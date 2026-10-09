import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';
import {initializeTestDb} from '../db.mjs';
import {fixture,call} from '../helpers/review-fixtures.mjs';

// No external connection string is accepted: this suite always creates its own
// loopback-only, disposable cluster. Fixtures and logs stay under test-results.
test('real Postgres concurrent scheduling and invitations', {timeout:120000},async t=>{
 const root=path.resolve('test-results');await fs.mkdir(root,{recursive:true});
 const databaseDir=await fs.mkdtemp(path.join(root,'postgres-review-'));
 assert.ok(databaseDir.startsWith(root+path.sep));
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 const pg=new EmbeddedPostgres({databaseDir,port,user:'postgres',password:randomUUID(),persistent:true,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
 await pg.initialise();await pg.start();
 const connections=[];t.after(async()=>{for(const c of connections)await c.end();await pg.stop();});
 const connect=async()=>{const c=pg.getPgClient('postgres','127.0.0.1');await c.connect();c.exec=sql=>c.query(sql);connections.push(c);await c.query("set statement_timeout='15s'");return c;};
 const db=await connect();await initializeTestDb(db);const f=await fixture(db);t.diagnostic((await db.query('select version() as version')).rows[0].version);
 const a=await connect(),b=await connect(),pid=(await b.query('select pg_backend_pid() as pid')).rows[0].pid;
 const begin=async(c,u)=>{await c.query('begin');await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.email',$2,true)",[u.id,u.email]);await c.query('set local role authenticated');};
 const waitForLock=async()=>{
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){if((await db.query("select wait_event_type from pg_stat_activity where pid=$1",[pid])).rows[0]?.wait_event_type==='Lock')return;await new Promise(r=>setTimeout(r,20));}
  assert.fail('Second independent connection did not wait on a database lock');
 };
 await t.test('overlapping matches in different tournaments/courts wait, then exactly one wins',async()=>{
  const e1=await f.event(),e2=await f.event();for(const e of [e1,e2]){await f.team(e,1,2);await f.team(e,3,4);}
  const [m1]=await f.lock(e1),[m2]=await f.lock(e2);
  await begin(a,f.owner);await call(a,'schedule_match',[m1.id,f.courts[0],f.at(0),f.at(1)]);
  await begin(b,f.owner);const attempt=call(b,'schedule_match',[m2.id,f.courts[1],f.at(0),f.at(1)]).then(()=>null,e=>e);
  await waitForLock();await a.query('commit');const error=await attempt;assert.match(error?.message||'',/player is unavailable/);await b.query('rollback');
  assert.equal((await db.query("select * from public.matches where id=any($1::uuid[]) and status='scheduled'",[[m1.id,m2.id]])).rows.length,1);
  await f.run(f.owner,'schedule_match',[m2.id,f.courts[1],f.at(1),f.at(2)]);
 });
 await t.test('competing invitation acceptances serialize; unique membership has one winner',async()=>{
  const e=await f.event(),one=await f.team(e,1,2,false),two=await f.team(e,3,2,false);
  await begin(a,f.users[2]);await call(a,'respond_team_invitation',[one,true]);
  await begin(b,f.users[2]);const attempt=call(b,'respond_team_invitation',[two,true]).then(()=>null,e=>e);
  await waitForLock();await a.query('commit');const error=await attempt;assert.match(error?.message||'',/already belongs/);await b.query('rollback');
  const memberships=(await db.query('select * from public.team_members where tournament_id=$1 and player_id=$2',[e,f.users[2].id])).rows;
  assert.equal(memberships.length,1);assert.equal(memberships[0].team_id,one);
 });
 await t.test('concurrent final-capacity acceptances cannot oversubscribe',async()=>{
  const e=await f.event(2);await f.team(e,1,2);const one=await f.team(e,3,4,false),two=await f.team(e,5,6,false);
  await begin(a,f.users[4]);await call(a,'respond_team_invitation',[one,true]);
  await begin(b,f.users[6]);const attempt=call(b,'respond_team_invitation',[two,true]).then(()=>null,e=>e);
  await waitForLock();await a.query('commit');const error=await attempt;assert.match(error?.message||'',/full/);await b.query('rollback');
  assert.equal((await db.query("select * from public.teams where tournament_id=$1 and status='accepted'",[e])).rows.length,2);
 });
 await t.test('an enqueue committed after token reassignment cannot be claimed or sent',async()=>{
  const token='ExpoPushToken[racingenqueue]';await f.run(f.users[1],'register_push_token',[token,'android']);
  await a.query('begin');await call(a,'notify_user',[f.users[1].id,'Race fixture','Race fixture',{}]);
  // The new job is uncommitted and invisible to the invalidation trigger.
  await begin(b,f.users[2]);await call(b,'register_push_token',[token,'android']);await b.query('commit');await a.query('commit');
  const stale=(await db.query('select * from public.push_jobs where token=$1',[token])).rows[0];
  assert.equal(stale.status,'pending');
  const claimed=(await db.query('select * from public.claim_push_jobs(100)')).rows;
  assert.equal(claimed.some(j=>j.id===stale.id),false);
  assert.equal((await db.query('select status from public.push_jobs where id=$1',[stale.id])).rows[0].status,'failed');
 });
});
