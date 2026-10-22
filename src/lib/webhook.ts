import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Assinatura Svix/Standard Webhooks (usada pelo Resend): base64(HMAC-SHA256(secret, "id.timestamp.body")).
 * O header pode trazer várias assinaturas ("v1,abc v1,def"); timestamp fora de 5 min é recusado (replay).
 */
export function verifyWebhook(secret: string, headers: { id: string; timestamp: string; signature: string }, body: string, now = Date.now()) {
  const ts = Number(headers.timestamp);
  if (!headers.id || !Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = Buffer.from(createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${body}`).digest("base64"));
  return headers.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    const given = Buffer.from(sig ?? "");
    return version === "v1" && given.length === expected.length && timingSafeEqual(given, expected);
  });
}
