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

export { otpEmail } from "./email-templates";
