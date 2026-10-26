begin;
-- A contact may subscribe to different products, but cannot duplicate an account
-- in the same product merely by changing email case or surrounding spaces.
create unique index accounts_platform_email_unique on public.accounts
  (platform_id, lower(btrim(email))) where email is not null and btrim(email) <> '';
notify pgrst, 'reload schema';
commit;
