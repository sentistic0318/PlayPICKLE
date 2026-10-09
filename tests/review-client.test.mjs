import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
const moduleUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const source=await fs.readFile(new URL('../src/lib/api.js',import.meta.url),'utf8');
const entries=await fs.readFile(new URL('../src/lib/tournamentData.js',import.meta.url),'utf8');
const signOut=await import(moduleUrl(await fs.readFile(new URL('../src/lib/signOut.js',import.meta.url),'utf8')));
const {dispatchJobs}=await import(moduleUrl(await fs.readFile(new URL('../supabase/functions/push-dispatch/dispatch.js',import.meta.url),'utf8')));

test('the shared screen loader retrieves every team and match despite server page caps',async()=>{
 const teams=Array.from({length:238},(_,i)=>({id:String(i+1).padStart(5,'0'),created_at:'2026-01-01',status:i<110?'withdrawn':'accepted',captain_id:i===237?'me':'other',partner_id:'partner'}));
 const matches=[];for(let round=1;round<=7;round++)for(let position=1;position<=128/(2**round);position++)matches.push({id:String(matches.length+1).padStart(5,'0'),round,position});
 const calls=[];
 globalThis.reviewClient={from(table){let after=null;return {select(){return this;},eq(){return this;},gt(k,v){assert.equal(k,'id');after=v;return this;},order(k){assert.equal(k,'id');return this;},limit(size){calls.push({table,after,size});return Promise.resolve({data:({teams,matches}[table]).filter(r=>!after||r.id>after).slice(0,37),error:null});}};}};
 const api=moduleUrl(source.replace("import { supabase } from './supabase';",'const supabase=globalThis.reviewClient;'));
 const {loadTournamentEntries,playerEntries}=await import(moduleUrl(entries.replace("'./api'",JSON.stringify(api))));
 const result=await loadTournamentEntries('event');
 assert.equal(result.teams.length,238);assert.equal(result.teams.filter(t=>t.status==='accepted').length,128);
 assert.equal(result.matches.length,127);assert.deepEqual(result.matches.at(-1),{id:'00127',round:7,position:1});
 assert.equal(playerEntries(result.teams,'me').myTeam.id,'00238');
 assert.ok(calls.filter(c=>c.table==='teams').length>3);
 assert.deepEqual(playerEntries([{id:'invitation',status:'pending',partner_id:'me'}],'me'),{myTeam:undefined,invitations:[{id:'invitation',status:'pending',partner_id:'me'}]});
 globalThis.reviewClient.from=()=>({select(){return this;},eq(){return this;},order(){return this;},limit(){return Promise.resolve({error:{message:'Page failed'}});}});
 await assert.rejects(loadTournamentEntries('event'),/Page failed/);
 delete globalThis.reviewClient;
});

test('logout unregisters first and clears the real SDK session despite unregister and auth network failures',async()=>{
 for(const offline of [false,true]){
  const key='review-logout-'+offline,user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated'};
  const storage=new Map([[key,JSON.stringify({access_token:'fixture-access',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user})]]);
  const calls=[];
  const client=createClient('https://fixture.supabase.co','fixture-key',{auth:{storageKey:key,autoRefreshToken:false,detectSessionInUrl:false,storage:{getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>storage.set(k,v),removeItem:async k=>storage.delete(k)}},global:{fetch:async()=>{calls.push('signout');return new Response(offline?'offline':null,{status:offline?503:204});}}});
  const result=await signOut.signOutWithDeviceCleanup(client.auth,async()=>{calls.push('unregister');if(offline)throw new Error('Offline');});
  assert.deepEqual(calls,['unregister','signout']);assert.equal(result.deviceCleanupFailed,offline);
  assert.equal((await client.auth.getSession()).data.session,null);assert.equal(storage.has(key),false);
  await client.auth.stopAutoRefresh();
 }
});

test('push dispatcher checks each claimed job immediately before transport and preserves retry outcomes',async()=>{
 const calls=[],jobs=[{id:'old',lease_id:'old-lease'},{id:'current',lease_id:'lease',token:'current-device',notification_id:'notification'}];
 const db={rpc:async(name,args)=>{calls.push([name,args]);return name==='validate_push_job'?{data:args.p_id==='current',error:null}:{error:null};}};
 let sends=0;
 await dispatchJobs(db,jobs,{},async(url,options)=>{sends++;assert.equal(JSON.parse(options.body).to,'current-device');assert.equal(calls.at(-1)[0],'validate_push_job');return new Response(JSON.stringify({data:{status:'ok',id:'ticket'}}));});
 assert.equal(sends,1);assert.equal(calls.at(-1)[1].p_result,'ticket');
 await dispatchJobs(db,[jobs[1]],{},async()=>{throw new Error('Temporary network failure');});
 assert.equal(calls.at(-1)[1].p_result,'retry');
 await dispatchJobs(db,[{...jobs[1],receipt_id:'ticket'}],{},async()=>new Response(JSON.stringify({data:{ticket:{status:'error',details:{error:'DeviceNotRegistered'}}}})));
 assert.equal(calls.at(-1)[1].p_error,'DeviceNotRegistered');
 const unavailable={rpc:async(name)=>name==='validate_push_job'?{error:new Error('Database unavailable')}:{error:null}};
 await dispatchJobs(unavailable,[jobs[1]],{},async()=>{assert.fail('Do not send when ownership cannot be verified');});
});

test('an unresponsive device cleanup cannot hold local sign-out open',async()=>{
 let signal,signedOut=false;
 const result=await signOut.signOutWithDeviceCleanup({signOut:async()=>{signedOut=true;return {error:null};}},s=>{signal=s;return new Promise(()=>{});},{timeoutMs:20});
 assert.equal(signal.aborted,true);assert.equal(signedOut,true);assert.equal(result.deviceCleanupFailed,true);
});

test('offline logout removes an expired refresh session and emits SIGNED_OUT',async()=>{
 const key='expired-review-session',user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated'};
 const values=new Map([[key,JSON.stringify({access_token:'expired',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)-3600,user})]]);
 const storage={getItem:async k=>values.get(k)??null,setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k)};
 const client=createClient('https://fixture.supabase.co','fixture-key',{auth:{storageKey:key,storage,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async()=>new Response('offline',{status:503})}});
 const events=[];const {data:{subscription}}=client.auth.onAuthStateChange(event=>events.push(event));
 const result=await signOut.signOutWithDeviceCleanup(client.auth,async()=>{throw new Error('offline');},{clearStoredSession:async()=>values.delete(key)});
 assert.equal(result.serverRevocationFailed,true);assert.equal(values.has(key),false);assert.equal((await client.auth.getSession()).data.session,null);assert.ok(events.includes('SIGNED_OUT'));
 subscription.unsubscribe();await client.auth.stopAutoRefresh();
});
