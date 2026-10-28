"use server";
import { requireAdmin, createClient } from "@/lib/supabase/server";
import { requestSupport, confirmSupport } from "@/lib/support-access";
async function context() {
  const admin = await requireAdmin();
  const client = await createClient();
  const claims = await client.auth.getClaims();
  const session = claims.data?.claims.session_id;
  if (typeof session !== "string")
    throw new Error("Entre novamente no admin antes de solicitar suporte.");
  return { ...admin, session };
}
export async function requestSupportAccess(accountId: string) {
  const { supabase, email, session } = await context();
  try {
    return {
      challenge: await requestSupport(
        supabase,
        email.toLowerCase(),
        session,
        accountId,
      ),
      ok: "Código enviado para seu email administrativo.",
    };
  } catch {
    return {
      error:
        "Não foi possível enviar o código. Aguarde um minuto e confira a autorização de suporte.",
    };
  }
}
export async function confirmSupportAccess(accountId: string, form: FormData) {
  const { supabase, email, session } = await context();
  try {
    return {
      link: await confirmSupport(
        supabase,
        email.toLowerCase(),
        session,
        accountId,
        String(form.get("challenge") ?? ""),
        String(form.get("code") ?? "").trim(),
      ),
      ok: "Acesso temporário liberado. O botão vale por dois minutos.",
    };
  } catch {
    return {
      error:
        "Código inválido, expirado ou já utilizado. Após cinco tentativas, solicite outro.",
    };
  }
}
