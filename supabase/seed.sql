-- Dados de demonstração (apenas local: supabase db reset). Admin: pnpm admin:add <email>.
insert into public.platforms (slug, name, url, color, support_email)
values ('invoicy', 'Invoicy', 'https://invoicy.mosaic-labs.co', '#536b9c', 'invoicy@mosaic-labs.co');

insert into public.plans (platform_id, code, name, price_cents)
select id, 'LSN-PRO', 'Pro', 8900 from public.platforms where slug = 'lessonara'
union all select id, 'INV-START', 'Start', 2900 from public.platforms where slug = 'invoicy';

insert into public.accounts (platform_id, external_id, name, email, status, plan_id, billing_day, metrics, source_created_at, synced_at)
select p.id, a.ext, a.name, a.email, a.status, (select id from public.plans where platform_id = p.id and code = a.plan), a.day, a.metrics::jsonb, now() - interval '90 days', now()
from public.platforms p
join (values
  ('lessonara', 't-001', 'Mariana Souza', 'mariana@exemplo.com', 'active', 'LSN-ESSENCIAL', 5, '{"students": 12, "active_students": 10}'),
  ('lessonara', 't-002', 'Rafael Lima', 'rafael@exemplo.com', 'active', 'LSN-PRO', 10, '{"students": 31, "active_students": 27}'),
  ('lessonara', 't-003', 'Júlia Andrade', 'julia@exemplo.com', 'trial', null, 10, '{"students": 2, "active_students": 2}'),
  ('lessonara', 't-004', 'Pedro Alves', 'pedro@exemplo.com', 'suspended', 'LSN-ESSENCIAL', 15, '{"students": 6, "active_students": 0}'),
  ('invoicy', 'c-01', 'Studio Norte', 'financeiro@studionorte.com', 'active', 'INV-START', 20, '{}')
) as a(platform, ext, name, email, status, plan, day, metrics) on a.platform = p.slug;

-- Mês anterior pago, mês atual com uma em aberto e uma atrasada.
insert into public.charges (account_id, period, amount_cents, due_on, status, paid_at, paid_amount_cents, method, settled_by)
select a.id, date_trunc('month', now() - interval '1 month')::date, pl.price_cents,
       (date_trunc('month', now() - interval '1 month')::date + (a.billing_day - 1)), 'paid', now() - interval '25 days', pl.price_cents, 'pix', 'seed'
from public.accounts a join public.plans pl on pl.id = a.plan_id where a.status = 'active';
insert into public.charges (account_id, period, amount_cents, due_on)
select a.id, date_trunc('month', now())::date, pl.price_cents, (date_trunc('month', now())::date + (a.billing_day - 1))
from public.accounts a join public.plans pl on pl.id = a.plan_id where a.status = 'active';

with t as (
  insert into public.support_tickets (platform_id, account_id, from_email, from_name, subject, last_message_at)
  select platform_id, id, email, name, 'Não consigo enviar o lembrete de pagamento', now() - interval '3 hours'
  from public.accounts where external_id = 't-001'
  returning id
)
insert into public.support_messages (ticket_id, direction, author, body, message_id, created_at)
select id, 'inbound', 'mariana@exemplo.com', E'Oi! Desde ontem o botão de lembrete não envia nada para o aluno.\n\nPodem ver?', '<seed-1@exemplo.com>', now() - interval '3 hours' from t;

insert into public.health_targets (platform_id, name, url)
select id, 'Site', 'https://invoicy.mosaic-labs.co' from public.platforms where slug = 'invoicy';
