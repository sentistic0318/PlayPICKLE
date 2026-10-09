import React from 'react';
import {View} from 'react-native';
import {router} from 'expo-router';
import {Screen,Title,Body,Eyebrow,CourtArt,Card,Button,Section,Badge,Row,DataState,Notice} from '../components/ui';
import {useAuth} from '../providers/AuthProvider';
import {useData} from '../hooks/useData';
import {query} from '../lib/api';
import {dateTime} from '../lib/format';
import {colors} from '../theme';
export default function Home(){
 const {user,profile,memberships,isAdmin,error}=useAuth();
 const bookings=useData(async()=>{const rows=await query('bookings',{select:'*,clubs(name,timezone),courts(name)',filters:{user_id:user.id,status:'confirmed',ends_at:{gt:new Date().toISOString()}},order:'starts_at',limit:10});return rows.filter(b=>new Date(b.ends_at)>new Date());},[user.id],['bookings']);
 const matches=useData(async()=>{const memberships=await query('team_members',{filters:{player_id:user.id}});const teamIds=memberships.map(m=>m.team_id),events=[...new Set(memberships.map(m=>m.tournament_id))];if(!events.length)return [];const rows=await query('matches',{select:'*,tournaments(title,clubs(timezone)),courts(name)',filters:{tournament_id:events,status:['scheduled','in_progress']},order:'starts_at'});return rows.filter(m=>teamIds.includes(m.team_a_id)||teamIds.includes(m.team_b_id));},[user.id],['matches','teams']);
 const updates=useData(()=>query('notifications',{filters:{user_id:user.id},order:{column:'created_at',ascending:false},limit:3}),[user.id],['notifications']);
 return <Screen onRefresh={()=>{bookings.reload();updates.reload();matches.reload();}} refreshing={bookings.loading&&updates.loading}><View style={{gap:6}}><Eyebrow>LET’S GET OUT THERE</Eyebrow><Title>Hey, {profile?.display_name?.split(' ')[0]||'player'}.</Title><Body style={{color:colors.muted}}>A good day starts on the court.</Body></View><Notice message={error} tone="error"/>
 {!profile?.display_name&&<Card><Body>Make it yours. Add your name and home area to finish your profile.</Body><Button title="Complete your profile" onPress={()=>router.push('/profile')}/></Card>}
 <View style={{backgroundColor:colors.forest,padding:24,borderRadius:26,gap:12}}><Row><Badge style={{backgroundColor:colors.lime}}>MORE PLAY. LESS PLANNING.</Badge></Row><Title style={{fontSize:34,lineHeight:39,color:colors.white}}>Your next game{'\n'}is calling.</Title><CourtArt/><Button title="Find a court" variant="lime" icon="arrow-forward" onPress={()=>router.push('/courts')}/></View>
 <Section title="On your calendar" action="History" onPress={()=>router.push('/history')}><DataState state={bookings} emptyTitle="Room for a little court time" emptyMessage="Your upcoming reservations will appear here."><View style={{gap:12}}>{bookings.data?.map(b=><Card key={b.id} onPress={()=>router.push('/booking/'+b.id)}><Badge>Reserved</Badge><Title style={{fontSize:23}}>{b.clubs?.name}</Title><Body>{b.courts?.name} · {dateTime(b.starts_at,b.clubs?.timezone)}</Body><Body style={{color:colors.forest,fontWeight:'700'}}>View reservation →</Body></Card>)}</View></DataState></Section>
 <Section title="Your next matches"><DataState state={matches} emptyTitle="Your doubles story starts here" emptyMessage="Scheduled tournament matches will appear here.">{matches.data?.map(m=><Card key={m.id} onPress={()=>router.push('/tournament/'+m.tournament_id)}><Badge>{m.status}</Badge><Title style={{fontSize:22}}>{m.tournaments?.title}</Title><Body>Round {m.round} · {m.courts?.name}</Body><Body>{dateTime(m.starts_at,m.tournaments?.clubs?.timezone)}</Body></Card>)}</DataState></Section>
 <Card><Eyebrow>BETTER TOGETHER</Eyebrow><Title style={{fontSize:25}}>Two paddles. One team.</Title><Body style={{color:colors.muted}}>Find a doubles tournament, invite your partner, and play for your club’s seasonal standings.</Body><Button title="Explore tournaments" variant="secondary" onPress={()=>router.push('/tournaments')}/></Card>
 <Section title="Around your community" action="Inbox" onPress={()=>router.push('/notifications')}><DataState state={updates} emptyTitle="You're all caught up" emptyMessage="Booking and tournament updates will find you here.">{updates.data?.map(n=><Card key={n.id}><Body style={{fontWeight:'700'}}>{n.title}</Body><Body>{n.body}</Body></Card>)}</DataState></Section>
 {(memberships.length>0||isAdmin)&&<Button title="Open club workspace" variant="secondary" onPress={()=>router.push('/manage')}/>}
 {isAdmin&&<Button title="Platform administration" variant="secondary" onPress={()=>router.push('/admin')}/>}
 </Screen>;
}
