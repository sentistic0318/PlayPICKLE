import React,{useState} from 'react';
import {View} from 'react-native';
import {router} from 'expo-router';
import {Screen,Eyebrow,Title,Body,Card,Field,Row,Badge,Chip,DataState,Empty,Section,Button} from '../components/ui';
import {useData} from '../hooks/useData';
import {useAuth} from '../providers/AuthProvider';
import {query} from '../lib/api';
import {dateTime} from '../lib/format';
import {colors} from '../theme';
export default function Tournaments(){
 const {user}=useAuth();const [search,setSearch]=useState(''),[category,setCategory]=useState('All');
 const state=useData(()=>query('tournaments',{select:'*,clubs(name,area,timezone)',filters:{status:['published','locked','completed']},order:'starts_at'}),[],['tournaments']);
 const invitations=useData(()=>query('teams',{select:'*,tournaments!teams_tournament_id_fkey(title)',filters:{partner_id:user.id,status:'pending'}}),[user.id],['teams']);
 const visible=state.data?.filter(t=>(t.title+' '+t.clubs?.name+' '+t.clubs?.area).toLowerCase().includes(search.toLowerCase())&&(category==='All'||t.category===category));
 return <Screen onRefresh={()=>{state.reload();invitations.reload();}} refreshing={state.loading}><Eyebrow>FIND YOUR NEXT CHALLENGE</Eyebrow><Title>Better as a team.</Title><Body style={{color:colors.muted}}>Local doubles. Real competition. Your community.</Body>
 {invitations.data?.length>0&&<Section title="You've been invited">{invitations.data.map(t=><Card key={t.id}><Badge>Partner invitation</Badge><Title style={{fontSize:23}}>{t.name}</Title><Body>{t.tournaments?.title}</Body><Button title="Review invitation" onPress={()=>router.push('/tournament/'+t.tournament_id)}/></Card>)}</Section>}
 <Field label="Search tournaments" value={search} onChangeText={setSearch} placeholder="Event, club, or area"/><Row>{['All','open','beginner','intermediate','advanced'].map(c=><Chip key={c} label={c} selected={category===c} onPress={()=>setCategory(c)}/>)}</Row>
 <DataState state={state} emptyTitle="The next competition is on its way" emptyMessage="Published tournaments from verified clubs will appear here.">{visible?.length===0?<Empty title="No matching tournaments" message="Try another category or search."/>:visible?.map(t=><Card key={t.id} onPress={()=>router.push('/tournament/'+t.id)}><Row><Badge>{t.category} doubles</Badge><Badge>{t.status==='published'?'Registration open':t.status}</Badge></Row><Title style={{fontSize:25}}>{t.title}</Title><Body>{t.clubs?.name} · {t.clubs?.area}</Body><Body style={{color:colors.muted}}>{dateTime(t.starts_at,t.clubs?.timezone)}</Body><View style={{borderTopWidth:1,borderColor:colors.border,paddingTop:12}}><Body>Single elimination · Up to {t.max_teams} teams</Body><Body style={{color:colors.forest,fontWeight:'700'}}>Meet the competition →</Body></View></Card>)}</DataState></Screen>;
}
