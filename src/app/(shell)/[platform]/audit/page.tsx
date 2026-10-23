import { AuditDetails } from "@/components/audit-details";
import { requireAdmin } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/platforms";
import { dateTime } from "@/lib/format";
import { Empty, PageHead, PlatformTag } from "@/components/ui";

export default async function Audit({ params }: PageProps<"/[platform]/audit">) {
  const { platform: slug } = await params;
  const { supabase } = await requireAdmin();
  const { platform, platforms } = await resolveScope(slug);
  let q = supabase.from("audit_log").select("id,actor,action,platform_id,entity,entity_id,data,created_at").order("created_at", { ascending: false }).limit(200);
  if (platform) q = q.eq("platform_id", platform.id);
  const { data, error } = await q;
  if (error) throw new Error("Não foi possível carregar a auditoria.");
  const byId = new Map(platforms.map((p) => [p.id, p]));

  return (
    <>
      <PageHead eyebrow={platform?.name ?? "Todas as plataformas"} title="Auditoria" description="Toda alteração feita pelo painel (baixas, planos, contas, suporte). Últimos 200 registros." />
      <section className="card table-wrap">
        {data.length ? (
          <table className="table">
            <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th>{!platform && <th>Plataforma</th>}<th>Detalhes</th></tr></thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-xs text-muted">{dateTime(row.created_at)}</td>
                  <td className="text-xs">{row.actor}</td>
                  <td className="font-mono text-xs">{row.action}</td>
                  {!platform && <td><PlatformTag platform={row.platform_id ? byId.get(row.platform_id) : null} /></td>}
                  <td><AuditDetails entry={row} platform={row.platform_id ? byId.get(row.platform_id)?.name ?? "—" : "Todas as plataformas"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>Nada registrado ainda.</Empty>}
      </section>
    </>
  );
}
