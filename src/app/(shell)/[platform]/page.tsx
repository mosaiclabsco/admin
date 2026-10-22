import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/platforms";
import { chargesForPeriod, healthStatus, listAccounts, overdueCharges } from "@/lib/queries";
import { monthlyPrice, summarize, toPeriod, todaySP } from "@/lib/billing";
import { date, money, monthLabel, relative } from "@/lib/format";
import { uptime } from "@/lib/health";
import { ChargeStatus, Empty, PageHead, PlatformTag, Stat, TicketStatus } from "@/components/ui";

export default async function Overview({ params }: PageProps<"/[platform]">) {
  const { platform: slug } = await params;
  const { supabase } = await requireAdmin();
  const { platform, platforms } = await resolveScope(slug);
  const pid = platform?.id;
  const today = todaySP();
  const period = toPeriod();
  const byId = new Map(platforms.map((p) => [p.id, p]));

  let tickets = supabase.from("support_tickets").select("id,subject,from_email,status,last_message_at,platform_id").neq("status", "closed").order("last_message_at", { ascending: false }).limit(6);
  if (pid) tickets = tickets.eq("platform_id", pid);
  const [accounts, charges, overdue, ticketRows, health] = await Promise.all([
    listAccounts(supabase, pid),
    chargesForPeriod(supabase, period, pid),
    overdueCharges(supabase, today, pid, 8),
    tickets,
    healthStatus(supabase, pid),
  ]);
  const active = accounts.filter((a) => a.status === "active");
  const mrr = active.reduce((sum, a) => sum + (monthlyPrice(a) ?? 0), 0);
  const month = summarize(charges, today);
  const down = health.filter((t) => t.active && t.checks[0] && !t.checks[0].ok);

  return (
    <>
      <PageHead eyebrow={platform ? platform.name : "Todas as plataformas"} title="Visão geral" description={monthLabel(period)} />
      <div className="stats">
        <Stat label="MRR" value={money(mrr)} hint={`${active.length} contas ativas · ${accounts.filter((a) => a.status === "trial").length} em teste`} />
        <Stat label="Recebido no mês" value={money(month.received)} hint={`de ${money(month.expected)} previsto`} tone="ok" />
        <Stat label="Em aberto" value={money(month.open)} hint="dentro do vencimento" />
        <Stat label="Atrasado" value={money(overdue.reduce((s, c) => s + c.amount_cents, 0))} hint={`${overdue.length} cobranças (todos os meses)`} tone={overdue.length ? "bad" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="h2">Pagamentos atrasados</h2>
            <Link href={`/${slug}/billing`} className="link text-xs">Cobranças →</Link>
          </div>
          {overdue.length ? (
            <table className="table"><tbody>
              {overdue.map((c) => (
                <tr key={c.id}>
                  <td><Link className="font-medium hover:underline" href={`/${slug}/accounts/${c.account.id}`}>{c.account.name}</Link>{!platform && <div className="mt-0.5"><PlatformTag platform={byId.get(c.account.platform_id)} /></div>}</td>
                  <td className="text-muted">venceu {date(c.due_on)}</td>
                  <td className="tabular text-right">{money(c.amount_cents)}</td>
                  <td className="text-right"><ChargeStatus status={c.status} overdue /></td>
                </tr>
              ))}
            </tbody></table>
          ) : <Empty>Nenhum pagamento atrasado. 🎉</Empty>}
        </section>

        <section className="card">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="h2">Suporte em andamento</h2>
            <Link href={`/${slug}/support`} className="link text-xs">Suporte →</Link>
          </div>
          {ticketRows.data?.length ? (
            <table className="table"><tbody>
              {ticketRows.data.map((t) => (
                <tr key={t.id}>
                  <td className="max-w-0 w-full"><Link className="block truncate font-medium hover:underline" href={`/${slug}/support/${t.id}`}>{t.subject}</Link><span className="text-xs text-muted">{t.from_email}</span></td>
                  <td className="whitespace-nowrap text-xs text-muted">{relative(t.last_message_at)}</td>
                  <td className="text-right"><TicketStatus status={t.status} /></td>
                </tr>
              ))}
            </tbody></table>
          ) : <Empty>Caixa de suporte vazia.</Empty>}
        </section>

        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="h2">Saúde {down.length > 0 && <span className="badge badge-bad ml-2">{down.length} fora do ar</span>}</h2>
            <Link href={`/${slug}/health`} className="link text-xs">Saúde →</Link>
          </div>
          {health.length ? (
            <table className="table"><tbody>
              {health.filter((t) => t.active).map((t) => {
                const last = t.checks[0];
                return (
                  <tr key={t.id}>
                    <td><span className="font-medium">{t.name}</span>{!platform && <div className="mt-0.5"><PlatformTag platform={t.platform_id ? byId.get(t.platform_id) : null} /></div>}</td>
                    <td>{!last ? <span className="badge badge-muted">Sem dados</span> : last.ok ? <span className="badge badge-ok">No ar</span> : <span className="badge badge-bad">Falha</span>}</td>
                    <td className="tabular text-muted">{last?.latency_ms != null ? `${last.latency_ms} ms` : "—"}</td>
                    <td className="tabular text-muted">{uptime(t.checks) != null ? `${uptime(t.checks)}% (24h)` : "—"}</td>
                    <td className="text-right text-xs text-muted">{relative(last?.checked_at)}</td>
                  </tr>
                );
              })}
            </tbody></table>
          ) : <Empty>Nenhum alvo de health check.</Empty>}
        </section>
      </div>
    </>
  );
}
