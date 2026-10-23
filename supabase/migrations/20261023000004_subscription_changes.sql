begin;
alter table public.plans add column feature_tier text check(feature_tier in ('essential','plus','pro'));
update public.plans p set feature_tier=case p.code when 'LSN-ESSENCIAL' then 'essential' when 'LSN-PLUS' then 'plus' when 'LSN-PRO' then 'pro' end from public.platforms f where p.platform_id=f.id and f.slug='lessonara';
create table public.subscription_changes (
 id uuid primary key,
 account_id uuid not null references public.accounts on delete cascade,
 from_plan_id uuid references public.plans,
 from_override integer,
 target_plan_id uuid not null references public.plans,
 target_name text not null,
 old_price_cents integer not null check(old_price_cents between 0 and 9900000),
 new_price_cents integer not null check(new_price_cents between 0 and 9900000),
 target_override integer check(target_override between 0 and 9900000),
 billing_day integer not null check(billing_day between 1 and 28),
 feature_tier text check(feature_tier in ('essential','plus','pro')),
 source_revision bigint,
 source_suspended boolean,
 actor text not null,
 requested_on date not null,
 effective_on date not null,
 quote jsonb not null,
 status text not null default 'scheduled' check(status in ('scheduled','processing','applied','cancelled','failed')),
 attempts integer not null default 0,
 claim_token uuid,
 lease_until timestamptz,
 retry_after timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 applied_at timestamptz,
 check(feature_tier is null or (source_revision is not null and source_revision>=0 and source_suspended is not null))
);
create unique index subscription_change_one_open on public.subscription_changes(account_id) where status in ('scheduled','processing','failed');
create index subscription_changes_due on public.subscription_changes(effective_on) where status in ('scheduled','processing');
alter table public.subscription_changes enable row level security;
revoke all on public.subscription_changes from public,anon,authenticated;
grant select on public.subscription_changes to authenticated;
grant all on public.subscription_changes to service_role;
create policy "admins read subscription changes" on public.subscription_changes for select to authenticated using(public.is_admin());

create function public.protect_subscription_terms() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.plan_id is distinct from old.plan_id or new.price_override_cents is distinct from old.price_override_cents) and auth.role() is distinct from 'service_role' then
  raise exception 'Schedule plan changes for renewal' using errcode='42501';
 end if;
 if new.billing_day is distinct from old.billing_day and exists(select 1 from public.subscription_changes where account_id=old.id and status in ('scheduled','processing','failed')) then
  raise exception 'Cancel the scheduled change before changing the billing day' using errcode='22023';
 end if;
 return new;
end;$$;
revoke all on function public.protect_subscription_terms() from public,anon,authenticated;
create trigger protect_subscription_terms before update of plan_id,price_override_cents,billing_day on public.accounts for each row execute function public.protect_subscription_terms();

create function public.schedule_subscription_change(p_account uuid,p_plan uuid,p_override integer,p_expected_current integer,p_expected_new integer,p_expected_day integer,p_today date,p_operation uuid,p_source_revision bigint,p_source_suspended boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.accounts; p public.plans; prior public.subscription_changes; old_price integer; new_price integer; start_on date; end_on date; days integer; used integer; old_used integer; old_remaining integer; new_remaining integer; actor_email text; product text; snapshot jsonb;
begin
 if not public.is_admin() then raise insufficient_privilege; end if;
 select email into actor_email from public.admins where user_id=auth.uid();
 select * into a from public.accounts where id=p_account for update;
 if not found or a.status='cancelled' then raise exception 'Account unavailable' using errcode='22023';end if;
 select * into prior from public.subscription_changes where id=p_operation;
 if found then
  if prior.account_id<>p_account or prior.target_plan_id<>p_plan or prior.target_override is distinct from p_override or prior.actor<>actor_email then raise exception 'Operation already used' using errcode='22023';end if;
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
 old_used:=round(old_price::numeric*used/days)::int;old_remaining:=old_price-old_used;new_remaining:=round(new_price::numeric*(days-used)/days)::int;
 snapshot:=jsonb_build_object('cycle_start',start_on,'effective_on',end_on,'total_days',days,'used_days',used,'remaining_days',days-used,'old_used_cents',old_used,'old_remaining_cents',old_remaining,'new_remaining_cents',new_remaining,'difference_cents',new_remaining-old_remaining);
 insert into public.subscription_changes(id,account_id,from_plan_id,from_override,target_plan_id,target_name,old_price_cents,new_price_cents,target_override,billing_day,feature_tier,source_revision,source_suspended,actor,requested_on,effective_on,quote)
 values(p_operation,a.id,a.plan_id,a.price_override_cents,p.id,p.name,old_price,new_price,p_override,a.billing_day,case when product='lessonara' then p.feature_tier else null end,case when product='lessonara' then p_source_revision else null end,case when product='lessonara' then p_source_suspended else null end,actor_email,p_today,end_on,snapshot);
 insert into public.audit_log(actor,action,platform_id,entity,entity_id,data) values(actor_email,'subscription.schedule',a.platform_id,'account',a.id::text,jsonb_build_object('operation',p_operation,'from_plan',a.plan_id,'target_plan',p.id,'old_price_cents',old_price,'new_price_cents',new_price,'quote',snapshot,'refund','manual_only'));
 return p_operation;
end;$$;
revoke all on function public.schedule_subscription_change(uuid,uuid,integer,integer,integer,integer,date,uuid,bigint,boolean) from public,anon;
grant execute on function public.schedule_subscription_change(uuid,uuid,integer,integer,integer,integer,date,uuid,bigint,boolean) to authenticated;

create function public.cancel_subscription_change(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.subscription_changes; actor_email text; platform uuid;
begin
 if not public.is_admin() then raise insufficient_privilege;end if;
 select * into c from public.subscription_changes where id=p_id for update;
 if not found or c.status not in ('scheduled','failed') then raise exception 'Change cannot be cancelled now' using errcode='40001';end if;
 select email into actor_email from public.admins where user_id=auth.uid();select platform_id into platform from public.accounts where id=c.account_id;
 update public.subscription_changes set status='cancelled',claim_token=null,lease_until=null where id=p_id;
 insert into public.audit_log(actor,action,platform_id,entity,entity_id,data) values(actor_email,'subscription.cancel',platform,'account',c.account_id::text,jsonb_build_object('operation',c.id));
end;$$;
revoke all on function public.cancel_subscription_change(uuid) from public,anon;
grant execute on function public.cancel_subscription_change(uuid) to authenticated;

create function public.claim_subscription_changes() returns setof public.subscription_changes language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege;end if;
 update public.subscription_changes set status='failed',last_error='Execução interrompida após cinco tentativas. Revise e tente novamente.',lease_until=null where status='processing' and lease_until<now() and attempts>=5;
 return query with due as (
  select id from public.subscription_changes where effective_on<=(now() at time zone 'America/Sao_Paulo')::date and attempts<5
   and ((status='scheduled' and (retry_after is null or retry_after<=now())) or (status='processing' and lease_until<now()))
   order by effective_on,created_at for update skip locked limit 10
 ) update public.subscription_changes c set status='processing',attempts=c.attempts+1,claim_token=gen_random_uuid(),lease_until=now()+interval '5 minutes' from due where c.id=due.id returning c.*;
end;$$;
revoke all on function public.claim_subscription_changes() from public,anon,authenticated;
grant execute on function public.claim_subscription_changes() to service_role;

create function public.finish_subscription_change(p_id uuid,p_claim uuid,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
declare c public.subscription_changes; a public.accounts; p public.plans;
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege;end if;
 select * into c from public.subscription_changes where id=p_id for update;
 if not found or c.status='applied' or c.status<>'processing' or c.claim_token is distinct from p_claim then return;end if;
 if p_error is not null then
  update public.subscription_changes set status=case when attempts>=5 then 'failed' else 'scheduled' end,last_error=left(p_error,300),retry_after=now()+interval '1 hour',lease_until=null where id=p_id;return;
 end if;
 select * into a from public.accounts where id=c.account_id for update;
 if a.status='cancelled' or a.plan_id is distinct from c.from_plan_id or a.price_override_cents is distinct from c.from_override or a.billing_day<>c.billing_day then raise exception 'Account changed; review required' using errcode='40001';end if;
 select * into p from public.plans where id=c.target_plan_id;
 update public.accounts set plan_id=c.target_plan_id,price_override_cents=case when c.target_override is not null or p.price_cents<>c.new_price_cents then c.new_price_cents else null end where id=a.id;
 update public.subscription_changes set status='applied',applied_at=now(),lease_until=null,last_error=null where id=p_id;
 insert into public.audit_log(actor,action,platform_id,entity,entity_id,data) values(c.actor,'subscription.apply',a.platform_id,'account',a.id::text,jsonb_build_object('operation',c.id,'plan',c.target_plan_id,'price_cents',c.new_price_cents,'effective_on',c.effective_on));
end;$$;
revoke all on function public.finish_subscription_change(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_subscription_change(uuid,uuid,text) to service_role;
create function public.retry_subscription_change(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.subscription_changes; actor_email text; platform uuid;
begin
 if not public.is_admin() then raise insufficient_privilege;end if;
 select * into c from public.subscription_changes where id=p_id for update;
 if not found or c.status not in ('scheduled','failed') or c.effective_on>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Change is not available for retry' using errcode='40001';end if;
 select email into actor_email from public.admins where user_id=auth.uid();select platform_id into platform from public.accounts where id=c.account_id;
 update public.subscription_changes set status='scheduled',attempts=0,retry_after=null,last_error=null,claim_token=null,lease_until=null where id=p_id;
 insert into public.audit_log(actor,action,platform_id,entity,entity_id,data) values(actor_email,'subscription.retry',platform,'account',c.account_id::text,jsonb_build_object('operation',c.id));
end;$$;
revoke all on function public.retry_subscription_change(uuid) from public,anon;
grant execute on function public.retry_subscription_change(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
