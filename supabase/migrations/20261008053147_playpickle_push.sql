-- In-app notifications are authoritative; push is a retryable delivery channel.
create table public.push_jobs (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null references public.notifications(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 token text not null, status text not null default 'pending' check(status in ('pending','processing','ticket','delivered','failed')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz, receipt_id text, last_error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(notification_id,token)
);
create index push_jobs_due on public.push_jobs(next_attempt_at) where status in ('pending','ticket','processing');
alter table public.push_jobs enable row level security;
revoke all on public.push_jobs from anon,authenticated;
grant all on public.push_jobs to service_role;

create function public.enqueue_notification_push() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.push_jobs(notification_id,user_id,token)
 select new.id,new.user_id,t.token from public.push_tokens t where t.user_id=new.user_id and t.active
 on conflict do nothing;
 return new;
end $$;
revoke all on function public.enqueue_notification_push() from public,anon,authenticated;
create trigger notification_push after insert on public.notifications for each row execute function public.enqueue_notification_push();

create function public.claim_push_jobs(p_limit integer default 30) returns setof public.push_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 return query with candidates as (
 select id from public.push_jobs where
 ((status in ('pending','ticket') and next_attempt_at<=now()) or (status='processing' and lease_until<now()))
 and (attempts<5 or receipt_id is not null)
 order by next_attempt_at for update skip locked limit least(greatest(p_limit,1),100)
 ) update public.push_jobs j set status='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',
 attempts=j.attempts+1,updated_at=now() from candidates c where j.id=c.id returning j.*;
end $$;
revoke all on function public.claim_push_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_push_jobs(integer) to service_role;

create function public.settle_push_job(p_id uuid,p_lease_id uuid,p_result text,p_ticket text default null,p_error text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.push_jobs;
begin
 select * into j from public.push_jobs where id=p_id for update;
 if not found or j.status<>'processing' or j.lease_id is distinct from p_lease_id then return; end if;
 if p_result not in ('delivered','ticket','retry','failed') then raise exception 'Invalid push result'; end if;
 if p_error='DeviceNotRegistered' then update public.push_tokens set active=false where token=j.token; end if;
 update public.push_jobs set
 status=case when p_result='retry' and (j.created_at<now()-interval '24 hours' or (j.receipt_id is null and j.attempts>=5)) then 'failed'
 when p_result='retry' then case when j.receipt_id is null then 'pending' else 'ticket' end else p_result end,
 receipt_id=coalesce(p_ticket,j.receipt_id),last_error=left(p_error,300),
 next_attempt_at=now()+case when p_result='ticket' or j.receipt_id is not null then interval '15 minutes' else least(3600,30*power(2,least(j.attempts,7))) * interval '1 second' end,
 lease_id=null,lease_until=null,updated_at=now() where id=j.id;
end $$;
revoke all on function public.settle_push_job(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.settle_push_job(uuid,uuid,text,text,text) to service_role;
