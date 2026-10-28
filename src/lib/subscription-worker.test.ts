import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runSubscriptionChanges } from "./subscription-worker";
function fixture(withFeatures = true) {
  const job = {
    id: "operation",
    account_id: "account",
    claim_token: "claim",
    actor: "operator@example.invalid",
    feature_tier: withFeatures ? "pro" : null,
    source_revision: 7,
    source_suspended: false,
    effective_on: "2026-11-10",
    application_mode: "renewal",
    from_plan_id: "old-plan",
    from_override: null,
    billing_day: 10,
  };
  const rpc = vi.fn(async (name: string) => ({
    data: name.startsWith("claim_") ? [job] : null,
    error: null,
  }));
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({
      data: {
        external_id: "teacher",
        status: "active",
        plan_id: "old-plan",
        price_override_cents: null,
        billing_day: 10,
        platform: { slug: "lessonara" },
      },
      error: null,
    }),
  };
  return {
    job,
    rpc,
    db: { rpc, from: () => chain } as unknown as SupabaseClient,
  };
}
it("applies access first with the stable operation ID, then commits commercial terms", async () => {
  const { db, job, rpc } = fixture();
  const apply = vi.fn(async () => undefined);
  expect(await runSubscriptionChanges(db, apply)).toEqual({
    claimed: 1,
    applied: 1,
    failed: 0,
  });
  expect(apply).toHaveBeenCalledWith(job.actor, {
    teacherId: "teacher",
    plan: "pro",
    suspended: false,
    revision: 7,
    operation: job.id,
    reason: "Troca agendada para 2026-11-10",
  });
  expect(rpc).toHaveBeenLastCalledWith("finish_subscription_change", {
    p_id: job.id,
    p_claim: job.claim_token,
    p_error: null,
  });
});
it("preserves current commercial terms when access fails and records a retry", async () => {
  const { db, job, rpc } = fixture();
  const apply = vi.fn(async () => {
    throw new Error("Revisão de acesso necessária");
  });
  expect(await runSubscriptionChanges(db, apply)).toEqual({
    claimed: 1,
    applied: 0,
    failed: 1,
  });
  expect(rpc).not.toHaveBeenCalledWith(
    "finish_subscription_change",
    expect.objectContaining({ p_error: null }),
  );
  expect(rpc).toHaveBeenLastCalledWith("finish_subscription_change", {
    p_id: job.id,
    p_claim: job.claim_token,
    p_error: "Revisão de acesso necessária",
  });
});
it("does not change another platform's access when no feature tier is linked", async () => {
  const { db } = fixture(false);
  const apply = vi.fn(async () => undefined);
  expect((await runSubscriptionChanges(db, apply)).applied).toBe(1);
  expect(apply).not.toHaveBeenCalled();
});

it("claims only the requested immediate operation and keeps its retry identity", async () => {
  const { db, job, rpc } = fixture();
  job.application_mode = "now";
  const apply = vi.fn(async () => undefined);
  await runSubscriptionChanges(db, apply, job.id);
  expect(rpc).toHaveBeenNthCalledWith(
    1,
    "claim_requested_subscription_change",
    {
      p_id: job.id,
    },
  );
  expect(apply).toHaveBeenCalledWith(
    job.actor,
    expect.objectContaining({
      operation: job.id,
      reason: "Troca imediata solicitada em 2026-11-10",
    }),
  );
});
it("rejects stale commercial terms before changing source access", async () => {
  const { db, job, rpc } = fixture();
  job.from_plan_id = "changed";
  const apply = vi.fn(async () => undefined);
  expect(await runSubscriptionChanges(db, apply, job.id)).toEqual({
    claimed: 1,
    applied: 0,
    failed: 1,
  });
  expect(apply).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenLastCalledWith(
    "finish_subscription_change",
    expect.objectContaining({
      p_error: "A assinatura mudou. Revise a troca antes de aplicar.",
    }),
  );
});
it("records a commercial finalization failure and reuses the same source operation on retry", async () => {
  const { db, job, rpc } = fixture();
  let failed = false;
  rpc.mockImplementation(async (name: string, args?: unknown) => {
    const values = args as { p_error?: string | null } | undefined;
    if (
      name === "finish_subscription_change" &&
      values?.p_error === null &&
      !failed
    ) {
      failed = true;
      return {
        data: null,
        error: { message: "temporary database failure" },
      } as never;
    }
    return {
      data: name.startsWith("claim_") ? [job] : null,
      error: null,
    };
  });
  const apply = vi.fn(async () => undefined);
  expect((await runSubscriptionChanges(db, apply, job.id)).failed).toBe(1);
  expect((await runSubscriptionChanges(db, apply, job.id)).applied).toBe(1);
  expect(apply.mock.calls[0]).toEqual(apply.mock.calls[1]);
});
