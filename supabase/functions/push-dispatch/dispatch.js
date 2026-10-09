// Shared with transport regression tests; credentials and authorization stay in index.ts.
export async function dispatchJobs(db,jobs,headers,send=fetch) {
 let processed=0,settleErrors=0;
 for(const job of jobs||[]){
  let outcome='retry',ticket=null,errorText=null;
  try{
   const {data:valid,error:validationError}=await db.rpc('validate_push_job',{p_id:job.id,p_lease_id:job.lease_id});
   if(validationError)throw new Error('Unable to validate device registration');
   if(!valid){processed++;continue;}
   const receipt=!!job.receipt_id;
   const response=await send('https://exp.host/--/api/v2/push/'+(receipt?'getReceipts':'send'),{method:'POST',headers,
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
 return {processed,settleErrors};
}
