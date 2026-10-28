const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

type CodeMessage = {
  title: string;
  intro: string;
  code: string;
  validity: string;
  detail: string;
  notice: string;
};

function codeEmail(message: CodeMessage) {
  const { title, intro, code, validity, detail, notice } = message;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><style>:root{color-scheme:light only;supported-color-schemes:light}@media(prefers-color-scheme:dark){.email-page{background-color:#f5f3ee!important;color:#202d3a!important}.email-card{background-color:#fff!important;color:#202d3a!important}}[data-ogsc] .email-card{background-color:#fff!important;color:#202d3a!important}</style><title>${escapeHtml(title)}</title></head>
<body class="email-page" bgcolor="#f5f3ee" style="color-scheme:light only;margin:0;padding:0;background-color:#f5f3ee;color:#202d3a;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(validity)} ${escapeHtml(detail)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f3ee"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px">
<tr><td style="padding:0 0 28px"><a href="https://www.mosaic-labs.co" style="text-decoration:none"><img src="https://www.mosaic-labs.co/brand/icon-text.png" alt="Mosaic Labs" width="180" height="40" style="display:block;width:180px;height:40px;border:0;color:#202d3a;font-size:22px;font-weight:bold"></a></td></tr>
<tr><td class="email-card" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #e5e3dd;border-radius:16px;overflow:hidden">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="padding:32px 28px 0;color:#1464c0;font-size:12px;font-weight:bold;letter-spacing:1px">MOSAIC LABS ADMIN</td></tr>
<tr><td style="padding:16px 28px 0"><h1 style="margin:0;font-size:28px;line-height:1.25;font-weight:600;color:#202d3a">${escapeHtml(title)}</h1></td></tr>
<tr><td style="padding:16px 28px 0;font-size:15px;line-height:1.7;color:#526171">${escapeHtml(intro)}</td></tr>
<tr><td style="padding:24px 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:24px 12px;background-color:#edf4fc;border:1px solid #d7e6f8;border-radius:12px"><p style="margin:0 0 12px;color:#42607e;font-size:13px">Seu código de confirmação</p><p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:34px;line-height:1.3;font-weight:bold;letter-spacing:4px;color:#1464c0">${escapeHtml(code)}</p><p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#42607e">${escapeHtml(validity)}</p></td></tr></table></td></tr>
<tr><td style="padding:0 28px 24px;font-size:14px;line-height:1.7;color:#526171">${escapeHtml(detail)}</td></tr>
<tr><td style="padding:20px 28px 28px;border-top:1px solid #eeeae4;font-size:13px;line-height:1.7;color:#526171"><strong style="color:#202d3a">Não compartilhe este código.</strong><br>${escapeHtml(notice)}</td></tr>
</table></td></tr>
<tr><td style="padding:24px 0 12px"><table role="presentation" width="64" cellspacing="0" cellpadding="0" border="0"><tr><td width="16" height="4" style="background-color:#1464c0;font-size:0">&nbsp;</td><td width="16" style="background-color:#ef6545;font-size:0">&nbsp;</td><td width="16" style="background-color:#f4b942;font-size:0">&nbsp;</td><td width="16" style="background-color:#0b9e8a;font-size:0">&nbsp;</td></tr></table></td></tr>
<tr><td style="font-size:12px;line-height:1.7;color:#6b7580">Mosaic Labs · Administração de produtos<br>Mensagem automática. <a href="https://www.mosaic-labs.co" style="color:#526171;text-decoration:underline">mosaic-labs.co</a></td></tr>
</table></td></tr></table></body></html>`;
}

export function otpEmail(code: string) {
  return {
    subject: `Código de acesso: ${code}`,
    text: `Seu código de acesso ao Mosaic Labs Admin: ${code}. Vale por 10 minutos e pode ser usado uma vez. Se não foi você, ignore este email.`,
    html: codeEmail({
      title: "Seu acesso ao Mosaic Labs.",
      intro: "Use o código abaixo para entrar no painel administrativo.",
      code,
      validity: "Válido por 10 minutos.",
      detail:
        "Este código pode ser usado uma única vez. Volte à tela de login para continuar.",
      notice: "Se você não solicitou este acesso, ignore esta mensagem.",
    }),
  };
}

export function supportAccessEmail(code: string) {
  return {
    subject: "Confirme o acesso de suporte ao Lessonara",
    text: `Seu código para acessar temporariamente o professor selecionado no admin no Lessonara é ${code}. Vale por 5 minutos, com até 5 tentativas. A sessão de suporte durará até 15 minutos. Se não solicitou, não compartilhe o código.`,
    html: codeEmail({
      title: "Confirme o acesso de suporte.",
      intro:
        "Você solicitou acesso temporário à conta do professor selecionado no Lessonara. Confirme no painel com o código abaixo.",
      code,
      validity: "Válido por 5 minutos · Até 5 tentativas",
      detail:
        "Após a confirmação, a sessão de suporte terá duração de até 15 minutos.",
      notice:
        "Se você não solicitou este acesso, ignore esta mensagem e não autorize a sessão de suporte.",
    }),
  };
}
