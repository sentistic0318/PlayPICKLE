-- OPTIONAL DEVELOPMENT ONLY. Never loaded automatically.
-- Create a development account first, then run this in the trusted SQL editor:
-- select set_config('playpickle.seed_owner_id','YOUR-DEVELOPMENT-USER-UUID',false);
-- Run this whole file in the same SQL session. No admin account is created.
begin;
do $$
declare v_owner uuid; v_club uuid; v_court uuid;
begin
 v_owner:=nullif(current_setting('playpickle.seed_owner_id',true),'')::uuid;
 if v_owner is null or not exists(select 1 from public.profiles where id=v_owner) then
  raise exception 'Set playpickle.seed_owner_id to a development account UUID first.';
 end if;
 if exists(select 1 from public.clubs where owner_id=v_owner and name='[DEMO] Riverside Pickleball') then
  raise exception 'Demo club already exists. Use a fresh development project.';
 end if;
 insert into public.clubs(owner_id,name,description,area,address,timezone,verification_status,facilities)
 values(v_owner,'[DEMO] Riverside Pickleball','Optional development fixture. Not a real participating club.','Demo City','Development data only','Asia/Manila','verified',array['Demo parking','Demo equipment rental']) returning id into v_club;
 insert into public.club_members(club_id,user_id,role) values(v_club,v_owner,'owner');
 insert into public.courts(club_id,name,surface,price_per_hour,currency) values(v_club,'[DEMO] Court 1','Acrylic',300,'PHP') returning id into v_court;
 insert into public.opening_hours(club_id,weekday,opens_at,closes_at) select v_club,day,'08:00'::time,'22:00'::time from generate_series(0,6) day;
 insert into public.seasons(club_id,name,starts_on,ends_on) values(v_club,'[DEMO] Development season',date_trunc('year',now())::date,(date_trunc('year',now())+interval '1 year -1 day')::date);
end $$;
commit;
