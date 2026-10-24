begin;

create schema if not exists private;
create table private.job_runs(
 id uuid primary key default gen_random_uuid(),job_key text not null check(job_key in ('admin-health')),
 status text not null default 'running' check(status in ('running','succeeded','failed','skipped')),
 started_at timestamptz not null default now(),finished_at timestamptz,
 metrics jsonb not null default '{}',error_code text
);
create index job_runs_latest on private.job_runs(job_key,started_at desc);
alter table private.job_runs enable row level security;
revoke all on private.job_runs from public,anon,authenticated,service_role;
create function public.start_job_run(p_job text) returns uuid language plpgsql security definer set search_path='' as $$
declare run_id uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege;end if;
 if p_job is null or p_job not in ('admin-health') then raise exception 'Unknown job';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('mosaic-admin-job:'||p_job));
 update private.job_runs set status='failed',finished_at=now(),error_code='lease_expired' where job_key=p_job and status='running' and started_at<now()-interval '2 minutes';
 if exists(select 1 from private.job_runs where job_key=p_job and status='running') then return null;end if;
 insert into private.job_runs(job_key) values(p_job) returning id into run_id;
 delete from private.job_runs where started_at<now()-interval '30 days' and status<>'running';
 return run_id;
end;$$;
create function public.finish_job_run(p_id uuid,p_status text,p_metrics jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege;end if;
 if p_status is null or p_status not in ('succeeded','failed','skipped') or jsonb_typeof(p_metrics) is distinct from 'object' or pg_column_size(p_metrics)>4096 or exists(select 1 from jsonb_each(p_metrics) e where jsonb_typeof(e.value) not in ('number','boolean')) then raise exception 'Invalid job result';end if;
 update private.job_runs set status=p_status,finished_at=now(),metrics=p_metrics,error_code=case when p_status='failed' then 'worker_failed' end where id=p_id and status='running';
 if not found then raise exception 'Job lease lost';end if;
end;$$;
revoke all on function public.start_job_run(text),public.finish_job_run(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.start_job_run(text),public.finish_job_run(uuid,text,jsonb) to service_role;

create function public.admin_jobs_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege;end if;
 return jsonb_build_object('generatedAt',now(),'runs',coalesce((select jsonb_agg(to_jsonb(r)) from(select * from private.job_runs order by started_at desc limit 30) r),'[]'::jsonb));
end;$$;
revoke all on function public.admin_jobs_snapshot() from public,anon,authenticated;
grant execute on function public.admin_jobs_snapshot() to service_role;
notify pgrst,'reload schema';
commit;
