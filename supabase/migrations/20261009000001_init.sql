-- Portal admin Mosaic Labs: gestão de contas, cobranças, suporte e saúde das plataformas.
-- Toda leitura/escrita do painel passa por RLS com is_admin(); webhooks e cron usam a secret key.

-- Quem pode entrar no portal. Usuário do Auth sem linha aqui não recebe código nem acessa nada.
create table public.admins (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null unique check (email = lower(email)),
  created_at timestamptz not null default now()
);

create function public.is_admin() returns boolean
  language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

create table public.platforms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}$' and slug not in ('all', 'platforms', 'login', 'api')),
  name text not null,
  url text,
  color text not null default '#3e7163' check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- Endereço que recebe suporte desta plataforma (roteia emails recebidos para ela).
  support_email text check (support_email = lower(support_email)),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Planos de assinatura de cada plataforma. code = identificador escolhido pelo admin (ex.: LSN-PRO).
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.platforms on delete cascade,
  code text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$'),
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (platform_id, code)
);

-- Conta = cliente pagante de uma plataforma (no Lessonara, um professor).
-- external_id liga à linha na plataforma de origem; o resto do cadastro comercial vive aqui.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.platforms on delete cascade,
  external_id text not null,
  name text not null default '',
  email text,
  status text not null default 'active' check (status in ('trial', 'active', 'suspended', 'cancelled')),
  plan_id uuid references public.plans on delete set null,
  price_override_cents integer check (price_override_cents >= 0),
  billing_day smallint not null default 10 check (billing_day between 1 and 28),
  notes text,
  metrics jsonb not null default '{}',
  source_created_at timestamptz,
  source_missing boolean not null default false,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (platform_id, external_id)
);
create index on public.accounts (platform_id, status);
create index on public.accounts (lower(email));

-- Uma cobrança por conta por mês. Atraso é derivado (pending e due_on < hoje).
create table public.charges (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts on delete cascade,
  period date not null check (extract(day from period) = 1),
  amount_cents integer not null check (amount_cents >= 0),
  due_on date not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'waived')),
  paid_at timestamptz,
  paid_amount_cents integer check (paid_amount_cents >= 0),
  method text check (method in ('pix', 'transfer', 'card', 'cash', 'other')),
  reference text,
  notes text,
  settled_by text,
  created_at timestamptz not null default now(),
  unique (account_id, period),
  check ((status = 'paid') = (paid_at is not null))
);
create index on public.charges (period, status);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid references public.platforms on delete set null,
  account_id uuid references public.accounts on delete set null,
  from_email text not null,
  from_name text,
  subject text not null default '(sem assunto)',
  status text not null default 'open' check (status in ('open', 'waiting', 'closed')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.support_tickets (status, last_message_at desc);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound', 'note')),
  author text,
  body text not null default '',
  -- Message-ID do email: deduplica reentregas do webhook e encadeia respostas.
  message_id text unique,
  created_at timestamptz not null default now()
);
create index on public.support_messages (ticket_id, created_at);

create table public.health_targets (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid references public.platforms on delete cascade,
  name text not null,
  url text not null check (url ~ '^https?://'),
  expect_status integer not null default 200,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.health_checks (
  id bigint generated always as identity primary key,
  target_id uuid not null references public.health_targets on delete cascade,
  ok boolean not null,
  status_code integer,
  latency_ms integer,
  error text,
  checked_at timestamptz not null default now()
);
create index on public.health_checks (target_id, checked_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  platform_id uuid references public.platforms on delete set null,
  entity text,
  entity_id text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_log (created_at desc);

-- Limite de pedidos de código (somente service role).
create table public.auth_attempts (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);
create index on public.auth_attempts (key, created_at);

create function public.allow_auth_attempt(p_key text, p_limit integer, p_seconds integer) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare used integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_key));
  delete from public.auth_attempts where created_at < now() - interval '1 day';
  select count(*) into used from public.auth_attempts
    where key = p_key and created_at > now() - make_interval(secs => p_seconds);
  if used >= p_limit then return false; end if;
  insert into public.auth_attempts (key) values (p_key);
  return true;
end;
$$;
revoke execute on function public.allow_auth_attempt from public, anon, authenticated;

-- Permissões explícitas: anon não acessa nada; authenticated só passa se for admin (RLS).
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage on all sequences in schema public to authenticated, service_role;
revoke all on public.auth_attempts from authenticated;

do $$
declare t text;
begin
  foreach t in array array['admins','platforms','plans','accounts','charges','support_tickets','support_messages','health_targets','health_checks','audit_log','auth_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['platforms','plans','accounts','charges','support_tickets','support_messages','health_targets','health_checks'] loop
    execute format('create policy "admins manage" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

create policy "admins read" on public.admins for select to authenticated using (public.is_admin());
-- Auditoria é só de inserção pelo próprio admin; ninguém edita histórico pelo painel.
create policy "admins read audit" on public.audit_log for select to authenticated using (public.is_admin());
create policy "admins write audit" on public.audit_log for insert to authenticated with check (public.is_admin());

-- Plataforma inicial. URLs/emails reais ajustáveis em /platforms.
insert into public.platforms (slug, name, url, color, support_email)
values ('lessonara', 'Lessonara', 'https://lessonara.mosaic-labs.co', '#3e7163', 'lessonara@mosaic-labs.co');
insert into public.plans (platform_id, code, name, price_cents)
select id, 'LSN-ESSENCIAL', 'Essencial', 4900 from public.platforms where slug = 'lessonara';
insert into public.health_targets (platform_id, name, url)
select id, 'App (login)', 'https://lessonara.mosaic-labs.co/login' from public.platforms where slug = 'lessonara';
