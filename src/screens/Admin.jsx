import React,{useState} from 'react';
import {router} from 'expo-router';
import {Text} from 'react-native';
import {Screen,Title,Body,Card,Field,Button,Badge,Notice,Empty} from '../components/ui';
import {query,rpc} from '../lib/api';
import {useData} from '../hooks/useData';
import {useAuth} from '../providers/AuthProvider';
import {Chips,FetchState,FormCard,Stack,Toggle,required,number,localTime,useAction} from './management/shared';
function ClubReview({club,reload}){
 const [reason,setReason]=useState('');const action=useAction(reload);
 return <Card><Title style={{fontSize:22}}>{club.name}</Title><Badge>{club.verification_status}</Badge><Body>{club.area} · {club.address}</Body><Body>{club.timezone}</Body><Field label="Verification decision reason" value={reason} onChangeText={setReason} multiline/>
 {['verified','rejected','pending'].map(status=><Button key={status} title={status==='verified'?'Verify club':status==='rejected'?'Reject application':'Return to review'} variant={status==='verified'?'primary':'secondary'} loading={action.busy} disabled={club.verification_status===status} onPress={()=>action.run(()=>rpc('verify_club',{p_club_id:club.id,p_status:status,p_reason:required(reason,'Reason')}),'Club verification updated.')}/>)}
 {action.feedback}</Card>;
}
function AccountReview({profile,reload,currentUser}){
 const [reason,setReason]=useState('');const action=useAction(reload);const next=profile.status==='active'?'suspended':'active';
 return <Card><Title style={{fontSize:22}}>{profile.display_name||'Profile not completed'}</Title><Badge>{profile.status}</Badge><Text selectable>Account {profile.id}</Text><Field label="Account status change reason" value={reason} onChangeText={setReason}/><Button title={next==='suspended'?'Suspend account':'Reactivate account'} variant="secondary" disabled={profile.id===currentUser&&next==='suspended'} loading={action.busy} onPress={()=>action.run(()=>rpc('manage_account',{p_user_id:profile.id,p_status:next,p_reason:required(reason,'Reason')}),'Account status updated.')}/>{action.feedback}</Card>;
}
function PolicyForm({rule,reload}){
 const [form,setForm]=useState({name:rule?.name||'Single-game doubles policy',game_points:String(rule?.game_points||11),win_by:'2',champion_points:String(rule?.champion_points??100),runner_up_points:String(rule?.runner_up_points??60),semifinal_points:String(rule?.semifinal_points??30),participation_points:String(rule?.participation_points??10),dispute_hours:String(rule?.dispute_hours??48),confirmed:rule?.confirmed||false});
 const set=key=>value=>setForm(prev=>({...prev,[key]:value}));const action=useAction(reload);
 return <FormCard title={rule?'Edit policy':'Create policy'}><Notice message="The default game to 11, win by 2 is confirmed. Placement points and the reporting window require explicit approval. Both partners receive placement points. These are PlayPICKLE points, not certified skill ratings."/><Field label="Policy name" value={form.name} onChangeText={set('name')}/><Body>One game, win by 2</Body><Chips items={[{value:'11',label:'Game to 11'},{value:'15',label:'Game to 15'}]} value={form.game_points} onChange={set('game_points')}/>
 {Object.entries({champion_points:'Champion points',runner_up_points:'Runner-up points',semifinal_points:'Semifinalist points',participation_points:'Other entrant points',dispute_hours:'Reporting window in hours'}).map(([key,label])=><Field key={key} label={label} value={form[key]} onChangeText={set(key)} keyboardType="number-pad"/>)}
 <Body>Open disputes hold tournament points. An administrator reviews and resolves reports. Changes apply to future publications; saved event policies remain intact.</Body><Toggle label="I explicitly confirm this scoring, points, and dispute policy" value={form.confirmed} onChange={set('confirmed')}/>
 <Button title={form.confirmed?'Save confirmed policy':'Save unconfirmed draft'} loading={action.busy} onPress={()=>action.run(()=>rpc('save_ranking_rule',{p_id:rule?.id||null,p_name:required(form.name,'Policy name'),p_game_points:Number(form.game_points),p_win_by:2,p_champion_points:number(form.champion_points,'Champion points',0,100000,true),p_runner_up_points:number(form.runner_up_points,'Runner-up points',0,100000,true),p_semifinal_points:number(form.semifinal_points,'Semifinal points',0,100000,true),p_participation_points:number(form.participation_points,'Participation points',0,100000,true),p_dispute_hours:number(form.dispute_hours,'Reporting hours',1,720,true),p_confirmed:form.confirmed}),'Policy saved.')}/>{action.feedback}</FormCard>;
}
function ReportReview({report,reload}){
 const [resolution,setResolution]=useState('');const action=useAction(reload);
 return <Card><Badge>{report.status}</Badge><Title style={{fontSize:22}}>Result report</Title><Body>{report.reason}</Body><Body>{localTime(report.created_at)}</Body><Button title="View tournament bracket" variant="secondary" onPress={()=>router.push('/tournament/'+report.tournament_id)}/><Button title="Open workspace to review / correct result" variant="secondary" onPress={()=>router.push('/manage')}/>
 {report.status==='open'?<><Notice message="Apply any authorized result correction in the club workspace first, then record the review outcome here. A downstream match that has started requires audited event cancellation and replay instead of automatic rewriting."/><Field label="Resolution (at least 10 characters)" value={resolution} onChangeText={setResolution} multiline/><Button title="Resolve report" loading={action.busy} onPress={()=>action.run(()=>rpc('resolve_dispute',{p_dispute_id:report.id,p_resolution:required(resolution,'Resolution')}),'Report resolved and the player notified.')}/></>:<Body>{report.resolution}</Body>}{action.feedback}</Card>;
}
function AdminContent(){
 const {user}=useAuth();const [tab,setTab]=useState('Clubs'),[policy,setPolicy]=useState('new'),[search,setSearch]=useState('');
 const state=useData(async()=>{const [clubs,profiles,rules,disputes,audit]=await Promise.all([query('clubs',{order:{column:'created_at',ascending:false}}),query('profiles',{order:'display_name'}),query('ranking_rules',{order:'name'}),query('disputes',{order:{column:'created_at',ascending:false}}),query('audit_log',{order:{column:'created_at',ascending:false},limit:100})]);return {clubs,profiles,rules,disputes,audit};},[],['clubs','disputes','profiles']);
 return <Screen onRefresh={state.reload} refreshing={state.loading}><Title>Keep the game fair.</Title><Body>Review clubs, protect accounts, and keep competition records accountable.</Body><Chips items={['Clubs','Accounts','Policies','Disputes','Audit']} value={tab} onChange={setTab}/>
 <FetchState state={state}>{state.data?<Stack>
 {tab==='Clubs'?(state.data.clubs.length?state.data.clubs.map(club=><ClubReview key={club.id+club.verification_status} club={club} reload={state.reload}/>):<Empty title="No club applications" message="Owner applications appear here for review."/>):null}
 {tab==='Accounts'?<><Field label="Find account by display name" value={search} onChangeText={setSearch}/>{state.data.profiles.filter(p=>p.display_name.toLowerCase().includes(search.toLowerCase())).map(profile=><AccountReview key={profile.id+profile.status} profile={profile} reload={state.reload} currentUser={user.id}/>)}</>:null}
 {tab==='Policies'?<><Chips items={[{value:'new',label:'+ New policy'},...state.data.rules.map(r=>({value:r.id,label:r.name+(r.confirmed?'':' · draft')}))]} value={policy} onChange={setPolicy}/><PolicyForm key={policy} rule={state.data.rules.find(r=>r.id===policy)} reload={state.reload}/></>:null}
 {tab==='Disputes'?(state.data.disputes.length?state.data.disputes.map(report=><ReportReview key={report.id+report.status} report={report} reload={state.reload}/>):<Empty title="No result reports" message="Player disputes appear here for review."/>):null}
 {tab==='Audit'?<><Body>Latest 100 immutable audit records</Body>{state.data.audit.map(a=><Card key={a.id}><Badge>{a.action.replaceAll('.',' ')}</Badge><Body>{localTime(a.created_at)}</Body>{a.details?.reason?<Body>{a.details.reason}</Body>:null}{a.details?.resolution?<Body>{a.details.resolution}</Body>:null}{a.details?.status?<Body>Status: {a.details.status}</Body>:null}<Text selectable>Actor: {a.actor_id}</Text><Text selectable>Record: {a.entity_id}</Text></Card>)}</>:null}
 </Stack>:null}</FetchState></Screen>;
}
export default function Admin(){const {isAdmin}=useAuth();return isAdmin?<AdminContent/>:<Screen><Title>Administrator access required</Title><Body>This account does not have platform administrator privileges.</Body><Button title="Return to profile" onPress={()=>router.replace('/profile')}/></Screen>;}
