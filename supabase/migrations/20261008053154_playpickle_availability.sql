-- Redacted realtime signals let players refresh availability without reading private usage rows.
create table public.availability_changes(court_id uuid primary key references public.courts(id),changed_at timestamptz not null default now());
alter table public.availability_changes enable row level security;
revoke all on public.availability_changes from public,anon,authenticated;
grant select on public.availability_changes to authenticated;
grant all on public.availability_changes to service_role;
create policy availability_changes_read on public.availability_changes for select to authenticated using(exists(select 1 from public.courts c join public.clubs cl on cl.id=c.club_id where c.id=court_id and (cl.verification_status='verified' or public.can_manage_club(cl.id))));
create function public.signal_availability() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.availability_changes(court_id,changed_at) values(new.court_id,clock_timestamp())
 on conflict(court_id) do update set changed_at=excluded.changed_at;
 return new;
end $$;
revoke all on function public.signal_availability() from public,anon,authenticated;
create trigger court_usage_signal after insert or update on public.court_usage for each row execute function public.signal_availability();
do $$ begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.availability_changes;end if;end $$;

create function public.club_bookings(p_club_id uuid) returns setof jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.require_active_user();
 if not public.can_manage_club(p_club_id,'bookings') then raise exception 'Booking permission required.' using errcode='42501';end if;
 return query select to_jsonb(b)||jsonb_build_object('player_name',p.display_name) from public.bookings b join public.profiles p on p.id=b.user_id where b.club_id=p_club_id order by b.starts_at desc limit 500;
end $$;
revoke all on function public.club_bookings(uuid) from public,anon,authenticated;
grant execute on function public.club_bookings(uuid) to authenticated;
