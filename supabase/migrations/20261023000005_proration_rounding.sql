begin;
-- Keep used + remaining equal to the monthly fee, including half-cent boundaries.
create or replace function public.schedule_subscription_change(p_account uuid,p_plan uuid,p_override integer,p_expected_current integer,p_expected_new integer,p_expected_day integer,p_today date,p_operation uuid,p_source_revision bigint,p_source_suspended boolean) returns uuid
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
 old_used:=round(old_price::numeric*used/days)::int;old_remaining:=old_price-old_used;new_remaining:=new_price-round(new_price::numeric*used/days)::int;
 snapshot:=jsonb_build_object('cycle_start',start_on,'effective_on',end_on,'total_days',days,'used_days',used,'remaining_days',days-used,'old_used_cents',old_used,'old_remaining_cents',old_remaining,'new_remaining_cents',new_remaining,'difference_cents',new_remaining-old_remaining);
 insert into public.subscription_changes(id,account_id,from_plan_id,from_override,target_plan_id,target_name,old_price_cents,new_price_cents,target_override,billing_day,feature_tier,source_revision,source_suspended,actor,requested_on,effective_on,quote)
 values(p_operation,a.id,a.plan_id,a.price_override_cents,p.id,p.name,old_price,new_price,p_override,a.billing_day,case when product='lessonara' then p.feature_tier else null end,case when product='lessonara' then p_source_revision else null end,case when product='lessonara' then p_source_suspended else null end,actor_email,p_today,end_on,snapshot);
 insert into public.audit_log(actor,action,platform_id,entity,entity_id,data) values(actor_email,'subscription.schedule',a.platform_id,'account',a.id::text,jsonb_build_object('operation',p_operation,'from_plan',a.plan_id,'target_plan',p.id,'old_price_cents',old_price,'new_price_cents',new_price,'quote',snapshot,'refund','manual_only'));
 return p_operation;
end;$$;
revoke all on function public.schedule_subscription_change(uuid,uuid,integer,integer,integer,integer,date,uuid,bigint,boolean) from public,anon;
grant execute on function public.schedule_subscription_change(uuid,uuid,integer,integer,integer,integer,date,uuid,bigint,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
