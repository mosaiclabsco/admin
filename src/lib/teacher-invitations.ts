import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { sendEmail } from "./email";
import { readTeacherAccess, writeTeacherAccess } from "./management";
export type TeacherInvitationStatus = {
  invitedAt: string | null;
  passwordDefinedAt: string | null;
  lastSignInAt: string | null;
};
export function invitationClient() {
  if (
    !process.env.LESSONARA_SUPABASE_URL ||
    !process.env.LESSONARA_SUPABASE_SECRET_KEY
  )
    throw new Error("Integração com Lessonara não configurada.");
  return createClient(
    process.env.LESSONARA_SUPABASE_URL,
    process.env.LESSONARA_SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export function accessEmail(name: string, link: string, recovery: boolean) {
  const escape = (v: string) =>
    v.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const subject = recovery
    ? "Defina sua senha do Lessonara"
    : "Seu convite para o Lessonara";
  const intro = recovery
    ? "Use o link abaixo para escolher uma nova senha do Lessonara."
    : "Seu espaço de ensino está pronto. Escolha sua senha para começar.";
  return {
    subject,
    text: `Olá, ${name || "professor(a)"}!\n\n${intro}\n\n${link}\n\nEste link é de uso único. Para recuperação de senha, use em até 10 minutos após o envio. Se expirar, peça um novo ao responsável pelo convite. Sua senha será escolhida por você e não será enviada por email. Se não reconhece a solicitação, ignore esta mensagem.`,
    html: `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><style>:root{color-scheme:light only;supported-color-schemes:light}@media(prefers-color-scheme:dark){.email-page{background-color:#edf2e9!important;color:#2b3e39!important}.email-card{background-color:#fff!important;color:#2b3e39!important}}[data-ogsc] .email-card{background-color:#fff!important;color:#2b3e39!important}</style></head><body class="email-page" bgcolor="#edf2e9" style="color-scheme:light only;margin:0;padding:32px 16px;background:#edf2e9;font-family:Arial,sans-serif;color:#2b3e39"><div class="email-card" style="max-width:520px;margin:auto;background:white;border-radius:18px;overflow:hidden"><div style="padding:24px 32px;background:#f7f8fa"><img src="https://lessonara.mosaic-labs.co/brand/complete-logo.png" alt="Lessonara" width="162" height="36" style="display:block;border:0;width:162px;height:36px"></div><div style="padding:32px"><h1 style="font-size:24px;margin:0 0 24px">${recovery ? "Uma nova senha, escolhida por você." : "Bem-vindo ao seu espaço de ensino."}</h1><p>Olá, ${escape(name || "professor(a)")}!</p><p style="line-height:1.7">${intro}</p><p style="margin:28px 0"><a href="${escape(link)}" style="display:inline-block;background:#3e7163;color:white;text-decoration:none;border-radius:10px;padding:14px 22px;font-weight:bold">Definir minha senha</a></p><p style="font-size:13px;line-height:1.7;color:#66766e">Este link é de uso único. Para recuperação de senha, use em até 10 minutos após o envio. Se expirar, peça o reenvio. Sua senha será escolhida por você e não será enviada por email.</p><p style="font-size:12px;line-height:1.7;color:#66766e">Se não reconhece esta solicitação, ignore a mensagem.</p></div></div></body></html>`,
  };
}
export async function teacherInvitationStatus(
  teacherId: string,
): Promise<TeacherInvitationStatus | null> {
  if (!/^[0-9a-f-]{36}$/i.test(teacherId)) return null;
  let result;
  try {
    result = await invitationClient().auth.admin.getUserById(teacherId);
  } catch {
    return null;
  }
  if (result.error || !result.data.user) return null;
  const user = result.data.user;
  return {
    invitedAt:
      typeof user.app_metadata.teacher_access_sent_at === "string"
        ? user.app_metadata.teacher_access_sent_at
        : null,
    passwordDefinedAt:
      typeof user.app_metadata.teacher_password_defined_at === "string"
        ? user.app_metadata.teacher_password_defined_at
        : null,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}
export async function inviteTeacher(
  db: SupabaseClient,
  actor: string,
  input: { email: string; name: string; planId?: string },
  source = invitationClient(),
) {
  const email = input.email.trim().toLowerCase(),
    name = input.name.trim();
  if (
    !/^\S+@\S+\.\S+$/.test(email) ||
    email.length > 254 ||
    !name ||
    name.length > 120 ||
    /[\r\n\x00-\x1f]/.test(name)
  )
    throw new Error("Informe nome e email válidos.");
  const admin = await db
    .from("admins")
    .select("user_id")
    .eq("email", actor.toLowerCase())
    .maybeSingle();
  if (admin.error || !admin.data)
    throw new Error("Permissão administrativa necessária.");
  const platform = await db
    .from("platforms")
    .select("id")
    .eq("slug", "lessonara")
    .eq("active", true)
    .single();
  if (platform.error || !platform.data)
    throw new Error("Plataforma Lessonara indisponível.");
  const selected = input.planId
    ? await db
        .from("plans")
        .select("id,feature_tier")
        .eq("id", input.planId)
        .eq("platform_id", platform.data.id)
        .eq("active", true)
        .single()
    : { data: null, error: null };
  if (selected.error || (input.planId && !selected.data?.feature_tier))
    throw new Error("Selecione um plano ativo do Lessonara.");
  const target = await source
    .from("teachers")
    .select("id,name,email")
    .eq("email", email)
    .maybeSingle();
  if (target.error) throw new Error("Não foi possível consultar o professor.");
  const linkedAccount = await db
    .from("accounts")
    .select("id,external_id")
    .eq("platform_id", platform.data.id)
    .eq("email", email)
    .maybeSingle();
  if (linkedAccount.error)
    throw new Error("Não foi possível verificar o vínculo da conta.");
  if (linkedAccount.data && linkedAccount.data.external_id !== target.data?.id)
    throw new Error(
      "Já existe uma conta comercial com este email. Revise o vínculo antes de convidar o professor.",
    );
  if (target.data && selected.data) {
    const current = await readTeacherAccess(target.data.id);
    if (!current || current.platform_plan !== selected.data.feature_tier)
      throw new Error(
        "Esta conta já existe com outro plano. Use a troca de plano da assinatura.",
      );
  }
  const limited = await source.rpc("allow_student_auth", {
    p_keys: [
      `teacher-invitation/${createHash("sha256").update(email).digest("hex")}`,
    ],
    p_limits: [1],
    p_seconds: [60],
  });
  if (limited.error || limited.data !== true)
    throw new Error("Aguarde um minuto antes de reenviar para este email.");
  const recovery = Boolean(target.data);
  const generated = await source.auth.admin.generateLink(
    recovery
      ? { type: "recovery", email }
      : { type: "invite", email, options: { data: { name } } },
  );
  if (
    generated.error ||
    !generated.data.user ||
    !generated.data.properties?.hashed_token
  )
    throw new Error(
      "Não foi possível preparar o convite. Confira se o email já tem outro tipo de acesso.",
    );
  const user = generated.data.user;
  if (recovery && target.data!.id !== user.id)
    throw new Error(
      "O vínculo do professor mudou. Atualize e tente novamente.",
    );
  const profile = await source
    .from("teachers")
    .select("id")
    .eq("id", user.id)
    .eq("email", email)
    .maybeSingle();
  if (profile.error || !profile.data)
    throw new Error(
      "O cadastro do professor não pôde ser confirmado. O email não foi enviado.",
    );
  const sentBefore =
    typeof user.app_metadata.teacher_access_sent_at === "string";
  if (!recovery && selected.data) {
    const current = await readTeacherAccess(user.id);
    if (!current)
      throw new Error("Não foi possível consultar o acesso inicial.");
    if (current.platform_plan !== selected.data.feature_tier)
      await writeTeacherAccess(actor, {
        teacherId: user.id,
        plan: selected.data.feature_tier,
        suspended: current.access_suspended,
        revision: current.access_revision,
        operation: randomUUID(),
        reason: "Plano inicial definido no convite de professor",
      });
  }
  // Import identity without overwriting an existing subscription, payment or plan.
  const created = await db.from("accounts").upsert(
    {
      platform_id: platform.data.id,
      external_id: user.id,
      name: target.data?.name || name,
      email,
      status: "trial",
      plan_id: !recovery ? (selected.data?.id ?? null) : null,
    },
    { onConflict: "platform_id,external_id", ignoreDuplicates: true },
  );
  if (created.error)
    throw new Error(
      "Não foi possível vincular a conta administrativa. O email não foi enviado.",
    );
  const account = await db
    .from("accounts")
    .select("id")
    .eq("platform_id", platform.data.id)
    .eq("external_id", user.id)
    .single();
  if (account.error || !account.data)
    throw new Error("Não foi possível confirmar a conta administrativa.");
  const origin =
    process.env.LESSONARA_APP_URL || "https://lessonara.mosaic-labs.co";
  const url = new URL("/login/password", origin);
  if (url.protocol !== "https:")
    throw new Error("O endereço de convite precisa usar HTTPS.");
  url.hash = new URLSearchParams({
    token_hash: generated.data.properties.hashed_token,
    type: recovery ? "recovery" : "invite",
  }).toString();
  const mail = accessEmail(target.data?.name || name, url.href, recovery);
  const messageId = await sendEmail({
    to: email,
    ...mail,
    from: "Lessonara <lessonara@mosaic-labs.co>",
    replyTo: "lessonara@mosaic-labs.co",
  });
  const recorded = await source.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      teacher_access_sent_at: new Date().toISOString(),
      teacher_access_message_id: messageId,
    },
  });
  const logged = await db.from("audit_log").insert({
    actor,
    action: sentBefore ? "lessonara.invite.resend" : "lessonara.invite.send",
    platform_id: platform.data.id,
    entity: "account",
    entity_id: account.data.id,
    data: { message_id: messageId, kind: recovery ? "recovery" : "invite" },
  });
  return {
    teacherId: user.id,
    accountId: account.data.id,
    messageId,
    trackingPending: Boolean(recorded.error || logged.error),
  };
}
