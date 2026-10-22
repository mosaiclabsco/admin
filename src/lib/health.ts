import type { SupabaseClient } from "@supabase/supabase-js";

export type HealthTarget = { id: string; name: string; url: string; expect_status: number };
export type HealthResult = { target_id: string; ok: boolean; status_code: number | null; latency_ms: number | null; error: string | null };

export async function checkTarget(target: HealthTarget, fetcher: typeof fetch = fetch, timeoutMs = 8000): Promise<HealthResult> {
  const started = performance.now();
  try {
    const response = await fetcher(target.url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { "user-agent": "mosaic-labs-admin-healthcheck/1" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latency = Math.round(performance.now() - started);
    await response.body?.cancel();
    const ok = response.status === target.expect_status;
    return { target_id: target.id, ok, status_code: response.status, latency_ms: latency, error: ok ? null : `esperado ${target.expect_status}, recebido ${response.status}` };
  } catch (cause) {
    const timeout = cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
    // undici: "fetch failed" com o motivo real (ENOTFOUND, ECONNREFUSED, certificado…) em cause.cause.
    const reason = (cause as { cause?: { code?: string; message?: string } })?.cause;
    const message = reason?.code ?? reason?.message ?? (cause instanceof Error ? cause.message : "erro desconhecido");
    return { target_id: target.id, ok: false, status_code: null, latency_ms: null, error: timeout ? `sem resposta em ${timeoutMs / 1000}s` : String(message).slice(0, 200) };
  }
}

/** Roda todos os alvos ativos (opcionalmente de uma plataforma) e grava o histórico. */
export async function runHealthChecks(db: SupabaseClient, platformId?: string | null) {
  let query = db.from("health_targets").select("id,name,url,expect_status").eq("active", true);
  if (platformId) query = query.eq("platform_id", platformId);
  const { data, error } = await query;
  if (error) throw new Error("Não foi possível carregar os alvos de health check.");
  const results = await Promise.all((data as HealthTarget[]).map((target) => checkTarget(target)));
  if (results.length) {
    const saved = await db.from("health_checks").insert(results);
    if (saved.error) throw new Error("Não foi possível gravar o resultado do health check.");
  }
  return results;
}

/** Uptime em % (uma casa) a partir do histórico. */
export function uptime(checks: { ok: boolean }[]) {
  if (!checks.length) return null;
  return Math.round((checks.filter((c) => c.ok).length / checks.length) * 1000) / 10;
}
