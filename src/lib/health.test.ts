import { expect, it } from "vitest";
import { checkTarget, uptime } from "./health";

const target = { id: "t1", name: "App", url: "https://app.test/health", expect_status: 200 };

it("ok quando o status bate", async () => {
  const r = await checkTarget(target, (async () => new Response("ok", { status: 200 })) as typeof fetch);
  expect(r).toMatchObject({ target_id: "t1", ok: true, status_code: 200, error: null });
  expect(r.latency_ms).toBeGreaterThanOrEqual(0);
});

it("falha com status inesperado (redirect não é seguido)", async () => {
  const r = await checkTarget(target, (async () => new Response(null, { status: 307, headers: { location: "/login" } })) as typeof fetch);
  expect(r).toMatchObject({ ok: false, status_code: 307, error: "esperado 200, recebido 307" });
});

it("timeout vira falha legível", async () => {
  const hang = ((_: unknown, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))) as typeof fetch;
  const r = await checkTarget(target, hang, 50);
  expect(r).toMatchObject({ ok: false, status_code: null, error: "sem resposta em 0.05s" });
});

it("uptime", () => {
  expect(uptime([])).toBeNull();
  expect(uptime([{ ok: true }, { ok: true }, { ok: false }])).toBe(66.7);
});
