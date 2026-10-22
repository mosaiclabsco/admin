import { createHmac } from "node:crypto";
import { expect, it } from "vitest";
import { verifyWebhook } from "./webhook";

const secret = `whsec_${Buffer.from("segredo-de-teste").toString("base64")}`;
const sign = (id: string, ts: string, body: string) => createHmac("sha256", Buffer.from("segredo-de-teste")).update(`${id}.${ts}.${body}`).digest("base64");

it("aceita assinatura válida (inclusive entre várias) e recusa adulteração/replay", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  const ts = String(now / 1000);
  const body = '{"type":"email.received"}';
  const sig = sign("msg_1", ts, body);
  expect(verifyWebhook(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body, now)).toBe(true);
  expect(verifyWebhook(secret, { id: "msg_1", timestamp: ts, signature: `v1,outra v1,${sig}` }, body, now)).toBe(true);
  expect(verifyWebhook(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body + " ", now)).toBe(false);
  expect(verifyWebhook(secret, { id: "msg_2", timestamp: ts, signature: `v1,${sig}` }, body, now)).toBe(false);
  expect(verifyWebhook(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body, now + 10 * 60_000)).toBe(false);
});
