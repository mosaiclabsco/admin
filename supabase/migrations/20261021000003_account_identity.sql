begin;
-- The source identity is stable even when contact details or billing change.
alter table public.accounts add constraint accounts_external_id_not_blank
  check (length(btrim(external_id)) > 0 and external_id = btrim(external_id));

create function public.protect_account_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.platform_id is distinct from old.platform_id or new.external_id is distinct from old.external_id then
    raise exception 'Account source identity cannot be changed' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_account_identity() from public, anon, authenticated;
create trigger protect_account_identity before update of platform_id, external_id on public.accounts
  for each row execute function public.protect_account_identity();
commit;
