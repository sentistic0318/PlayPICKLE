-- Doubles, verified single-elimination results and immutable points history.
create table public.ranking_rules(
 id uuid primary key default gen_random_uuid(),name text not null,
 game_points integer not null check(game_points in (11,15)),win_by integer not null check(win_by=2),
 champion_points integer not null check(champion_points>=0),runner_up_points integer not null check(runner_up_points>=0),
 semifinal_points integer not null check(semifinal_points>=0),participation_points integer not null check(participation_points>=0),
 dispute_hours integer not null check(dispute_hours between 1 and 720),confirmed boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.tournaments(
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),
 season_id uuid not null references public.seasons(id),title text not null check(length(trim(title)) between 1 and 150),
 description text not null default '',category text not null check(category in ('open','beginner','intermediate','advanced')),
 starts_at timestamptz not null,registration_deadline timestamptz not null,max_teams integer not null check(max_teams between 2 and 128),
 status text not null default 'draft' check(status in ('draft','published','locked','completed','cancelled')),
 policy_id uuid not null references public.ranking_rules(id),policy_snapshot jsonb,champion_team_id uuid,
 finalized_at timestamptz,revision integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(registration_deadline<starts_at));
create table public.teams(
 id uuid primary key default gen_random_uuid(),tournament_id uuid not null references public.tournaments(id),
 name text not null check(length(trim(name)) between 1 and 80),captain_id uuid not null references public.profiles(id),
 partner_id uuid not null references public.profiles(id),status text not null default 'pending' check(status in ('pending','accepted','withdrawn')),
 placement integer,withdrawal_reason text,created_at timestamptz not null default now(),check(captain_id<>partner_id),unique(id,tournament_id));
alter table public.tournaments add constraint champion_team_fk foreign key(champion_team_id) references public.teams(id);
create table public.team_members(
 team_id uuid not null,tournament_id uuid not null,player_id uuid not null references public.profiles(id),accepted boolean not null default false,
 primary key(team_id,player_id),unique(tournament_id,player_id),foreign key(team_id,tournament_id) references public.teams(id,tournament_id));
create table public.matches(
 id uuid primary key default gen_random_uuid(),tournament_id uuid not null references public.tournaments(id),
 round integer not null check(round>0),position integer not null check(position>0),
 team_a_id uuid references public.teams(id),team_b_id uuid references public.teams(id),winner_team_id uuid references public.teams(id),
 status text not null default 'waiting' check(status in ('waiting','ready','scheduled','in_progress','submitted','verified','bye')),
 court_id uuid references public.courts(id),starts_at timestamptz,ends_at timestamptz,
 score_a integer,score_b integer,submitted_by uuid references public.profiles(id),verified_by uuid references public.profiles(id),verified_at timestamptz,
 created_at timestamptz not null default now(),unique(tournament_id,round,position),
 check(team_a_id is null or team_b_id is null or team_a_id<>team_b_id));
create table public.match_result_history(
 id uuid primary key default gen_random_uuid(),match_id uuid not null references public.matches(id),actor_id uuid not null references public.profiles(id),
 action text not null,previous_result jsonb not null,new_result jsonb not null,reason text not null,created_at timestamptz not null default now());
create table public.disputes(
 id uuid primary key default gen_random_uuid(),reporter_id uuid not null references public.profiles(id),match_id uuid not null references public.matches(id),
 tournament_id uuid not null references public.tournaments(id),reason text not null,
 status text not null default 'open' check(status in ('open','resolved')),resolution text,resolved_by uuid references public.profiles(id),resolved_at timestamptz,
 created_at timestamptz not null default now());
create unique index one_open_report_per_match on public.disputes(match_id,reporter_id) where status='open';
create table public.point_ledger(
 id uuid primary key default gen_random_uuid(),player_id uuid not null references public.profiles(id),club_id uuid not null references public.clubs(id),
 season_id uuid not null references public.seasons(id),category text not null,tournament_id uuid not null references public.tournaments(id),
 points integer not null,reason text not null,kind text not null check(kind in ('award','reversal')),revision integer not null,
 reversal_of uuid unique references public.point_ledger(id),created_at timestamptz not null default now(),
 check((kind='award' and points>=0 and reversal_of is null) or (kind='reversal' and points<=0 and reversal_of is not null)));
create unique index one_award_per_revision on public.point_ledger(tournament_id,player_id,revision) where kind='award';
create index matches_tournament on public.matches(tournament_id,round,position);
create index points_standings on public.point_ledger(club_id,season_id,category,player_id);
create index teams_partners on public.teams(partner_id,status);
create index disputes_open on public.disputes(tournament_id) where status='open';
create function public.save_ranking_rule(p_id uuid,p_name text,p_game_points integer,p_win_by integer,p_champion_points integer,p_runner_up_points integer,p_semifinal_points integer,p_participation_points integer,p_dispute_hours integer,p_confirmed boolean)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 if not public.is_admin() then raise exception 'Administrator required.' using errcode='42501';end if;
 if length(trim(p_name))<2 or p_champion_points<p_runner_up_points or p_runner_up_points<p_semifinal_points or p_semifinal_points<p_participation_points then raise exception 'Use a name and descending placement points.';end if;
 if p_id is null then
 insert into public.ranking_rules(name,game_points,win_by,champion_points,runner_up_points,semifinal_points,participation_points,dispute_hours,confirmed)
 values(p_name,p_game_points,p_win_by,p_champion_points,p_runner_up_points,p_semifinal_points,p_participation_points,p_dispute_hours,p_confirmed) returning id into v_id;
 else
 update public.ranking_rules set name=p_name,game_points=p_game_points,win_by=p_win_by,champion_points=p_champion_points,runner_up_points=p_runner_up_points,semifinal_points=p_semifinal_points,participation_points=p_participation_points,dispute_hours=p_dispute_hours,confirmed=p_confirmed,updated_at=now() where id=p_id returning id into v_id;
 if not found then raise exception 'Policy not found.';end if;
 end if;
 perform public.audit_event(null,'policy.saved',v_id,jsonb_build_object('confirmed',p_confirmed));return v_id;
end $$;
create function public.save_tournament(p_id uuid,p_club_id uuid,p_season_id uuid,p_title text,p_description text,p_category text,p_starts_at timestamptz,p_registration_deadline timestamptz,p_max_teams integer,p_policy_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 perform public.require_active_user();
 if not public.can_manage_club(p_club_id,'tournaments') then raise exception 'Tournament permission required.' using errcode='42501';end if;
 if not exists(select 1 from public.seasons s join public.clubs c on c.id=s.club_id where s.id=p_season_id and s.club_id=p_club_id and not s.archived and (p_starts_at at time zone c.timezone)::date between s.starts_on and s.ends_on) then raise exception 'Choose an active club season containing this date.';end if;
 if p_registration_deadline<=now() then raise exception 'Registration deadline must be in the future.';end if;
 if p_id is null then
 insert into public.tournaments(club_id,season_id,title,description,category,starts_at,registration_deadline,max_teams,policy_id)
 values(p_club_id,p_season_id,p_title,p_description,p_category,p_starts_at,p_registration_deadline,p_max_teams,p_policy_id) returning id into v_id;
 else
 update public.tournaments set season_id=p_season_id,title=p_title,description=p_description,category=p_category,starts_at=p_starts_at,registration_deadline=p_registration_deadline,max_teams=p_max_teams,policy_id=p_policy_id,updated_at=now() where id=p_id and club_id=p_club_id and status='draft' returning id into v_id;
 if not found then raise exception 'Only draft tournaments can be edited.';end if;
 end if;
 perform public.audit_event(p_club_id,'tournament.saved',v_id);return v_id;
end $$;
create function public.publish_tournament(p_tournament_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tournaments;r public.ranking_rules;
begin
 perform public.require_active_user();select * into t from public.tournaments where id=p_tournament_id for update;
 if t.id is null or not public.can_manage_club(t.club_id,'tournaments') then raise exception 'Tournament permission required.' using errcode='42501';end if;
 if t.status='published' then return;end if;
 select * into r from public.ranking_rules where id=t.policy_id;
 if t.status<>'draft' or t.registration_deadline<=now() or not r.confirmed then raise exception 'A future draft and explicitly confirmed policy are required.';end if;
 if not exists(select 1 from public.clubs where id=t.club_id and verification_status='verified') or exists(select 1 from public.seasons where id=t.season_id and archived) then raise exception 'Verified club and active season required.';end if;
 update public.tournaments set status='published',policy_snapshot=to_jsonb(r),updated_at=now() where id=t.id;
 perform public.audit_event(t.club_id,'tournament.published',t.id,to_jsonb(r));
end $$;

create function public.register_team(p_tournament_id uuid,p_partner_id uuid,p_name text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.require_active_user();t public.tournaments;v_id uuid;
begin
 select * into t from public.tournaments where id=p_tournament_id for update;
 if t.id is null or t.status<>'published' or t.registration_deadline<=now() then raise exception 'Registration is closed.';end if;
 if u=p_partner_id then raise exception 'A doubles team needs two distinct players.';end if;
 select id into v_id from public.teams where tournament_id=t.id and captain_id=u and partner_id=p_partner_id and name=p_name and status in ('pending','accepted');
 if found then return v_id;end if;
 if (select count(*) from public.profiles where id in (u,p_partner_id) and status='active' and length(trim(display_name))>0 and (t.category='open' or competition_category=t.category))<>2 then raise exception 'Both players need active completed profiles eligible for this category.';end if;
 if exists(select 1 from public.team_members where tournament_id=t.id and player_id in (u,p_partner_id)) then raise exception 'A player already belongs to a team in this event.';end if;
 if (select count(*) from public.teams where tournament_id=t.id and status in ('pending','accepted'))>=t.max_teams then raise exception 'This tournament is full.';end if;
 insert into public.teams(tournament_id,name,captain_id,partner_id) values(t.id,trim(p_name),u,p_partner_id) returning id into v_id;
 insert into public.team_members(team_id,tournament_id,player_id,accepted) values(v_id,t.id,u,true),(v_id,t.id,p_partner_id,false);
 perform public.notify_user(p_partner_id,'Doubles invitation',p_name||' invited you to play. Accept before registration closes.',jsonb_build_object('tournament_id',t.id,'team_id',v_id));
 perform public.notify_user(u,'Team registration pending','Your partner needs to accept the invitation.',jsonb_build_object('tournament_id',t.id));
 perform public.audit_event(t.club_id,'team.registered',v_id);return v_id;
end $$;
create function public.respond_team_invitation(p_team_id uuid,p_accept boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.require_active_user();t public.tournaments;v_team public.teams;
begin
 select * into t from public.tournaments where id=(select tournament_id from public.teams where id=p_team_id) for update;
 select * into v_team from public.teams where id=p_team_id for update;
 if v_team.partner_id is distinct from u then raise exception 'This is not your partner invitation.' using errcode='42501';end if;
 if v_team.status='accepted' and p_accept then return;end if;
 if t.status<>'published' or t.registration_deadline<=now() or v_team.status<>'pending' then raise exception 'Invitation is closed.';end if;
 if p_accept then
 if (select count(*) from public.profiles where id in (v_team.captain_id,v_team.partner_id) and status='active' and display_name<>'' and (t.category='open' or competition_category=t.category))<>2 then raise exception 'Both players must be eligible for this category.';end if;
 update public.teams set status='accepted' where id=p_team_id;
 update public.team_members set accepted=true where team_id=p_team_id;
 else
 update public.teams set status='withdrawn',withdrawal_reason='Partner declined' where id=p_team_id;
 delete from public.team_members where team_id=p_team_id;
 end if;
 perform public.notify_user(v_team.captain_id,'Partner invitation updated',case when p_accept then 'Your doubles team is confirmed.' else 'Your partner declined the invitation.' end,jsonb_build_object('tournament_id',t.id));
 perform public.notify_user(u,'Team registration updated',case when p_accept then 'Your doubles team is confirmed.' else 'Invitation declined.' end,jsonb_build_object('tournament_id',t.id));
 perform public.audit_event(t.club_id,'team.invitation_response',p_team_id,jsonb_build_object('accepted',p_accept));
end $$;
create function public.withdraw_team(p_team_id uuid,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.require_active_user();t public.tournaments;v_team public.teams;
begin
 select * into t from public.tournaments where id=(select tournament_id from public.teams where id=p_team_id) for update;
 select * into v_team from public.teams where id=p_team_id;
 if v_team.id is null or (u not in (v_team.captain_id,v_team.partner_id) and not public.can_manage_club(t.club_id,'tournaments')) then raise exception 'Team access denied.' using errcode='42501';end if;
 if v_team.status='withdrawn' then return;end if;
 if t.status<>'published' or length(trim(p_reason))<1 then raise exception 'Withdrawals need a reason and must precede bracket locking.';end if;
 update public.teams set status='withdrawn',withdrawal_reason=p_reason where id=p_team_id;
 delete from public.team_members where team_id=p_team_id;
 perform public.notify_user(v_team.captain_id,'Team withdrawn',p_reason,jsonb_build_object('tournament_id',t.id));
 perform public.notify_user(v_team.partner_id,'Team withdrawn',p_reason,jsonb_build_object('tournament_id',t.id));
 perform public.audit_event(t.club_id,'team.withdrawn',p_team_id,jsonb_build_object('reason',p_reason));
end $$;
-- Internal: caller holds the tournament lock. Only verified results or generated byes advance.
create function public.advance_match(p_match_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.matches;n public.matches;
begin
 select * into m from public.matches where id=p_match_id;
 if m.status not in ('verified','bye') or m.winner_team_id is null then raise exception 'Only verified winners advance.';end if;
 select * into n from public.matches where tournament_id=m.tournament_id and round=m.round+1 and position=(m.position+1)/2;
 if n.id is null then
 update public.tournaments set champion_team_id=m.winner_team_id,status='completed',updated_at=now() where id=m.tournament_id;
 update public.teams set placement=1 where id=m.winner_team_id;
 update public.teams set placement=2 where id in (m.team_a_id,m.team_b_id) and id<>m.winner_team_id;
 else
 if (m.position%2=1 and n.team_a_id is not null and n.team_a_id<>m.winner_team_id) or (m.position%2=0 and n.team_b_id is not null and n.team_b_id<>m.winner_team_id) then raise exception 'Advancement conflict requires an audited correction.';end if;
 update public.matches set team_a_id=case when m.position%2=1 then m.winner_team_id else team_a_id end,
 team_b_id=case when m.position%2=0 then m.winner_team_id else team_b_id end where id=n.id;
 update public.matches set status='ready' where id=n.id and status='waiting' and team_a_id is not null and team_b_id is not null;
 update public.teams set placement=case when not exists(select 1 from public.matches where tournament_id=m.tournament_id and round=m.round+2) then 3 else power(2,(select max(round) from public.matches where tournament_id=m.tournament_id)-m.round)::integer+1 end
 where id in (m.team_a_id,m.team_b_id) and id<>m.winner_team_id;
 end if;
end $$;
create function public.generate_bracket(p_tournament_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tournaments;ids uuid[];n integer;size integer:=2;rounds integer:=1;r integer;p integer;m record;
begin
 perform public.require_active_user();select * into t from public.tournaments where id=p_tournament_id for update;
 if t.id is null or not public.can_manage_club(t.club_id,'tournaments') then raise exception 'Tournament permission required.' using errcode='42501';end if;
 if exists(select 1 from public.matches where tournament_id=t.id) then return;end if;
 if t.status<>'published' or t.registration_deadline>now() then raise exception 'Wait for registration to close.';end if;
 if exists(select 1 from public.teams tm join public.team_members a on a.team_id=tm.id join public.profiles pr on pr.id=a.player_id where tm.tournament_id=t.id and tm.status='accepted' and (not a.accepted or pr.status<>'active' or (t.category<>'open' and pr.competition_category<>t.category))) then raise exception 'An accepted player is ineligible. Resolve team entries before locking.';end if;
 select array_agg(id order by random()) into ids from public.teams where tournament_id=t.id and status='accepted';
 n:=coalesce(cardinality(ids),0);if n<2 then raise exception 'At least two accepted doubles teams are needed.';end if;
 while size<n loop size:=size*2;rounds:=rounds+1;end loop;
 update public.tournaments set status='locked',updated_at=now() where id=t.id;
 update public.teams set status='withdrawn',withdrawal_reason='Partner acceptance deadline expired' where tournament_id=t.id and status='pending';
 delete from public.team_members where team_id in(select id from public.teams where tournament_id=t.id and status='withdrawn');
 for r in 1..rounds loop
 for p in 1..(size/power(2,r)::integer) loop
 insert into public.matches(tournament_id,round,position,team_a_id,team_b_id,status)
 values(t.id,r,p,case when r=1 then ids[p] end,case when r=1 then ids[p+size/2] end,case when r=1 and ids[p+size/2] is not null then 'ready' else 'waiting' end);
 end loop;end loop;
 for m in select * from public.matches where tournament_id=t.id and round=1 and team_b_id is null loop
 update public.matches set status='bye',winner_team_id=team_a_id,verified_at=now() where id=m.id;
 perform public.advance_match(m.id);
 end loop;
 perform public.audit_event(t.club_id,'bracket.generated',t.id,jsonb_build_object('teams',n,'size',size,'random_draw',ids));
end $$;

create function public.schedule_match(p_match_id uuid,p_court_id uuid,p_starts_at timestamptz,p_ends_at timestamptz) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tournaments;m public.matches;c public.clubs;u uuid;
begin
 perform public.require_active_user();
 select * into t from public.tournaments where id=(select tournament_id from public.matches where id=p_match_id) for update;
 select * into m from public.matches where id=p_match_id for update;
 if t.id is null or not public.can_manage_club(t.club_id,'tournaments') then raise exception 'Tournament permission required.' using errcode='42501';end if;
 if t.status<>'locked' or m.status not in ('ready','scheduled') or m.team_a_id is null or m.team_b_id is null then raise exception 'Only ready matches can be scheduled.';end if;
 if m.starts_at<=now() or p_starts_at<=now() or p_starts_at<t.starts_at or p_ends_at<=p_starts_at or p_ends_at>p_starts_at+interval '8 hours' then raise exception 'Choose a future match time after the event starts.';end if;
 perform 1 from public.courts where id=p_court_id and club_id=t.club_id and active for update;
 if not found then raise exception 'Choose an active court in this club.';end if;
 select * into c from public.clubs where id=t.club_id;
 if not exists(select 1 from public.opening_hours h where h.club_id=c.id and h.weekday=extract(dow from p_starts_at at time zone c.timezone)::integer and (p_starts_at at time zone c.timezone)::date=(p_ends_at at time zone c.timezone)::date and (p_starts_at at time zone c.timezone)::time>=h.opens_at and (p_ends_at at time zone c.timezone)::time<=h.closes_at) then raise exception 'Match must fit the club opening hours.';end if;
 if exists(select 1 from public.matches f where f.tournament_id=t.id and f.round=m.round-1 and (f.position+1)/2=m.position and f.ends_at>p_starts_at) then raise exception 'Previous-round matches must finish first.';end if;
 update public.court_usage set active=false where kind='match' and reference_id=m.id;
 insert into public.court_usage(court_id,starts_at,ends_at,kind,reference_id) values(p_court_id,p_starts_at,p_ends_at,'match',m.id);
 update public.matches set court_id=p_court_id,starts_at=p_starts_at,ends_at=p_ends_at,status='scheduled' where id=m.id;
 for u in select player_id from public.team_members where team_id in(m.team_a_id,m.team_b_id) loop
 perform public.notify_user(u,'Match scheduled',t.title||' has a court and match time for your team.',jsonb_build_object('tournament_id',t.id,'match_id',m.id));end loop;
 perform public.audit_event(t.club_id,'match.scheduled',m.id,jsonb_build_object('court_id',p_court_id,'starts_at',p_starts_at));
end $$;
create function public.check_match_score(p_target integer,p_win_by integer,p_a integer,p_b integer) returns void
language plpgsql immutable set search_path=public,pg_temp as $$
declare hi integer:=greatest(p_a,p_b);lo integer:=least(p_a,p_b);
begin
 if p_a is null or p_b is null or lo<0 or hi>1000 or hi<p_target or hi-lo<p_win_by or (hi>p_target and hi-lo<>p_win_by) then raise exception 'Enter a valid completed single-game score for this policy.';end if;
end $$;
create function public.submit_match_score(p_match_id uuid,p_score_a integer,p_score_b integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.require_active_user();t public.tournaments;m public.matches;
begin
 select * into t from public.tournaments where id=(select tournament_id from public.matches where id=p_match_id) for update;
 select * into m from public.matches where id=p_match_id for update;
 if t.id is null or not public.can_manage_club(t.club_id,'results') then raise exception 'Results permission required.' using errcode='42501';end if;
 if t.status<>'locked' or m.status not in ('scheduled','in_progress','submitted') or m.starts_at>now() then raise exception 'Only a scheduled match that has started can receive a score.';end if;
 if m.status='submitted' then
 if m.score_a=p_score_a and m.score_b=p_score_b then return;end if;
 raise exception 'A submitted score is locked. An administrator must correct verified results with a reason.';
 end if;
 perform public.check_match_score((t.policy_snapshot->>'game_points')::integer,(t.policy_snapshot->>'win_by')::integer,p_score_a,p_score_b);
 update public.matches set score_a=p_score_a,score_b=p_score_b,submitted_by=u,status='submitted' where id=m.id;
 insert into public.match_result_history(match_id,actor_id,action,previous_result,new_result,reason) values(m.id,u,'submit',to_jsonb(m),jsonb_build_object('score_a',p_score_a,'score_b',p_score_b),'Score submitted');
 perform public.audit_event(t.club_id,'score.submitted',m.id);
end $$;
create function public.verify_match(p_match_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.require_active_user();t public.tournaments;m public.matches;player uuid;
begin
 select * into t from public.tournaments where id=(select tournament_id from public.matches where id=p_match_id) for update;
 select * into m from public.matches where id=p_match_id for update;
 if t.id is null or not public.can_manage_club(t.club_id,'results') then raise exception 'Results permission required.' using errcode='42501';end if;
 if m.status='verified' then return;end if;
 if t.status<>'locked' or m.status<>'submitted' then raise exception 'Submit the score before verification.';end if;
 perform public.check_match_score((t.policy_snapshot->>'game_points')::integer,(t.policy_snapshot->>'win_by')::integer,m.score_a,m.score_b);
 update public.matches set status='verified',winner_team_id=case when score_a>score_b then team_a_id else team_b_id end,verified_by=u,verified_at=now() where id=m.id;
 perform public.advance_match(m.id);
 insert into public.match_result_history(match_id,actor_id,action,previous_result,new_result,reason) values(m.id,u,'verify',to_jsonb(m),jsonb_build_object('verified',true),'Club verified result');
 for player in select player_id from public.team_members where team_id in(m.team_a_id,m.team_b_id) loop
 perform public.notify_user(player,'Match result verified',t.title||' has a verified result. Check the bracket and report any errors within the policy window.',jsonb_build_object('tournament_id',t.id,'match_id',m.id));end loop;
 perform public.audit_event(t.club_id,'score.verified',m.id);
end $$;
create function public.reverse_tournament_points(p_tournament_id uuid,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.point_ledger(player_id,club_id,season_id,category,tournament_id,points,reason,kind,revision,reversal_of)
 select a.player_id,a.club_id,a.season_id,a.category,a.tournament_id,-a.points,p_reason,'reversal',a.revision,a.id
 from public.point_ledger a where a.tournament_id=p_tournament_id and a.kind='award' and not exists(select 1 from public.point_ledger b where b.reversal_of=a.id);
 update public.tournaments set finalized_at=null,revision=revision+1 where id=p_tournament_id;
end $$;
create function public.correct_match_result(p_match_id uuid,p_score_a integer,p_score_b integer,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.require_active_user();t public.tournaments;m public.matches;n public.matches;r integer;p integer;
begin
 select * into t from public.tournaments where id=(select tournament_id from public.matches where id=p_match_id) for update;
 select * into m from public.matches where id=p_match_id for update;
 if t.id is null or not public.is_admin() then raise exception 'Administrator review required for a verified result correction.' using errcode='42501';end if;
 if m.status<>'verified' or t.status not in ('locked','completed') or length(trim(p_reason))<10 then raise exception 'Correct a verified result with a detailed reason.';end if;
 perform public.check_match_score((t.policy_snapshot->>'game_points')::integer,(t.policy_snapshot->>'win_by')::integer,p_score_a,p_score_b);
 if m.score_a=p_score_a and m.score_b=p_score_b then return;end if;
 r:=m.round+1;p:=(m.position+1)/2;
 loop
 select * into n from public.matches where tournament_id=t.id and round=r and position=p;
 exit when not found;
 if n.status in ('in_progress','submitted','verified') or (n.status='scheduled' and n.starts_at<=now()) then raise exception 'A later match has started or finished. Automatic rewriting is blocked. An administrator must resolve this with an audited event cancellation and replay.';end if;
 r:=r+1;p:=(p+1)/2;
 end loop;
 perform public.reverse_tournament_points(t.id,p_reason);
 select * into n from public.matches where tournament_id=t.id and round=m.round+1 and position=(m.position+1)/2;
 if found then
 update public.court_usage set active=false where kind='match' and reference_id=n.id;
 update public.matches set team_a_id=case when m.position%2=1 then null else team_a_id end,
 team_b_id=case when m.position%2=0 then null else team_b_id end,
 status='waiting',court_id=null,starts_at=null,ends_at=null where id=n.id;
 end if;
 update public.teams set placement=null where id in(m.team_a_id,m.team_b_id);
 update public.tournaments set champion_team_id=null,status='locked' where id=t.id;
 update public.matches set score_a=p_score_a,score_b=p_score_b,winner_team_id=case when p_score_a>p_score_b then team_a_id else team_b_id end,verified_by=u,verified_at=now() where id=m.id;
 perform public.advance_match(m.id);
 insert into public.match_result_history(match_id,actor_id,action,previous_result,new_result,reason) values(m.id,u,'correction',to_jsonb(m),jsonb_build_object('score_a',p_score_a,'score_b',p_score_b),p_reason);
 perform public.audit_event(t.club_id,'score.corrected',m.id,jsonb_build_object('reason',p_reason));
 perform public.notify_user((select captain_id from public.teams where id=m.team_a_id),'Result corrected',p_reason,jsonb_build_object('tournament_id',t.id));
 perform public.notify_user((select captain_id from public.teams where id=m.team_b_id),'Result corrected',p_reason,jsonb_build_object('tournament_id',t.id));
end $$;

create function public.report_result(p_match_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.require_active_user();t public.tournaments;m public.matches;v_id uuid;a uuid;
begin
 select * into t from public.tournaments where id=(select tournament_id from public.matches where id=p_match_id) for update;
 select * into m from public.matches where id=p_match_id;
 if not exists(select 1 from public.team_members where player_id=u and team_id in(m.team_a_id,m.team_b_id)) then raise exception 'Only participants can report this result.' using errcode='42501';end if;
 if m.status<>'verified' or t.status='cancelled' or now()>m.verified_at+make_interval(hours=>(t.policy_snapshot->>'dispute_hours')::integer) then raise exception 'The reporting window is closed. Contact the platform administrator.';end if;
 if length(trim(p_reason))<10 then raise exception 'Describe the issue in at least 10 characters.';end if;
 select id into v_id from public.disputes where match_id=m.id and reporter_id=u and status='open';
 if found then return v_id;end if;
 insert into public.disputes(reporter_id,match_id,tournament_id,reason) values(u,m.id,t.id,p_reason) returning id into v_id;
 perform public.reverse_tournament_points(t.id,'Held for dispute '||v_id::text);
 perform public.notify_user(u,'Result report received','An administrator will review your report. Tournament points are held.',jsonb_build_object('tournament_id',t.id));
 for a in select user_id from public.administrators loop
 perform public.notify_user(a,'Result report needs review',t.title,jsonb_build_object('tournament_id',t.id));end loop;
 perform public.audit_event(t.club_id,'dispute.opened',v_id,jsonb_build_object('reason',p_reason));return v_id;
end $$;
create function public.resolve_dispute(p_dispute_id uuid,p_resolution text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.disputes;t public.tournaments;
begin
 if not public.is_admin() then raise exception 'Administrator required.' using errcode='42501';end if;
 select * into t from public.tournaments where id=(select tournament_id from public.disputes where id=p_dispute_id) for update;
 select * into d from public.disputes where id=p_dispute_id for update;
 if d.id is null or length(trim(p_resolution))<10 then raise exception 'Provide a detailed resolution.';end if;
 if d.status='resolved' then return;end if;
 update public.disputes set status='resolved',resolution=p_resolution,resolved_by=auth.uid(),resolved_at=now() where id=d.id;
 perform public.notify_user(d.reporter_id,'Your result report was reviewed',p_resolution,jsonb_build_object('tournament_id',t.id));
 perform public.audit_event(t.club_id,'dispute.resolved',d.id,jsonb_build_object('resolution',p_resolution));
end $$;
create function public.finalize_tournament(p_tournament_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tournaments;tm record;player uuid;points integer;latest timestamptz;
begin
 perform public.require_active_user();select * into t from public.tournaments where id=p_tournament_id for update;
 if t.id is null or not public.can_manage_club(t.club_id,'results') then raise exception 'Results permission required.' using errcode='42501';end if;
 if t.finalized_at is not null then return;end if;
 if t.status<>'completed' or t.champion_team_id is null or not coalesce((t.policy_snapshot->>'confirmed')::boolean,false) then raise exception 'A completed tournament with a confirmed saved policy is required.';end if;
 if exists(select 1 from public.disputes where tournament_id=t.id and status='open') then raise exception 'Resolve all disputes before awarding points.';end if;
 if exists(select 1 from public.matches where tournament_id=t.id and status not in('verified','bye')) then raise exception 'Verify every played match first.';end if;
 select max(verified_at) into latest from public.matches where tournament_id=t.id and status='verified';
 if latest is null or now()<latest+make_interval(hours=>(t.policy_snapshot->>'dispute_hours')::integer) then raise exception 'The dispute window is still open. Points remain pending.';end if;
 for tm in select * from public.teams where tournament_id=t.id and status='accepted' loop
 if tm.placement is null then raise exception 'Every accepted team must have a final placement.';end if;
 points:=(t.policy_snapshot->>case when tm.placement=1 then 'champion_points' when tm.placement=2 then 'runner_up_points' when tm.placement=3 then 'semifinal_points' else 'participation_points' end)::integer;
 for player in select player_id from public.team_members where team_id=tm.id and accepted loop
 insert into public.point_ledger(player_id,club_id,season_id,category,tournament_id,points,reason,kind,revision)
 values(player,t.club_id,t.season_id,t.category,t.id,points,'Verified placement '||tm.placement,'award',t.revision);
 perform public.notify_user(player,'Competition points finalized',t.title||': '||points||' points.',jsonb_build_object('tournament_id',t.id));
 end loop;end loop;
 update public.tournaments set finalized_at=now(),updated_at=now() where id=t.id;
 perform public.audit_event(t.club_id,'points.finalized',t.id,jsonb_build_object('revision',t.revision,'policy',t.policy_snapshot));
end $$;
create function public.cancel_tournament(p_tournament_id uuid,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tournaments;u uuid;
begin
 if not public.is_admin() then raise exception 'Administrator review required for event cancellation.' using errcode='42501';end if;
 select * into t from public.tournaments where id=p_tournament_id for update;
 if t.id is null or length(trim(p_reason))<10 then raise exception 'Provide the event and a detailed resolution reason.';end if;
 if t.status='cancelled' then return;end if;
 perform public.reverse_tournament_points(t.id,'Event cancelled: '||p_reason);
 update public.tournaments set status='cancelled',updated_at=now() where id=t.id;
 update public.court_usage set active=false where kind='match' and reference_id in(select id from public.matches where tournament_id=t.id) and starts_at>now();
 for u in select distinct player_id from public.team_members where tournament_id=t.id loop
 perform public.notify_user(u,'Tournament cancelled',p_reason,jsonb_build_object('tournament_id',t.id));end loop;
 perform public.audit_event(t.club_id,'tournament.cancelled',t.id,jsonb_build_object('reason',p_reason));
end $$;

do $$ declare t text;begin
 foreach t in array array['ranking_rules','tournaments','teams','team_members','matches','match_result_history','disputes','point_ledger'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create policy policy_read on public.ranking_rules for select to authenticated using(confirmed or public.is_admin());
create policy tournaments_read on public.tournaments for select to authenticated using(
 public.can_manage_club(club_id) or (status<>'draft' and exists(select 1 from public.clubs c where c.id=tournaments.club_id and c.verification_status='verified')));
create policy teams_read on public.teams for select to authenticated using(exists(select 1 from public.tournaments t where t.id=teams.tournament_id));
create policy team_members_read on public.team_members for select to authenticated using(player_id=auth.uid() or exists(select 1 from public.tournaments t where t.id=team_members.tournament_id and public.can_manage_club(t.club_id)));
create policy matches_read on public.matches for select to authenticated using(exists(select 1 from public.tournaments t where t.id=matches.tournament_id));
create policy result_history_read on public.match_result_history for select to authenticated using(exists(select 1 from public.matches m join public.tournaments t on t.id=m.tournament_id where m.id=match_result_history.match_id and (public.can_manage_club(t.club_id,'results') or exists(select 1 from public.team_members tm where tm.player_id=auth.uid() and tm.team_id in(m.team_a_id,m.team_b_id)))));
create policy dispute_read on public.disputes for select to authenticated using(reporter_id=auth.uid() or public.is_admin() or exists(select 1 from public.tournaments t where t.id=disputes.tournament_id and public.can_manage_club(t.club_id,'results')));
create policy points_read on public.point_ledger for select to authenticated using(player_id=auth.uid() or public.can_manage_club(club_id,'results') or public.can_manage_club(club_id,'tournaments'));
-- This view intentionally exposes only aggregate competition points and public display names.
create view public.rankings as
 select l.player_id,p.display_name,p.avatar_url,l.club_id,l.season_id,l.category,sum(l.points)::bigint total_points
 from public.point_ledger l join public.profiles p on p.id=l.player_id join public.clubs c on c.id=l.club_id
 where auth.uid() is not null and (c.verification_status='verified' or public.can_manage_club(c.id))
 group by l.player_id,p.display_name,p.avatar_url,l.club_id,l.season_id,l.category having sum(l.points)>0;
revoke all on public.rankings from public,anon,authenticated;
grant select on public.rankings to authenticated;
do $$ declare f record;begin
 for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and proname=any(array[
 'save_ranking_rule','save_tournament','publish_tournament','register_team','respond_team_invitation','withdraw_team','advance_match','generate_bracket','schedule_match','check_match_score','submit_match_score','verify_match','reverse_tournament_points','correct_match_result','report_result','resolve_dispute','finalize_tournament','cancel_tournament']) loop
 execute 'revoke all on function '||f.signature||' from public,anon,authenticated';
 if f.proname not in('advance_match','check_match_score','reverse_tournament_points') then execute 'grant execute on function '||f.signature||' to authenticated';end if;
 end loop;
end $$;
do $$ declare t text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['tournaments','teams','matches','point_ledger','disputes'] loop execute format('alter publication supabase_realtime add table public.%I',t);end loop;end if;
end $$;
