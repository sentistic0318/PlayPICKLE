const {test,expect}=require('@playwright/test');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function setup(page,{pending=false}={}){
 const user={id:id(9000),email:'fixture@example.test',aud:'authenticated',role:'authenticated'};
 const club={id:id(9001),owner_id:user.id,name:'Fixture club',area:'Fixture area',address:'Fixture address',timezone:'Asia/Manila',verification_status:'verified'};
 const event={id:id(9002),club_id:club.id,title:'128-team regression event',category:'open',status:pending?'published':'locked',starts_at:'2099-01-02T00:00:00Z',registration_deadline:'2099-01-01T00:00:00Z',max_teams:128,clubs:club};
 const teams=Array.from({length:238},(_,i)=>({id:id(i+1),tournament_id:event.id,name:(i<110?'Withdrawn team ':'Accepted team ')+(i<110?i:i-110),created_at:'2026-01-01T00:00:00Z',status:i<110?'withdrawn':'accepted',captain_id:i===237?user.id:id(10000+i),partner_id:id(20000+i)}));
 const matches=[];for(let round=1;round<=7;round++)for(let position=1;position<=128/(2**round);position++)matches.push({id:id(30000+matches.length),tournament_id:event.id,round,position,status:'waiting',team_a_id:round===1?teams[110+(position-1)*2].id:null,team_b_id:round===1?teams[111+(position-1)*2].id:null,score_a:null,score_b:null});
 if(pending){teams.length=0;teams.push({id:id(1),name:'Unwanted invitation',status:'pending',created_at:'2026-01-01T00:00:00Z',partner_id:user.id,captain_id:id(1)});matches.length=0;}
 const tables={profiles:[{id:user.id,display_name:'Fixture player',status:'active'}],clubs:[club],club_members:[{user_id:user.id,club_id:club.id,role:'owner',permissions:[],clubs:club}],administrators:[],tournaments:[event],teams,matches,seasons:[],ranking_rules:[],courts:[]};
 await page.addInitScript(({user})=>localStorage.setItem('sb-playpickle-review-auth-token',JSON.stringify({access_token:'fixture-token',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user})),{user});
 await page.route('https://playpickle-review.supabase.co/**',async route=>{
  const url=new URL(route.request().url());let data=tables[url.pathname.split('/').at(-1)]||[];
  const cursor=url.searchParams.get('id');if(cursor?.startsWith('gt.'))data=data.filter(r=>r.id>cursor.slice(3));
  const order=url.searchParams.get('order');if(order==='id.asc')data=[...data].sort((a,b)=>a.id.localeCompare(b.id));
  if(url.pathname.includes('/rest/v1/'))data=data.slice(0,Number(url.searchParams.get('limit')||100));
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 return event;
}
test('player sees all accepted teams, their last-page team, 127 matches and the final',async({page})=>{
 const event=await setup(page);await page.goto('/tournament/'+event.id);
 await expect(page.getByText('128/128 accepted teams',{exact:false})).toBeVisible();
 await expect(page.getByText('Accepted team 127',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Teams',exact:true}).click();
 await expect(page.getByText(/^Accepted team /)).toHaveCount(128);await expect(page.getByText(/^Withdrawn team /)).toHaveCount(110);
 await page.getByRole('button',{name:'Bracket',exact:true}).click();
 await expect(page.getByText(/^Match \d+$/)).toHaveCount(127);await expect(page.getByText('Final',{exact:true})).toBeVisible();
});
test('club workspace sees all accepted teams, 127 matches and round-7 final',async({page})=>{
 await setup(page);await page.goto('/manage');
 await page.getByRole('button',{name:'Tournaments',exact:true}).click();
 await page.getByRole('button',{name:'128-team regression event',exact:true}).click();
 await expect(page.getByText(/^Accepted team /)).toHaveCount(128);await expect(page.getByText(/^Withdrawn team /)).toHaveCount(110);
 await page.getByRole('button',{name:'Matches',exact:true}).click();
 await expect(page.getByText(/^Round \d+.*Match \d+$/)).toHaveCount(127);await expect(page.getByText(/^Round 7.*Match 1$/)).toBeVisible();
});
test('pending invite remains actionable without hiding registration',async({page})=>{
 const event=await setup(page,{pending:true});await page.goto('/tournament/'+event.id);
 await expect(page.getByRole('button',{name:'Accept partner invitation'})).toBeVisible();
 await expect(page.getByText('Bring your doubles partner.',{exact:true})).toBeVisible();
});
