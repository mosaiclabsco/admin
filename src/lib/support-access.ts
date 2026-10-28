import "server-only";
import {
  createHmac,
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
} from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { invitationClient } from "./teacher-invitations";
import { sendEmail } from "./email";
import { supportAccessEmail } from "./email-templates";
export function supportCodeHash(id: string, code: string) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Confirmação de suporte indisponível.");
  return createHmac("sha256", key)
    .update(`support/${id}/${code}`)
    .digest("hex");
}
export async function supportTeacher(db: SupabaseClient, accountId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(accountId)) throw new Error("Conta inválida.");
  const result = await db
    .from("accounts")
    .select(
      "id,external_id,platform_id,platform:platforms!accounts_platform_id_fkey(slug,active)",
    )
    .eq("id", accountId)
    .maybeSingle();
  const platform = result.data?.platform as unknown as {
    slug: string;
    active: boolean;
  } | null;
  if (
    result.error ||
    !result.data ||
    platform?.slug !== "lessonara" ||
    !platform.active ||
    !/^[a-f0-9-]{36}$/i.test(result.data.external_id)
  )
    throw new Error("Conta Lessonara não encontrada.");
  return {
    teacher: result.data.external_id as string,
    platformId: result.data.platform_id as string,
  };
}
export async function requestSupport(
  db: SupabaseClient,
  actor: string,
  sessionId: string,
  accountId: string,
  source = invitationClient(),
) {
  const { teacher, platformId } = await supportTeacher(db, accountId);
  const id = randomUUID(),
    code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const saved = await source.rpc("request_support_challenge", {
    p_id: id,
    p_actor: actor,
    p_admin_session: sessionId,
    p_teacher: teacher,
    p_code_hash: supportCodeHash(id, code),
  });
  if (saved.error)
    throw new Error(
      "Não foi possível gerar o código. Aguarde um minuto e confira a autorização de suporte.",
    );
  const audit = await db
    .from("audit_log")
    .insert({
      actor,
      action: "lessonara.support.request",
      platform_id: platformId,
      entity: "account",
      entity_id: accountId,
      data: { teacher_id: teacher, challenge_id: id },
    });
  if (audit.error)
    throw new Error("Não foi possível registrar a solicitação de suporte.");
  await sendEmail({
    to: actor,
    ...supportAccessEmail(code),
  });
  return id;
}
export async function confirmSupport(
  db: SupabaseClient,
  actor: string,
  sessionId: string,
  accountId: string,
  id: string,
  code: string,
  source = invitationClient(),
) {
  const { teacher, platformId } = await supportTeacher(db, accountId);
  if (!/^[a-f0-9-]{36}$/i.test(id) || !/^\d{6}$/.test(code))
    throw new Error("Informe o código de seis dígitos recebido por email.");
  const token = randomBytes(32).toString("base64url");
  const result = await source.rpc("verify_support_challenge", {
    p_id: id,
    p_actor: actor,
    p_admin_session: sessionId,
    p_teacher: teacher,
    p_code_hash: supportCodeHash(id, code),
    p_token_hash: createHash("sha256").update(token).digest("hex"),
  });
  if (result.error || result.data !== true)
    throw new Error(
      "Código inválido, expirado ou já utilizado. Após cinco tentativas, solicite outro.",
    );
  const audit = await db
    .from("audit_log")
    .insert({
      actor,
      action: "lessonara.support.authorize",
      platform_id: platformId,
      entity: "account",
      entity_id: accountId,
      data: { teacher_id: teacher, challenge_id: id, duration_minutes: 15 },
    });
  if (audit.error)
    throw new Error("Não foi possível registrar a autorização de suporte.");
  return `https://lessonara.mosaic-labs.co/support/access#token=${token}`;
}
