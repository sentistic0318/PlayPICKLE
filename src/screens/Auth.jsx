import React,{useState} from 'react';
import {View} from 'react-native';
import {router} from 'expo-router';
import * as Linking from 'expo-linking';
import {Screen,Brand,Eyebrow,Title,Body,Card,CourtArt,Button,Field,Notice} from '../components/ui';
import {colors} from '../theme';
import {supabase,configured} from '../lib/supabase';
export default function Auth(){
 const [mode,setMode]=useState('login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function submit(){setError('');setMessage('');if(!email.includes('@'))return setError('Enter your email address.');if(mode!=='reset'&&password.length<8)return setError('Use a password with at least 8 characters.');setBusy(true);
 try{const redirectTo=Linking.createURL('auth/callback');let result;
 if(mode==='signup')result=await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:redirectTo}});
 else if(mode==='reset')result=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo});
 else result=await supabase.auth.signInWithPassword({email:email.trim(),password});
 if(result.error)throw result.error;
 if(mode==='reset')setMessage('If this email has an account, a password reset link is on its way. Open it on this device.');
 else if(result.data.session)router.replace('/');else setMessage('Check your email to verify your account, then return to sign in.');
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 return <Screen topSafe style={{paddingTop:30}}><Brand/><View style={{backgroundColor:colors.forest,borderRadius:26,padding:26,gap:12}}><Eyebrow light>YOUR NEXT GOOD GAME</Eyebrow><Title style={{fontSize:40,lineHeight:44,color:colors.white}}>Find your court.{'\n'}Find your people.</Title><CourtArt/><Body style={{color:'#DDE9DF'}}>Book a court. Team up for doubles. Make every match count.</Body></View>
 {!configured?<Card><Title style={{fontSize:24}}>Let’s connect your club community.</Title><Body>PlayPICKLE needs its Supabase connection before accounts and reservations can go live.</Body><Notice message="Add your project URL and publishable key to .env, apply the included migrations, and restart Expo. The README walks you through each step."/><Body style={{color:colors.muted}}>Your app uses real records. No sample reservations or rankings are shown as live data.</Body></Card>:<Card>
 <Title style={{fontSize:26}}>{mode==='signup'?'Join the community':mode==='reset'?'Reset your password':'Welcome back'}</Title><Body style={{color:colors.muted}}>{mode==='signup'?'Your next game starts here.':'A little less planning. A lot more playing.'}</Body>
 <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress"/>
 {mode!=='reset'&&<Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode==='signup'?'new-password':'current-password'} textContentType={mode==='signup'?'newPassword':'password'}/>}
 <Notice message={error} tone="error"/><Notice message={message} tone="success"/>
 <Button title={mode==='signup'?'Create account':mode==='reset'?'Send reset link':'Sign in'} onPress={submit} loading={busy}/>
 {mode==='login'&&<Button title="Forgot password?" variant="ghost" onPress={()=>{setMode('reset');setError('');setMessage('');}}/>}
 <Button title={mode==='login'?'New here? Create an account':'Already a member? Sign in'} variant="secondary" onPress={()=>{setMode(mode==='login'?'signup':'login');setError('');setMessage('');}}/>
 </Card>}<Body style={{textAlign:'center',fontSize:13,color:colors.muted}}>COURTS. COMMUNITY. COMPETITION.</Body></Screen>;
}
