import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createTestDb} from './db.mjs';
import {fixture,call} from './helpers/review-fixtures.mjs';

test('review regressions on a disposable database (sequential, not concurrency proof)',async t=>{
 const db=await createTestDb();t.after(()=>db.close());const f=await fixture(db,270);
 await t.test('128 accepted teams plus withdrawn history generate all 127 matches and round-7 final',async()=>{
  const e=await f.event();
  for(let i=0;i<110;i++){const team=await f.team(e,1,2,false);await f.run(f.users[1],'withdraw_team',[team,'Local history']);}
  for(let i=1;i<=255;i+=2)await f.team(e,i,i+1);
  const matches=await f.lock(e);
  assert.equal(matches.length,127);assert.equal(matches.at(-1).round,7);
  assert.equal((await db.query("select * from public.teams where tournament_id=$1 and status='accepted'",[e])).rows.length,128);
  assert.equal((await db.query('select * from public.teams where tournament_id=$1',[e])).rows.length,238);
 });
 await t.test('unwanted pending invites do not block creating or accepting the preferred team',async()=>{
  const e=await f.event(2),unwanted=await f.team(e,1,2,false);
  assert.equal((await db.query('select * from public.team_members where team_id=$1',[unwanted])).rows.length,1);
  const preferred=await f.team(e,2,3);await f.run(f.users[2],'respond_team_invitation',[unwanted,false]);
  assert.equal((await db.query('select team_id from public.team_members where tournament_id=$1 and player_id=$2',[e,f.users[2].id])).rows[0].team_id,preferred);
  const pending=await f.team(e,4,5,false),chosen=await f.team(e,6,5,false);
  await f.run(f.users[5],'respond_team_invitation',[chosen,true]);
  await f.run(f.users[5],'respond_team_invitation',[chosen,true]);
  await assert.rejects(f.run(f.users[5],'respond_team_invitation',[pending,true]),/already belongs/);
  await f.run(f.users[6],'withdraw_team',[chosen,'Changed our plans']);
  await f.run(f.users[5],'respond_team_invitation',[pending,true]);
  assert.equal((await db.query('select * from public.team_members where tournament_id=$1',[e])).rows.length,4);
 });
 await t.test('acceptance rechecks capacity, category, profile eligibility and deadline',async()=>{
  const e=await f.event(2),pending=await f.team(e,1,2,false);
  await f.team(e,3,4);await f.team(e,5,6);
  await assert.rejects(f.run(f.users[2],'respond_team_invitation',[pending,true]),/full/);
  const e2=await f.event(),p=await f.team(e2,7,8,false);
  await db.query("update public.profiles set status='suspended' where id=$1",[f.users[7].id]);
  await assert.rejects(f.run(f.users[8],'respond_team_invitation',[p,true]),/eligible/);
  await db.query("update public.profiles set status='active',display_name=' ' where id=$1",[f.users[7].id]);
  await assert.rejects(f.run(f.users[8],'respond_team_invitation',[p,true]),/eligible/);
  await db.query("update public.profiles set display_name='Restored' where id=$1",[f.users[7].id]);
  await db.query("update public.tournaments set category='advanced' where id=$1",[e2]);
  await assert.rejects(f.run(f.users[8],'respond_team_invitation',[p,true]),/eligible/);
  await db.query("update public.tournaments set registration_deadline=now()-interval '1 second' where id=$1",[e2]);
  await assert.rejects(f.run(f.users[8],'respond_team_invitation',[p,true]),/closed/);
 });
 await t.test('bracket locking expires pending invitations and releases their captains',async()=>{
  const e=await f.event(2),pending=await f.team(e,1,2,false);await f.team(e,3,4);await f.team(e,5,6);
  await f.lock(e);
  assert.equal((await db.query('select status from public.teams where id=$1',[pending])).rows[0].status,'withdrawn');
  assert.equal((await db.query('select * from public.team_members where team_id=$1',[pending])).rows.length,0);
  await assert.rejects(f.run(f.users[2],'respond_team_invitation',[pending,true]),/closed/);
 });
 await t.test('participant conflicts span tournaments and courts, rescheduling excludes self and cancellation releases time',async()=>{
  const e1=await f.event(),e2=await f.event();
  for(const e of [e1,e2]){await f.team(e,1,2);await f.team(e,3,4);}
  const [m1]=await f.lock(e1),[m2]=await f.lock(e2);
  const schedule=(m,c,a,b)=>f.run(f.owner,'schedule_match',[m.id,c,f.at(a),f.at(b)]);
  await assert.rejects(schedule(m1,f.courts[0],15.5,16.5),/opening hours/);
  await schedule(m1,f.courts[0],0,1);
  await schedule(m1,f.courts[0],0,1);
  await assert.rejects(schedule(m2,f.courts[1],0.5,1.5),/player is unavailable/);
  assert.equal((await db.query('select * from public.court_usage where reference_id=$1 and active',[m2.id])).rows.length,0);
  await schedule(m2,f.courts[1],1,2);
  await assert.rejects(schedule(m1,f.courts[2],1,2),/player is unavailable/);
  await f.run(f.owner,'cancel_tournament',[e1,'Cancelled for local regression']);
  await schedule(m2,f.courts[1],0,1);
  await assert.rejects(f.run(f.users[1],'schedule_match',[m2.id,f.courts[0],f.at(2),f.at(3)]),/permission/);
  await f.as(f.users[1],()=>assert.rejects(db.query('insert into public.player_match_usage select * from public.player_match_usage'),/permission/));
 });
 await t.test('previous-round completion and participant reservations survive result advancement',async()=>{
  const e=await f.event();for(let i=1;i<9;i+=2)await f.team(e,i,i+1);
  const matches=await f.lock(e),first=matches.filter(m=>m.round===1),final=matches.find(m=>m.round===2);
  for(let i=0;i<first.length;i++){
   const m=first[i];await f.run(f.owner,'schedule_match',[m.id,f.courts[i],f.at(3),f.at(4)]);
   // Trusted fixture marks winners; public scoring permission is covered separately.
   await db.query("update public.matches set status='verified',winner_team_id=team_a_id where id=$1",[m.id]);await call(db,'advance_match',[m.id]);
  }
  await assert.rejects(f.run(f.owner,'schedule_match',[final.id,f.courts[2],f.at(3.5),f.at(4.5)]),/Previous-round/);
  await f.run(f.owner,'schedule_match',[final.id,f.courts[2],f.at(4),f.at(5)]);
 });
 await t.test('device unregister is owner-scoped; claims and pre-send checks reject reassigned and inactive tokens',async()=>{
  const a=f.users[1],b=f.users[2],device='ExpoPushToken[shared]',other='ExpoPushToken[other]';
  const register=(u,token)=>f.run(u,'register_push_token',[token,'android']);
  const notify=u=>call(db,'notify_user',[u.id,'Local test','Local test',{}]);
  const jobs=()=>db.query('select * from public.claim_push_jobs(100)');
  await register(a,device);await register(a,other);await notify(a);
  await f.run(b,'unregister_push_token',[device]);
  assert.equal((await db.query('select active from public.push_tokens where token=$1',[device])).rows[0].active,true);
  const claimed=(await jobs()).rows,old=claimed.find(j=>j.token===device);
  assert.equal(await call(db,'validate_push_job',[old.id,old.lease_id]),true);
  await register(b,device);
  assert.equal(await call(db,'validate_push_job',[old.id,old.lease_id]),false);
  await call(db,'settle_push_job',[old.id,old.lease_id,'failed',null,'DeviceNotRegistered']);
  assert.equal((await db.query('select active from public.push_tokens where token=$1',[device])).rows[0].active,true);
  await notify(b);const bJob=(await jobs()).rows.find(j=>j.token===device);assert.equal(bJob.user_id,b.id);
  await f.run(a,'unregister_push_token',[device]);assert.equal(await call(db,'validate_push_job',[bJob.id,bJob.lease_id]),true);
  await f.run(b,'unregister_push_token',[device]);assert.equal(await call(db,'validate_push_job',[bJob.id,bJob.lease_id]),false);
  assert.equal((await db.query('select active from public.push_tokens where token=$1',[other])).rows[0].active,true);
  await register(a,device);assert.equal(await call(db,'validate_push_job',[old.id,old.lease_id]),false);
  // Simulate an enqueue that raced with invalidation and committed afterwards.
  const n=(await db.query('select id from public.notifications where user_id=$1 limit 1',[b.id])).rows[0].id;
  await db.query("insert into public.push_jobs(notification_id,user_id,token,token_registration_id) values($1,$2,$3,$4) on conflict(notification_id,token) do update set status='pending',lease_id=null",[n,b.id,device,bJob.token_registration_id]);
  assert.equal((await jobs()).rows.filter(j=>j.token===device).length,0);
  await f.as(a,()=>assert.rejects(call(db,'validate_push_job',[old.id,old.lease_id]),/permission/));
  await f.as(a,()=>assert.rejects(call(db,'claim_push_jobs',[1]),/permission/));
 });
});

test('upgrade preserves accepted teams and converts existing pending invitations',async t=>{
 const db=await createTestDb({migrationFilter:f=>f.startsWith('20261008')});t.after(()=>db.close());const f=await fixture(db);
 const e=await f.event(),pending=await f.team(e,1,2,false),accepted=await f.team(e,3,4);
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const name of (await fs.readdir(dir)).filter(n=>n.startsWith('20261009')).sort())await db.exec(await fs.readFile(new URL(name,dir),'utf8'));
 assert.equal((await db.query('select * from public.team_members where team_id=$1',[pending])).rows.length,1);
 assert.equal((await db.query('select * from public.team_members where team_id=$1',[accepted])).rows.length,2);
 await f.run(f.users[2],'respond_team_invitation',[pending,true]);
 assert.equal((await db.query('select * from public.team_members where team_id=$1',[pending])).rows.length,2);
});
