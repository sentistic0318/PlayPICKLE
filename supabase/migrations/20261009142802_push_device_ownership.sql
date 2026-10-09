-- Snapshot a registration, not just an Expo token (which can change owners).
alter table public.push_tokens add column registration_id uuid not null default gen_random_uuid();
alter table public.push_jobs add column token_registration_id uuid;
update public.push_jobs j set token_registration_id=t.registration_id from public.push_tokens t where t.token=j.token and t.user_id=j.user_id and t.active;
update public.push_jobs set
 status=case when status in ('pending','processing','ticket') then 'failed' else status end,
 last_error=case when status in ('pending','processing','ticket') then 'Device registration unavailable' else last_error end,
 lease_id=null,lease_until=null,token_registration_id=gen_random_uuid() where token_registration_id is null;
alter table public.push_jobs alter column token_registration_id set not null;
create index push_jobs_device_pending on public.push_jobs(token) where status in ('pending','ticket','processing');

create function public.rotate_push_registration() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- Every explicit registration/update starts a new delivery generation, even
 -- when the same user signs back in following an offline sign-out.
 new.registration_id=gen_random_uuid();
 update public.push_jobs set status='failed',last_error='Device registration changed',lease_id=null,lease_until=null,updated_at=now()
 where token=old.token and status in ('pending','ticket','processing');
 return new;
end $$;
revoke all on function public.rotate_push_registration() from public,anon,authenticated;
create trigger push_registration_changed before update on public.push_tokens
for each row execute function public.rotate_push_registration();

create function public.unregister_push_token(p_token text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 -- Deliberately allow suspended users to unregister on logout.
 update public.push_tokens set active=false,updated_at=now() where token=p_token and user_id=auth.uid() and active;
end $$;
revoke all on function public.unregister_push_token(text) from public,anon,authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

create or replace function public.enqueue_notification_push() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.push_jobs(notification_id,user_id,token,token_registration_id)
 select new.id,new.user_id,t.token,t.registration_id from public.push_tokens t where t.user_id=new.user_id and t.active
 on conflict do nothing;
 return new;
end $$;

create or replace function public.claim_push_jobs(p_limit integer default 30) returns setof public.push_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- Also retire stale enqueues that committed after a token invalidation scan.
 update public.push_jobs j set status='failed',last_error='Device registration changed',lease_id=null,lease_until=null,updated_at=now()
 where j.status in ('pending','ticket','processing') and not exists(
  select 1 from public.push_tokens t where t.token=j.token and t.user_id=j.user_id and t.active and t.registration_id=j.token_registration_id);
 return query with candidates as (
 select j.id from public.push_jobs j where
 ((status in ('pending','ticket') and next_attempt_at<=now()) or (status='processing' and lease_until<now()))
 and (attempts<5 or receipt_id is not null)
 and exists(select 1 from public.push_tokens t where t.token=j.token and t.user_id=j.user_id and t.active and t.registration_id=j.token_registration_id)
 order by next_attempt_at,j.id for update of j skip locked limit least(greatest(p_limit,1),100)
 ) update public.push_jobs j set status='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',
 attempts=j.attempts+1,updated_at=now() from candidates c where j.id=c.id returning j.*;
end $$;

-- Service-only last check, used immediately before each Expo send/receipt request.
create function public.validate_push_job(p_id uuid,p_lease_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.push_jobs j join public.push_tokens t on t.token=j.token
 where j.id=p_id and j.lease_id=p_lease_id and j.status='processing' and j.lease_until>now()
 and t.active and t.user_id=j.user_id and t.registration_id=j.token_registration_id)
$$;
revoke all on function public.validate_push_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.validate_push_job(uuid,uuid) to service_role;

create or replace function public.settle_push_job(p_id uuid,p_lease_id uuid,p_result text,p_ticket text default null,p_error text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.push_jobs;
begin
 -- Keep token -> job lock order consistent with the invalidation trigger.
 perform 1 from public.push_tokens where token=(select token from public.push_jobs where id=p_id) for update;
 select * into j from public.push_jobs where id=p_id for update;
 if not found or j.status<>'processing' or j.lease_id is distinct from p_lease_id then return; end if;
 if not exists(select 1 from public.push_tokens t where t.token=j.token and t.user_id=j.user_id and t.active and t.registration_id=j.token_registration_id) then
 update public.push_jobs set status='failed',last_error='Device registration changed',lease_id=null,lease_until=null,updated_at=now() where id=j.id;return;
 end if;
 if p_result not in ('delivered','ticket','retry','failed') then raise exception 'Invalid push result'; end if;
 if p_error='DeviceNotRegistered' then update public.push_tokens set active=false where token=j.token and user_id=j.user_id and registration_id=j.token_registration_id; end if;
 update public.push_jobs set
 status=case when p_result='retry' and (j.created_at<now()-interval '24 hours' or (j.receipt_id is null and j.attempts>=5)) then 'failed'
 when p_result='retry' then case when j.receipt_id is null then 'pending' else 'ticket' end else p_result end,
 receipt_id=coalesce(p_ticket,j.receipt_id),last_error=left(p_error,300),
 next_attempt_at=now()+case when p_result='ticket' or j.receipt_id is not null then interval '15 minutes' else least(3600,30*power(2,least(j.attempts,7))) * interval '1 second' end,
 lease_id=null,lease_until=null,updated_at=now() where id=j.id and status='processing' and lease_id=p_lease_id;
end $$;
