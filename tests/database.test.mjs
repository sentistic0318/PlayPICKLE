import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import {createTestDb,addUser,asUser} from './db.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('PlayPICKLE database business and permission regression suite',async t=>{
 const db=await createTestDb();t.after(()=>db.close());
 const users=[];for(let i=1;i<=18;i++)users.push(await addUser(db,id(i),'Player '+i));
 const admin=users[0],owner=users[1],outsider=users[2],players=users.slice(3);
 const as=(u,work)=>asUser(db,u.id,u.email,work);
 const call=async(name,args=[])=>{const q='select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as value';return (await db.query(q,args)).rows[0].value;};
 await db.query('insert into public.administrators(user_id) values($1)',[admin.id]);
 let club,court,booking,slots,season,rule,event;
 await t.test('profiles cannot grant administrator privileges or mutate protected fields',async()=>{
  await as(outsider,async()=>{
   await assert.rejects(db.query("update public.profiles set status='active' where id=$1",[outsider.id]),/permission denied/);
   await assert.rejects(db.query('insert into public.administrators(user_id) values($1)',[outsider.id]),/permission denied/);
   assert.equal(await call('is_admin'),false);
   await assert.rejects(call('notify_user',[admin.id,'Forged','Forged',{}]),/permission denied/);
   await assert.rejects(call('claim_push_jobs',[1]),/permission denied/);
  });
 });
 await t.test('owners configure only their clubs; verified clubs expose redacted availability',async()=>{
  club=await as(owner,()=>call('apply_club',['Test club','Test area','Test address','Asia/Manila']));
  court=await as(owner,()=>call('save_court',[club,{name:'Court A',price_per_hour:300,currency:'PHP'},null]));
  await as(owner,()=>call('set_opening_hours',[club,Array.from({length:7},(_,weekday)=>({weekday,opens_at:'08:00',closes_at:'22:00'}))]));
  await as(outsider,()=>assert.rejects(call('update_club',[club,{name:'Stolen club'}]),/permission/));
  await as(admin,()=>call('verify_club',[club,'verified','Test verification']));
  const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  slots=await as(outsider,async()=>(await db.query('select * from public.court_availability($1,$2)',[club,date])).rows);
  assert.equal(slots.length,14);assert.equal(slots[0].starts_at.getUTCHours(),0);assert.equal(Number(slots[0].price_total),300);
  assert.equal('user_id' in slots[0],false);
 });
 await t.test('same-slot attempts have one winner; retries are idempotent and blocks conflict',async()=>{
  const request=randomUUID(),slot=slots[0];
  booking=await as(players[0],()=>call('create_booking',[court,slot.starts_at,slot.ends_at,request]));
  assert.equal(await as(players[0],()=>call('create_booking',[court,slot.starts_at,slot.ends_at,request])),booking);
  const attempts=await as(players[1],()=>Promise.allSettled([call('create_booking',[court,slot.starts_at,slot.ends_at,randomUUID()]),call('create_booking',[court,slot.starts_at,slot.ends_at,randomUUID()])]));
  assert.ok(attempts.every(a=>a.status==='rejected'));
  await as(owner,()=>assert.rejects(call('add_block',[court,slot.starts_at,slot.ends_at,'Conflict test']),/conflict|exclusion/));
  assert.equal(Number((await db.query('select count(*) from public.bookings')).rows[0].count),1);
  assert.equal(Number(await as(outsider,async()=>(await db.query('select count(*) from public.bookings')).rows[0].count)),0);
  await as(outsider,()=>assert.rejects(call('cancel_booking',[booking,'Not mine']),/denied/));
 });
 await t.test('availability signals hide player data and booking names require club permission',async()=>{
  const signals=await as(players[1],()=>db.query('select * from public.availability_changes where court_id=$1',[court]));
  assert.equal(signals.rows.length,1);assert.deepEqual(Object.keys(signals.rows[0]).sort(),['changed_at','court_id']);
  assert.equal((await as(players[1],()=>db.query('select * from public.court_usage'))).rows.length,0);
  await as(players[1],()=>assert.rejects(call('club_bookings',[club]),/permission/));
  const records=await as(owner,()=>db.query('select * from public.club_bookings($1)',[club]));
  assert.equal(records.rows[0].club_bookings.player_name,'Player 4');
 });
 await t.test('image uploads are limited to the player or authorized club path',async()=>{
  await as(players[0],()=>db.query("insert into storage.objects(bucket_id,name) values('avatars',$1)",[players[0].id+'/avatar.png']));
  await as(players[0],()=>assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('avatars',$1)",[owner.id+'/forged.png']),/row-level security/));
  await as(owner,()=>db.query("insert into storage.objects(bucket_id,name) values('club-images',$1)",[club+'/photo.png']));
  await as(players[0],()=>assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('club-images',$1)",[club+'/forged.png']),/row-level security/));
 });
 await t.test('staff cannot escalate delegated permissions and invitations require the matching verified email',async()=>{
  const invite=await as(owner,()=>call('invite_staff',[club,outsider.email,['staff','bookings']]));
  await as(players[0],()=>assert.rejects(call('accept_staff_invite',[invite]),/verified email/));
  await as(outsider,()=>call('accept_staff_invite',[invite]));
  await as(outsider,()=>assert.rejects(call('invite_staff',[club,players[1].email,['results']]),/do not have/));
  await as(owner,()=>call('revoke_staff',[club,outsider.id]));
  await as(outsider,()=>assert.rejects(call('cancel_booking',[booking,'Revoked access']),/denied/));
 });
 await t.test('unconfirmed rules cannot publish and published rules retain snapshots',async()=>{
  season=await as(owner,()=>call('save_season',[club,{name:'Test season',starts_on:'2020-01-01',ends_on:'2099-12-31'},null]));
  rule=await as(admin,()=>call('save_ranking_rule',[null,'Test policy',11,2,100,60,30,10,48,false]));
  event=await as(owner,()=>call('save_tournament',[null,club,season,'Doubles test','', 'open',slots[0].starts_at,new Date(Date.now()+86400000),5,rule]));
  await as(owner,()=>assert.rejects(call('publish_tournament',[event]),/confirmed policy/));
  await as(admin,()=>call('save_ranking_rule',[rule,'Test policy',11,2,100,60,30,10,48,true]));
  await as(owner,()=>call('publish_tournament',[event]));
  await as(admin,()=>call('save_ranking_rule',[rule,'Changed future policy',15,2,50,30,15,5,72,true]));
  assert.equal((await db.query('select policy_snapshot from public.tournaments where id=$1',[event])).rows[0].policy_snapshot.game_points,11);
 });
 const teamIds=[];
 await t.test('two-player registration enforces identities, capacity, acceptance and duplicate protection',async()=>{
  await as(players[0],()=>assert.rejects(call('register_team',[event,players[0].id,'One player']),/distinct/));
  for(let i=0;i<5;i++){
   const captain=players[i*2],partner=players[i*2+1];
   const team=await as(captain,()=>call('register_team',[event,partner.id,'Team '+i]));teamIds.push(team);
   assert.equal(await as(captain,()=>call('register_team',[event,partner.id,'Team '+i])),team);
   await as(partner,()=>call('respond_team_invitation',[team,true]));
  }
  await as(players[0],()=>assert.rejects(call('register_team',[event,players[10].id,'Duplicate player']),/already belongs/));
  await as(players[10],()=>assert.rejects(call('register_team',[event,players[11].id,'Overflow']),/full/));
  await as(players[12],()=>assert.rejects(call('respond_team_invitation',[teamIds[0],true]),/not your/));
 });
 await t.test('five teams generate three byes and one immutable seven-match bracket',async()=>{
  await db.query("update public.tournaments set registration_deadline=now()-interval '1 hour' where id=$1",[event]);
  await as(owner,()=>call('generate_bracket',[event]));await as(owner,()=>call('generate_bracket',[event]));
  const all=(await db.query('select * from public.matches where tournament_id=$1',[event])).rows;
  assert.equal(all.length,7);assert.equal(all.filter(m=>m.status==='bye').length,3);
  await as(players[0],()=>assert.rejects(call('withdraw_team',[teamIds[0],'Too late']),/locking/));
 });
 let firstVerified;
 await t.test('matches share court conflict protection; scores cannot be verified by a player',async()=>{
  const m=(await db.query("select * from public.matches where tournament_id=$1 and status='ready' order by round,position limit 1",[event])).rows[0];
  await as(owner,()=>assert.rejects(call('schedule_match',[m.id,court,slots[0].starts_at,slots[0].ends_at]),/conflict|exclusion/));
  await as(owner,()=>call('schedule_match',[m.id,court,slots[1].starts_at,slots[1].ends_at]));
  await as(owner,()=>assert.rejects(call('submit_match_score',[m.id,11,5]),/started/));
  await db.query("update public.matches set starts_at=now()-interval '1 hour',ends_at=now() where id=$1",[m.id]);
  await as(owner,()=>assert.rejects(call('submit_match_score',[m.id,11,10]),/valid completed/));
  await as(owner,()=>call('submit_match_score',[m.id,11,5]));
  await as(players[0],()=>assert.rejects(call('verify_match',[m.id]),/permission/));
  await as(owner,()=>call('verify_match',[m.id]));await as(owner,()=>call('verify_match',[m.id]));
  firstVerified=m.id;
 });
 await t.test('verified winners advance once and every accepted team receives a placement',async()=>{
  for(let rounds=0;rounds<10;rounds++){
   const ready=(await db.query("select * from public.matches where tournament_id=$1 and status='ready' order by round,position",[event])).rows;
   if(!ready.length)break;
   for(const m of ready){
    // Fixture clock advance: score validation is exercised after the simulated scheduled start.
    await db.query("update public.matches set status='scheduled',court_id=$2,starts_at=now()-interval '1 hour',ends_at=now() where id=$1",[m.id,court]);
    await as(owner,()=>call('submit_match_score',[m.id,11,5]));await as(owner,()=>call('verify_match',[m.id]));await as(owner,()=>call('verify_match',[m.id]));
   }
  }
  const trow=(await db.query('select * from public.tournaments where id=$1',[event])).rows[0];
  assert.equal(trow.status,'completed');assert.ok(trow.champion_team_id);
  const placements=(await db.query("select placement from public.teams where tournament_id=$1 and status='accepted' order by placement",[event])).rows.map(r=>r.placement);
  assert.deepEqual(placements,[1,2,3,3,5]);
  await as(admin,()=>assert.rejects(call('correct_match_result',[firstVerified,5,11,'Incorrect first-round winner']),/later match/));
 });
 let finalMatch,dispute;
 await t.test('disputes hold points and unauthorized resolutions are denied',async()=>{
  finalMatch=(await db.query('select * from public.matches where tournament_id=$1 order by round desc limit 1',[event])).rows[0];
  const participant=(await db.query('select captain_id from public.teams where id=$1',[finalMatch.team_a_id])).rows[0].captain_id;
  const reporter=users.find(u=>u.id===participant);
  dispute=await as(reporter,()=>call('report_result',[finalMatch.id,'Please review the final recorded score.']));
  assert.equal(await as(reporter,()=>call('report_result',[finalMatch.id,'Same report retry'])),dispute);
  await as(owner,()=>assert.rejects(call('finalize_tournament',[event]),/disputes/));
  await as(owner,()=>assert.rejects(call('resolve_dispute',[dispute,'Reviewed and dismissed']),/Administrator/));
  await as(admin,()=>call('resolve_dispute',[dispute,'Reviewed the record; the original score is correct.']));
  await as(owner,()=>assert.rejects(call('finalize_tournament',[event]),/window/));
 });
 await t.test('points are idempotent; final corrections reverse and safely recalculate awards',async()=>{
  await db.query("update public.matches set verified_at=now()-interval '49 hours' where tournament_id=$1",[event]);
  await as(owner,()=>call('finalize_tournament',[event]));await as(owner,()=>call('finalize_tournament',[event]));
  let awards=(await db.query("select * from public.point_ledger where tournament_id=$1 and kind='award'",[event])).rows;
  assert.equal(awards.length,10);assert.equal(awards.reduce((sum,r)=>sum+r.points,0),460);
  await as(admin,()=>call('correct_match_result',[finalMatch.id,5,11,'Final score transcribed in reverse.']));
  assert.equal(Number((await db.query('select sum(points) total from public.point_ledger where tournament_id=$1',[event])).rows[0].total),0);
  await as(owner,()=>assert.rejects(call('finalize_tournament',[event]),/window/));
  await db.query("update public.matches set verified_at=now()-interval '49 hours' where tournament_id=$1",[event]);
  await as(owner,()=>call('finalize_tournament',[event]));await as(owner,()=>call('finalize_tournament',[event]));
  assert.equal(Number((await db.query('select sum(points) total from public.point_ledger where tournament_id=$1',[event])).rows[0].total),460);
  await as(players[0],()=>assert.rejects(db.query("insert into public.point_ledger(player_id,points) values($1,999)",[players[0].id]),/permission denied/));
  const rankings=await as(players[0],()=>db.query('select * from public.rankings where club_id=$1',[club]));assert.equal(rankings.rows.length,10);
 });
 await t.test('push queue leases are service-only, idempotent and discard stale settlement',async()=>{
  await as(players[0],()=>call('register_push_token',['ExpoPushToken[testtoken123]','android']));
  await db.query("select public.notify_user($1,'Test','Test', '{}'::jsonb)",[players[0].id]);
  await db.exec('set role service_role');
  try{
   const jobs=(await db.query('select * from public.claim_push_jobs(10)')).rows;assert.equal(jobs.length,1);
   const j=jobs[0];assert.equal((await db.query('select * from public.claim_push_jobs(10)')).rows.length,0);
   await call('settle_push_job',[j.id,randomUUID(),'delivered',null,null]);
   assert.equal((await db.query('select status from public.push_jobs where id=$1',[j.id])).rows[0].status,'processing');
   await call('settle_push_job',[j.id,j.lease_id,'failed',null,'DeviceNotRegistered']);
  }finally{await db.exec('reset role');}
  assert.equal((await db.query("select active from public.push_tokens where token='ExpoPushToken[testtoken123]'")).rows[0].active,false);
 });
 await t.test('suspension blocks writes and cancelled bookings release their slot',async()=>{
  await as(players[0],()=>call('cancel_booking',[booking,'Change of plan']));
  await as(admin,()=>call('manage_account',[players[0].id,'suspended','Suspension test']));
  await as(players[0],()=>assert.rejects(call('create_booking',[court,slots[0].starts_at,slots[0].ends_at,randomUUID()]),/active account/));
  const id2=await as(players[1],()=>call('create_booking',[court,slots[0].starts_at,slots[0].ends_at,randomUUID()]));assert.ok(id2);
 });
 await t.test('authorized cancellation reverses points once and preserves the audit trail',async()=>{
  await as(owner,()=>assert.rejects(call('cancel_tournament',[event,'Incorrect downstream result requires a replay.']),/Administrator/));
  await as(admin,()=>call('cancel_tournament',[event,'Incorrect downstream result requires a replay.']));
  await as(admin,()=>call('cancel_tournament',[event,'Repeated request after a connection failure.']));
  assert.equal(Number((await db.query('select sum(points) total from public.point_ledger where tournament_id=$1',[event])).rows[0].total),0);
  assert.equal((await db.query("select * from public.audit_log where entity_id=$1 and action='tournament.cancelled'",[event])).rows.length,1);
  assert.equal((await db.query('select * from public.matches where tournament_id=$1',[event])).rows.length,7);
 });
 await t.test('optional seed requires an existing owner and creates explicitly labelled fixtures',async()=>{
  await db.query("select set_config('playpickle.seed_owner_id',$1,false)",[owner.id]);
  await db.exec(await fs.readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
  const demo=(await db.query("select * from public.clubs where name='[DEMO] Riverside Pickleball'")).rows;
  assert.equal(demo.length,1);assert.equal(demo[0].owner_id,owner.id);
  assert.equal((await db.query('select * from public.courts where club_id=$1',[demo[0].id])).rows.length,1);
 });
});
