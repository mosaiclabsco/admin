import Link from "next/link";
import { InviteTeacher } from "@/components/invite-teacher";
import { requireAdmin } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/platforms";
import { chargesForPeriod, listAccounts, listPlans } from "@/lib/queries";
import { isOverdue, monthlyPrice, toPeriod, todaySP } from "@/lib/billing";
import { money, relative } from "@/lib/format";
import { connectorFor } from "@/lib/connectors";
import { AccountStatus, ChargeStatus, Empty, Notice, PageHead, PlatformTag } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Icon } from "@/components/icon";
import { createAccount, syncPlatformAccounts } from "../../actions";

const FILTERS = [["", "Todas"], ["active", "Ativas"], ["trial", "Teste"], ["suspended", "Suspensas"], ["cancelled", "Canceladas"]] as const;

export default async function Accounts({ params, searchParams }: PageProps<"/[platform]/accounts">) {
  const [{ platform: slug }, query] = await Promise.all([params, searchParams]);
  const status = typeof query.status === "string" ? query.status : "";
  const search = typeof query.q === "string" ? query.q.trim().toLowerCase() : "";
  const { supabase } = await requireAdmin();
  const { platform, platforms } = await resolveScope(slug);
  const today = todaySP();
  const [accounts, charges, plans] = await Promise.all([
    listAccounts(supabase, platform?.id),
    chargesForPeriod(supabase, toPeriod(), platform?.id),
    listPlans(supabase, platform?.id),
  ]);
  const byId = new Map(platforms.map((p) => [p.id, p]));
  const chargeOf = new Map(charges.map((c) => [c.account.id, c]));
  const rows = accounts.filter((a) => (!status || a.status === status) && (!search || `${a.name} ${a.email ?? ""} ${a.external_id}`.toLowerCase().includes(search)));
  const connector = platform ? connectorFor(platform.slug) : null;
  const lastSync = accounts.reduce<string | null>((max, a) => (a.synced_at && (!max || a.synced_at > max) ? a.synced_at : max), null);

  return (
    <>
      <PageHead eyebrow={platform?.name ?? "Todas as plataformas"} title="Contas" description={`${accounts.length} contas${connector ? ` · última sincronização ${relative(lastSync)}` : ""}`}>
        {platform?.slug === "lessonara" && <InviteTeacher plans={plans.filter(p=>p.active && p.feature_tier).map(p=>({id:p.id,name:p.name}))}/>}
        {platform && connector && (
          <Form action={syncPlatformAccounts} className="flex flex-col items-end gap-1">
            <input type="hidden" name="platform_id" value={platform.id} />
            <SubmitButton className="btn-ghost" pendingLabel="Sincronizando…" disabled={!connector.configured()} title={connector.description}><Icon name="refresh" className="h-4 w-4" />Sincronizar do {platform.name}</SubmitButton>
          </Form>
        )}
      </PageHead>
      {platform && connector && !connector.configured() && (
        <Notice tone="warn">Conector do {platform.name} não configurado. Defina <code>LESSONARA_SUPABASE_URL</code> e <code>LESSONARA_SUPABASE_SECRET_KEY</code> para importar as contas automaticamente. Enquanto isso, dá para cadastrar à mão.</Notice>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="switcher">
          {FILTERS.map(([value, label]) => (
            <Link key={value} href={`/${slug}/accounts${value ? `?status=${value}` : ""}`} aria-current={status === value}>{label} <span className="text-xs text-muted">{value ? accounts.filter((a) => a.status === value).length : accounts.length}</span></Link>
          ))}
        </div>
        <form className="ml-auto">
          {status && <input type="hidden" name="status" value={status} />}
          <input className="input w-60" name="q" placeholder="Buscar nome, email ou ID…" defaultValue={search} />
        </form>
      </div>

      <section className="card table-wrap">
        {rows.length ? (
          <table className="table">
            <thead><tr><th>Conta</th>{!platform && <th>Plataforma</th>}<th>Status</th><th>Plano</th><th className="text-right">Mensal</th><th className="text-right">Venc.</th><th>Mês atual</th>{platform?.slug === "lessonara" && <th className="text-right">Alunos</th>}</tr></thead>
            <tbody>
              {rows.map((a) => {
                const charge = chargeOf.get(a.id);
                const price = monthlyPrice(a);
                return (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/${slug}/accounts/${a.id}`} className="font-medium hover:underline">{a.name || "(sem nome)"}</Link>
                      <div className="text-xs text-muted">{a.email ?? a.external_id}{a.source_missing && <span className="badge badge-warn ml-2">removida na origem</span>}</div>
                    </td>
                    {!platform && <td><PlatformTag platform={byId.get(a.platform_id)} /></td>}
                    <td><AccountStatus status={a.status} /></td>
                    <td>{a.plan ? <><span className="font-mono text-xs">{a.plan.code}</span><div className="text-xs text-muted">{a.plan.name}</div></> : <span className="text-xs text-muted">sem plano</span>}</td>
                    <td className="tabular text-right">{price != null ? money(price) : "—"}{a.price_override_cents != null && <div className="text-[11px] text-muted">personalizado</div>}</td>
                    <td className="tabular text-right text-muted">dia {a.billing_day}</td>
                    <td>{charge ? <ChargeStatus status={charge.status} overdue={isOverdue(charge, today)} /> : <span className="text-xs text-muted">—</span>}</td>
                    {platform?.slug === "lessonara" && <td className="tabular text-right">{a.metrics.active_students ?? 0}<span className="text-muted">/{a.metrics.students ?? 0}</span></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <Empty>Nenhuma conta {status || search ? "com esse filtro" : "ainda"}.</Empty>}
      </section>

      <details className="card card-pad mt-4">
        <summary className="h2">Cadastrar conta manualmente</summary>
        <Form action={createAccount} resetOnSuccess className="mt-4 grid gap-3 sm:grid-cols-5 sm:items-end">
          <div>
            <label className="label">Plataforma</label>
            <select className="input" name="platform_id" defaultValue={platform?.id} required>
              {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label className="label">Nome</label><input className="input" name="name" required /></div>
          <div><label className="label">Email</label><input className="input" name="email" type="email" /></div>
          <div>
            <label className="label">Plano</label>
            <select className="input" name="plan_id" defaultValue="">
              <option value="">Sem plano</option>
              {plans.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{!platform ? `${byId.get(p.platform_id)?.name} · ` : ""}{p.code} — {money(p.price_cents)}</option>)}
            </select>
          </div>
          <SubmitButton>Criar conta</SubmitButton>
        </Form>
      </details>
    </>
  );
}
