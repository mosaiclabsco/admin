import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { runSubscriptionChanges } from "@/lib/subscription-worker";
import { writeTeacherAccess } from "@/lib/management";
import { runHealthChecks } from "@/lib/health";

export const maxDuration = 60;
const RETENTION_DAYS = 30;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return (
    Boolean(secret) &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  );
}

/** Vercel Cron (GET) ou pinger externo: Authorization: Bearer <CRON_SECRET>. */
export async function GET(request: Request) {
  if (!authorized(request))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = createServiceClient();
  const claimed = await db.rpc("start_job_run", { p_job: "admin-health" });
  if (claimed.error)
    return Response.json(
      { error: "Não foi possível registrar a execução." },
      { status: 503 },
    );
  if (!claimed.data) return Response.json({ busy: true });
  try {
    const subscriptions = await runSubscriptionChanges(db, writeTeacherAccess);
    const results = await runHealthChecks(db);
    const removed = await db
      .from("health_checks")
      .delete()
      .lt(
        "checked_at",
        new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString(),
      );
    if (removed.error) throw new Error("Health cleanup failed");
    const metrics = {
      checked: results.length,
      healthFailed: results.filter((r) => !r.ok).length,
      subscriptionsApplied: subscriptions.applied,
      subscriptionsFailed: subscriptions.failed,
    };
    const saved = await db.rpc("finish_job_run", {
      p_id: claimed.data,
      p_status:
        metrics.healthFailed || metrics.subscriptionsFailed
          ? "failed"
          : "succeeded",
      p_metrics: metrics,
    });
    if (saved.error) throw new Error("Could not record result");
    return Response.json(metrics);
  } catch {
    await db.rpc("finish_job_run", {
      p_id: claimed.data,
      p_status: "failed",
      p_metrics: { failed: 1 },
    });
    return Response.json(
      { error: "Não foi possível concluir o job." },
      { status: 500 },
    );
  }
}
