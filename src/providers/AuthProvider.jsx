import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {supabase} from '../lib/supabase';
import {query} from '../lib/api';
const AuthContext=createContext(null);
export function AuthProvider({children}){
 const [session,setSession]=useState(null),[loading,setLoading]=useState(!!supabase),[authError,setAuthError]=useState('');
 const [details,setDetails]=useState({userId:null,profile:null,memberships:[],isAdmin:false,error:''});
 const user=session?.user,userId=user?.id,generation=useRef(0);
 const refreshProfile=useCallback(async()=>{
  const revision=++generation.current;if(!userId)return;
  try{const [profiles,members,admins]=await Promise.all([query('profiles',{filters:{id:userId}}),query('club_members',{select:'*,clubs(*)',filters:{user_id:userId}}),query('administrators',{filters:{user_id:userId}})]);
   if(revision!==generation.current)return;
   setDetails({userId,profile:profiles[0]||null,memberships:members,isAdmin:!!admins.length,error:''});
  }catch(e){if(revision===generation.current)setDetails({userId,profile:null,memberships:[],isAdmin:false,error:e.message});}
 },[userId]);
 useEffect(()=>{if(!supabase)return;let active=true,receivedEvent=false;
 supabase.auth.getSession().then(({data,error})=>{if(active&&!receivedEvent){setSession(data.session);setAuthError(error?.message||'');setLoading(false);}}).catch(e=>{if(active){setAuthError(e.message);setLoading(false);}});
 const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{receivedEvent=true;if(active){setSession(next);setLoading(false);}});
 if(AppState.currentState==='active')supabase.auth.startAutoRefresh();
 const app=AppState.addEventListener('change',state=>state==='active'?supabase.auth.startAutoRefresh():supabase.auth.stopAutoRefresh());
 return()=>{active=false;subscription.unsubscribe();app.remove();supabase.auth.stopAutoRefresh();};},[]);
 // The effect fetches remote account permissions; state changes only after the request settles.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{refreshProfile();return()=>{generation.current++;};},[refreshProfile]);
 const current=details.userId===userId?details:{profile:null,memberships:[],isAdmin:false,error:''};
 return <AuthContext.Provider value={{session,user,profile:current.profile,memberships:current.memberships,isAdmin:current.isAdmin,loading,error:authError||current.error,refreshProfile}}>{children}</AuthContext.Provider>;
}
export function useAuth(){return useContext(AuthContext);}
