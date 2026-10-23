import Link from "next/link";
import { todaySP } from "@/lib/billing";
import { requireAdmin } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/platforms";
import { healthStatus } from "@/lib/queries";
import { uptime } from "@/lib/health";
import { dateTime, relative } from "@/lib/format";
import { Empty, PageHead, PlatformTag } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Icon } from "@/components/icon";
import { checkNow, deleteTarget, saveTarget } from "../../actions";

export default async function Health({ params }: PageProps<"/[platform]/health">) {
  const { platform: slug } = await params;
  const { supabase } = await requireAdmin();
  const { platform, platforms } = await resolveScope(slug);
  const targets = await healthStatus(supabase, platform?.id);
  let changesQuery = supabase.from("subscription_changes").select("id,account_id,target_name,effective_on,status,attempts,last_error,account:accounts!inner(platform_id,name)").in("status", ["scheduled", "processing", "failed"]).order("effective_on").limit(50);
  if (platform) changesQuery = changesQuery.eq("account.platform_id", platform.id);
  const changes = await changesQuery;
  if (changes.error) throw new Error("Não foi possível carregar as trocas de plano pendentes.");
  const byId = new Map(platforms.map((p) => [p.id, p]));
  const failures = targets.flatMap((t) => t.checks.filter((c) => !c.ok).map((c) => ({ ...c, target: t }))).sort((a, b) => b.checked_at.localeCompare(a.checked_at)).slice(0, 30);

  return (
    <>
      <PageHead eyebrow={platform?.name ?? "Todas as plataformas"} title="Saúde" description="Verificação HTTP periódica (cron) ou sob demanda. Histórico das últimas 24h.">
        <Form action={checkNow} className="flex flex-col items-end gap-1">
          {platform && <input type="hidden" name="platform_id" value={platform.id} />}
          <SubmitButton className="btn" pendingLabel="Verificando…"><Icon name="refresh" className="h-4 w-4" />Verificar agora</SubmitButton>
        </Form>
      </PageHead>

      <section className="card table-wrap">
        {targets.length ? (
          <table className="table">
            <thead><tr><th>Alvo</th>{!platform && <th>Plataforma</th>}<th>Status</th><th className="text-right">Latência</th><th className="text-right">Uptime 24h</th><th>Últimas verificações</th><th className="text-right">Última</th><th className="w-0" /></tr></thead>
            <tbody>
              {targets.map((t) => {
                const last = t.checks[0];
                const up = uptime(t.checks);
                return (
                  <tr key={t.id} className={t.active ? "" : "opacity-50"}>
                    <td><span className="font-medium">{t.name}</span><div className="max-w-64 truncate font-mono text-[11px] text-muted">{t.url}</div></td>
                    {!platform && <td><PlatformTag platform={t.platform_id ? byId.get(t.platform_id) : null} /></td>}
                    <td>{!t.active ? <span className="badge badge-muted">Pausado</span> : !last ? <span className="badge badge-muted">Sem dados</span> : last.ok ? <span className="badge badge-ok">No ar</span> : <span className="badge badge-bad" title={last.error ?? ""}>Falha</span>}</td>
                    <td className="tabular text-right">{last?.latency_ms != null ? `${last.latency_ms} ms` : "—"}</td>
                    <td className="tabular text-right">{up != null ? `${up}%` : "—"}</td>
                    <td>
                      <div className="bars" aria-label="Últimas 30 verificações">
                        {t.checks.slice(0, 30).reverse().map((c, i) => (
                          <span key={i} title={`${dateTime(c.checked_at)} · ${c.ok ? `${c.latency_ms} ms` : c.error}`} style={{ height: c.ok ? `${Math.max(25, Math.min(100, (c.latency_ms ?? 0) / 15))}%` : "100%", background: c.ok ? "var(--ok)" : "var(--bad)" }} />
                        ))}
                      </div>
                    </td>
                    <td className="text-right text-xs text-muted">{relative(last?.checked_at)}</td>
                    <td className="text-right">
                      <details className="inline-form">
                        <summary><span className="btn-xs">Editar</span></summary>
                        <div className="flex flex-col items-end gap-2">
                          <Form action={saveTarget} className="flex flex-wrap items-end justify-end gap-2">
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="platform_id" value={t.platform_id ?? ""} />
                            <label className="text-xs text-muted">Nome<input className="input mt-1 w-32 py-1" name="name" defaultValue={t.name} /></label>
                            <label className="text-xs text-muted">URL<input className="input mt-1 w-64 py-1" name="url" defaultValue={t.url} /></label>
                            <label className="text-xs text-muted">Status esperado<input className="input mt-1 w-20 py-1" name="expect_status" defaultValue={t.expect_status} /></label>
                            <label className="text-xs text-muted">Ativo<select className="input mt-1 w-24 py-1" name="active" defaultValue={t.active ? "on" : "off"}><option value="on">Sim</option><option value="off">Pausado</option></select></label>
                            <SubmitButton className="btn py-1.5">Salvar</SubmitButton>
                          </Form>
                          <Form action={deleteTarget}><input type="hidden" name="id" value={t.id} /><SubmitButton className="text-xs text-bad">Remover alvo</SubmitButton></Form>
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <Empty>Nenhum alvo cadastrado.</Empty>}
      </section>

      <section className="card mt-4"><div className="px-6 pt-6 pb-3"><h2 className="h2">Trocas de plano</h2><p className="mt-2 text-xs text-muted">Aplicação diária na renovação. Falhas podem ser revisadas e reprocessadas no detalhe da conta.</p></div>{changes.data.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Conta</th><th>Plano</th><th>Vigência</th><th>Status</th><th>Tentativas</th><th>Pendência</th></tr></thead><tbody>{changes.data.map(c => { const account = c.account as unknown as { name: string };return <tr key={c.id}><td><Link className="link" href={`/${slug}/accounts/${c.account_id}`}>{account.name || "Ver conta"}</Link></td><td>{c.target_name}</td><td>{c.effective_on.split("-").reverse().join("/")}</td><td><span className={`badge ${c.last_error || c.status === "failed" ? "badge-bad" : c.effective_on < todaySP() ? "badge-warn" : "badge-info"}`}>{c.status === "failed" ? "Revisão necessária" : c.status === "processing" ? "Aplicando" : c.effective_on < todaySP() ? "Em atraso" : "Agendada"}</span></td><td>{c.attempts}/5</td><td className="text-xs text-muted">{c.last_error ?? "—"}</td></tr>;})}</tbody></table></div> : <Empty>Nenhuma troca aguardando aplicação.</Empty>}</section>

      <section className="card card-pad mt-4">
        <h2 className="h2 mb-3">Novo alvo</h2>
        <Form action={saveTarget} resetOnSuccess className="grid gap-3 sm:grid-cols-5 sm:items-end">
          <div>
            <label className="label">Plataforma</label>
            <select className="input" name="platform_id" defaultValue={platform?.id ?? ""}><option value="">Infra geral</option>{platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </div>
          <div><label className="label">Nome</label><input className="input" name="name" placeholder="API, Jitsi, Supabase…" /></div>
          <div className="sm:col-span-2"><label className="label">URL</label><input className="input" name="url" placeholder="https://…" required /></div>
          <div className="flex items-end gap-2"><div className="w-20"><label className="label">Status</label><input className="input" name="expect_status" defaultValue={200} /></div><SubmitButton>Adicionar</SubmitButton></div>
        </Form>
      </section>

      <section className="card mt-4">
        <h2 className="h2 px-4 pt-4 pb-2">Log de falhas (24h)</h2>
        {failures.length ? (
          <table className="table"><tbody>
            {failures.map((f, i) => <tr key={i}><td className="whitespace-nowrap text-xs text-muted">{dateTime(f.checked_at)}</td><td className="font-medium">{f.target.name}</td><td className="font-mono text-xs">{f.status_code ?? "—"}</td><td className="text-xs text-bad">{f.error}</td></tr>)}
          </tbody></table>
        ) : <Empty>Nenhuma falha nas últimas 24h.</Empty>}
      </section>
    </>
  );
}
