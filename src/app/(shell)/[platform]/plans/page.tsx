import { requireAdmin } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/platforms";
import { listAccounts, listPlans } from "@/lib/queries";
import { money } from "@/lib/format";
import { Empty, PageHead, PlatformTag } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { savePlan } from "../../actions";

export default async function Plans({ params }: PageProps<"/[platform]/plans">) {
  const { platform: slug } = await params;
  const { supabase } = await requireAdmin();
  const { platform, platforms } = await resolveScope(slug);
  const [plans, accounts] = await Promise.all([listPlans(supabase, platform?.id), listAccounts(supabase, platform?.id)]);
  const byId = new Map(platforms.map((p) => [p.id, p]));
  const usage = (planId: string) => accounts.filter((a) => a.plan_id === planId && a.status !== "cancelled").length;

  return (
    <>
      <PageHead eyebrow={platform?.name ?? "Todas as plataformas"} title="Planos" description="O ID do plano é o código que você usa para identificá-lo (em cobranças, contratos, integrações)." />
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
                    <details className="inline-form">
                      <summary><span className="btn-xs">Editar</span></summary>
                      <Form action={savePlan} className="flex flex-wrap items-end justify-end gap-2">
                        <input type="hidden" name="id" value={p.id} />
                        <label className="text-xs text-muted">ID<input className="input mt-1 w-32 py-1 font-mono" name="code" defaultValue={p.code} /></label>
                        <label className="text-xs text-muted">Nome<input className="input mt-1 w-32 py-1" name="name" defaultValue={p.name} /></label>
                        <label className="text-xs text-muted">Preço<input className="input mt-1 w-24 py-1" name="price" defaultValue={(p.price_cents / 100).toFixed(2).replace(".", ",")} /></label>
                        <label className="text-xs text-muted">Status<select className="input mt-1 w-24 py-1" name="active" defaultValue={p.active ? "on" : "off"}><option value="on">Ativo</option><option value="off">Inativo</option></select></label>
                        <input type="hidden" name="notes" value={p.notes ?? ""} />
                        <SubmitButton className="btn py-1.5">Salvar</SubmitButton>
                      </Form>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>Nenhum plano cadastrado.</Empty>}
      </section>

      <section className="card card-pad mt-4">
        <h2 className="h2 mb-3">Novo plano</h2>
        <Form action={savePlan} resetOnSuccess className="grid gap-3 sm:grid-cols-6 sm:items-end">
          <div>
            <label className="label">Plataforma</label>
            <select className="input" name="platform_id" defaultValue={platform?.id} required>{platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </div>
          <div><label className="label">ID do plano</label><input className="input font-mono uppercase" name="code" placeholder="LSN-PRO" required /></div>
          <div><label className="label">Nome</label><input className="input" name="name" placeholder="Pro" /></div>
          <div><label className="label">Preço/mês (R$)</label><input className="input" name="price" placeholder="89,90" required /></div>
          <div><label className="label">Observação</label><input className="input" name="notes" /></div>
          <SubmitButton>Criar plano</SubmitButton>
        </Form>
      </section>
    </>
  );
}
