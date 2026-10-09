import React from 'react';
import {router} from 'expo-router';
import {Screen,Title,Body,Card,Badge,DataState,Action,Button} from '../components/ui';
import {useAuth} from '../providers/AuthProvider';
import {query,rpc} from '../lib/api';
import {useData} from '../hooks/useData';
import {dateTime} from '../lib/format';
import {colors} from '../theme';
export default function Notifications(){const {user}=useAuth();const state=useData(()=>query('notifications',{filters:{user_id:user.id},order:{column:'created_at',ascending:false},limit:100}),[user.id],['notifications']);return <Screen refreshing={state.loading} onRefresh={state.reload}><Title>Around your game.</Title><Body style={{color:colors.muted}}>Reservations, invitations, schedules, and results. All in one place.</Body><DataState state={state} emptyTitle="You're all caught up" emptyMessage="Your first booking or tournament update will appear here.">{state.data?.map(n=><Card key={n.id} style={!n.read_at?{borderColor:colors.forest}:null}>{!n.read_at&&<Badge>New update</Badge>}<Title style={{fontSize:22}}>{n.title}</Title><Body>{n.body}</Body><Body style={{fontSize:13,color:colors.muted}}>{dateTime(n.created_at)}</Body>{n.data?.booking_id&&<Button title="View reservation" variant="secondary" onPress={()=>router.push('/booking/'+n.data.booking_id)}/>} {n.data?.tournament_id&&<Button title="View tournament" variant="secondary" onPress={()=>router.push('/tournament/'+n.data.tournament_id)}/>} {!n.read_at&&<Action title="Mark as read" variant="ghost" run={()=>rpc('mark_notification_read',{p_notification_id:n.id})} onDone={state.reload}/>}</Card>)}</DataState></Screen>;}
