import type { SupabaseClient } from "@supabase/supabase-js";
import { lessonara } from "./lessonara";
import type { Connector, ExternalAccount } from "./types";

/** Conector por slug de plataforma. Plataforma sem conector = contas cadastradas à mão. */
const connectors: Record<string, Connector> = { lessonara };

export function connectorFor(slug: string): Connector | null {
  return connectors[slug] ?? null;
}

/**
 * Upsert das contas vindas da origem. Atualiza só dados de identidade/métricas;
 * plano, status e cobrança continuam sendo do admin. Conta que sumiu da origem é marcada.
 */
export async function syncAccounts(db: SupabaseClient, platformId: string, external: ExternalAccount[], now = new Date()) {
  const syncedAt = now.toISOString();
  const rows = external.map((a) => ({
    platform_id: platformId,
    external_id: a.externalId,
    name: a.name,
    email: a.email,
    metrics: a.metrics,
    source_created_at: a.createdAt,
    source_missing: false,
    synced_at: syncedAt,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("accounts").upsert(rows.slice(i, i + 500), { onConflict: "platform_id,external_id" });
    if (error) throw new Error("Não foi possível gravar as contas sincronizadas.");
  }
  const present = new Set(external.map((a) => a.externalId));
  const existing = await db.from("accounts").select("id,external_id").eq("platform_id", platformId).eq("source_missing", false).not("synced_at", "is", null);
  if (existing.error) throw new Error("Não foi possível conferir contas removidas.");
  const missing = existing.data.filter((a) => !present.has(a.external_id)).map((a) => a.id);
  if (missing.length) {
    const { error } = await db.from("accounts").update({ source_missing: true }).in("id", missing);
    if (error) throw new Error("Não foi possível marcar contas removidas.");
  }
  return { upserted: rows.length, missing: missing.length };
}
