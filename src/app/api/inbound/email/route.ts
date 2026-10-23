import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";
import { ingestInboundEmail, parseAddress, type InboundEmail } from "@/lib/support";
import { verifyWebhook } from "@/lib/webhook";

type ReceivedEvent = { type: string; data: { email_id: string; from: string; to: string[]; subject?: string; message_id?: string } };

/**
 * Webhook "email.received" do Resend. O evento traz só metadados; o corpo vem da API
 * de recebimento. Assinatura verificada antes de qualquer acesso ao banco.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "not_configured" }, { status: 503 });
  const payload = await request.text();
  const h = request.headers;
  const signed = verifyWebhook(secret, {
    id: h.get("svix-id") ?? h.get("webhook-id") ?? "",
    timestamp: h.get("svix-timestamp") ?? h.get("webhook-timestamp") ?? "",
    signature: h.get("svix-signature") ?? h.get("webhook-signature") ?? "",
  }, payload);
  if (!signed) return Response.json({ error: "invalid_signature" }, { status: 401 });

  let event: ReceivedEvent;
  try { event = JSON.parse(payload) as ReceivedEvent; } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  if (!event || typeof event.type !== "string") return Response.json({ error: "invalid_event" }, { status: 400 });
  if (event.type !== "email.received") return Response.json({ ignored: event.type });
  const meta = event.data;
  if (!meta || typeof meta.email_id !== "string" || typeof meta.from !== "string" || !Array.isArray(meta.to) || !meta.to.every(to => typeof to === "string")) return Response.json({ error: "invalid_email" }, { status: 400 });
  const receivingDomain = process.env.SUPPORT_RECEIVING_DOMAIN;
  if (receivingDomain && !meta.to.some(to => parseAddress(to).email.endsWith(`@${receivingDomain}`))) return Response.json({ ignored: "recipient" });
  let email: InboundEmail = { from: meta.from, to: meta.to ?? [], subject: meta.subject ?? "", text: null, html: null, messageId: meta.message_id || `<${meta.email_id}@resend-inbound>` };
  const receivingKey = process.env.RESEND_RECEIVING_API_KEY || process.env.RESEND_API_KEY;
  if (receivingKey) {
    const full = await new Resend(receivingKey).emails.receiving.get(meta.email_id);
    // Sem o corpo, o Resend reenvia o webhook; melhor falhar que gravar ticket vazio.
    if (full.error || !full.data) return Response.json({ error: "fetch_failed" }, { status: 502 });
    const headers = Object.fromEntries(Object.entries(full.data.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    email = { ...email, text: full.data.text, html: full.data.html, inReplyTo: headers["in-reply-to"] ?? null, references: headers["references"] ?? null };
  }
  const result = await ingestInboundEmail(createServiceClient(), email);
  return Response.json(result);
}
