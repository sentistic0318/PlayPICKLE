import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const asModule=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const formatSource=await fs.readFile(new URL('../src/lib/format.js',import.meta.url),'utf8');
const format=await import(asModule(formatSource));
const linksSource=(await fs.readFile(new URL('../src/lib/authLinks.js',import.meta.url),'utf8')).replace("'./format'",JSON.stringify(asModule(formatSource)));
const {completeAuthLink}=await import(asModule(linksSource));
test('UTC bookings display in the club timezone across DST transitions',()=>{
 assert.match(format.clockTime('2026-03-08T06:30:00Z','America/New_York'),/1:30/);
 assert.match(format.clockTime('2026-03-08T07:30:00Z','America/New_York'),/3:30/);
 assert.match(format.clockTime('2026-10-01T01:00:00Z','Asia/Manila'),/9:00/);
});
test('PKCE recovery links exchange once and preserve recovery intent',async()=>{
 const calls=[];const client={auth:{exchangeCodeForSession:async code=>{calls.push(code);return {data:{redirectType:'recovery'},error:null};}}};
 assert.equal(await completeAuthLink(client,'playpickle://auth/callback?code=one-use-code'),'recovery');
 assert.deepEqual(calls,['one-use-code']);
});
test('implicit mobile recovery links restore both session tokens',async()=>{
 let restored;const client={auth:{setSession:async value=>{restored=value;return {data:{},error:null};}}};
 assert.equal(await completeAuthLink(client,'playpickle://auth/callback#access_token=access&refresh_token=refresh&type=recovery'),'recovery');
 assert.deepEqual(restored,{access_token:'access',refresh_token:'refresh'});
});
test('expired links and failed session exchanges never report verification success',async()=>{
 const client={auth:{exchangeCodeForSession:async()=>({error:new Error('Expired code')})}};
 await assert.rejects(completeAuthLink(client,'playpickle://auth/callback?code=expired'),/Expired code/);
 await assert.rejects(completeAuthLink(client,'playpickle://auth/callback?error_description=Expired%20link'),/Expired link/);
 await assert.rejects(completeAuthLink(client,'playpickle://auth/callback'),/incomplete/);
});
test('token-hash email verification uses the trusted SDK verification method',async()=>{
 let input;const client={auth:{verifyOtp:async value=>{input=value;return {data:{},error:null};}}};
 assert.equal(await completeAuthLink(client,'playpickle://auth/callback?token_hash=one-use&type=email'),'verified');
 assert.deepEqual(input,{token_hash:'one-use',type:'email'});
});

test('Supabase restores a persisted session and local logout clears it',async()=>{
 const {createClient,processLock}=await import('@supabase/supabase-js');
 const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'session@example.test'};
 const expiry=Math.floor(Date.now()/1000)+3600;
 const session={access_token:'fixture-token',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:expiry,expires_in:3600,user};
 const data=new Map([['playpickle-session-test',JSON.stringify(session)]]);
 const storage={getItem:async key=>data.get(key)??null,setItem:async(key,value)=>{data.set(key,value);},removeItem:async key=>{data.delete(key);}};
 const options={auth:{storage,storageKey:'playpickle-session-test',persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,flowType:'pkce',lock:processLock},global:{fetch:async()=>new Response(null,{status:204})}};
 const first=createClient('https://session-test.supabase.co','fixture-public-key',options);
 assert.equal((await first.auth.getSession()).data.session.user.id,user.id);
 const restored=createClient('https://session-test.supabase.co','fixture-public-key',options);
 assert.equal((await restored.auth.getSession()).data.session.refresh_token,'fixture-refresh');
 const {error}=await restored.auth.signOut({scope:'local'});assert.equal(error,null);
 assert.equal(data.has('playpickle-session-test'),false);
 assert.equal((await restored.auth.getSession()).data.session,null);
 await first.auth.stopAutoRefresh();await restored.auth.stopAutoRefresh();
});