import React,{useState} from 'react';
import {View} from 'react-native';
import {Screen,Eyebrow,Title,Body,Card,Row,Chip,Badge,Section,DataState} from '../components/ui';
import {useData} from '../hooks/useData';
import {query} from '../lib/api';
import {useAuth} from '../providers/AuthProvider';
import {colors} from '../theme';
export default function Rankings(){
 const {user}=useAuth();const [clubId,setClubId]=useState(''),[seasonId,setSeasonId]=useState(''),[category,setCategory]=useState('open');
 const clubs=useData(()=>query('clubs',{filters:{verification_status:'verified'},order:'name'}),[]);
 const chosenClub=clubId||clubs.data?.[0]?.id;
 const seasons=useData(()=>chosenClub?query('seasons',{filters:{club_id:chosenClub},order:{column:'starts_on',ascending:false}}):Promise.resolve([]),[chosenClub],['seasons']);
 const chosenSeason=seasonId||seasons.data?.[0]?.id;
 const standings=useData(()=>chosenSeason?query('rankings',{filters:{club_id:chosenClub,season_id:chosenSeason,category},order:{column:'total_points',ascending:false}}):Promise.resolve([]),[chosenClub,chosenSeason,category],['point_ledger','tournaments']);
 return <Screen onRefresh={()=>{clubs.reload();seasons.reload();standings.reload();}} refreshing={standings.loading}><Eyebrow>EVERY MATCH COUNTS</Eyebrow><Title>Your club. Your climb.</Title><Body style={{color:colors.muted}}>Seasonal points from verified tournament placements.</Body>
 <DataState state={clubs} emptyTitle="Standings start with a community" emptyMessage="Verified clubs and their seasons will appear here."><Section title="Choose your club"><Row>{clubs.data?.map(c=><Chip key={c.id} label={c.name} selected={chosenClub===c.id} onPress={()=>{setClubId(c.id);setSeasonId('');}}/>)}</Row></Section></DataState>
 {chosenClub&&<><Section title="Season"><DataState state={seasons} emptyTitle="A fresh season is coming" emptyMessage="Your club's seasons will appear once configured."><Row>{seasons.data?.map(s=><Chip key={s.id} label={s.name+(s.archived?' · archived':'')} selected={chosenSeason===s.id} onPress={()=>setSeasonId(s.id)}/>)}</Row></DataState></Section><Row>{['open','beginner','intermediate','advanced'].map(c=><Chip key={c} label={c} selected={category===c} onPress={()=>setCategory(c)}/>)}</Row>
 {chosenSeason&&<DataState state={standings} emptyTitle="A level playing field" emptyMessage="No finalized points in this category yet. Finish a verified tournament to get on the board.">{standings.data?.map(p=>{const place=standings.data.findIndex(row=>Number(row.total_points)===Number(p.total_points))+1;return <Card key={p.player_id} style={p.player_id===user.id?{borderColor:colors.forest,borderWidth:2}:null}><Row style={{justifyContent:'space-between'}}><Row style={{flex:1}}><View style={{width:42,height:42,borderRadius:21,backgroundColor:place===1?colors.lime:colors.soft,justifyContent:'center',alignItems:'center'}}><Body style={{fontWeight:'800'}}>{place}</Body></View><View style={{flex:1}}><Body style={{fontWeight:'700'}}>{p.display_name||'Player'}{p.player_id===user.id?' · you':''}</Body><Body style={{fontSize:13,color:colors.muted}}>Verified competition points</Body></View></Row><Title style={{fontSize:25}}>{p.total_points}</Title></Row></Card>;})}</DataState>}</>}
 <Card><Badge>PLAYPICKLE POINTS</Badge><Body>Rankings belong to each club, season, and competition category. Tied points share a rank. These are competition points, not certified skill ratings.</Body><Body style={{color:colors.muted}}>Disputed results are held for review. Previous seasons remain available in your history.</Body></Card>
 </Screen>;
}
