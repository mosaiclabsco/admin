import { Resend } from "resend";

export type EmailInput = { to: string; subject: string; html?: string; text: string; from?: string; replyTo?: string; headers?: Record<string, string> };

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(input: EmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada.");
  const { html, ...rest } = input;
  const result = await new Resend(apiKey).emails.send({
    ...rest,
    ...(html ? { html } : {}),
    from: input.from || process.env.EMAIL_FROM || "Mosaic Labs Admin <onboarding@resend.dev>",
  });
  if (result.error || !result.data?.id) throw new Error(`Falha no envio do email (${result.error?.name ?? "sem confirmação"}).`);
  return result.data.id;
}

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function otpEmail(code: string) {
  return {
    subject: `Código de acesso: ${code}`,
    text: `Seu código de acesso ao Mosaic Labs Admin: ${code}. Vale por 10 minutos e pode ser usado uma vez. Se não foi você, ignore este email.`,
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f5f2;font-family:Arial,sans-serif;color:#1f2a27"><div style="max-width:480px;margin:32px auto;padding:32px;background:#fff;border-radius:14px"><p style="font-weight:bold;font-size:18px">mosaic labs <span style="color:#8a948f">admin</span></p><p>Use este código para entrar:</p><p style="font-size:34px;letter-spacing:8px;font-weight:bold">${escape(code)}</p><p style="color:#5f6b67;font-size:13px">Vale por 10 minutos e pode ser usado uma vez. Se não foi você, ignore este email.</p></div></body></html>`,
  };
}
