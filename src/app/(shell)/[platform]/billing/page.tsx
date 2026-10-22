import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/platforms";
import { chargesForPeriod, listAccounts } from "@/lib/queries";
import { buildCharges, isOverdue, summarize, toPeriod, todaySP } from "@/lib/billing";
import { date, money, monthLabel } from "@/lib/format";
import { ChargeStatus, Empty, MonthNav, Notice, PageHead, PlatformTag, Stat } from "@/components/ui";
import { ChargeActions, methodLabel } from "@/components/charge-actions";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { generateCharges } from "../../actions";

const FILTERS = [["", "Todas"], ["open", "Em aberto"], ["overdue", "Atrasadas"], ["paid", "Pagas"], ["waived", "Isentas"]] as const;

export default async function Billing({ params, searchParams }: PageProps<"/[platform]/billing">) {
  const [{ platform: slug }, query] = await Promise.all([params, searchParams]);
  const period = toPeriod(typeof query.m === "string" ? query.m : null);
  const filter = typeof query.f === "string" ? query.f : "";
  const { supabase } = await requireAdmin();
  const { platform, platforms } = await resolveScope(slug);
  const today = todaySP();
  const [charges, accounts] = await Promise.all([chargesForPeriod(supabase, period, platform?.id), listAccounts(supabase, platform?.id)]);
  const byId = new Map(platforms.map((p) => [p.id, p]));
  const sum = summarize(charges, today);
  const billed = new Set(charges.map((c) => c.account.id));
  const missing = buildCharges(accounts, period).filter((c) => !billed.has(c.account_id)).length;
  const rows = charges.filter((c) =>
    !filter ? true
    : filter === "open" ? c.status === "pending" && !isOverdue(c, today)
    : filter === "overdue" ? isOverdue(c, today)
    : c.status === filter);
  const base = `/${slug}/billing`;

  return (
    <>
      <PageHead eyebrow={platform?.name ?? "Todas as plataformas"} title="Cobranças" description="Mensalidades por conta. Confirme o pagamento para dar baixa.">
        <MonthNav base={base} period={period} />
        <Form action={generateCharges} className="flex flex-col items-end gap-1">
          <input type="hidden" name="period" value={period} />
          {platform && <input type="hidden" name="platform_id" value={platform.id} />}
          <SubmitButton pendingLabel="Gerando…" disabled={!missing} title={missing ? undefined : "Todas as contas ativas já têm cobrança neste mês"}>Gerar cobranças{missing ? ` (${missing})` : ""}</SubmitButton>
        </Form>
      </PageHead>

      <div className="stats">
        <Stat label="Previsto" value={money(sum.expected)} hint={`${charges.length} cobranças`} />
        <Stat label="Recebido" value={money(sum.received)} hint={sum.expected ? `${Math.round((sum.received / sum.expected) * 100)}% do previsto` : undefined} tone="ok" />
        <Stat label="Em aberto" value={money(sum.open)} />
        <Stat label="Atrasado" value={money(sum.overdue)} hint={`${sum.overdueCount} cobranças`} tone={sum.overdueCount ? "bad" : undefined} />
      </div>

      {missing > 0 && (
        <Notice tone="warn"><strong>{missing} {missing === 1 ? "conta ativa ainda não tem" : "contas ativas ainda não têm"}</strong> cobrança de {monthLabel(period).toLowerCase()}. Use “Gerar cobranças”.</Notice>
      )}

      <div className="switcher mb-3 w-fit">
        {FILTERS.map(([value, label]) => <Link key={value} href={`${base}?m=${period.slice(0, 7)}${value ? `&f=${value}` : ""}`} aria-current={filter === value}>{label}</Link>)}
      </div>

      <section className="card table-wrap">
        {rows.length ? (
          <table className="table">
            <thead><tr><th>Conta</th>{!platform && <th>Plataforma</th>}<th>Vencimento</th><th className="text-right">Valor</th><th>Status</th><th>Pagamento</th><th className="w-0" /></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/${slug}/accounts/${c.account.id}`} className="font-medium hover:underline">{c.account.name}</Link><div className="text-xs text-muted">{c.account.email}</div></td>
                  {!platform && <td><PlatformTag platform={byId.get(c.account.platform_id)} /></td>}
                  <td className="text-muted">{date(c.due_on)}</td>
                  <td className="tabular text-right">{money(c.amount_cents)}</td>
                  <td><ChargeStatus status={c.status} overdue={isOverdue(c, today)} /></td>
                  <td className="text-xs text-muted">{c.status === "paid" ? <>{date(c.paid_at)} · {methodLabel(c.method)}{c.paid_amount_cents !== c.amount_cents && <> · {money(c.paid_amount_cents)}</>}<div>por {c.settled_by}</div></> : "—"}</td>
                  <td className="whitespace-nowrap text-right"><ChargeActions charge={c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>{charges.length ? "Nada com esse filtro." : "Nenhuma cobrança neste mês."}</Empty>}
      </section>
    </>
  );
}
