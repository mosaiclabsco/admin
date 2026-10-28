"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import type { FormResult } from "@/components/form";
import { requireAdmin } from "@/lib/supabase/server";
import { parseAccessChange } from "@/lib/management-rules";
import { createServiceClient } from "@/lib/supabase/server";
import { runSubscriptionChanges } from "@/lib/subscription-worker";
import { readTeacherAccess, writeTeacherAccess } from "@/lib/management";
import { audit } from "@/lib/audit";
import { buildCharges, toPeriod, todaySP, type BillableAccount } from "@/lib/billing";
import { parseMoney } from "@/lib/format";
import { connectorFor, syncAccounts } from "@/lib/connectors";
import { runHealthChecks } from "@/lib/health";
import { emailConfigured, sendEmail } from "@/lib/email";

type Admin = Awaited<ReturnType<typeof requireAdmin>>;

/** Envolve a action: autentica, converte Error em mensagem e revalida o painel. */
function action(run: (admin: Admin, form: FormData) => Promise<string | void>) {
  return async (_prev: FormResult, form: FormData): Promise<FormResult> => {
    try {
      const admin = await requireAdmin();
      const ok = await run(admin, form);
      revalidatePath("/", "layout");
      return { ok: ok || "Salvo." };
    } catch (cause) {
      unstable_rethrow(cause);
      return { error: cause instanceof Error ? cause.message : "Não foi possível concluir a ação." };
    }
  };
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) => text(form, key) || null;
const uuid = (form: FormData, key: string) => {
  const value = text(form, key);
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error("Registro inválido.");
  return value;
};
function must<T>(result: { data: T; error: { message: string } | null }, message: string): NonNullable<T> {
  if (result.error) throw new Error(message);
  return result.data as NonNullable<T>;
}

export const updateLessonaraAccess = action(async ({ supabase, email }, form) => {
  const id = uuid(form, "id");
  const account = must(await supabase.from("accounts").select("external_id,platform_id").eq("id", id).single(), "Conta não encontrada.");
  const platform = must(await supabase.from("platforms").select("slug").eq("id", account.platform_id).single(), "Plataforma não encontrada.");
  if (platform.slug !== "lessonara") throw new Error("Esta conta não pertence ao Lessonara.");
  const change = parseAccessChange(form, account.external_id);
  const currentAccess = await readTeacherAccess(account.external_id);
  if (!currentAccess || change.plan !== currentAccess.platform_plan) throw new Error("Use Trocar plano para alterar a assinatura e o acesso.");
  await writeTeacherAccess(email, change);
  // The source transaction already recorded the authoritative audit. Local history is supplementary.
  const logged = await supabase.from("audit_log").insert({ actor: email, action: "lessonara.access.update", platform_id: account.platform_id, entity: "account", entity_id: id, data: { operation: change.operation, reason: change.reason, plan: change.plan, suspended: change.suspended } });
  return logged.error ? "Acesso aplicado e auditado no Lessonara. O histórico deste painel não pôde ser atualizado." : "Acesso aplicado e auditado no Lessonara.";
});

// ───────────── Contas ─────────────

export const updateAccount = action(async ({ supabase, email }, form) => {
  const id = uuid(form, "id");
  const status = text(form, "status");
  if (!["trial", "active", "suspended", "cancelled"].includes(status)) throw new Error("Status inválido.");
  const billingDay = Number(text(form, "billing_day"));
  if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 28) throw new Error("Dia de vencimento deve ser de 1 a 28.");
  const changes = { status, billing_day: billingDay, notes: optional(form, "notes") };
  const before = must(await supabase.from("accounts").select("platform_id,status,plan_id,price_override_cents,billing_day").eq("id", id).single(), "Conta não encontrada.");
  must(await supabase.from("accounts").update(changes).eq("id", id), "Não foi possível salvar a conta.");
  await audit(supabase, { actor: email, action: "account.update", platformId: before.platform_id, entity: "account", entityId: id, data: { before, after: changes } });
  return "Conta atualizada.";
});

export const createAccount = action(async ({ supabase, email }, form) => {
  const platformId = uuid(form, "platform_id");
  const name = text(form, "name");
  if (!name) throw new Error("Informe o nome.");
  const contactEmail = optional(form, "email")?.trim().toLowerCase() ?? null;
  if (contactEmail && (!/^\S+@\S+\.\S+$/.test(contactEmail) || contactEmail.length > 254)) throw new Error("Informe um email válido.");
  if (contactEmail) {
    const existing = must(await supabase.from("accounts").select("id").eq("platform_id", platformId).eq("email", contactEmail).maybeSingle(), "Não foi possível verificar o email.");
    if (existing) throw new Error("Já existe uma conta com este email nesta plataforma. Use a conta existente.");
  }
  const created = must(await supabase.from("accounts").insert({
    platform_id: platformId,
    external_id: optional(form, "external_id") ?? `manual-${crypto.randomUUID().slice(0, 8)}`,
    name,
    email: contactEmail,
    plan_id: optional(form, "plan_id"),
    status: "active",
  }).select("id").single(), "Não foi possível criar a conta. Confira se o email ou ID externo já está cadastrado nesta plataforma.");
  await audit(supabase, { actor: email, action: "account.create", platformId, entity: "account", entityId: created.id, data: { name } });
  return "Conta criada.";
});

export const syncPlatformAccounts = action(async ({ supabase, email }, form) => {
  const platformId = uuid(form, "platform_id");
  const platform = must(await supabase.from("platforms").select("slug,name").eq("id", platformId).single(), "Plataforma não encontrada.");
  const connector = connectorFor(platform.slug);
  if (!connector?.configured()) throw new Error(`Conector de ${platform.name} não configurado (ver .env.example).`);
  const external = await connector.listAccounts();
  const result = await syncAccounts(supabase, platformId, external);
  await audit(supabase, { actor: email, action: "accounts.sync", platformId, data: result });
  return `${result.upserted} contas sincronizadas${result.missing ? `, ${result.missing} não existem mais na origem` : ""}.`;
});

// ───────────── Cobranças ─────────────

export const generateCharges = action(async ({ supabase, email }, form) => {
  await runSubscriptionChanges(createServiceClient(), writeTeacherAccess);
  const period = toPeriod(text(form, "period"));
  const platformId = optional(form, "platform_id");
  let query = supabase.from("accounts").select("id,status,billing_day,price_override_cents,platform_id,plan:plans!accounts_plan_id_fkey(price_cents)").eq("status", "active");
  if (platformId) query = query.eq("platform_id", platformId);
  const accounts = must(await query, "Não foi possível carregar as contas.") as unknown as (BillableAccount & { platform_id: string })[];
  const pending = accounts.length ? await supabase.from("subscription_changes").select("account_id,new_price_cents,effective_on,status").in("account_id", accounts.map(a => a.id)).in("status", ["scheduled", "processing", "failed"]) : { data: [], error: null };
  if (pending.error) throw new Error("Não foi possível conferir as trocas agendadas.");
  const rows = buildCharges(accounts.map(account => {
    const change = pending.data?.find(c => c.account_id === account.id && c.effective_on <= `${period.slice(0, 8)}${String(account.billing_day).padStart(2, "0")}`);
    if (change && (change.effective_on <= todaySP() || change.status === "failed" || change.status === "processing")) throw new Error("Há uma troca pendente de aplicação. Revise a conta antes de gerar cobranças.");
    return change ? { ...account, price_override_cents: change.new_price_cents } : account;
  }), period);
  if (!rows.length) return "Nenhuma conta ativa com plano para cobrar.";
  const inserted = must(await supabase.from("charges").upsert(rows, { onConflict: "account_id,period", ignoreDuplicates: true }).select("id"), "Não foi possível gerar as cobranças.");
  await audit(supabase, { actor: email, action: "charges.generate", platformId, data: { period, created: inserted.length } });
  return inserted.length ? `${inserted.length} cobranças geradas.` : "Todas as cobranças do mês já existiam.";
});

export const settleCharge = action(async ({ supabase }, form) => {
  const id = uuid(form, "id");
  const method = text(form, "method");
  if (!["pix", "transfer", "card", "cash", "other"].includes(method)) throw new Error("Forma de pagamento inválida.");
  const paidOn = text(form, "paid_on") || todaySP();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) throw new Error("Data inválida.");
  const charge = must(await supabase.from("charges").select("amount_cents,status,account:accounts(platform_id)").eq("id", id).single(), "Cobrança não encontrada.") as unknown as { amount_cents: number; status: string; account: { platform_id: string } };
  if (charge.status === "paid") throw new Error("Essa cobrança já foi baixada.");
  const amount = text(form, "amount") ? parseMoney(text(form, "amount")) : charge.amount_cents;
  if (amount === null) throw new Error("Valor pago inválido.");
  const settled = await supabase.rpc("settle_platform_charge", { p_id: id, p_method: method, p_paid_on: paidOn, p_amount: amount, p_reference: optional(form, "reference") });
  if (settled.error) throw new Error("Não foi possível confirmar. Confira a data, o valor e se a cobrança já foi alterada.");
  return "Pagamento confirmado.";
});

export const setChargeStatus = action(async ({ supabase, email }, form) => {
  const id = uuid(form, "id");
  const status = text(form, "status");
  if (!["pending", "waived"].includes(status)) throw new Error("Status inválido.");
  const charge = must(await supabase.from("charges").select("status,account:accounts(platform_id)").eq("id", id).single(), "Cobrança não encontrada.") as unknown as { status: string; account: { platform_id: string } };
  must(await supabase.from("charges").update({ status, paid_at: null, paid_amount_cents: null, method: null, reference: null, settled_by: null }).eq("id", id), "Não foi possível alterar a cobrança.");
  await audit(supabase, { actor: email, action: status === "waived" ? "charge.waive" : "charge.reopen", platformId: charge.account.platform_id, entity: "charge", entityId: id, data: { from: charge.status } });
  return status === "waived" ? "Cobrança isenta." : "Cobrança reaberta.";
});

// ───────────── Planos ─────────────

export const savePlan = action(async ({ supabase, email }, form) => {
  const id = optional(form, "id");
  const code = text(form, "code").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_.-]{0,39}$/.test(code)) throw new Error("ID do plano: letras, números, - _ . (até 40).");
  const price = parseMoney(text(form, "price"));
  if (price === null || price > 9900000) throw new Error("Preço inválido (máximo R$ 99.000,00).");
  const platformId = id ? must(await supabase.from("plans").select("platform_id").eq("id", id).single(), "Plano não encontrado.").platform_id : uuid(form, "platform_id");
  const platform = must(await supabase.from("platforms").select("slug").eq("id", platformId).single(), "Plataforma não encontrada.");
  const featureTier = optional(form, "feature_tier");
  if (platform.slug === "lessonara" && !["essential", "plus", "pro"].includes(featureTier ?? "")) throw new Error("Selecione o acesso do plano no Lessonara.");
  if (text(form, "name").length > 100 || text(form, "notes").length > 2000) throw new Error("Nome ou observação muito longos.");
  const values = { feature_tier: platform.slug === "lessonara" ? featureTier : null, code, name: text(form, "name") || code, price_cents: price, active: form.get("active") !== "off", notes: optional(form, "notes") };
  if (id) {
    const plan = must(await supabase.from("plans").select("platform_id").eq("id", id).single(), "Plano não encontrado.");
    must(await supabase.from("plans").update(values).eq("id", id), "Não foi possível salvar (ID repetido nesta plataforma?).");
    await audit(supabase, { actor: email, action: "plan.update", platformId: plan.platform_id, entity: "plan", entityId: id, data: values });
    return "Plano salvo.";
  }
  const created = must(await supabase.from("plans").insert({ ...values, platform_id: platformId }).select("id").single(), "Não foi possível criar (ID repetido nesta plataforma?).");
  await audit(supabase, { actor: email, action: "plan.create", platformId, entity: "plan", entityId: created.id, data: values });
  return "Plano criado.";
});

// ───────────── Suporte ─────────────

export const replyTicket = action(async ({ supabase, email }, form) => {
  const id = uuid(form, "id");
  const body = text(form, "body");
  const kind = text(form, "kind") === "note" ? "note" : "outbound";
  if (!body) throw new Error("Escreva a mensagem.");
  const ticket = must(await supabase.from("support_tickets").select("from_email,subject,platform_id,platform:platforms(name,support_email)").eq("id", id).single(), "Ticket não encontrado.") as unknown as { from_email: string; subject: string; platform_id: string | null; platform: { name: string; support_email: string | null } | null };
  let messageId: string | null = null;
  if (kind === "outbound") {
    if (!emailConfigured()) throw new Error("RESEND_API_KEY não configurada: use nota interna ou responda pelo seu email.");
    const last = await supabase.from("support_messages").select("message_id").eq("ticket_id", id).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const replyTo = ticket.platform?.support_email ?? undefined;
    const from = process.env.SUPPORT_EMAIL_FROM || process.env.EMAIL_FROM;
    const subject = /^re:/i.test(ticket.subject) ? ticket.subject : `Re: ${ticket.subject}`;
    const headers = last.data?.message_id ? { "In-Reply-To": last.data.message_id, References: last.data.message_id } : undefined;
    const sentId = await sendEmail({ to: ticket.from_email, subject, text: body, from, replyTo, headers });
    messageId = `<${sentId}@resend>`;
  }
  must(await supabase.from("support_messages").insert({ ticket_id: id, direction: kind, author: email, body, message_id: messageId }), "Resposta enviada, mas não foi possível gravar no histórico.");
  if (kind === "outbound") must(await supabase.from("support_tickets").update({ status: "waiting", last_message_at: new Date().toISOString() }).eq("id", id), "Não foi possível atualizar o ticket.");
  await audit(supabase, { actor: email, action: kind === "note" ? "ticket.note" : "ticket.reply", platformId: ticket.platform_id, entity: "ticket", entityId: id });
  return kind === "note" ? "Nota adicionada." : "Resposta enviada.";
});

export const setTicket = action(async ({ supabase, email }, form) => {
  const id = uuid(form, "id");
  const changes: Record<string, unknown> = {};
  const status = optional(form, "status");
  if (status) {
    if (!["open", "waiting", "closed"].includes(status)) throw new Error("Status inválido.");
    changes.status = status;
  }
  if (form.has("platform_id")) changes.platform_id = optional(form, "platform_id");
  if (form.has("account_id")) changes.account_id = optional(form, "account_id");
  must(await supabase.from("support_tickets").update(changes).eq("id", id), "Não foi possível atualizar o ticket.");
  await audit(supabase, { actor: email, action: "ticket.update", entity: "ticket", entityId: id, data: changes });
  return "Ticket atualizado.";
});

// ───────────── Saúde ─────────────

export const checkNow = action(async ({ supabase }, form) => {
  const results = await runHealthChecks(supabase, optional(form, "platform_id"));
  const failing = results.filter((r) => !r.ok).length;
  return results.length ? `${results.length} verificações, ${failing} com falha.` : "Nenhum alvo ativo.";
});

export const saveTarget = action(async ({ supabase, email }, form) => {
  const id = optional(form, "id");
  const url = text(form, "url");
  try { if (!/^https?:$/.test(new URL(url).protocol)) throw 0; } catch { throw new Error("URL inválida (http/https)."); }
  const expect = Number(text(form, "expect_status") || 200);
  if (!Number.isInteger(expect) || expect < 100 || expect > 599) throw new Error("Status esperado inválido.");
  const values = { name: text(form, "name") || new URL(url).host, url, expect_status: expect, active: form.get("active") !== "off", platform_id: optional(form, "platform_id") };
  if (id) must(await supabase.from("health_targets").update(values).eq("id", id), "Não foi possível salvar o alvo.");
  else must(await supabase.from("health_targets").insert(values), "Não foi possível criar o alvo.");
  await audit(supabase, { actor: email, action: id ? "health_target.update" : "health_target.create", platformId: values.platform_id, entity: "health_target", entityId: id ?? undefined, data: values });
  return "Alvo salvo.";
});

export const deleteTarget = action(async ({ supabase, email }, form) => {
  const id = uuid(form, "id");
  must(await supabase.from("health_targets").delete().eq("id", id), "Não foi possível remover o alvo.");
  await audit(supabase, { actor: email, action: "health_target.delete", entity: "health_target", entityId: id });
  return "Alvo removido.";
});

// ───────────── Plataformas ─────────────

export const savePlatform = action(async ({ supabase, email }, form) => {
  const id = optional(form, "id");
  const slug = text(form, "slug").toLowerCase();
  if (!id && !/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug)) throw new Error("Slug: minúsculas, números e hífen.");
  const color = text(form, "color") || "#3e7163";
  const values = { name: text(form, "name"), url: optional(form, "url"), color, support_email: optional(form, "support_email")?.toLowerCase() ?? null, active: form.get("active") !== "off" };
  if (!values.name) throw new Error("Informe o nome.");
  if (id) must(await supabase.from("platforms").update(values).eq("id", id), "Não foi possível salvar a plataforma.");
  else must(await supabase.from("platforms").insert({ ...values, slug }), "Não foi possível criar (slug repetido ou reservado?).");
  await audit(supabase, { actor: email, action: id ? "platform.update" : "platform.create", platformId: id, entity: "platform", entityId: id ?? slug, data: values });
  if (!id) redirect(`/${slug}`);
  return "Plataforma salva.";
});


export const scheduleSubscriptionChange = action(async ({ supabase }, form) => {
  const id = uuid(form, "id");
  const target = uuid(form, "target_plan");
  const timing = text(form, "timing") || "renewal";
  if (!["now", "renewal"].includes(timing)) throw new Error("Escolha quando aplicar a troca.");
  const operation = uuid(form, "operation");
  const rawOverride = optional(form, "next_override");
  const override = rawOverride === null ? null : parseMoney(rawOverride);
  if (rawOverride !== null && (override === null || override > 9900000)) throw new Error("Valor personalizado inválido.");
  const account = must(await supabase.from("accounts").select("external_id,platform_id").eq("id", id).single(), "Conta não encontrada.");
  const platform = must(await supabase.from("platforms").select("slug").eq("id", account.platform_id).single(), "Plataforma não encontrada.");
  const access = platform.slug === "lessonara" ? await readTeacherAccess(account.external_id) : null;
  if (platform.slug === "lessonara" && !access) throw new Error("Conta não encontrada no Lessonara.");
  const ints = ["expected_current", "expected_new", "expected_day"].map(key => {
    const value = Number(text(form, key));
    if (!/^\d+$/.test(text(form, key)) || !Number.isSafeInteger(value)) throw new Error("Prévia inválida. Reabra a troca.");
    return value;
  });
  const result = await supabase.rpc("request_subscription_change", { p_account: id, p_plan: target, p_override: override, p_expected_current: ints[0], p_expected_new: ints[1], p_expected_day: ints[2], p_today: text(form, "quote_date"), p_operation: operation, p_source_revision: access?.access_revision ?? null, p_source_suspended: access?.access_suspended ?? null, p_timing: timing });
  if (result.error) throw new Error(result.error.code === "40001" ? "Os valores ou o ciclo mudaram. Atualize a página e revise novamente." : "Não foi possível registrar a troca. Confira se o plano está ativo e vinculado ao acesso, ou se já há uma troca pendente.");
  if (typeof result.data !== "string" || !/^[0-9a-f-]{36}$/i.test(result.data)) throw new Error("Não foi possível confirmar o registro da troca.");
  if (timing === "now") {
    const service = createServiceClient();
    try {
      await runSubscriptionChanges(service, writeTeacherAccess, result.data);
    } finally {
      revalidatePath("/", "layout");
    }
    const state = await service.from("subscription_changes").select("status").eq("id", result.data).eq("account_id", id).single();
    if (state.error || state.data?.status !== "applied") throw new Error("Troca registrada, mas a aplicação ainda está pendente. Confira o andamento na conta antes de tentar novamente.");
    return "Plano aplicado agora. Recarregue o Lessonara para atualizar os recursos. Vencimento e sessões foram mantidos; nenhuma cobrança ou reembolso foi criado.";
  }
  return "Troca agendada para a próxima renovação. Nenhum reembolso foi executado.";
});

export const cancelSubscriptionChange = action(async ({ supabase }, form) => {
  const result = await supabase.rpc("cancel_subscription_change", { p_id: uuid(form, "change_id") });
  if (result.error) throw new Error("Não foi possível cancelar. A aplicação pode já ter começado; confira o andamento e tente concluí-la.");
  return "Troca cancelada. O plano atual foi mantido.";
});

export const retrySubscriptionChange = action(async ({ supabase }, form) => {
  const changeId = uuid(form, "change_id");
  const retry = await supabase.rpc("retry_subscription_change", { p_id: changeId });
  if (retry.error) throw new Error("A troca ainda não venceu ou já está em processamento.");
  const result = await runSubscriptionChanges(createServiceClient(), writeTeacherAccess, changeId);
  return result.failed ? "Reprocessamento concluído com pendências. Confira o motivo na conta." : "Troca reprocessada. Confira o plano e o histórico.";
});

export const inviteLessonaraTeacher = action(
  async ({ supabase, email }, form) => {
    const { inviteTeacher } = await import("@/lib/teacher-invitations");
    const result = await inviteTeacher(supabase, email, {
      name: text(form, "name"),
      email: text(form, "email"),
      planId: optional(form, "plan_id") ?? undefined,
    });
    return result.trackingPending
      ? "Envio aceito pelo provedor. O registro do acompanhamento precisa ser revisado."
      : "Convite enviado. O destinatário escolherá a própria senha.";
  },
);
export const resendLessonaraInvitation = action(
  async ({ supabase, email }, form) => {
    const id = uuid(form, "account_id");
    const account = must(
      await supabase
        .from("accounts")
        .select("external_id,platform_id,name,email")
        .eq("id", id)
        .single(),
      "Conta não encontrada.",
    );
    const platform = must(
      await supabase
        .from("platforms")
        .select("slug")
        .eq("id", account.platform_id)
        .single(),
      "Plataforma não encontrada.",
    );
    if (platform.slug !== "lessonara" || !account.email)
      throw new Error("Esta conta não tem um email de professor do Lessonara.");
    const { inviteTeacher, invitationClient } =
      await import("@/lib/teacher-invitations");
    const source = invitationClient();
    const teacher = await source
      .from("teachers")
      .select("id,email")
      .eq("id", account.external_id)
      .maybeSingle();
    if (
      teacher.error ||
      !teacher.data ||
      teacher.data.email.toLowerCase() !== account.email.toLowerCase()
    )
      throw new Error(
        "O vínculo com o professor precisa ser sincronizado antes do reenvio.",
      );
    const result = await inviteTeacher(
      supabase,
      email,
      { name: account.name || "Professor(a)", email: account.email },
      source,
    );
    return result.trackingPending
      ? "Envio aceito. O acompanhamento precisa ser revisado."
      : "Link enviado. O destinatário poderá definir uma nova senha.";
  },
);
