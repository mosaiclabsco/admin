import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/platforms";
import { dateTime } from "@/lib/format";
import { emailConfigured } from "@/lib/email";
import { PageHead, PlatformTag, TicketStatus } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { replyTicket, setTicket } from "../../../actions";

const STYLE: Record<string, string> = {
  inbound: "border-line bg-surface",
  outbound: "border-accent/30 bg-accent/5 ml-8",
  note: "border-warn/30 bg-warn/5 border-dashed",
};

export default async function Ticket({ params }: PageProps<"/[platform]/support/[id]">) {
  const { platform: slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireAdmin();
  const { platforms } = await resolveScope(slug);
  const ticketRes = await supabase.from("support_tickets").select("id,subject,from_email,from_name,status,created_at,platform_id,account_id,account:accounts(id,name,status)").eq("id", id).maybeSingle();
  if (ticketRes.error) throw new Error("Não foi possível carregar o ticket.");
  if (!ticketRes.data) notFound();
  const ticket = ticketRes.data as unknown as { id: string; subject: string; from_email: string; from_name: string | null; status: string; created_at: string; platform_id: string | null; account_id: string | null; account: { id: string; name: string; status: string } | null };
  const [messages, candidates] = await Promise.all([
    supabase.from("support_messages").select("id,direction,author,body,created_at").eq("ticket_id", id).order("created_at"),
    supabase.from("accounts").select("id,name,email,platform_id").ilike("email", ticket.from_email).limit(5),
  ]);
  const platform = platforms.find((p) => p.id === ticket.platform_id);
  const canSend = emailConfigured();

  return (
    <>
      <Link href={`/${slug}/support`} className="link mb-3 inline-block text-xs">← Suporte</Link>
      <PageHead eyebrow={platform?.name ?? "Sem plataforma"} title={ticket.subject} description={<>{ticket.from_name ? `${ticket.from_name} · ` : ""}{ticket.from_email} · aberto {dateTime(ticket.created_at)}</>}>
        <TicketStatus status={ticket.status} />
      </PageHead>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {messages.data?.map((m) => (
            <article key={m.id} className={`rounded-xl border p-4 ${STYLE[m.direction]}`}>
              <header className="mb-2 flex justify-between gap-3 text-xs text-muted">
                <span>{m.direction === "note" ? "Nota interna" : m.direction === "outbound" ? "Resposta" : "Recebido"} · {m.author}</span>
                <span>{dateTime(m.created_at)}</span>
              </header>
              <div className="message">{m.body || <em className="text-muted">(sem conteúdo de texto)</em>}</div>
            </article>
          ))}
          <Form action={replyTicket} resetOnSuccess className="card card-pad space-y-3">
            <input type="hidden" name="id" value={ticket.id} />
            <textarea className="input min-h-32" name="body" placeholder={canSend ? `Responder para ${ticket.from_email}…` : "Nota interna…"} required />
            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton name="kind" value="reply" disabled={!canSend} pendingLabel="Enviando…">Enviar resposta</SubmitButton>
              <SubmitButton className="btn-ghost" name="kind" value="note">Salvar como nota</SubmitButton>
              {!canSend && <a className="link ml-auto text-xs" href={`mailto:${ticket.from_email}?subject=${encodeURIComponent(`Re: ${ticket.subject}`)}`}>Responder pelo meu email</a>}
            </div>
          </Form>
        </div>

        <aside className="space-y-4">
          <section className="card card-pad space-y-3">
            <h2 className="h2">Status</h2>
            <div className="flex flex-wrap gap-2">
              {(["open", "waiting", "closed"] as const).filter((s) => s !== ticket.status).map((s) => (
                <Form key={s} action={setTicket}>
                  <input type="hidden" name="id" value={ticket.id} />
                  <input type="hidden" name="status" value={s} />
                  <SubmitButton className="btn-ghost">{s === "closed" ? "Fechar" : s === "open" ? "Reabrir" : "Aguardando cliente"}</SubmitButton>
                </Form>
              ))}
            </div>
          </section>
          <section className="card card-pad space-y-3">
            <h2 className="h2">Vínculo</h2>
            <Form action={setTicket} className="space-y-3">
              <input type="hidden" name="id" value={ticket.id} />
              <div>
                <label className="label">Plataforma</label>
                <select className="input" name="platform_id" defaultValue={ticket.platform_id ?? ""}>
                  <option value="">—</option>
                  {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Conta</label>
                <select className="input" name="account_id" defaultValue={ticket.account_id ?? ""}>
                  <option value="">—</option>
                  {ticket.account && !candidates.data?.some((c) => c.id === ticket.account!.id) && <option value={ticket.account.id}>{ticket.account.name}</option>}
                  {candidates.data?.map((c) => <option key={c.id} value={c.id}>{c.name} ({platforms.find((p) => p.id === c.platform_id)?.name})</option>)}
                </select>
                <p className="mt-1 text-xs text-muted">Contas com o mesmo email do remetente.</p>
              </div>
              <SubmitButton className="btn-ghost">Salvar vínculo</SubmitButton>
            </Form>
            {ticket.account && <Link className="link text-sm" href={`/${slug}/accounts/${ticket.account.id}`}>Abrir conta {ticket.account.name} →</Link>}
            <PlatformTag platform={platform} />
          </section>
        </aside>
      </div>
    </>
  );
}
