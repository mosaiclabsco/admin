import Link from "next/link";
import { SubscriptionPlanPanel } from "@/components/subscription-plan-panel";
import type { SubscriptionChange } from "@/lib/subscriptions";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/platforms";
import { listPlans, type AccountRow } from "@/lib/queries";
import { isOverdue, monthlyPrice, todaySP } from "@/lib/billing";
import { date, dateTime, money, monthLabel, relative } from "@/lib/format";
import { AccountStatus, ChargeStatus, Empty, PageHead, PlatformTag, TicketStatus } from "@/components/ui";
import { ChargeActions, methodLabel } from "@/components/charge-actions";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { TeacherAccessPanel } from "@/components/teacher-access-panel";
import { Icon } from "@/components/icon";
import { updateAccount } from "../../../actions";

const METRIC_LABELS: Record<string, string> = { students: "Alunos", active_students: "Alunos ativos" };

export default async function AccountDetail({ params }: PageProps<"/[platform]/accounts/[id]">) {
  const { platform: slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireAdmin();
  const { platforms } = await resolveScope(slug);
  const accountRes = await supabase.from("accounts").select("id,platform_id,external_id,name,email,status,billing_day,price_override_cents,metrics,source_missing,synced_at,source_created_at,notes,plan_id,plan:plans!accounts_plan_id_fkey(id,code,name,price_cents)").eq("id", id).maybeSingle();
  if (accountRes.error) throw new Error("Não foi possível carregar a conta.");
  if (!accountRes.data) notFound();
  const account = accountRes.data as unknown as AccountRow;
  const platform = platforms.find((p) => p.id === account.platform_id);
  const [plans, charges, tickets, history, scheduled] = await Promise.all([
    listPlans(supabase, account.platform_id),
    supabase.from("charges").select("id,period,amount_cents,due_on,status,paid_at,paid_amount_cents,method,reference,settled_by").eq("account_id", id).order("period", { ascending: false }).limit(24),
    supabase.from("support_tickets").select("id,subject,status,last_message_at").eq("account_id", id).order("last_message_at", { ascending: false }).limit(10),
    supabase.from("audit_log").select("id,actor,action,created_at").eq("entity_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("subscription_changes").select("id,account_id,target_plan_id,target_name,new_price_cents,effective_on,status,attempts,last_error,actor").eq("account_id", id).in("status", ["scheduled", "processing", "failed"]).maybeSingle(),
  ]);
  if (scheduled.error) throw new Error("Não foi possível carregar as trocas agendadas.");
  const today = todaySP();
  const price = monthlyPrice(account);
  const totalPaid = (charges.data ?? []).filter((c) => c.status === "paid").reduce((s, c) => s + (c.paid_amount_cents ?? 0), 0);

  return (
    <>
      <Link href={`/${slug}/accounts`} className="link mb-3 inline-block text-xs">← Contas</Link>
      <PageHead eyebrow={platform?.name} title={account.name || "(sem nome)"} description={<>{account.email ?? "sem email"} · <span className="font-mono text-xs">{account.external_id}</span></>}>
        <AccountStatus status={account.status} />
      </PageHead>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card card-pad lg:col-span-1">
          <h2 className="h2 mb-4">Assinatura comercial</h2>
          <p className="mb-5 text-xs text-muted">Mensalidade e situação da cobrança. O acesso ao produto é controlado no card “Acesso ao Lessonara”.</p>
          <SubscriptionPlanPanel account={account} plans={plans} pending={scheduled.data as SubscriptionChange | null} today={today} slug={slug} />
          <Form action={updateAccount} className="space-y-3">
            <input type="hidden" name="id" value={account.id} />
            <div>
              <label className="label" htmlFor="status">Status</label>
              <select className="input" id="status" name="status" defaultValue={account.status}>
                <option value="trial">Teste</option><option value="active">Ativa</option><option value="suspended">Suspensa</option><option value="cancelled">Cancelada</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="label" htmlFor="billing_day">Dia do vencimento</label>
                <input className="input" id="billing_day" name="billing_day" type="number" min={1} max={28} defaultValue={account.billing_day} readOnly={Boolean(scheduled.data)} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="notes">Notas internas</label>
              <textarea className="input min-h-20" id="notes" name="notes" defaultValue={account.notes ?? ""} />
            </div>
            <div className="flex justify-end pt-3"><SubmitButton><Icon name="save" className="h-4 w-4" />Salvar</SubmitButton></div>
          </Form>
          <dl className="mt-6 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Mensalidade</dt><dd className="tabular font-medium">{price != null ? money(price) : "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Total pago (24 meses)</dt><dd className="tabular">{money(totalPaid)}</dd></div>
            {Object.entries(account.metrics ?? {}).map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted">{METRIC_LABELS[k] ?? k}</dt><dd className="tabular">{String(v)}</dd></div>)}
            <div className="flex justify-between"><dt className="text-muted">Criada na origem</dt><dd>{date(account.source_created_at)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Sincronizada</dt><dd>{relative(account.synced_at)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Plataforma</dt><dd><PlatformTag platform={platform} /></dd></div>
          </dl>
        </section>

        <div className="space-y-4 lg:col-span-2">
          {platform?.slug === "lessonara" && <TeacherAccessPanel accountId={id} teacherId={account.external_id} />}
          <section className="card table-wrap">
            <h2 className="h2 px-4 pt-4 pb-2">Cobranças</h2>
            {charges.data?.length ? (
              <table className="table">
                <thead><tr><th>Mês</th><th>Vencimento</th><th className="text-right">Valor</th><th>Status</th><th>Pagamento</th><th /></tr></thead>
                <tbody>
                  {charges.data.map((c) => (
                    <tr key={c.id}>
                      <td>{monthLabel(c.period)}</td>
                      <td className="text-muted">{date(c.due_on)}</td>
                      <td className="tabular text-right">{money(c.amount_cents)}</td>
                      <td><ChargeStatus status={c.status} overdue={isOverdue(c, today)} /></td>
                      <td className="text-xs text-muted">{c.status === "paid" ? <>{date(c.paid_at)} · {methodLabel(c.method)}{c.paid_amount_cents !== c.amount_cents && <> · {money(c.paid_amount_cents)}</>}{c.reference && <div className="truncate">{c.reference}</div>}</> : "—"}</td>
                      <td className="text-right"><ChargeActions charge={c} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>Sem cobranças. Gere as do mês em Cobranças.</Empty>}
          </section>

          <section className="card">
            <h2 className="h2 px-4 pt-4 pb-2">Suporte</h2>
            {tickets.data?.length ? (
              <table className="table"><tbody>
                {tickets.data.map((t) => (
                  <tr key={t.id}><td><Link href={`/${slug}/support/${t.id}`} className="hover:underline">{t.subject}</Link></td><td className="text-xs text-muted">{relative(t.last_message_at)}</td><td className="text-right"><TicketStatus status={t.status} /></td></tr>
                ))}
              </tbody></table>
            ) : <Empty>Nenhum ticket desta conta.</Empty>}
          </section>

          <section className="card">
            <h2 className="h2 px-4 pt-4 pb-2">Histórico</h2>
            {history.data?.length ? (
              <ul className="divide-y divide-line text-sm">
                {history.data.map((h) => <li key={h.id} className="flex justify-between gap-4 px-4 py-2.5"><span><span className="font-mono text-xs">{h.action}</span> <span className="text-muted">por {h.actor}</span></span><span className="text-xs text-muted">{dateTime(h.created_at)}</span></li>)}
              </ul>
            ) : <Empty>Sem alterações registradas.</Empty>}
          </section>
        </div>
      </div>
    </>
  );
}
