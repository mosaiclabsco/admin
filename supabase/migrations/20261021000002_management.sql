begin;
grant execute on function public.allow_auth_attempt(text,integer,integer) to service_role;
-- The database enforces the 12-hour lifetime independently of the web proxy.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.admins a join auth.sessions s on s.user_id=a.user_id
  where a.user_id=auth.uid() and s.id=nullif(auth.jwt()->>'session_id','')::uuid
   and s.created_at+interval '12 hours'>now() and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated,service_role;
-- Prevent linking a commercial account to another platform's plan, including via direct API.
alter table public.plans add constraint plans_id_platform_unique unique(id,platform_id);
alter table public.accounts add constraint accounts_plan_platform_fk foreign key(plan_id,platform_id) references public.plans(id,platform_id);

create function public.settle_platform_charge(p_id uuid,p_method text,p_paid_on date,p_amount integer,p_reference text) returns void
language plpgsql security definer set search_path='' as $$
declare charge public.charges; actor text; platform uuid;
begin
 if not public.is_admin() then raise insufficient_privilege; end if;
 if p_method is null or p_method not in ('pix','transfer','card','cash','other') or p_paid_on is null or p_paid_on>(now() at time zone 'America/Sao_Paulo')::date or p_paid_on<date '2000-01-01' or p_amount is null or p_amount<=0 or p_amount>9900000 or length(coalesce(p_reference,''))>500 then
  raise exception 'Invalid payment' using errcode='22023';
 end if;
 select * into charge from public.charges where id=p_id for update;
 if not found or charge.status<>'pending' then raise exception 'Charge is not pending' using errcode='40001'; end if;
 select email into actor from public.admins where user_id=auth.uid();
 select platform_id into platform from public.accounts where id=charge.account_id;
 update public.charges set status='paid',paid_at=(p_paid_on+time '12:00') at time zone 'America/Sao_Paulo',paid_amount_cents=p_amount,method=p_method,reference=p_reference,settled_by=actor where id=p_id;
 insert into public.audit_log(actor,action,platform_id,entity,entity_id,data) values(actor,'charge.settle',platform,'charge',p_id::text,jsonb_build_object('amount_cents',p_amount,'paid_on',p_paid_on,'method',p_method));
end;
$$;
revoke all on function public.settle_platform_charge(uuid,text,date,integer,text) from public,anon;
grant execute on function public.settle_platform_charge(uuid,text,date,integer,text) to authenticated;
commit;
