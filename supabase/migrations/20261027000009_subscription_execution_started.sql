begin;
-- A manual retry resets its attempt budget, never whether cross-database work has started.
alter table public.subscription_changes add column execution_started boolean not null default false;
create function public.preserve_subscription_execution_started() returns trigger
language plpgsql set search_path='' as $$
begin
 new.execution_started:=old.execution_started or old.attempts>0 or new.attempts>0;
 return new;
end;$$;
revoke all on function public.preserve_subscription_execution_started() from public,anon,authenticated;
create trigger preserve_subscription_execution_started before update of attempts on public.subscription_changes
for each row execute function public.preserve_subscription_execution_started();
create or replace function public.cancel_subscription_change(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.subscription_changes; actor_email text; platform uuid;
begin
 if not public.is_admin() then raise insufficient_privilege;end if;
 select * into c from public.subscription_changes where id=p_id for update;
 if not found or c.status not in ('scheduled','failed') or c.attempts>0 or c.execution_started then raise exception 'Change cannot be cancelled now' using errcode='40001';end if;
 select email into actor_email from public.admins where user_id=auth.uid();select platform_id into platform from public.accounts where id=c.account_id;
 update public.subscription_changes set status='cancelled',claim_token=null,lease_until=null where id=p_id;
 insert into public.audit_log(actor,action,platform_id,entity,entity_id,data) values(actor_email,'subscription.cancel',platform,'account',c.account_id::text,jsonb_build_object('operation',c.id));
end;$$;
revoke all on function public.cancel_subscription_change(uuid) from public,anon;
grant execute on function public.cancel_subscription_change(uuid) to authenticated;



notify pgrst,'reload schema';
commit;
