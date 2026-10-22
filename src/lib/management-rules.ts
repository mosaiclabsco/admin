export type AccessChange = { teacherId: string; plan: "essential" | "plus" | "pro"; suspended: boolean; revision: number; operation: string; reason: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseAccessChange(form: FormData, teacherId: string): AccessChange {
  const plan = String(form.get("access_plan") ?? "");
  const status = form.get("access_status");
  const rawRevision = String(form.get("access_revision") ?? "");
  const revision = Number(rawRevision);
  const operation = String(form.get("operation") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!uuid.test(teacherId) || !uuid.test(operation) || !["essential", "plus", "pro"].includes(plan) || !["active", "suspended"].includes(String(status)) || !/^\d+$/.test(rawRevision) || !Number.isSafeInteger(revision) || reason.length < 5 || reason.length > 500) throw new Error("Confira o plano, o acesso e o motivo (5 a 500 caracteres).");
  return { teacherId, plan: plan as AccessChange["plan"], suspended: status === "suspended", revision, operation, reason };
}
