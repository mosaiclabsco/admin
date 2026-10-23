import { requireAdmin } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/platforms";
import { listAccounts, listPlans } from "@/lib/queries";
import { money } from "@/lib/format";
import { Empty, PageHead, PlatformTag } from "@/components/ui";
import { PlanEditor } from "@/components/plan-editor";

export default async function Plans({ params }: PageProps<"/[platform]/plans">) {
  const { platform: slug } = await params;
  const { supabase } = await requireAdmin();
  const { platform, platforms } = await resolveScope(slug);
  const [plans, accounts] = await Promise.all([listPlans(supabase, platform?.id), listAccounts(supabase, platform?.id)]);
  const byId = new Map(platforms.map((p) => [p.id, p]));
  const usage = (planId: string) => accounts.filter((a) => a.plan_id === planId && a.status !== "cancelled").length;

  return (
    <>
      <PageHead eyebrow={platform?.name ?? "Todas as plataformas"} title="Planos" description="Planos comerciais, mensalidades e contas vinculadas."><PlanEditor platforms={platforms} defaultPlatform={platform?.id} /></PageHead>
      <section className="card table-wrap">
        {plans.length ? (
          <table className="table">
            <thead><tr><th>ID do plano</th><th>Nome</th>{!platform && <th>Plataforma</th>}<th className="text-right">Preço/mês</th><th className="text-right">Contas</th><th>Status</th><th className="w-0" /></tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.code}</td>
                  <td>{p.name}{p.notes && <div className="text-xs text-muted">{p.notes}</div>}</td>
                  {!platform && <td><PlatformTag platform={byId.get(p.platform_id)} /></td>}
                  <td className="tabular text-right">{money(p.price_cents)}</td>
                  <td className="tabular text-right">{usage(p.id)}</td>
                  <td>{p.active ? <span className="badge badge-ok">Ativo</span> : <span className="badge badge-muted">Inativo</span>}</td>
                  <td className="text-right">
                    <PlanEditor plan={p} platforms={platforms} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>Nenhum plano cadastrado.</Empty>}
      </section>

    </>
  );
}
