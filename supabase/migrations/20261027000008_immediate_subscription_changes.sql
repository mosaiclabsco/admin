begin;
-- Both execution modes retain the same administrator validation, pricing snapshot and retry journal.
alter table public.subscription_changes add column application_mode text not null default 'renewal' check(application_mode in ('now','renewal'));
create function public.request_subscription_change(p_account uuid,p_plan uuid,p_override integer,p_expected_current integer,p_expected_new integer,p_expected_day integer,p_today date,p_operation uuid,p_source_revision bigint,p_source_suspended boolean,p_timing text default 'renewal') returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.accounts; p public.plans; prior public.subscription_changes; old_price integer; new_price integer; start_on date; end_on date; days integer; used integer; old_used integer; old_remaining integer; new_remaining integer; actor_email text; product text; snapshot jsonb;
begin
 if not public.is_admin() then raise insufficient_privilege; end if;
 if p_timing is null or p_timing not in ('now','renewal') then raise exception 'Invalid timing' using errcode='22023';end if;
 select email into actor_email from public.admins where user_id=auth.uid();
 select * into a from public.accounts where id=p_account for update;
 if not found or a.status='cancelled' then raise exception 'Account unavailable' using errcode='22023';end if;
 select * into prior from public.subscription_changes where id=p_operation;
 if found then
  if prior.account_id<>p_account or prior.target_plan_id<>p_plan or prior.target_override is distinct from p_override or prior.actor<>actor_email or prior.application_mode<>p_timing then raise exception 'Operation already used' using errcode='22023';end if;
  return prior.id;
 end if;
 select * into p from public.plans where id=p_plan and platform_id=a.platform_id and active for share;
 if not found then raise exception 'Plan unavailable' using errcode='22023';end if;
 if p_override is not null and (p_override<0 or p_override>9900000) then raise exception 'Invalid price' using errcode='22023';end if;
 select slug into product from public.platforms where id=a.platform_id;
 if product='lessonara' and (p.feature_tier is null or p_source_revision is null or p_source_suspended is null or p_source_revision<0) then raise exception 'Configure the plan access and source revision' using errcode='22023';end if;
 select coalesce(a.price_override_cents,price_cents,0) into old_price from public.plans where id=a.plan_id;
 old_price:=coalesce(old_price,a.price_override_cents,0);new_price:=coalesce(p_override,p.price_cents);
 if p_today is distinct from (now() at time zone 'America/Sao_Paulo')::date or p_expected_day is distinct from a.billing_day or p_expected_current is distinct from old_price or p_expected_new is distinct from new_price then raise exception 'Quote changed. Reload.' using errcode='40001';end if;
 if a.plan_id=p_plan and a.price_override_cents is not distinct from p_override and old_price=new_price then raise exception 'No plan change' using errcode='22023';end if;
 start_on:=make_date(extract(year from p_today)::int,extract(month from p_today)::int,a.billing_day);
 if start_on>p_today then start_on:=(start_on-interval '1 month')::date;end if;
 end_on:=(start_on+interval '1 month')::date;days:=end_on-start_on;used:=p_today-start_on;
 old_used:=round(old_price::numeric*used/days)::int;old_remaining:=old_price-old_used;new_remaining:=new_price-round(new_price::numeric*used/days)::int;
 snapshot:=jsonb_build_object('cycle_start',start_on,'effective_on',case when p_timing='now' then p_today else end_on end,'renewal_on',end_on,'total_days',days,'used_days',used,'remaining_days',days-used,'old_used_cents',old_used,'old_remaining_cents',old_remaining,'new_remaining_cents',new_remaining,'difference_cents',new_remaining-old_remaining);
 insert into public.subscription_changes(id,account_id,from_plan_id,from_override,target_plan_id,target_name,old_price_cents,new_price_cents,target_override,billing_day,feature_tier,source_revision,source_suspended,actor,requested_on,effective_on,quote,application_mode)
 values(p_operation,a.id,a.plan_id,a.price_override_cents,p.id,p.name,old_price,new_price,p_override,a.billing_day,case when product='lessonara' then p.feature_tier else null end,case when product='lessonara' then p_source_revision else null end,case when product='lessonara' then p_source_suspended else null end,actor_email,p_today,case when p_timing='now' then p_today else end_on end,snapshot,p_timing);
 insert into public.audit_log(actor,action,platform_id,entity,entity_id,data) values(actor_email,case when p_timing='now' then 'subscription.request_immediate' else 'subscription.schedule' end,a.platform_id,'account',a.id::text,jsonb_build_object('operation',p_operation,'from_plan',a.plan_id,'target_plan',p.id,'old_price_cents',old_price,'new_price_cents',new_price,'quote',snapshot,'refund','manual_only','application_mode',p_timing));
 return p_operation;
end;$$;
revoke all on function public.request_subscription_change(uuid,uuid,integer,integer,integer,integer,date,uuid,bigint,boolean,text) from public,anon;
grant execute on function public.request_subscription_change(uuid,uuid,integer,integer,integer,integer,date,uuid,bigint,boolean,text) to authenticated;


-- Immediate requests may claim only their own operation; the cron still calls with no filter.
create function public.claim_requested_subscription_change(p_id uuid default null) returns setof public.subscription_changes language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege;end if;
 update public.subscription_changes set status='failed',last_error='Execução interrompida após cinco tentativas. Revise e tente novamente.',lease_until=null where (p_id is null or id=p_id) and status='processing' and lease_until<now() and attempts>=5;
 return query with due as (
  select id from public.subscription_changes where (p_id is null or id=p_id) and effective_on<=(now() at time zone 'America/Sao_Paulo')::date and attempts<5
   and ((status='scheduled' and (retry_after is null or retry_after<=now())) or (status='processing' and lease_until<now()))
   order by effective_on,created_at for update skip locked limit 10
 ) update public.subscription_changes c set status='processing',attempts=c.attempts+1,claim_token=gen_random_uuid(),lease_until=now()+interval '5 minutes' from due where c.id=due.id returning c.*;
end;$$;
revoke all on function public.claim_requested_subscription_change(uuid) from public,anon,authenticated;
grant execute on function public.claim_requested_subscription_change(uuid) to service_role;


-- After an attempt, source access may already be applied in the other database.
-- Require completion/review instead of pretending cancellation rolled that access back.
create or replace function public.cancel_subscription_change(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.subscription_changes; actor_email text; platform uuid;
begin
 if not public.is_admin() then raise insufficient_privilege;end if;
 select * into c from public.subscription_changes where id=p_id for update;
 if not found or c.status not in ('scheduled','failed') or c.attempts>0 then raise exception 'Change cannot be cancelled now' using errcode='40001';end if;
 select email into actor_email from public.admins where user_id=auth.uid();select platform_id into platform from public.accounts where id=c.account_id;
 update public.subscription_changes set status='cancelled',claim_token=null,lease_until=null where id=p_id;
 insert into public.audit_log(actor,action,platform_id,entity,entity_id,data) values(actor_email,'subscription.cancel',platform,'account',c.account_id::text,jsonb_build_object('operation',c.id));
end;$$;
revoke all on function public.cancel_subscription_change(uuid) from public,anon;
grant execute on function public.cancel_subscription_change(uuid) to authenticated;


notify pgrst,'reload schema';
commit;
