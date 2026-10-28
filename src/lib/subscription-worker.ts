import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccessChange } from "./management-rules";

type Job = {
  id: string;
  account_id: string;
  claim_token: string;
  actor: string;
  feature_tier: AccessChange["plan"] | null;
  source_revision: number | null;
  source_suspended: boolean | null;
  effective_on: string;
  application_mode: "now" | "renewal";
  from_plan_id: string | null;
  from_override: number | null;
  billing_day: number;
};
export async function runSubscriptionChanges(
  db: SupabaseClient,
  applyAccess: (actor: string, change: AccessChange) => Promise<unknown>,
  changeId?: string,
) {
  const claimed = await db.rpc(
    changeId
      ? "claim_requested_subscription_change"
      : "claim_subscription_changes",
    changeId ? { p_id: changeId } : {},
  );
  if (claimed.error)
    throw new Error("Não foi possível consultar trocas agendadas.");
  const result = { claimed: 0, applied: 0, failed: 0 };
  for (const job of (claimed.data ?? []) as Job[]) {
    result.claimed++;
    try {
      const account = await db
        .from("accounts")
        .select(
          "external_id,status,plan_id,price_override_cents,billing_day,platform:platforms(slug)",
        )
        .eq("id", job.account_id)
        .single();
      if (account.error || !account.data || account.data.status === "cancelled")
        throw new Error("Conta indisponível. Revise a troca.");
      if (
        account.data.plan_id !== job.from_plan_id ||
        account.data.price_override_cents !== job.from_override ||
        account.data.billing_day !== job.billing_day
      )
        throw new Error("A assinatura mudou. Revise a troca antes de aplicar.");
      if (job.feature_tier) {
        const platform = account.data.platform as unknown as { slug: string };
        if (
          platform?.slug !== "lessonara" ||
          job.source_revision === null ||
          job.source_suspended === null
        )
          throw new Error("Vínculo de funcionalidades inválido.");
        await applyAccess(job.actor, {
          teacherId: account.data.external_id,
          plan: job.feature_tier,
          suspended: job.source_suspended,
          revision: job.source_revision,
          operation: job.id,
          reason:
            job.application_mode === "now"
              ? `Troca imediata solicitada em ${job.effective_on}`
              : `Troca agendada para ${job.effective_on}`,
        });
      }
      const finished = await db.rpc("finish_subscription_change", {
        p_id: job.id,
        p_claim: job.claim_token,
        p_error: null,
      });
      if (finished.error)
        throw new Error(
          "Não foi possível concluir a troca. Revise o histórico.",
        );
      result.applied++;
    } catch (cause) {
      result.failed++;
      const failed = await db.rpc("finish_subscription_change", {
        p_id: job.id,
        p_claim: job.claim_token,
        p_error:
          cause instanceof Error ? cause.message : "Falha ao aplicar a troca.",
      });
      if (failed.error)
        throw new Error(
          "Não foi possível registrar a falha de uma troca agendada.",
        );
    }
  }
  return result;
}
