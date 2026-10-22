"use server";

import { checkLoginLimit } from "@/lib/login-limit";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { emailConfigured, otpEmail, sendEmail } from "@/lib/email";

export type LoginState = { phase: "email" | "code"; email?: string; message?: string; error?: string };

const EMAIL_COOKIE = "admin_login_email";
const generic = "Se este email tiver acesso, você vai receber um código em instantes.";
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

async function clientIp() {
  // Na Vercel, só esse header é confiável; x-forwarded-for pode vir do cliente.
  return process.env.VERCEL ? ((await headers()).get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "unknown") : "local";
}

async function allow(key: string, limit: number, seconds: number) {
  return checkLoginLimit(createServiceClient(), key, limit, seconds);
}

/** Uma action para o formulário inteiro: intent = request | verify | restart. */
export async function login(prev: LoginState, form: FormData): Promise<LoginState> {
  const intent = form.get("intent");
  if (intent === "verify") return verifyCode(prev, form);
  if (intent === "restart") {
    (await cookies()).delete({ name: EMAIL_COOKIE, path: "/login" });
    return { phase: "email" };
  }
  return requestCode(prev, form);
}

async function requestCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { phase: "email", error: "Informe um email válido." };

  const ip = fingerprint(await clientIp());
  for (const [key, limit] of [[`request/ip/${ip}`, 10], [`request/email/${fingerprint(email)}`, 5]] as const) {
    const result = await allow(key, limit, 3600);
    if (result === "unavailable") return { phase: "email", email, error: "O serviço de login está indisponível. Tente novamente em instantes." };
    if (result === "limited") return { phase: "email", email, error: "Limite de solicitações atingido. Tente novamente mais tarde." };
  }

  (await cookies()).set(EMAIL_COOKIE, email, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/login" });

  // A resposta é a mesma para quem tem ou não acesso; o envio roda depois da resposta.
  after(async () => {
    try {
      const db = createServiceClient();
      const admin = await db.from("admins").select("user_id").eq("email", email).maybeSingle();
      if (admin.error || !admin.data) return;
      const authHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
      if (!emailConfigured() && process.env.NODE_ENV === "development" && ["127.0.0.1", "localhost"].includes(authHost)) {
        const sent = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
        if (sent.error) throw new Error("local_otp_delivery_failed");
        return;
      }
      const link = await db.auth.admin.generateLink({ type: "magiclink", email });
      const code = link.data?.properties?.email_otp;
      if (link.error || !code) throw new Error("otp_generation_failed");
      await sendEmail({ to: email, ...otpEmail(code) });
    } catch (cause) {
      console.error("admin_code_delivery_failed", cause instanceof Error ? cause.message : cause);
    }
  });
  return { phase: "code", email, message: generic };
}

async function verifyCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const jar = await cookies();
  const email = jar.get(EMAIL_COOKIE)?.value;
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!email) return { phase: "email", error: "O pedido de código expirou. Informe o email de novo." };
  const fail: LoginState = { phase: "code", email, error: "Código inválido ou expirado." };
  if (!/^\d{6,10}$/.test(code)) return fail;
  const limit = await allow(`verify/email/${fingerprint(email)}`, 6, 600);
  if (limit === "unavailable") return { phase: "code", email, error: "O serviço de login está indisponível. Tente novamente em instantes." };
  if (limit === "limited") return { phase: "code", email, error: "Muitas tentativas. Peça um novo código em alguns minutos." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) return fail;
  const isAdmin = await supabase.rpc("is_admin");
  if (isAdmin.error || isAdmin.data !== true) {
    await supabase.auth.signOut({ scope: "local" });
    return fail;
  }
  jar.delete({ name: EMAIL_COOKIE, path: "/login" });
  redirect("/all");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
