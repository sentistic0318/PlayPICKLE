// Unregister this device first; server failures must not preserve local login.
export async function signOutWithDeviceCleanup(auth,unregister,{timeoutMs=8000,clearStoredSession}={}) {
 let deviceCleanupFailed=false;
 const controller=new AbortController();let timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Device cleanup timed out'));},timeoutMs);});
 try { await Promise.race([unregister(controller.signal),deadline]); }
 catch { deviceCleanupFailed=true; }
 finally { clearTimeout(timer); }
 const {error}=await auth.signOut({scope:'local'});
 if(error) {
  if(clearStoredSession){
   // A refresh failure can return before the SDK removes an expired session.
   await auth.stopAutoRefresh();
   await clearStoredSession();
   // With storage empty this is local-only, and emits the SDK SIGNED_OUT event.
   const {error:localError}=await auth.signOut({scope:'local'});
   if(localError)throw localError;
  }else{
   const {data}=await auth.getSession();
   if(data.session)throw error;
  }
 }
 return {deviceCleanupFailed,serverRevocationFailed:!!error};
}
