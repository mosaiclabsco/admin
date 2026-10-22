import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { AccessChange } from "./management-rules";
export type TeacherAccess = { platform_plan: "essential" | "plus" | "pro"; access_suspended: boolean; access_revision: number };
export function managementConfigured() { return Boolean(process.env.LESSONARA_SUPABASE_URL && process.env.LESSONARA_SUPABASE_SECRET_KEY); }
function client() {
  if (!managementConfigured()) throw new Error("Integração com o Lessonara não configurada.");
  return createClient(process.env.LESSONARA_SUPABASE_URL!, process.env.LESSONARA_SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function readTeacherAccess(teacherId: string): Promise<TeacherAccess | null> {
  const result = await client().from("teachers").select("platform_plan,access_suspended,access_revision").eq("id", teacherId).maybeSingle();
  if (result.error) throw new Error("Não foi possível consultar o acesso. Confira a migração de administração no Lessonara.");
  return result.data as TeacherAccess | null;
}
export async function writeTeacherAccess(actor: string, change: AccessChange) {
  const result = await client().rpc("manage_teacher_access", { p_teacher: change.teacherId, p_actor: actor, p_plan: change.plan, p_suspended: change.suspended, p_revision: change.revision, p_operation: change.operation, p_reason: change.reason });
  if (result.error) throw new Error(result.error.code === "40001" ? "A conta mudou. Atualize a página antes de salvar." : "Não foi possível alterar o acesso. Confira a autorização administrativa e tente novamente.");
  return result.data as TeacherAccess;
}
