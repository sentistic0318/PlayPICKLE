import { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Body, Button, Card, Empty, Field, Notice } from '../../components/ui';
import { query, rpc } from '../../lib/api';
import { useData } from '../../hooks/useData';
import { useAuth } from '../../providers/AuthProvider';
import { Chips, DateRange, FetchState, FormCard, Stack, Toggle, day, localTime, number, required, styles, timeRange, timestamp, useAction } from './shared';

const categories = ['open', 'beginner', 'intermediate', 'advanced'];
const inputTime = value => value ? new Date(value).toISOString().replace('.000Z', 'Z') : '';
const teamName = (teams, id) => teams.find(team => team.id === id)?.name || (id ? 'Team' : 'Awaiting opponent');

function EventForm({ club, event, seasons, rules, reload }) {
  const [form, setForm] = useState({ title: event?.title || '', description: event?.description || '', category: event?.category || 'open', starts_at: inputTime(event?.starts_at), registration_deadline: inputTime(event?.registration_deadline), max_teams: String(event?.max_teams || 16), season_id: event?.season_id || seasons.find(season => !season.archived)?.id || '', policy_id: event?.policy_id || rules.find(rule => rule.confirmed)?.id || '' });
  const set = key => value => setForm(previous => ({ ...previous, [key]: value }));
  const action = useAction(reload);
  return <FormCard title={event ? 'Edit tournament draft' : 'Create a tournament'}>
    <Field label="Tournament title" value={form.title} onChangeText={set('title')} />
    <Field label="Description and eligibility information" value={form.description} onChangeText={set('description')} multiline />
    <Text style={styles.label}>Competition category</Text><Chips items={categories} value={form.category} onChange={set('category')} />
    <Body>Choose a season and an administrator-confirmed policy. Published events preserve their policy.</Body>
    <Text style={styles.label}>Season</Text>{seasons.some(season => !season.archived) ? <Chips items={seasons.filter(season => !season.archived).map(season => ({ value: season.id, label: season.name }))} value={form.season_id} onChange={set('season_id')} /> : <Notice message="Create an active season in the Seasons tab first." />}
    <Text style={styles.label}>Scoring and ranking policy</Text>{rules.some(rule => rule.confirmed) ? <Chips items={rules.filter(rule => rule.confirmed).map(rule => ({ value: rule.id, label: rule.name }))} value={form.policy_id} onChange={set('policy_id')} /> : <Notice message="An administrator must confirm a scoring, points, and dispute policy before an event can be published." />}
    <Body>Club time zone: {club.timezone}. Enter timestamps with their UTC offset, for example 2026-10-15T09:00+08:00.</Body>
    <Field label="Tournament starts • timestamp with offset" value={form.starts_at} onChangeText={set('starts_at')} autoCapitalize="none" />
    <Field label="Registration deadline • timestamp with offset" value={form.registration_deadline} onChangeText={set('registration_deadline')} autoCapitalize="none" />
    <Field label="Maximum doubles teams" value={form.max_teams} onChangeText={set('max_teams')} keyboardType="number-pad" />
    {action.feedback}<Button title="Save tournament draft" loading={action.busy} onPress={() => action.run(async () => {
      const starts = timestamp(form.starts_at, 'Tournament start'); const deadline = timestamp(form.registration_deadline, 'Registration deadline');
      if (deadline >= starts) throw new Error('Registration must close before the tournament starts.');
      await rpc('save_tournament', { p_id: event?.id || null, p_club_id: club.id, p_season_id: required(form.season_id, 'Season'), p_title: required(form.title, 'Title'), p_description: form.description.trim(), p_category: form.category, p_starts_at: starts, p_registration_deadline: deadline, p_max_teams: number(form.max_teams, 'Team capacity', 2, 128, true), p_policy_id: required(form.policy_id, 'Confirmed policy') });
    }, 'Tournament draft saved.')} />
  </FormCard>;
}

function SeasonForm({ club, season, reload }) {
  const [name, setName] = useState(season?.name || '');
  const [start, setStart] = useState(season?.starts_on || ''); const [end, setEnd] = useState(season?.ends_on || '');
  const [archived, setArchived] = useState(season?.archived || false);
  const action = useAction(reload);
  return <FormCard title={season ? 'Edit season' : 'Start a new season'}>
    <Field label="Season name" value={name} onChangeText={setName} />
    <Field label="First day • YYYY-MM-DD" value={start} onChangeText={setStart} />
    <Field label="Last day • YYYY-MM-DD" value={end} onChangeText={setEnd} />
    {season ? <Toggle label="Archive this season" value={archived} onChange={setArchived} /> : null}
    <Body>Archived seasons retain every result and points record. New events use an active season.</Body>
    {action.feedback}<Button title="Save season" loading={action.busy} onPress={() => action.run(async () => {
      const starts_on = day(start, 'First day'); const ends_on = day(end, 'Last day');
      if (ends_on < starts_on) throw new Error('Last day must be on or after first day.');
      await rpc('save_season', { p_club_id: club.id, p_season_id: season?.id || null, p_details: { name: required(name, 'Season name'), starts_on, ends_on, archived } });
    }, 'Season saved.')} />
  </FormCard>;
}
function Seasons({ club, seasons, reload }) {
  const [selected, setSelected] = useState('new');
  return <Stack><Chips items={[{ value: 'new', label: '+ New season' }, ...seasons.map(season => ({ value: season.id, label: season.name + (season.archived ? ' · archived' : '') }))]} value={selected} onChange={setSelected} /><SeasonForm key={selected} club={club} season={seasons.find(season => season.id === selected)} reload={reload} /></Stack>;
}
function MatchForm({match,club,teams,courts,canManage,canResults,reload,isAdmin}){
 const [court,setCourt]=useState(match.court_id||courts[0]?.id||''),[start,setStart]=useState(inputTime(match.starts_at)),[end,setEnd]=useState(inputTime(match.ends_at));
 const [a,setA]=useState(String(match.score_a??'')),[b,setB]=useState(String(match.score_b??'')),[reason,setReason]=useState('');
 const action=useAction(reload);
 return <Card><Stack><View style={styles.row}><Text style={styles.heading}>Round {match.round} · Match {match.position}</Text><Badge>{match.status}</Badge></View>
 <Body>{teamName(teams,match.team_a_id)} vs {match.status==='bye'?'Bye':teamName(teams,match.team_b_id)}</Body><Body>{localTime(match.starts_at,club.timezone)}</Body>
 {match.winner_team_id?<Body>Winner: {teamName(teams,match.winner_team_id)}</Body>:null}
 {canManage&&['ready','scheduled'].includes(match.status)?<><Chips items={courts.filter(c=>c.active).map(c=>({value:c.id,label:c.name}))} value={court} onChange={setCourt}/><DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} timezone={club.timezone}/><Button title="Save match schedule" loading={action.busy} onPress={()=>action.run(()=>{const range=timeRange(start,end);return rpc('schedule_match',{p_match_id:match.id,p_court_id:required(court,'Court'),p_starts_at:range.starts_at,p_ends_at:range.ends_at});},'Match scheduled; participants notified.')}/></>:null}
 {canResults&&['scheduled','in_progress'].includes(match.status)?<><Body>Enter the completed single-game score after the scheduled start.</Body><Field label={teamName(teams,match.team_a_id)+' score'} value={a} onChangeText={setA} keyboardType="number-pad"/><Field label={teamName(teams,match.team_b_id)+' score'} value={b} onChangeText={setB} keyboardType="number-pad"/><Button title="Submit score for verification" loading={action.busy} onPress={()=>action.run(()=>rpc('submit_match_score',{p_match_id:match.id,p_score_a:number(a,'First score',0,1000,true),p_score_b:number(b,'Second score',0,1000,true)}),'Score submitted. Verify the recorded result before advancement.')}/></>:null}
 {match.status==='submitted'?<><Body>Submitted score: {match.score_a} – {match.score_b}</Body>{canResults?<Button title="Verify score & advance winner" loading={action.busy} onPress={()=>action.run(()=>rpc('verify_match',{p_match_id:match.id}),'Result verified. Winner advanced.')}/>:null}</>:null}
 {match.status==='verified'?<Body>Verified score: {match.score_a} – {match.score_b}</Body>:null}
 {isAdmin&&match.status==='verified'?<><Body>Corrections preserve history and reverse affected points. Later matches that have started block automatic rewriting.</Body><Field label="Correct first score" value={a} onChangeText={setA} keyboardType="number-pad"/><Field label="Correct second score" value={b} onChangeText={setB} keyboardType="number-pad"/><Field label="Correction reason (at least 10 characters)" value={reason} onChangeText={setReason} multiline/><Button title="Apply audited correction" loading={action.busy} variant="secondary" onPress={()=>action.run(()=>rpc('correct_match_result',{p_match_id:match.id,p_score_a:number(a,'First score',0,1000,true),p_score_b:number(b,'Second score',0,1000,true),p_reason:required(reason,'Reason')}),'Correction recorded. Recheck future match schedules and finalize points after the reporting window.')}/></>:null}
 {action.feedback}</Stack></Card>;
}
function TeamRecord({team,event,reload,canManage}){
 const [reason,setReason]=useState('');const action=useAction(reload);
 return <Card><Stack><Text style={styles.label}>{team.name}</Text><Badge>{team.status}</Badge>{team.placement?<Body>Placement: {team.placement}</Body>:null}
 {canManage&&event.status==='published'&&team.status!=='withdrawn'?<><Field label="Withdrawal reason" value={reason} onChangeText={setReason}/><Button title="Withdraw this team" variant="secondary" loading={action.busy} onPress={()=>action.run(()=>rpc('withdraw_team',{p_team_id:team.id,p_reason:required(reason,'Reason')}),'Team withdrawn; both partners notified.')}/></>:null}{action.feedback}</Stack></Card>;
}
function EventOperations({event,club,courts,canManage,canResults,reload,isAdmin}){
 const [tab,setTab]=useState('Teams'),[cancel,setCancel]=useState(false),[reason,setReason]=useState('');
 const state=useData(async()=>{const [teams,matches]=await Promise.all([query('teams',{filters:{tournament_id:event.id},order:'created_at'}),query('matches',{filters:{tournament_id:event.id},order:'round'})]);return {teams,matches};},[event.id],['teams','matches']);
 const refresh=async()=>{await reload();await state.reload();};const action=useAction(refresh);
 return <Stack><FormCard title={event.title}><Badge>{event.status}</Badge><Body>{localTime(event.starts_at,club.timezone)} · {event.category} doubles</Body><Body>Registration closes {localTime(event.registration_deadline,club.timezone)}.</Body>
 {canManage&&event.status==='draft'?<Button title="Publish tournament" loading={action.busy} onPress={()=>action.run(()=>rpc('publish_tournament',{p_tournament_id:event.id}),'Tournament published.')}/>:null}
 {canManage&&event.status==='published'?<><Body>Generate the bracket after the registration deadline. This locks accepted entries and records a random draw with byes.</Body><Button title="Generate & lock bracket" loading={action.busy} onPress={()=>action.run(()=>rpc('generate_bracket',{p_tournament_id:event.id}),'Bracket generated and entries locked.')}/></>:null}
 {canResults&&event.status==='completed'?<><Body>Points can be finalized after the reporting window and resolution of all disputes.</Body><Button title={event.finalized_at?'Points finalized':'Finalize competition points'} disabled={!!event.finalized_at} loading={action.busy} onPress={()=>action.run(()=>rpc('finalize_tournament',{p_tournament_id:event.id}),'Competition points finalized.')}/></>:null}
 {isAdmin&&event.status!=='cancelled'?<Button title="Review event cancellation" variant="ghost" onPress={()=>setCancel(!cancel)}/>:null}
 {cancel?<><Notice message="Cancellation reverses event points and releases future match court time. Match history remains. Use this for an authorized resolution when downstream matches cannot safely be rewritten."/><Field label="Detailed cancellation / replay reason" value={reason} onChangeText={setReason} multiline/><Button title="Confirm audited event cancellation" variant="danger" loading={action.busy} onPress={()=>action.run(()=>rpc('cancel_tournament',{p_tournament_id:event.id,p_reason:required(reason,'Reason')}),'Tournament cancelled with an audit record.')}/></>:null}
 {action.feedback}</FormCard><Chips items={['Teams','Matches']} value={tab} onChange={setTab}/>
 <FetchState state={state}>{state.data?<Stack>{tab==='Teams'?(state.data.teams.length?state.data.teams.map(team=><TeamRecord key={team.id} team={team} event={event} reload={refresh} canManage={canManage}/>):<Empty title="No teams yet" message="Published events accept player registrations before the deadline."/>):(state.data.matches.length?state.data.matches.map(match=><MatchForm key={match.id+':'+match.status+':'+match.score_a+':'+match.score_b} match={match} club={club} courts={courts} teams={state.data.teams} canManage={canManage&&event.status==='locked'} canResults={canResults&&event.status!=='cancelled'} reload={refresh} isAdmin={isAdmin&&event.status!=='cancelled'}/>):<Empty title="No bracket yet" message="Generate a bracket after registration closes."/>)}</Stack>:null}</FetchState></Stack>;
}
export default function TournamentPanel({club,canManage,canResults}){
 const {isAdmin}=useAuth();const [tab,setTab]=useState('Events'),[selected,setSelected]=useState('new');
 const state=useData(async()=>{const [events,seasons,rules,courts]=await Promise.all([query('tournaments',{filters:{club_id:club.id},order:{column:'created_at',ascending:false}}),query('seasons',{filters:{club_id:club.id},order:{column:'starts_on',ascending:false}}),query('ranking_rules',{order:'name'}),query('courts',{filters:{club_id:club.id}})]);return {events,seasons,rules,courts};},[club.id],['tournaments','seasons']);
 const event=state.data?.events.find(e=>e.id===selected);
 return <Stack><Chips items={canManage?['Events','Seasons']:['Events']} value={tab} onChange={setTab}/><FetchState state={state}>{state.data?<>
 {tab==='Seasons'&&canManage?<Seasons club={club} seasons={state.data.seasons} reload={state.reload}/>:<>
 <Chips items={[...(canManage?[{value:'new',label:'+ New event'}]:[]),...state.data.events.map(e=>({value:e.id,label:e.title}))]} value={selected} onChange={setSelected}/>
 {selected==='new'&&canManage?<EventForm key="new" club={club} seasons={state.data.seasons} rules={state.data.rules} reload={state.reload}/>:event?<Stack>{event.status==='draft'&&canManage?<EventForm key={event.id} club={club} event={event} seasons={state.data.seasons} rules={state.data.rules} reload={state.reload}/>:null}<EventOperations event={event} club={club} courts={state.data.courts} canManage={canManage} canResults={canResults} reload={state.reload} isAdmin={isAdmin}/></Stack>:<Empty title="Choose a tournament" message="Select an event to manage its teams, matches, and results."/>}</>}
 </>:null}</FetchState></Stack>;
}
