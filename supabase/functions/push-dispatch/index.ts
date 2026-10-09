import {dispatchJobs} from './dispatch.js';
import {createClient} from 'npm:@supabase/supabase-js@2.117.0';
const respond=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
Deno.serve(async(req:Request)=>{
 const secret=Deno.env.get('PUSH_WORKER_SECRET');
 if(!secret)return respond(503,{error:'Push worker is not configured.'});
 if(req.method!=='POST'||req.headers.get('Authorization')!=='Bearer '+secret)return respond(401,{error:'Unauthorized'});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return respond(503,{error:'Backend configuration missing.'});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:jobs,error}=await db.rpc('claim_push_jobs',{p_limit:10});
 if(error)return respond(500,{error:'Unable to claim jobs.'});
 const expoToken=Deno.env.get('EXPO_ACCESS_TOKEN');
 const headers:Record<string,string>={'Content-Type':'application/json','Accept':'application/json',...(expoToken?{Authorization:'Bearer '+expoToken}:{})};
 const {processed,settleErrors}=await dispatchJobs(db,jobs,headers);
 return respond(settleErrors?500:200,{processed,settleErrors});
});
