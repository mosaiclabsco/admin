import type { SupabaseClient } from "@supabase/supabase-js";

export type InboundEmail = {
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  messageId: string;
  inReplyTo?: string | null;
  references?: string | null;
};

/** "Maria <maria@x.com>" → { email: "maria@x.com", name: "Maria" } */
export function parseAddress(raw: string) {
  const match = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (match ? match[2] : raw).trim().toLowerCase();
  const name = match?.[1]?.trim() || null;
  return { email, name };
}

/** Remove prefixos Re:/Fwd:/RES:/ENC: para encadear respostas pelo assunto. */
export function normalizeSubject(subject: string) {
  return subject.replace(/^\s*((re|res|fw|fwd|enc)\s*:\s*)+/i, "").trim().toLowerCase();
}

/** Texto legível a partir do HTML quando o email não traz parte text/plain. */
export function htmlToText(html: string) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Primeiro Message-ID citado em In-Reply-To/References. */
export function referencedIds(email: Pick<InboundEmail, "inReplyTo" | "references">) {
  return `${email.inReplyTo ?? ""} ${email.references ?? ""}`.match(/<[^>]+>/g) ?? [];
}

/**
 * Grava um email recebido: deduplica pelo Message-ID, encadeia em ticket aberto
 * (por In-Reply-To ou mesmo remetente + assunto) e roteia a plataforma pelo destinatário.
 */
export async function ingestInboundEmail(db: SupabaseClient, email: InboundEmail) {
  const dup = await db.from("support_messages").select("ticket_id").eq("message_id", email.messageId).maybeSingle();
  if (dup.error) throw dup.error;
  if (dup.data) return { ticketId: dup.data.ticket_id as string, duplicate: true };

  const sender = parseAddress(email.from);
  const recipients = email.to.map((to) => parseAddress(to).email);
  const body = (email.text?.trim() || (email.html ? htmlToText(email.html) : "")).slice(0, 50_000);

  let ticketId: string | null = null;
  const refs = referencedIds(email);
  if (refs.length) {
    const parent = await db.from("support_messages").select("ticket_id").in("message_id", refs).limit(1).maybeSingle();
    if (parent.error) throw parent.error;
    ticketId = (parent.data?.ticket_id as string) ?? null;
  }
  if (!ticketId) {
    const open = await db.from("support_tickets").select("id,subject").eq("from_email", sender.email).neq("status", "closed").order("last_message_at", { ascending: false }).limit(20);
    if (open.error) throw open.error;
    ticketId = open.data.find((t) => normalizeSubject(t.subject) === normalizeSubject(email.subject))?.id ?? null;
  }

  if (ticketId) {
    const updated = await db.from("support_tickets").update({ status: "open", last_message_at: new Date().toISOString() }).eq("id", ticketId);
    if (updated.error) throw updated.error;
  } else {
    const platform = recipients.length
      ? await db.from("platforms").select("id").in("support_email", recipients).limit(1).maybeSingle()
      : { data: null, error: null };
    if (platform.error) throw platform.error;
    let account = db.from("accounts").select("id,platform_id").ilike("email", sender.email).limit(1);
    if (platform.data) account = account.eq("platform_id", platform.data.id);
    const matched = await account.maybeSingle();
    if (matched.error) throw matched.error;
    const created = await db.from("support_tickets").insert({
      platform_id: platform.data?.id ?? matched.data?.platform_id ?? null,
      account_id: matched.data?.id ?? null,
      from_email: sender.email,
      from_name: sender.name,
      subject: email.subject.trim().slice(0, 300) || "(sem assunto)",
    }).select("id").single();
    if (created.error) throw created.error;
    ticketId = created.data.id as string;
  }

  const message = await db.from("support_messages").insert({ ticket_id: ticketId, direction: "inbound", author: sender.email, body, message_id: email.messageId });
  // Reentrega concorrente do mesmo webhook: a unique de message_id resolve.
  if (message.error && message.error.code !== "23505") throw message.error;
  return { ticketId, duplicate: false };
}
