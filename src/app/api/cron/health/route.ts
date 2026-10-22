import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { runHealthChecks } from "@/lib/health";

const RETENTION_DAYS = 30;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return Boolean(secret) && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Vercel Cron (GET) ou pinger externo: Authorization: Bearer <CRON_SECRET>. */
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = createServiceClient();
  const results = await runHealthChecks(db);
  await db.from("health_checks").delete().lt("checked_at", new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString());
  return Response.json({ checked: results.length, failing: results.filter((r) => !r.ok).length });
}
