import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/platforms";
import { relative } from "@/lib/format";
import { Empty, Notice, PageHead, PlatformTag, TicketStatus } from "@/components/ui";

const FILTERS = [["active", "Em andamento"], ["open", "Abertos"], ["waiting", "Aguardando cliente"], ["closed", "Fechados"], ["all", "Todos"]] as const;

export default async function Support({ params, searchParams }: PageProps<"/[platform]/support">) {
  const [{ platform: slug }, query] = await Promise.all([params, searchParams]);
  const filter = typeof query.f === "string" ? query.f : "active";
  const { supabase } = await requireAdmin();
  const { platform, platforms } = await resolveScope(slug);
  let q = supabase.from("support_tickets").select("id,subject,from_email,from_name,status,last_message_at,platform_id,account:accounts(id,name)").order("last_message_at", { ascending: false }).limit(200);
  if (platform) q = q.eq("platform_id", platform.id);
  if (filter === "active") q = q.neq("status", "closed");
  else if (filter !== "all") q = q.eq("status", filter);
  const { data, error } = await q;
  if (error) throw new Error("Não foi possível carregar o suporte.");
  const tickets = data as unknown as { id: string; subject: string; from_email: string; from_name: string | null; status: string; last_message_at: string; platform_id: string | null; account: { id: string; name: string } | null }[];
  const byId = new Map(platforms.map((p) => [p.id, p]));
  const inbound = platform?.support_email ?? platforms.map((p) => p.support_email).filter(Boolean).join(", ");

  return (
    <>
      <PageHead eyebrow={platform?.name ?? "Todas as plataformas"} title="Suporte" description={inbound ? <>Emails recebidos em <span className="font-mono text-xs">{inbound}</span></> : undefined} />
      {!process.env.RESEND_WEBHOOK_SECRET && <Notice tone="warn">Recebimento de emails desligado: configure o webhook <code>email.received</code> do Resend e <code>RESEND_WEBHOOK_SECRET</code> (ver README).</Notice>}
      <div className="switcher mb-3 w-fit">
        {FILTERS.map(([value, label]) => <Link key={value} href={`/${slug}/support${value === "active" ? "" : `?f=${value}`}`} aria-current={filter === value}>{label}</Link>)}
      </div>
      <section className="card table-wrap">
        {tickets.length ? (
          <table className="table">
            <thead><tr><th>Assunto</th><th>De</th>{!platform && <th>Plataforma</th>}<th>Status</th><th className="text-right">Última mensagem</th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td className="max-w-0 w-1/2"><Link href={`/${slug}/support/${t.id}`} className={`block truncate hover:underline ${t.status === "open" ? "font-semibold" : ""}`}>{t.subject}</Link></td>
                  <td>{t.account ? <Link href={`/${slug}/accounts/${t.account.id}`} className="hover:underline">{t.account.name}</Link> : (t.from_name ?? t.from_email)}<div className="text-xs text-muted">{t.from_email}</div></td>
                  {!platform && <td><PlatformTag platform={t.platform_id ? byId.get(t.platform_id) : null} /></td>}
                  <td><TicketStatus status={t.status} /></td>
                  <td className="text-right text-xs text-muted">{relative(t.last_message_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>Nenhum ticket aqui.</Empty>}
      </section>
    </>
  );
}
