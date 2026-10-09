import React,{useEffect,useRef,useState} from 'react';
import {router} from 'expo-router';
import * as Linking from 'expo-linking';
import {supabase} from '../../src/lib/supabase';
import {completeAuthLink} from '../../src/lib/authLinks';
import {Screen,Title,Body,Field,Button,Notice,Loading} from '../../src/components/ui';
export default function Callback(){
 const url=Linking.useURL(),handled=useRef('');const [state,setState]=useState('loading'),[error,setError]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{async function complete(){const initial=url||await Linking.getInitialURL();if(!initial||handled.current===initial)return;handled.current=initial;
 try{const next=await completeAuthLink(supabase,initial);setState(previous=>previous==='recovery'?'recovery':next);}
 catch(e){setError(e.message);setState('error');}}complete();},[url]);
 useEffect(()=>{if(!supabase)return;const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')setState('recovery');});return()=>subscription.unsubscribe();},[]);
 return <Screen topSafe><Title>{state==='recovery'?'Choose a new password':'Account verification'}</Title>{state==='loading'&&<Loading/>}<Notice message={error} tone="error"/>
 {state==='verified'&&<><Body>Your email link has been verified.</Body><Button title="Continue to PlayPICKLE" onPress={()=>router.replace('/')}/><Button title="I am resetting my password" variant="secondary" onPress={()=>setState('recovery')}/></>}
 {state==='recovery'&&<><Field label="New password (at least 8 characters)" secureTextEntry value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete="new-password"/><Button title="Save new password" loading={busy} onPress={async()=>{if(password.length<8)return setError('Use at least 8 characters.');setBusy(true);setError('');try{const {error:e}=await supabase.auth.updateUser({password});if(e)throw e;setState('saved');}catch(e){setError(e.message);}finally{setBusy(false);}}}/></>}
 {state==='saved'&&<><Notice tone="success" message="Your password was updated."/><Button title="Continue" onPress={()=>router.replace('/')}/></>}
 {state==='error'&&<Button title="Return to sign in" onPress={()=>router.replace('/auth/sign-in')}/>}</Screen>;
}
