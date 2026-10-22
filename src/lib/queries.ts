import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChargeStatus } from "./billing";

export type ChargeWithAccount = {
  id: string;
  period: string;
  amount_cents: number;
  due_on: string;
  status: ChargeStatus;
  paid_at: string | null;
  paid_amount_cents: number | null;
  method: string | null;
  reference: string | null;
  settled_by: string | null;
  account: { id: string; name: string; email: string | null; platform_id: string };
};

const CHARGE_FIELDS = "id,period,amount_cents,due_on,status,paid_at,paid_amount_cents,method,reference,settled_by,account:accounts!inner(id,name,email,platform_id)";

export async function chargesForPeriod(db: SupabaseClient, period: string, platformId?: string | null) {
  let q = db.from("charges").select(CHARGE_FIELDS).eq("period", period).order("due_on").order("id");
  if (platformId) q = q.eq("account.platform_id", platformId);
  const { data, error } = await q;
  if (error) throw new Error("Não foi possível carregar as cobranças.");
  return data as unknown as ChargeWithAccount[];
}

export async function overdueCharges(db: SupabaseClient, today: string, platformId?: string | null, limit = 50) {
  let q = db.from("charges").select(CHARGE_FIELDS).eq("status", "pending").lt("due_on", today).order("due_on").limit(limit);
  if (platformId) q = q.eq("account.platform_id", platformId);
  const { data, error } = await q;
  if (error) throw new Error("Não foi possível carregar as cobranças atrasadas.");
  return data as unknown as ChargeWithAccount[];
}

export type AccountRow = {
  id: string;
  platform_id: string;
  external_id: string;
  name: string;
  email: string | null;
  status: string;
  billing_day: number;
  price_override_cents: number | null;
  metrics: Record<string, number | string>;
  source_missing: boolean;
  synced_at: string | null;
  source_created_at: string | null;
  notes: string | null;
  plan_id: string | null;
  plan: { id: string; code: string; name: string; price_cents: number } | null;
};

export async function listAccounts(db: SupabaseClient, platformId?: string | null) {
  let q = db.from("accounts").select("id,platform_id,external_id,name,email,status,billing_day,price_override_cents,metrics,source_missing,synced_at,source_created_at,notes,plan_id,plan:plans!accounts_plan_id_fkey(id,code,name,price_cents)").order("name");
  if (platformId) q = q.eq("platform_id", platformId);
  const { data, error } = await q;
  if (error) throw new Error("Não foi possível carregar as contas.");
  return data as unknown as AccountRow[];
}

export type PlanRow = { id: string; platform_id: string; code: string; name: string; price_cents: number; active: boolean; notes: string | null };

export async function listPlans(db: SupabaseClient, platformId?: string | null) {
  let q = db.from("plans").select("id,platform_id,code,name,price_cents,active,notes").order("price_cents");
  if (platformId) q = q.eq("platform_id", platformId);
  const { data, error } = await q;
  if (error) throw new Error("Não foi possível carregar os planos.");
  return data as PlanRow[];
}

export type TargetStatus = {
  id: string;
  platform_id: string | null;
  name: string;
  url: string;
  expect_status: number;
  active: boolean;
  checks: { ok: boolean; status_code: number | null; latency_ms: number | null; error: string | null; checked_at: string }[];
};

/** Alvos com as verificações das últimas 24h (mais recente primeiro). */
export async function healthStatus(db: SupabaseClient, platformId?: string | null, since = new Date(Date.now() - 24 * 3600_000)) {
  let q = db.from("health_targets").select("id,platform_id,name,url,expect_status,active").order("name");
  if (platformId) q = q.eq("platform_id", platformId);
  const targets = await q;
  if (targets.error) throw new Error("Não foi possível carregar os alvos.");
  const ids = targets.data.map((t) => t.id);
  const checks = ids.length
    ? await db.from("health_checks").select("target_id,ok,status_code,latency_ms,error,checked_at").in("target_id", ids).gte("checked_at", since.toISOString()).order("checked_at", { ascending: false }).limit(5000)
    : { data: [], error: null };
  if (checks.error) throw new Error("Não foi possível carregar o histórico de saúde.");
  return targets.data.map((t) => ({ ...t, checks: checks.data.filter((c) => c.target_id === t.id) })) as TargetStatus[];
}
