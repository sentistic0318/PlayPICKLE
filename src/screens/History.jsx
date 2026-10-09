import React,{useState} from 'react';
import {router} from 'expo-router';
import {Screen,Title,Body,Card,Row,Chip,Badge,DataState,Button} from '../components/ui';
import {useAuth} from '../providers/AuthProvider';
import {useData} from '../hooks/useData';
import {query} from '../lib/api';
import {dateTime,money} from '../lib/format';
import {colors} from '../theme';
export default function History(){
 const {user}=useAuth();const [tab,setTab]=useState('Reservations');
 const reservations=useData(()=>query('bookings',{select:'*,clubs(name,timezone),courts(name)',filters:{user_id:user.id},order:{column:'created_at',ascending:false},limit:200}),[user.id],['bookings']);
 const teams=useData(()=>Promise.all([query('teams',{select:'*,tournaments!teams_tournament_id_fkey(title,category,starts_at,clubs(name,timezone))',filters:{captain_id:user.id},limit:200}),query('teams',{select:'*,tournaments!teams_tournament_id_fkey(title,category,starts_at,clubs(name,timezone))',filters:{partner_id:user.id},limit:200})]).then(groups=>groups.flat().map(team=>({team_id:team.id,tournament_id:team.tournament_id,teams:team}))),[user.id],['teams','matches']);
 const points=useData(()=>query('point_ledger',{select:'*,tournaments(title),seasons(name),clubs(name)',filters:{player_id:user.id},order:{column:'created_at',ascending:false},limit:200}),[user.id],['point_ledger']);
 const reports=useData(()=>query('disputes',{filters:{reporter_id:user.id},order:{column:'created_at',ascending:false},limit:100}),[user.id],['disputes']);
 return <Screen refreshing={reservations.loading} onRefresh={()=>{reservations.reload();teams.reload();points.reload();reports.reload();}}><Title>Your game, on record.</Title><Body style={{color:colors.muted}}>Reservations, competition, and every point along the way.</Body><Row>{['Reservations','Competition','Points','Reports'].map(t=><Chip key={t} label={t} selected={tab===t} onPress={()=>setTab(t)}/>)}</Row>
 {tab==='Reservations'&&<DataState state={reservations} emptyTitle="Your first court is waiting" emptyMessage="Confirmed and cancelled reservations appear here.">{reservations.data?.map(b=><Card key={b.id} onPress={()=>router.push('/booking/'+b.id)}><Badge>{b.status}</Badge><Title style={{fontSize:22}}>{b.clubs?.name}</Title><Body>{b.courts?.name} · {dateTime(b.starts_at,b.clubs?.timezone)}</Body><Body>{money(b.price_total,b.currency)}</Body></Card>)}</DataState>}
 {tab==='Competition'&&<DataState state={teams} emptyTitle="Every player starts somewhere" emptyMessage="Join a doubles tournament to start your competition history.">{teams.data?.map(m=><Card key={m.team_id} onPress={()=>router.push('/tournament/'+m.tournament_id)}><Badge>{m.teams?.status}</Badge><Title style={{fontSize:23}}>{m.teams?.tournaments?.title}</Title><Body>{m.teams?.name} · {m.teams?.tournaments?.category}</Body><Body>{m.teams?.tournaments?.clubs?.name}</Body>{m.teams?.placement&&<Body>Final placement: {m.teams.placement}</Body>}<Body>View matches & results →</Body></Card>)}</DataState>}
 {tab==='Points'&&<DataState state={points} emptyTitle="Points will follow your play" emptyMessage="Finalized awards, reversals, and corrections appear here.">{points.data?.map(p=><Card key={p.id}><Row style={{justifyContent:'space-between'}}><Badge>{p.kind}</Badge><Title style={{fontSize:25}}>{Number(p.points)>0?'+':''}{p.points}</Title></Row><Body style={{fontWeight:'700'}}>{p.tournaments?.title}</Body><Body>{p.clubs?.name} · {p.seasons?.name} · {p.category}</Body><Body>{p.reason}</Body><Body style={{color:colors.muted,fontSize:13}}>{dateTime(p.created_at)}</Body></Card>)}</DataState>}
 {tab==='Reports'&&<DataState state={reports} emptyTitle="No reported results" emptyMessage="You can report an incorrect verified match from its tournament bracket.">{reports.data?.map(d=><Card key={d.id}><Badge>{d.status}</Badge><Body>{d.reason}</Body>{d.resolution&&<Body>Resolution: {d.resolution}</Body>}<Body>{dateTime(d.created_at)}</Body><Button title="View tournament" variant="secondary" onPress={()=>router.push('/tournament/'+d.tournament_id)}/></Card>)}</DataState>}
 </Screen>;
}
