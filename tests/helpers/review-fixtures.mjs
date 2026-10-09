import {randomUUID} from 'node:crypto';
import {addUser,asUser} from '../db.mjs';
export const call=async(db,name,args=[])=> (await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as value',args.map(v=>Array.isArray(v)?JSON.stringify(v):v))).rows[0].value;
export async function fixture(db,count=20) {
 const users=[];for(let i=0;i<count;i++)users.push(await addUser(db,randomUUID(),'Review player '+i));
 const owner=users[0],as=(u,fn)=>asUser(db,u.id,u.email,fn),run=(u,name,args)=>as(u,()=>call(db,name,args));
 await db.query('insert into public.administrators(user_id) values($1)',[owner.id]);
 const club=await run(owner,'apply_club',['Review club','Area','Address','UTC']);
 await run(owner,'verify_club',[club,'verified','Local test verification']);
 const courts=[];for(let i=0;i<3;i++)courts.push(await run(owner,'save_court',[club,{name:'Court '+i,price_per_hour:0,currency:'PHP'},null]));
 await run(owner,'set_opening_hours',[club,Array.from({length:7},(_,weekday)=>({weekday,opens_at:'00:00',closes_at:'23:59'}))]);
 const season=await run(owner,'save_season',[club,{name:'Review season',starts_on:'2020-01-01',ends_on:'2099-12-31'},null]);
 const rule=await run(owner,'save_ranking_rule',[null,'Local policy',11,2,100,60,30,10,48,true]);
 const start=new Date(Date.now()+7*86400000);start.setUTCHours(8,0,0,0);
 const at=hours=>new Date(start.getTime()+hours*3600000);
 const event=async(max=128,category='open')=>{
  const id=await run(owner,'save_tournament',[null,club,season,'Review event','',category,at(0),new Date(Date.now()+86400000),max,rule]);
  await run(owner,'publish_tournament',[id]);return id;
 };
 const team=async(e,a,b,accept=true)=>{
  const id=await run(users[a],'register_team',[e,users[b].id,'Team '+a]);
  if(accept)await run(users[b],'respond_team_invitation',[id,true]);return id;
 };
 const lock=async e=>{await db.query("update public.tournaments set registration_deadline=now()-interval '1 hour' where id=$1",[e]);await run(owner,'generate_bracket',[e]);return (await db.query('select * from public.matches where tournament_id=$1 order by round,position',[e])).rows;};
 return {users,owner,as,run,club,courts,event,team,lock,at};
}
