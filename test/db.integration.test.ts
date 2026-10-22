// Contra o Supabase local (pnpm db:start && pnpm db:reset): pnpm test:db
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ingestInboundEmail } from "@/lib/support";
import { listAccounts } from "@/lib/queries";
import { syncAccounts } from "@/lib/connectors";

const enabled = process.env.DB_INTEGRATION === "1";
if (enabled && !["127.0.0.1", "localhost"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) {
  throw new Error("DB integration fixtures are restricted to the local Supabase. Use the opt-in live connector check for cloud.");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = () => createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

async function userClient(email: string, admin: boolean) {
  const db = service();
  const password = randomUUID();
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  if (admin) await db.from("admins").insert({ user_id: created.data.user.id, email });
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return client;
}

describe.skipIf(!enabled)("banco local", () => {
  let adminDb: SupabaseClient;
  let outsiderDb: SupabaseClient;
  const anon = () => createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });

  beforeAll(async () => {
    const tag = randomUUID().slice(0, 8);
    adminDb = await userClient(`admin-${tag}@test.local`, true);
    outsiderDb = await userClient(`outsider-${tag}@test.local`, false);
  });

  it("account and plan embedding remains unambiguous with both foreign keys", async () => {
    const rows = await listAccounts(adminDb);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some(row => row.plan !== null)).toBe(true);
    expect(await listAccounts(outsiderDb)).toEqual([]);
  });

  it("RLS: admin lê, usuário autenticado sem allowlist e anônimo não", async () => {
    const asAdmin = await adminDb.from("accounts").select("id");
    expect(asAdmin.error).toBeNull();
    expect(asAdmin.data!.length).toBeGreaterThan(0);
    for (const table of ["accounts", "charges", "platforms", "support_tickets", "admins", "audit_log"]) {
      const asOutsider = await outsiderDb.from(table).select("*").limit(1);
      expect(asOutsider.data ?? [], table).toEqual([]);
    }
    const write = await outsiderDb.from("platforms").insert({ slug: "hack", name: "x" });
    expect(write.error).not.toBeNull();
    const asAnon = await anon().from("accounts").select("id");
    expect(asAnon.data ?? []).toEqual([]);
  });

  it("RLS: auditoria não pode ser editada nem apagada pelo painel", async () => {
    const inserted = await adminDb.from("audit_log").insert({ actor: "t", action: "test" }).select("id").single();
    expect(inserted.error).toBeNull();
    await adminDb.from("audit_log").update({ action: "forged" }).eq("id", inserted.data!.id);
    await adminDb.from("audit_log").delete().eq("id", inserted.data!.id);
    const row = await service().from("audit_log").select("action").eq("id", inserted.data!.id).single();
    expect(row.data!.action).toBe("test");
  });

  it("rate limit do login só via service role", async () => {
    const key = `test/${randomUUID()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await service().rpc("allow_auth_attempt", { p_key: key, p_limit: 3, p_seconds: 60 })).data);
    expect(results).toEqual([true, true, true, false]);
    const asAdmin = await adminDb.rpc("allow_auth_attempt", { p_key: key, p_limit: 3, p_seconds: 60 });
    expect(asAdmin.error).not.toBeNull();
  });

  it("cobrança: uma por conta/mês e baixa exige paid_at", async () => {
    const account = (await adminDb.from("accounts").select("id").eq("external_id", "t-001").single()).data!;
    const dup = await adminDb.from("charges").insert({ account_id: account.id, period: new Date().toISOString().slice(0, 8) + "01", amount_cents: 1, due_on: "2026-10-10" });
    expect(dup.error?.code).toBe("23505");
    const bad = await adminDb.from("charges").insert({ account_id: account.id, period: "2020-01-01", amount_cents: 1, due_on: "2020-01-10", status: "paid" });
    expect(bad.error?.code).toBe("23514");
  });

  it("email recebido: cria ticket na plataforma do destinatário, vincula conta e encadeia resposta", async () => {
    const db = service();
    const id = randomUUID();
    const first = await ingestInboundEmail(db, { from: "Rafael Lima <Rafael@exemplo.com>", to: ["lessonara@mosaic-labs.co"], subject: `Dúvida ${id}`, text: "Como exporto?", html: null, messageId: `<${id}@mail>` });
    const ticket = (await db.from("support_tickets").select("platform_id,account_id,from_name,platform:platforms(slug),account:accounts(external_id)").eq("id", first.ticketId).single()).data as unknown as { from_name: string; platform: { slug: string }; account: { external_id: string } };
    expect(ticket.platform.slug).toBe("lessonara");
    expect(ticket.account.external_id).toBe("t-002");
    expect(ticket.from_name).toBe("Rafael Lima");

    const again = await ingestInboundEmail(db, { from: "rafael@exemplo.com", to: ["lessonara@mosaic-labs.co"], subject: `Dúvida ${id}`, text: "dup", html: null, messageId: `<${id}@mail>` });
    expect(again).toEqual({ ticketId: first.ticketId, duplicate: true });

    await db.from("support_tickets").update({ status: "waiting" }).eq("id", first.ticketId);
    const reply = await ingestInboundEmail(db, { from: "rafael@exemplo.com", to: ["outro@x.com"], subject: `RE: Dúvida ${id}`, text: null, html: "<p>Valeu!</p>", messageId: `<${id}-2@mail>`, inReplyTo: `<${id}@mail>` });
    expect(reply.ticketId).toBe(first.ticketId);
    const after = await db.from("support_tickets").select("status").eq("id", first.ticketId).single();
    expect(after.data!.status).toBe("open");
    const messages = await db.from("support_messages").select("body").eq("ticket_id", first.ticketId).order("created_at");
    expect(messages.data!.map((m) => m.body)).toEqual(["Como exporto?", "Valeu!"]);

    const unknown = await ingestInboundEmail(db, { from: "novo@desconhecido.com", to: ["ninguem@x.com"], subject: "Oi", text: "?", html: null, messageId: `<${id}-3@mail>` });
    const orphan = await db.from("support_tickets").select("platform_id,account_id").eq("id", unknown.ticketId).single();
    expect(orphan.data).toEqual({ platform_id: null, account_id: null });
  });

  it("source ID survives email changes and keeps billing; duplicate and retarget are rejected", async () => {
    const db = service();
    const tag = randomUUID().slice(0, 8);
    const platform = (await db.from("platforms").insert({ slug: `identity-${tag}`, name: "Identity test" }).select("id").single()).data!;
    const source = { externalId: randomUUID(), name: "Teacher", email: "before@example.invalid", createdAt: null, metrics: {} };
    try {
      await syncAccounts(db, platform.id, [source]);
      const account = (await db.from("accounts").select("id").eq("platform_id", platform.id).eq("external_id", source.externalId).single()).data!;
      const plan = (await db.from("plans").insert({ platform_id: platform.id, code: "TEST", name: "Test", price_cents: 100 }).select("id").single()).data!;
      await db.from("accounts").update({ plan_id: plan.id, status: "trial" }).eq("id", account.id);
      const charge = await db.from("charges").insert({ account_id: account.id, period: "2026-01-01", due_on: "2026-01-10", amount_cents: 100 }).select("id").single();
      expect(charge.error).toBeNull();
      await syncAccounts(db, platform.id, [{ ...source, email: "after@example.invalid" }]);
      const changed = await db.from("accounts").select("id,email,plan_id,status").eq("platform_id", platform.id).eq("external_id", source.externalId).single();
      expect(changed.data).toEqual({ id: account.id, email: "after@example.invalid", plan_id: plan.id, status: "trial" });
      expect((await db.from("charges").select("account_id").eq("id", charge.data!.id).single()).data?.account_id).toBe(account.id);
      const duplicate = await db.from("accounts").insert({ platform_id: platform.id, external_id: source.externalId });
      expect(duplicate.error?.code).toBe("23505");
      const retarget = await adminDb.from("accounts").update({ external_id: randomUUID() }).eq("id", account.id);
      expect(retarget.error?.code).toBe("22023");
      const blank = await db.from("accounts").insert({ platform_id: platform.id, external_id: " " });
      expect(blank.error?.code).toBe("23514");
    } finally {
      await db.from("platforms").delete().eq("id", platform.id);
    }
  });

  it("sync: atualiza identidade, preserva plano/status e marca contas sumidas", async () => {
    const db = service();
    const platform = (await db.from("platforms").insert({ slug: `sync-${randomUUID().slice(0, 6)}`, name: "Sync" }).select("id").single()).data!;
    await syncAccounts(db, platform.id, [
      { externalId: "x1", name: "Um", email: "um@x.com", createdAt: null, metrics: { students: 1 } },
      { externalId: "x2", name: "Dois", email: "dois@x.com", createdAt: null, metrics: {} },
    ]);
    await db.from("accounts").update({ status: "suspended", billing_day: 20 }).eq("platform_id", platform.id).eq("external_id", "x1");
    const result = await syncAccounts(db, platform.id, [{ externalId: "x1", name: "Um Renomeado", email: "um@x.com", createdAt: null, metrics: { students: 5 } }]);
    expect(result).toEqual({ upserted: 1, missing: 1 });
    const rows = (await db.from("accounts").select("external_id,name,status,billing_day,metrics,source_missing").eq("platform_id", platform.id).order("external_id")).data;
    expect(rows).toEqual([
      { external_id: "x1", name: "Um Renomeado", status: "suspended", billing_day: 20, metrics: { students: 5 }, source_missing: false },
      { external_id: "x2", name: "Dois", status: "active", billing_day: 10, metrics: {}, source_missing: true },
    ]);
    await db.from("platforms").delete().eq("id", platform.id);
  });
});
