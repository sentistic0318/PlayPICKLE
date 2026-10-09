-- PlayPICKLE core. All mutations pass through checked, atomic RPCs.
create extension if not exists btree_gist;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check(length(display_name)<=80),
 avatar_url text, home_area text not null default '' check(length(home_area)<=120),
 status text not null default 'active' check(status in ('active','suspended')),
 competition_category text not null default 'open' check(competition_category in ('open','beginner','intermediate','advanced')),
 created_at timestamptz not null default now()
);
create table public.administrators (user_id uuid primary key references public.profiles(id) on delete cascade);
create table public.clubs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 name text not null check(length(trim(name)) between 1 and 150), description text not null default '',
 area text not null, address text not null, timezone text not null default 'Asia/Manila',
 verification_status text not null default 'pending' check(verification_status in ('pending','verified','rejected')),
 verification_reason text, facilities text[] not null default '{}', photo_url text,
 booking_duration_minutes integer not null default 60 check(booking_duration_minutes between 15 and 480),
 cancellation_hours numeric not null default 24 check(cancellation_hours between 0 and 720),
 created_at timestamptz not null default now()
);
create table public.club_members (
 club_id uuid references public.clubs(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade,
 role text not null check(role in ('owner','staff')), permissions text[] not null default '{}',
 primary key(club_id,user_id), check(permissions <@ array['profile','courts','bookings','tournaments','results','staff'])
);
create table public.staff_invitations (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete cascade,
 email text not null check(email=lower(trim(email))), permissions text[] not null,
 status text not null default 'pending' check(status in ('pending','accepted','revoked')),
 expires_at timestamptz not null default now()+interval '7 days', accepted_at timestamptz,
 created_at timestamptz not null default now(), unique(club_id,email),
 check(permissions <@ array['profile','courts','bookings','tournaments','results','staff'])
);
create table public.courts (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120), surface text not null default '',
 indoor boolean not null default false, active boolean not null default true,
 price_per_hour numeric(12,2) not null default 0 check(price_per_hour>=0),
 currency text not null default 'PHP' check(currency ~ '^[A-Z]{3}$'), unique(club_id,name)
);
create table public.opening_hours (
 club_id uuid references public.clubs(id) on delete cascade, weekday integer check(weekday between 0 and 6),
 opens_at time not null, closes_at time not null, primary key(club_id,weekday), check(closes_at>opens_at)
);
create table public.court_usage (
 id uuid primary key default gen_random_uuid(), court_id uuid not null references public.courts(id),
 starts_at timestamptz not null, ends_at timestamptz not null,
 kind text not null check(kind in ('booking','block','match')), reference_id uuid, reason text,
 active boolean not null default true, check(ends_at>starts_at),
 exclude using gist(court_id with =,tstzrange(starts_at,ends_at,'[)') with &&) where(active)
);
create index court_usage_reference on public.court_usage(reference_id);
create table public.bookings (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 club_id uuid not null references public.clubs(id), court_id uuid not null references public.courts(id),
 starts_at timestamptz not null, ends_at timestamptz not null, status text not null default 'confirmed' check(status in ('confirmed','cancelled')),
 request_id uuid not null, price_total numeric(12,2) not null check(price_total>=0), currency text not null,
 created_at timestamptz not null default now(), cancelled_at timestamptz, cancellation_reason text,
 unique(user_id,request_id), check(ends_at>starts_at)
);
create index bookings_club_starts on public.bookings(club_id,starts_at);
create table public.seasons (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id),
 name text not null check(length(trim(name)) between 1 and 150), starts_on date not null, ends_on date not null,
 archived boolean not null default false, check(ends_on>=starts_on)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null, body text not null, data jsonb not null default '{}', read_at timestamptz, created_at timestamptz not null default now()
);
create index notifications_user_created on public.notifications(user_id,created_at desc);
create table public.audit_log (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id), club_id uuid references public.clubs(id),
 action text not null, entity_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.push_tokens (
 token text primary key, user_id uuid not null references public.profiles(id) on delete cascade,
 platform text not null check(platform in ('ios','android','web')), active boolean not null default true,
 updated_at timestamptz not null default now()
);
create function public.is_admin() returns boolean language sql stable security definer set search_path=public,pg_temp
as $$ select exists(select 1 from public.administrators a join public.profiles p on p.id=a.user_id where a.user_id=auth.uid() and p.status='active') $$;
create function public.can_manage_club(p_club_id uuid,p_permission text default null) returns boolean
language sql stable security definer set search_path=public,pg_temp
as $$ select public.is_admin() or exists(select 1 from public.club_members m join public.profiles p on p.id=m.user_id where m.club_id=p_club_id and m.user_id=auth.uid() and p.status='active' and (m.role='owner' or p_permission is null or p_permission=any(m.permissions))) $$;
create function public.require_active_user() returns uuid language plpgsql stable security definer set search_path=public,pg_temp
as $$ begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and status='active') then raise exception 'An active account is required.' using errcode='42501'; end if;
 return auth.uid();
end $$;
create function public.notify_user(p_user_id uuid,p_title text,p_body text,p_data jsonb default '{}') returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$ declare v_id uuid; begin
 insert into public.notifications(user_id,title,body,data) values(p_user_id,p_title,p_body,p_data) returning id into v_id; return v_id;
end $$;
create function public.audit_event(p_club_id uuid,p_action text,p_entity_id uuid default null,p_details jsonb default '{}') returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$ declare v_id uuid; begin
 insert into public.audit_log(actor_id,club_id,action,entity_id,details) values(auth.uid(),p_club_id,p_action,p_entity_id,p_details) returning id into v_id; return v_id;
end $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin
 insert into public.profiles(id,display_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'display_name',''),80)) on conflict(id) do nothing; return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(id,display_name) select id,left(coalesce(raw_user_meta_data->>'display_name',''),80) from auth.users on conflict(id) do nothing;

-- Profile and club administration.
create function public.update_profile(p_display_name text,p_home_area text default '',p_avatar_url text default null,p_competition_category text default 'open') returns public.profiles
language plpgsql security definer set search_path=public,pg_temp as $$ declare v_user uuid:=public.require_active_user(); v_row public.profiles; begin
 if length(trim(p_display_name)) not between 1 and 80 or length(p_home_area)>120 or (p_avatar_url is not null and p_avatar_url !~ '^https://') then raise exception 'Enter a valid display name, area, and HTTPS photo URL.'; end if;
 update public.profiles set display_name=trim(p_display_name),home_area=trim(p_home_area),avatar_url=p_avatar_url,competition_category=p_competition_category where id=v_user returning * into v_row; return v_row;
end $$;
create function public.search_players(p_search text) returns table(id uuid,display_name text,avatar_url text,competition_category text)
language plpgsql stable security definer set search_path=public,pg_temp as $$ begin
 perform public.require_active_user();
 if length(trim(p_search))<2 then return; end if;
 return query select p.id,p.display_name,p.avatar_url,p.competition_category from public.profiles p where p.status='active' and p.display_name ilike '%'||replace(replace(trim(p_search),'%','\%'),'_','\_')||'%' order by p.display_name limit 20;
end $$;
create function public.apply_club(p_name text,p_area text,p_address text,p_timezone text default 'Asia/Manila') returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$ declare v_user uuid:=public.require_active_user();v_id uuid;begin
 if length(trim(p_area))=0 or length(trim(p_address))=0 or not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Enter an area, address, and valid IANA time zone.';end if;
 insert into public.clubs(owner_id,name,area,address,timezone) values(v_user,trim(p_name),trim(p_area),trim(p_address),p_timezone) returning id into v_id;
 insert into public.club_members(club_id,user_id,role) values(v_id,v_user,'owner');
 perform public.audit_event(v_id,'club.applied',v_id);
 return v_id;
end $$;
create function public.update_club(p_club_id uuid,p_details jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 perform public.require_active_user();
 if not public.can_manage_club(p_club_id,'profile') then raise exception 'Club profile permission required.' using errcode='42501';end if;
 if p_details ? 'timezone' and not exists(select 1 from pg_timezone_names where name=p_details->>'timezone') then raise exception 'Choose a valid IANA time zone.';end if;
 if p_details->>'photo_url' is not null and p_details->>'photo_url' !~ '^https://' then raise exception 'Use an HTTPS photo URL.';end if;
 update public.clubs set name=coalesce(trim(p_details->>'name'),name),description=coalesce(p_details->>'description',description),
 area=coalesce(trim(p_details->>'area'),area),address=coalesce(trim(p_details->>'address'),address),timezone=coalesce(p_details->>'timezone',timezone),
 facilities=case when p_details ? 'facilities' then array(select jsonb_array_elements_text(p_details->'facilities')) else facilities end,
 photo_url=case when p_details ? 'photo_url' then p_details->>'photo_url' else photo_url end,
 booking_duration_minutes=coalesce((p_details->>'booking_duration_minutes')::integer,booking_duration_minutes),
 cancellation_hours=coalesce((p_details->>'cancellation_hours')::numeric,cancellation_hours) where id=p_club_id;
 perform public.audit_event(p_club_id,'club.updated',p_club_id);
end $$;
create function public.save_court(p_club_id uuid,p_details jsonb,p_court_id uuid default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$ declare v_id uuid;begin
 perform public.require_active_user();
 if not public.can_manage_club(p_club_id,'courts') then raise exception 'Court permission required.' using errcode='42501';end if;
 if p_court_id is null then
 insert into public.courts(club_id,name,surface,indoor,active,price_per_hour,currency) values(p_club_id,trim(p_details->>'name'),coalesce(p_details->>'surface',''),coalesce((p_details->>'indoor')::boolean,false),coalesce((p_details->>'active')::boolean,true),coalesce((p_details->>'price_per_hour')::numeric,0),coalesce(p_details->>'currency','PHP')) returning id into v_id;
 else
 update public.courts set name=coalesce(trim(p_details->>'name'),name),surface=coalesce(p_details->>'surface',surface),indoor=coalesce((p_details->>'indoor')::boolean,indoor),active=coalesce((p_details->>'active')::boolean,active),price_per_hour=coalesce((p_details->>'price_per_hour')::numeric,price_per_hour),currency=coalesce(p_details->>'currency',currency) where id=p_court_id and club_id=p_club_id returning id into v_id;
 if v_id is null then raise exception 'Court not found in this club.';end if;
 end if;
 perform public.audit_event(p_club_id,'court.saved',v_id);return v_id;
end $$;
create function public.set_opening_hours(p_club_id uuid,p_hours jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 perform public.require_active_user();
 if not public.can_manage_club(p_club_id,'courts') then raise exception 'Court permission required.' using errcode='42501';end if;
 if jsonb_typeof(p_hours)<>'array' or jsonb_array_length(p_hours)>7 then raise exception 'Supply up to seven opening days.';end if;
 perform 1 from public.clubs where id=p_club_id for update;
 delete from public.opening_hours where club_id=p_club_id;
 insert into public.opening_hours(club_id,weekday,opens_at,closes_at) select p_club_id,(h->>'weekday')::integer,(h->>'opens_at')::time,(h->>'closes_at')::time from jsonb_array_elements(p_hours) h;
 perform public.audit_event(p_club_id,'hours.saved',p_club_id);
end $$;
create function public.add_block(p_court_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$ declare v_club uuid;v_id uuid;begin
 perform public.require_active_user();
 select club_id into v_club from public.courts where id=p_court_id;
 if not public.can_manage_club(v_club,'courts') then raise exception 'Court permission required.' using errcode='42501';end if;
 if p_ends_at<=p_starts_at or p_ends_at<=now() or length(trim(p_reason))=0 then raise exception 'Choose a future time range and give a reason.';end if;
 insert into public.court_usage(court_id,starts_at,ends_at,kind,reason) values(p_court_id,p_starts_at,p_ends_at,'block',trim(p_reason)) returning id into v_id;
 perform public.audit_event(v_club,'court.blocked',v_id);return v_id;
end $$;
create function public.remove_block(p_usage_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$ declare v_club uuid;begin
 perform public.require_active_user();
 select c.club_id into v_club from public.court_usage u join public.courts c on c.id=u.court_id where u.id=p_usage_id and u.kind='block' for update of u;
 if not public.can_manage_club(v_club,'courts') then raise exception 'Court permission required.' using errcode='42501';end if;
 update public.court_usage set active=false where id=p_usage_id and kind='block';
 perform public.audit_event(v_club,'court.block_removed',p_usage_id);
end $$;

-- Booking availability is public to active signed-in players, without occupant identities.
create function public.court_availability(p_club_id uuid,p_date date)
returns table(court_id uuid,court_name text,starts_at timestamptz,ends_at timestamptz,available boolean,price_total numeric,currency text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.require_active_user();
 if p_date is null then raise exception 'Choose a booking date.';end if;
 return query
 select c.id,c.name,s.start_time,s.start_time+make_interval(mins=>cl.booking_duration_minutes),
 s.start_time>now() and not exists(select 1 from public.court_usage u where u.court_id=c.id and u.active and tstzrange(u.starts_at,u.ends_at,'[)') && tstzrange(s.start_time,s.start_time+make_interval(mins=>cl.booking_duration_minutes),'[)')),
 round(c.price_per_hour*cl.booking_duration_minutes/60,2),c.currency
 from public.clubs cl join public.courts c on c.club_id=cl.id and c.active
 join public.opening_hours h on h.club_id=cl.id and h.weekday=extract(dow from p_date)::integer
 cross join lateral generate_series((p_date+h.opens_at) at time zone cl.timezone,
 (p_date+h.closes_at) at time zone cl.timezone-make_interval(mins=>cl.booking_duration_minutes),
 make_interval(mins=>cl.booking_duration_minutes)) s(start_time)
 where cl.id=p_club_id and cl.verification_status='verified' order by c.name,s.start_time;
end $$;
alter table public.bookings add column cancellation_hours numeric not null default 24;
create function public.create_booking(p_court_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_request_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=public.require_active_user();v_old public.bookings;v_court public.courts;v_club public.clubs;v_id uuid;v_slot record;
begin
 if p_request_id is null then raise exception 'A request ID is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user::text||p_request_id::text,0));
 select * into v_old from public.bookings where user_id=v_user and request_id=p_request_id;
 if found then
  if v_old.court_id<>p_court_id or v_old.starts_at<>p_starts_at or v_old.ends_at<>p_ends_at then raise exception 'Request ID already belongs to another reservation.';end if;
  return v_old.id;
 end if;
 select * into v_court from public.courts where id=p_court_id for update;
 select * into v_club from public.clubs where id=v_court.club_id for share;
 if v_court.id is null or not v_court.active or v_club.verification_status<>'verified' then raise exception 'Court is not available for booking.';end if;
 select * into v_slot from public.court_availability(v_club.id,(p_starts_at at time zone v_club.timezone)::date) s
 where s.court_id=p_court_id and s.starts_at=p_starts_at and s.ends_at=p_ends_at and s.available;
 if not found then raise exception 'That time is unavailable. Refresh availability and choose another session.';end if;
 insert into public.bookings(user_id,club_id,court_id,starts_at,ends_at,request_id,price_total,currency,cancellation_hours)
 values(v_user,v_club.id,p_court_id,p_starts_at,p_ends_at,p_request_id,v_slot.price_total,v_slot.currency,v_club.cancellation_hours) returning id into v_id;
 insert into public.court_usage(court_id,starts_at,ends_at,kind,reference_id) values(p_court_id,p_starts_at,p_ends_at,'booking',v_id);
 perform public.notify_user(v_user,'Court reserved',v_club.name||' confirmed your reservation.',jsonb_build_object('booking_id',v_id));
 perform public.audit_event(v_club.id,'booking.created',v_id);
 return v_id;
end $$;
create function public.cancel_booking(p_booking_id uuid,p_reason text default '') returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=public.require_active_user();b public.bookings;manager boolean;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 manager:=public.can_manage_club(b.club_id,'bookings');
 if b.id is null or (b.user_id<>v_user and not manager) then raise exception 'Reservation access denied.' using errcode='42501';end if;
 if b.status='cancelled' then return;end if;
 if manager and length(trim(p_reason))=0 then raise exception 'A management cancellation needs a reason.';end if;
 if not manager and now()>b.starts_at-make_interval(secs=>(b.cancellation_hours*3600)::double precision) then raise exception 'The cancellation window has closed. Contact the club.';end if;
 update public.bookings set status='cancelled',cancelled_at=now(),cancellation_reason=left(p_reason,1000) where id=b.id;
 update public.court_usage set active=false where kind='booking' and reference_id=b.id;
 perform public.notify_user(b.user_id,'Reservation cancelled','Your court time has been released.',jsonb_build_object('booking_id',b.id));
 perform public.audit_event(b.club_id,'booking.cancelled',b.id,jsonb_build_object('reason',p_reason));
end $$;
create function public.invite_staff(p_club_id uuid,p_email text,p_permissions text[]) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 perform public.require_active_user();
 -- Staff managers cannot delegate authority they do not themselves possess.
 if not public.can_manage_club(p_club_id,'staff') then raise exception 'Staff permission required.' using errcode='42501';end if;
 if not (public.is_admin() or exists(select 1 from public.club_members where club_id=p_club_id and user_id=auth.uid() and role='owner')) then
  if not p_permissions <@ (select permissions from public.club_members where club_id=p_club_id and user_id=auth.uid()) then raise exception 'Cannot delegate permissions you do not have.';end if;
 end if;
 if p_email !~ '^[^ @]+@[^ @]+[.][^ @]+$' or coalesce(cardinality(p_permissions),0)=0 then raise exception 'Provide an email and at least one permission.';end if;
 insert into public.staff_invitations(club_id,email,permissions) values(p_club_id,lower(trim(p_email)),p_permissions)
 on conflict(club_id,email) do update set permissions=excluded.permissions,status='pending',accepted_at=null,expires_at=now()+interval '7 days' returning id into v_id;
 perform public.audit_event(p_club_id,'staff.invited',v_id);
 return v_id;
end $$;
create function public.accept_staff_invite(p_invitation_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=public.require_active_user();i public.staff_invitations;v_email text;
begin
 select lower(email) into v_email from auth.users where id=v_user and email_confirmed_at is not null;
 select * into i from public.staff_invitations where id=p_invitation_id for update;
 if i.id is null or i.email is distinct from v_email then raise exception 'This invitation requires its verified email account.' using errcode='42501';end if;
 if i.status='accepted' then return;end if;
 if i.status<>'pending' or i.expires_at<=now() then raise exception 'Invitation expired or revoked.';end if;
 if exists(select 1 from public.club_members where club_id=i.club_id and user_id=v_user and role='owner') then raise exception 'You already own this club.';end if;
 insert into public.club_members(club_id,user_id,role,permissions) values(i.club_id,v_user,'staff',i.permissions)
 on conflict(club_id,user_id) do update set permissions=excluded.permissions;
 update public.staff_invitations set status='accepted',accepted_at=now() where id=i.id;
 perform public.notify_user(v_user,'Club access added','Your staff invitation has been accepted.',jsonb_build_object('club_id',i.club_id));
 perform public.audit_event(i.club_id,'staff.accepted',v_user);
end $$;
create function public.revoke_staff(p_club_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.require_active_user();
 if not (public.is_admin() or exists(select 1 from public.club_members where club_id=p_club_id and user_id=auth.uid() and role='owner')) then raise exception 'Only the club owner or administrator can revoke staff.' using errcode='42501';end if;
 delete from public.club_members where club_id=p_club_id and user_id=p_user_id and role='staff';
 update public.staff_invitations set status='revoked' where club_id=p_club_id and email=(select lower(email) from auth.users where id=p_user_id);
 perform public.audit_event(p_club_id,'staff.revoked',p_user_id);
end $$;

create function public.verify_club(p_club_id uuid,p_status text,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_admin() then raise exception 'Administrator required.' using errcode='42501';end if;
 if p_status not in ('verified','rejected','pending') or length(trim(p_reason))<3 then raise exception 'Choose a verification status and reason.';end if;
 update public.clubs set verification_status=p_status,verification_reason=p_reason where id=p_club_id;
 if not found then raise exception 'Club not found.';end if;
 perform public.audit_event(p_club_id,'club.verification',p_club_id,jsonb_build_object('status',p_status,'reason',p_reason));
 perform public.notify_user((select owner_id from public.clubs where id=p_club_id),'Club verification updated',p_reason,jsonb_build_object('club_id',p_club_id));
end $$;
create function public.manage_account(p_user_id uuid,p_status text,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_admin() then raise exception 'Administrator required.' using errcode='42501';end if;
 if p_status not in ('active','suspended') or length(trim(p_reason))<3 then raise exception 'Choose a status and give a reason.';end if;
 if p_user_id=auth.uid() and p_status='suspended' then raise exception 'You cannot suspend your own administrator account.';end if;
 update public.profiles set status=p_status where id=p_user_id;
 if not found then raise exception 'Account not found.';end if;
 perform public.audit_event(null,'account.status',p_user_id,jsonb_build_object('status',p_status,'reason',p_reason));
end $$;
create function public.save_season(p_club_id uuid,p_details jsonb,p_season_id uuid default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 perform public.require_active_user();
 if not public.can_manage_club(p_club_id,'tournaments') then raise exception 'Tournament permission required.' using errcode='42501';end if;
 if p_season_id is null then
 insert into public.seasons(club_id,name,starts_on,ends_on,archived) values(p_club_id,p_details->>'name',(p_details->>'starts_on')::date,(p_details->>'ends_on')::date,coalesce((p_details->>'archived')::boolean,false)) returning id into v_id;
 else
 update public.seasons set name=coalesce(p_details->>'name',name),archived=coalesce((p_details->>'archived')::boolean,archived)
 where id=p_season_id and club_id=p_club_id returning id into v_id;
 if v_id is null then raise exception 'Season not found.';end if;
 -- Dates are immutable to preserve published event eligibility and history.
 if exists(select 1 from public.seasons where id=v_id and (starts_on is distinct from (p_details->>'starts_on')::date or ends_on is distinct from (p_details->>'ends_on')::date)) then raise exception 'Season dates cannot be changed. Create a new season.';end if;
 end if;
 perform public.audit_event(p_club_id,'season.saved',v_id);return v_id;
end $$;
create function public.mark_notification_read(p_notification_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.notifications set read_at=coalesce(read_at,now()) where id=p_notification_id and user_id=public.require_active_user();
 if not found then raise exception 'Notification not found.';end if;
end $$;
create function public.register_push_token(p_token text,p_platform text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=public.require_active_user();
begin
 if p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' or length(p_token)>250 then raise exception 'Invalid Expo push token.';end if;
 insert into public.push_tokens(token,user_id,platform,active) values(p_token,v_user,p_platform,true)
 on conflict(token) do update set user_id=excluded.user_id,platform=excluded.platform,active=true,updated_at=now();
end $$;

-- Audit-friendly update timestamps, including writes through trusted functions.
create function public.touch_updated_at() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin new.updated_at=now();return new;end $$;
do $$ declare t text;begin
 foreach t in array array['profiles','clubs','club_members','staff_invitations','courts','opening_hours','court_usage','bookings','seasons'] loop
 execute format('alter table public.%I add column updated_at timestamptz not null default now()',t);
 execute format('create trigger touch_updated before update on public.%I for each row execute function public.touch_updated_at()',t);
 end loop;
end $$;
revoke create on schema public from public;
do $$ declare t text;begin
 foreach t in array array['profiles','administrators','clubs','club_members','staff_invitations','courts','opening_hours','court_usage','bookings','seasons','notifications','audit_log','push_tokens'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy administrators_read on public.administrators for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy clubs_read on public.clubs for select to authenticated using(verification_status='verified' or public.can_manage_club(id) or exists(select 1 from public.staff_invitations i where i.club_id=clubs.id and i.email=lower(auth.jwt()->>'email') and i.status='pending'));
create policy members_read on public.club_members for select to authenticated using(user_id=auth.uid() or public.can_manage_club(club_id,'staff'));
create policy invitations_read on public.staff_invitations for select to authenticated using(email=lower(auth.jwt()->>'email') or public.can_manage_club(club_id,'staff'));
create policy courts_read on public.courts for select to authenticated using(exists(select 1 from public.clubs c where c.id=club_id));
create policy hours_read on public.opening_hours for select to authenticated using(exists(select 1 from public.clubs c where c.id=club_id));
create policy usage_read on public.court_usage for select to authenticated using(public.can_manage_club((select club_id from public.courts where id=court_id)));
create policy bookings_read on public.bookings for select to authenticated using(user_id=auth.uid() or public.can_manage_club(club_id,'bookings'));
create policy seasons_read on public.seasons for select to authenticated using(exists(select 1 from public.clubs c where c.id=club_id));
create policy notifications_read on public.notifications for select to authenticated using(user_id=auth.uid());
create policy audit_read on public.audit_log for select to authenticated using(public.is_admin() or exists(select 1 from public.club_members m where m.club_id=audit_log.club_id and m.user_id=auth.uid() and m.role='owner'));
create policy tokens_read on public.push_tokens for select to authenticated using(user_id=auth.uid());

-- Functions are deny-by-default; only checked public entry points and RLS helpers are exposed.
do $$ declare f record;begin
 for f in select oid::regprocedure as signature from pg_proc
 where pronamespace='public'::regnamespace and proname=any(array['is_admin','can_manage_club','require_active_user','notify_user','audit_event','handle_new_user','update_profile','search_players','apply_club','update_club','save_court','set_opening_hours','add_block','remove_block','court_availability','create_booking','cancel_booking','invite_staff','accept_staff_invite','revoke_staff','verify_club','manage_account','save_season','mark_notification_read','register_push_token','touch_updated_at']) loop
 execute 'revoke execute on function '||f.signature||' from public,anon,authenticated';
 end loop;
end $$;
grant execute on function public.is_admin(),public.can_manage_club(uuid,text) to authenticated;
do $$ declare f record;begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname=any(array[
 'update_profile','search_players','apply_club','update_club','save_court','set_opening_hours','add_block','remove_block',
 'court_availability','create_booking','cancel_booking','invite_staff','accept_staff_invite','revoke_staff','verify_club','manage_account','save_season','mark_notification_read','register_push_token']) loop
 execute 'grant execute on function '||f.signature||' to authenticated';
 end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp']),
 ('club-images','club-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy playpickle_images_read on storage.objects for select using(bucket_id in ('avatars','club-images'));
create policy playpickle_avatar_insert on storage.objects for insert to authenticated with check(
 bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.profiles where id=auth.uid() and status='active'));
create policy playpickle_avatar_delete on storage.objects for delete to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy playpickle_club_image_insert on storage.objects for insert to authenticated with check(bucket_id='club-images' and public.can_manage_club(((storage.foldername(name))[1])::uuid,'profile'));
create policy playpickle_club_image_delete on storage.objects for delete to authenticated using(bucket_id='club-images' and public.can_manage_club(((storage.foldername(name))[1])::uuid,'profile'));
do $$ declare t text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['clubs','courts','opening_hours','bookings','court_usage','notifications','staff_invitations','club_members','seasons'] loop
 execute format('alter publication supabase_realtime add table public.%I',t);
 end loop;end if;
end $$;
