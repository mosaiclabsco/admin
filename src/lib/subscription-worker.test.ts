import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runSubscriptionChanges } from "./subscription-worker";
function fixture(withFeatures = true) {
 const job = { id: "operation", account_id: "account", claim_token: "claim", actor: "operator@example.invalid", feature_tier: withFeatures ? "pro" : null, source_revision: 7, source_suspended: false, effective_on: "2026-11-10" };
 const rpc = vi.fn(async (name: string) => ({ data: name === "claim_subscription_changes" ? [job] : null, error: null }));
 const chain = { select: () => chain, eq: () => chain, single: async () => ({ data: { external_id: "teacher", status: "active", platform: { slug: "lessonara" } }, error: null }) };
 return { job, rpc, db: { rpc, from: () => chain } as unknown as SupabaseClient };
}
it("applies access first with the stable operation ID, then commits commercial terms", async () => {
 const { db, job, rpc } = fixture();const apply = vi.fn(async () => undefined);
 expect(await runSubscriptionChanges(db, apply)).toEqual({ claimed: 1, applied: 1, failed: 0 });
 expect(apply).toHaveBeenCalledWith(job.actor, { teacherId: "teacher", plan: "pro", suspended: false, revision: 7, operation: job.id, reason: "Troca agendada para 2026-11-10" });
 expect(rpc).toHaveBeenLastCalledWith("finish_subscription_change", { p_id: job.id, p_claim: job.claim_token, p_error: null });
});
it("preserves current commercial terms when access fails and records a retry", async () => {
 const { db, job, rpc } = fixture();const apply = vi.fn(async () => { throw new Error("Revisão de acesso necessária"); });
 expect(await runSubscriptionChanges(db, apply)).toEqual({ claimed: 1, applied: 0, failed: 1 });
 expect(rpc).not.toHaveBeenCalledWith("finish_subscription_change", expect.objectContaining({ p_error: null }));
 expect(rpc).toHaveBeenLastCalledWith("finish_subscription_change", { p_id: job.id, p_claim: job.claim_token, p_error: "Revisão de acesso necessária" });
});
it("does not change another platform's access when no feature tier is linked", async () => {
 const { db } = fixture(false);const apply = vi.fn(async () => undefined);
 expect((await runSubscriptionChanges(db, apply)).applied).toBe(1);expect(apply).not.toHaveBeenCalled();
});
