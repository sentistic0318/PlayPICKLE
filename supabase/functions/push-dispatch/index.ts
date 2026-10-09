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
 let processed=0,settleErrors=0;
 for(const job of jobs||[]){
  let outcome='retry',ticket:string|null=null,errorText:string|null=null;
  try{
   const receipt=!!job.receipt_id;
   const response=await fetch('https://exp.host/--/api/v2/push/'+(receipt?'getReceipts':'send'),{method:'POST',headers,
    body:JSON.stringify(receipt?{ids:[job.receipt_id]}:{to:job.token,title:'PlayPICKLE update',body:'You have a new update. Open your inbox to see it.',sound:'default',channelId:'default',data:{notification_id:job.notification_id}}),
    signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw new Error('Expo HTTP '+response.status);
   const payload=await response.json(),result=receipt?payload.data?.[job.receipt_id]:payload.data;
   if(result?.status==='ok'){outcome=receipt?'delivered':'ticket';ticket=receipt?job.receipt_id:result.id;}
   else if(result?.status==='error'){errorText=result.details?.error||result.message||'Expo rejected delivery';outcome=['DeviceNotRegistered','MessageTooBig','InvalidCredentials'].includes(errorText)?'failed':'retry';}
   else errorText=receipt?'Receipt not available yet':'Expo returned no delivery ticket';
   if(outcome==='ticket'&&!ticket){outcome='retry';errorText='Missing Expo ticket';}
  }catch(error){errorText=error instanceof Error?error.message:'Push transport error';}
  const {error:settleError}=await db.rpc('settle_push_job',{p_id:job.id,p_lease_id:job.lease_id,p_result:outcome,p_ticket:ticket,p_error:errorText});
  if(settleError)settleErrors++;else processed++;
 }
 return respond(settleErrors?500:200,{processed,settleErrors});
});
