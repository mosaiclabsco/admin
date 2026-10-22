import type { SupabaseClient } from "@supabase/supabase-js";

export async function audit(db: SupabaseClient, entry: { actor: string; action: string; platformId?: string | null; entity?: string; entityId?: string; data?: Record<string, unknown> }) {
  const { error } = await db.from("audit_log").insert({
    actor: entry.actor,
    action: entry.action,
    platform_id: entry.platformId ?? null,
    entity: entry.entity ?? null,
    entity_id: entry.entityId ?? null,
    data: entry.data ?? {},
  });
  if (error) throw new Error("Não foi possível registrar a auditoria.");
}
