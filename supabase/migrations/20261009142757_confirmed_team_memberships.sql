-- A pending team reserves only its captain's explicit choice. Its partner_id
-- is an invitation, not membership. Existing accepted teams remain unchanged.
delete from public.team_members where not accepted;
alter table public.team_members add constraint team_members_confirmed check(accepted);
-- Keep UNIQUE(tournament_id,player_id). All registration/response/withdrawal/
-- bracket RPCs lock the tournament first, serializing membership and capacity.
-- Pending invitations do not consume accepted-team capacity.
create or replace function public.register_team(p_tournament_id uuid,p_partner_id uuid,p_name text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.require_active_user();t public.tournaments;v_id uuid;
begin
 select * into t from public.tournaments where id=p_tournament_id for update;
 if t.id is null or t.status<>'published' or t.registration_deadline<=clock_timestamp() then raise exception 'Registration is closed.';end if;
 if u=p_partner_id then raise exception 'A doubles team needs two distinct players.';end if;
 select id into v_id from public.teams where tournament_id=t.id and captain_id=u and partner_id=p_partner_id and name=p_name and status in ('pending','accepted');
 if found then return v_id;end if;
 if (select count(*) from public.profiles where id in (u,p_partner_id) and status='active' and length(trim(display_name))>0 and (t.category='open' or competition_category=t.category))<>2 then raise exception 'Both players need active completed profiles eligible for this category.';end if;
 if exists(select 1 from public.team_members where tournament_id=t.id and player_id in (u,p_partner_id)) then raise exception 'A player already belongs to a team in this event.';end if;
 if (select count(*) from public.teams where tournament_id=t.id and status='accepted')>=t.max_teams then raise exception 'This tournament is full.';end if;
 insert into public.teams(tournament_id,name,captain_id,partner_id) values(t.id,trim(p_name),u,p_partner_id) returning id into v_id;
 insert into public.team_members(team_id,tournament_id,player_id,accepted) values(v_id,t.id,u,true);
 perform public.notify_user(p_partner_id,'Doubles invitation',p_name||' invited you to play. Accept before registration closes.',jsonb_build_object('tournament_id',t.id,'team_id',v_id));
 perform public.notify_user(u,'Team registration pending','Your partner needs to accept the invitation.',jsonb_build_object('tournament_id',t.id));
 perform public.audit_event(t.club_id,'team.registered',v_id);return v_id;
end $$;
create or replace function public.respond_team_invitation(p_team_id uuid,p_accept boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.require_active_user();t public.tournaments;v_team public.teams;
begin
 select * into t from public.tournaments where id=(select tournament_id from public.teams where id=p_team_id) for update;
 select * into v_team from public.teams where id=p_team_id for update;
 if v_team.partner_id is distinct from u then raise exception 'This is not your partner invitation.' using errcode='42501';end if;
 if v_team.status='accepted' and p_accept then return;end if;
 if t.status<>'published' or t.registration_deadline<=clock_timestamp() or v_team.status<>'pending' then raise exception 'Invitation is closed.';end if;
 if p_accept then
 if (select count(*) from public.profiles where id in (v_team.captain_id,v_team.partner_id) and status='active' and length(trim(display_name))>0 and (t.category='open' or competition_category=t.category))<>2 then raise exception 'Both players must be eligible for this category.';end if;
 if not exists(select 1 from public.team_members where team_id=p_team_id and player_id=v_team.captain_id and accepted)
 or exists(select 1 from public.team_members where tournament_id=t.id and player_id=u) then
  raise exception 'A player already belongs to a team in this event.';
 end if;
 if (select count(*) from public.teams where tournament_id=t.id and status='accepted')>=t.max_teams then raise exception 'This tournament is full.';end if;
 insert into public.team_members(team_id,tournament_id,player_id,accepted) values(p_team_id,t.id,u,true);
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
create or replace function public.generate_bracket(p_tournament_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tournaments;ids uuid[];n integer;size integer:=2;rounds integer:=1;r integer;p integer;m record;
begin
 perform public.require_active_user();select * into t from public.tournaments where id=p_tournament_id for update;
 if t.id is null or not public.can_manage_club(t.club_id,'tournaments') then raise exception 'Tournament permission required.' using errcode='42501';end if;
 if exists(select 1 from public.matches where tournament_id=t.id) then return;end if;
 if t.status<>'published' or t.registration_deadline>now() then raise exception 'Wait for registration to close.';end if;
 if exists(select 1 from public.teams tm join public.team_members a on a.team_id=tm.id join public.profiles pr on pr.id=a.player_id where tm.tournament_id=t.id and tm.status='accepted' and (not a.accepted or pr.status<>'active' or (t.category<>'open' and pr.competition_category<>t.category))) then raise exception 'An accepted player is ineligible. Resolve team entries before locking.';end if;
 if exists(select 1 from public.teams tm where tm.tournament_id=t.id and tm.status='accepted'
 and (select count(*) from public.team_members a where a.team_id=tm.id and a.accepted and a.player_id in(tm.captain_id,tm.partner_id))<>2) then
 raise exception 'Every accepted team must have two confirmed members.';end if;
 if (select count(*) from public.teams where tournament_id=t.id and status='accepted')>t.max_teams then raise exception 'Too many accepted teams.';end if;
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
