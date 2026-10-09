import React,{useState} from 'react';
import {Image,View} from 'react-native';
import {router} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import {Screen,Title,Body,Eyebrow,Card,Field,Button,Action,Notice,Section,Badge,Row,Chip,DataState} from '../components/ui';
import {useAuth} from '../providers/AuthProvider';
import {useData} from '../hooks/useData';
import {query,rpc,client,unwrap} from '../lib/api';
import {chooseAndUploadImage} from '../lib/images';
import {enablePush} from '../lib/notifications';
import {colors} from '../theme';
function ProfileDetails(){
 const {user,profile,memberships,isAdmin,refreshProfile,error}=useAuth();
 const [name,setName]=useState(profile?.display_name||''),[area,setArea]=useState(profile?.home_area||''),[avatar,setAvatar]=useState(profile?.avatar_url||null),[category,setCategory]=useState(profile?.competition_category||'open'),[message,setMessage]=useState(''),[editing,setEditing]=useState(false);
 const invites=useData(()=>query('staff_invitations',{select:'*,clubs(name)',filters:{email:user.email?.toLowerCase(),status:'pending'}}),[user.id],['staff_invitations']);
 return <Screen><Eyebrow>YOUR SIDE OF THE COURT</Eyebrow><Row>{avatar?<Image source={{uri:avatar}} style={{width:74,height:74,borderRadius:37}} accessibilityLabel="Profile photo"/>:<View style={{width:74,height:74,borderRadius:37,backgroundColor:colors.lime,alignItems:'center',justifyContent:'center'}}><Ionicons name="person-outline" size={34} color={colors.forest}/></View>}<View style={{flex:1,minWidth:180}}><Title>{profile?.display_name||'Make yourself at home'}</Title><Body style={{color:colors.muted}}>{user.email}</Body></View></Row><Notice message={error} tone="error"/><Notice message={message} tone="success"/>
 {(!profile?.display_name||editing)?<Card><Title style={{fontSize:24}}>Player profile</Title><Field label="Display name" value={name} onChangeText={setName} autoComplete="name" maxLength={80}/><Field label="Home area / city" value={area} onChangeText={setArea} maxLength={120}/><Body>Competition category</Body><Row>{['open','beginner','intermediate','advanced'].map(c=><Chip key={c} label={c} selected={category===c} onPress={()=>setCategory(c)}/>)}</Row><Body style={{color:colors.muted}}>Choose your participation category. This is not a certified skill rating.</Body>
 <Action title="Choose profile photo" variant="secondary" run={async()=>{const url=await chooseAndUploadImage('avatars',user.id);if(url)setAvatar(url);}}/>
 <Action title="Save profile" run={async()=>{if(!name.trim())throw new Error('Enter your display name.');await rpc('update_profile',{p_display_name:name.trim(),p_home_area:area.trim(),p_avatar_url:avatar,p_competition_category:category});}} onDone={async()=>{await refreshProfile();setMessage('Your profile was saved.');setEditing(false);}}/>
 {profile?.display_name&&<Button title="Close editor" variant="ghost" onPress={()=>setEditing(false)}/>}</Card>:<Card><Row><Badge>{profile?.competition_category||'open'}</Badge><Body>{profile?.home_area||'All areas'}</Body></Row><Button title="Edit profile" variant="secondary" onPress={()=>setEditing(true)}/></Card>}
 <Section title="Your game"><Button title="Reservations & competition history" variant="secondary" icon="time-outline" onPress={()=>router.push('/history')}/><Button title="Notification inbox" variant="secondary" icon="notifications-outline" onPress={()=>router.push('/notifications')}/><Action title="Enable device notifications" variant="secondary" run={enablePush} onDone={setMessage}/></Section>
 <Section title="Club community"><Button title={memberships.length?'Open club workspace':'Apply to register your club'} variant="secondary" icon="business-outline" onPress={()=>router.push('/manage')}/>{isAdmin&&<Button title="Platform administration" variant="secondary" onPress={()=>router.push('/admin')}/>}
 <DataState state={invites} emptyTitle="No staff invitations" emptyMessage="Club invitations sent to your email will appear here.">{invites.data?.map(i=><Card key={i.id}><Title style={{fontSize:22}}>{i.clubs?.name||'Club invitation'}</Title><Body>Access: {i.permissions.join(', ')}</Body><Action title="Accept staff invitation" run={()=>rpc('accept_staff_invite',{p_invitation_id:i.id})} onDone={async()=>{await refreshProfile();invites.reload();setMessage('Club access added to your account.');}}/></Card>)}</DataState></Section>
 <Action title="Sign out" variant="ghost" run={()=>unwrap(client().auth.signOut())} onDone={()=>router.replace('/auth/sign-in')}/>
 <Body style={{fontSize:13,textAlign:'center',color:colors.muted}}>PlayPICKLE · A little more play, every day.</Body></Screen>;
}

export default function Profile(){const {profile}=useAuth();return <ProfileDetails key={profile ? profile.id+':'+(profile.updated_at||profile.display_name) : 'loading'}/>;}
