-- Materialized participant reservations: GiST enforces conflicts across transactions,
-- courts and tournaments. Half-open ranges allow back-to-back matches.
create table public.player_match_usage (
 match_id uuid not null references public.matches(id) on delete cascade,
 player_id uuid not null references public.profiles(id),
 starts_at timestamptz not null, ends_at timestamptz not null,
 primary key(match_id,player_id),
 check(ends_at>starts_at),
 constraint player_match_no_overlap exclude using gist
 (player_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
);
alter table public.player_match_usage enable row level security;
revoke all on public.player_match_usage from public,anon,authenticated;
grant all on public.player_match_usage to service_role;

create function public.sync_player_match_usage() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 delete from public.player_match_usage where match_id=new.id;
 if new.starts_at is not null and new.ends_at is not null
 and new.status in ('scheduled','in_progress','submitted','verified')
 and exists(select 1 from public.tournaments where id=new.tournament_id and status<>'cancelled') then
  insert into public.player_match_usage(match_id,player_id,starts_at,ends_at)
  select new.id,player_id,new.starts_at,new.ends_at from public.team_members
  where team_id in(new.team_a_id,new.team_b_id) and accepted order by player_id;
 end if;
 return new;
exception when exclusion_violation then
 raise exception 'A player is unavailable: another match overlaps this time. Choose a different time.';
end $$;
revoke all on function public.sync_player_match_usage() from public,anon,authenticated;
create trigger matches_player_usage after insert or update of starts_at,ends_at,team_a_id,team_b_id,status
on public.matches for each row execute function public.sync_player_match_usage();

create function public.release_cancelled_player_matches() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='cancelled' then
  delete from public.player_match_usage where match_id in(select id from public.matches where tournament_id=new.id);
 end if;
 return new;
end $$;
revoke all on function public.release_cancelled_player_matches() from public,anon,authenticated;
create trigger cancelled_player_matches after update of status on public.tournaments
for each row when (old.status is distinct from new.status) execute function public.release_cancelled_player_matches();

-- Deliberately fail migration if old schedules conflict; do not silently move matches.
insert into public.player_match_usage(match_id,player_id,starts_at,ends_at)
select m.id,tm.player_id,m.starts_at,m.ends_at from public.matches m
join public.tournaments t on t.id=m.tournament_id
join public.team_members tm on tm.team_id in(m.team_a_id,m.team_b_id) and tm.accepted
where t.status<>'cancelled' and m.status in ('scheduled','in_progress','submitted','verified')
and m.starts_at is not null and m.ends_at is not null
order by tm.player_id,m.id;
