import {queryAll} from './api';
export async function loadTournamentEntries(tournamentId) {
 const [teams,matches]=await Promise.all([
  queryAll('teams',{filters:{tournament_id:tournamentId}}),
  queryAll('matches',{select:'*,courts(name)',filters:{tournament_id:tournamentId}}),
 ]);
 teams.sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 matches.sort((a,b)=>a.round-b.round||a.position-b.position||a.id.localeCompare(b.id));
 return {teams,matches};
}
export function playerEntries(teams,playerId) {
 return {
  myTeam:teams.find(t=>t.status!=='withdrawn'&&(t.captain_id===playerId||(t.status==='accepted'&&t.partner_id===playerId))),
  invitations:teams.filter(t=>t.status==='pending'&&t.partner_id===playerId),
 };
}
