import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const m = vi.hoisted(() => ({
  mail: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  generate: vi.fn(),
  record: vi.fn(),
  limit: vi.fn(),
  authorized: true,
  conflictingAccount: false,
  existing: true,
  profile: true,
  planError: false,
  accountError: false,
  upserts: [] as unknown[],
  audits: [] as unknown[],
  filters: [] as unknown[],
  source: {} as unknown,
}));
vi.mock("server-only", () => ({}));
vi.mock("./email", () => ({ sendEmail: m.mail }));
vi.mock("./management", () => ({
  readTeacherAccess: m.read,
  writeTeacherAccess: m.write,
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => m.source }));
import {
  inviteTeacher,
  accessEmail,
  teacherInvitationStatus,
} from "./teacher-invitations";
const uid = "00000000-0000-4000-8000-000000000001";
const actor = "admin@example.test";
const input = { name: "Professora Teste", email: " TEACHER@example.test " };
function fakeDb() {
  return {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          m.filters.push([table, key, value]);
          return chain;
        },
        maybeSingle: async () => ({
          data:
            table === "admins"
              ? m.authorized
                ? { user_id: "admin-id" }
                : null
              : table === "accounts" && m.conflictingAccount ? {id:"account-id",external_id:"another-teacher"} : null,
          error: null,
        }),
        single: async () => ({
          data:
            table === "platforms"
              ? { id: "platform-id" }
              : table === "plans"
                ? { id: "plan-id", feature_tier: "pro" }
                : { id: "account-id" },
          error: table === "plans" && m.planError ? {} : null,
        }),
        upsert: async (...args: unknown[]) => {
          m.upserts.push(args);
          return { error: m.accountError ? {} : null };
        },
        insert: async (value: unknown) => {
          m.audits.push(value);
          return { error: null };
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}
function sourceDb() {
  return {
    from: () => {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return chain;
        },
        maybeSingle: async () => ({
          data: filters.id
            ? m.profile
              ? { id: uid, email: "teacher@example.test" }
              : null
            : m.existing
              ? { id: uid, email: "teacher@example.test", name: "Nome atual" }
              : null,
          error: null,
        }),
      };
      return chain;
    },
    rpc: m.limit,
    auth: {
      admin: {
        generateLink: m.generate,
        updateUserById: m.record,
        getUserById: async () => ({
          data: {
            user: {
              app_metadata: {
                teacher_access_sent_at: "2026-10-26T00:00:00Z",
                teacher_password_defined_at: "2026-10-26T00:10:00Z",
              },
            },
          },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.conflictingAccount = false;
  m.authorized = true;
  m.existing = true;
  m.profile = true;
  m.planError = false;
  m.accountError = false;
  m.upserts = [];
  m.audits = [];
  m.filters = [];
  m.mail.mockResolvedValue("message-id");
  m.generate.mockResolvedValue({
    data: {
      user: { id: uid, app_metadata: {} },
      properties: { hashed_token: "a".repeat(64) },
    },
    error: null,
  });
  m.record.mockResolvedValue({ error: null });
  m.limit.mockResolvedValue({ data: true, error: null });
  m.read.mockResolvedValue({
    platform_plan: "essential",
    access_suspended: false,
    access_revision: 0,
  });
  m.write.mockResolvedValue({});
  m.source = sourceDb();
  process.env.LESSONARA_SUPABASE_URL = "https://example.supabase.co";
  process.env.LESSONARA_SUPABASE_SECRET_KEY = "fake-key";
});
it("exige administrador antes de gerar links ou enviar emails", async () => {
  m.authorized = false;
  await expect(
    inviteTeacher(fakeDb(), actor, input, sourceDb()),
  ).rejects.toThrow("administrativa");
  expect(m.generate).not.toHaveBeenCalled();
  expect(m.mail).not.toHaveBeenCalled();
});
it("conta existente recebe recuperação sem alteração do plano ou cobrança", async () => {
  const result = await inviteTeacher(fakeDb(), actor, input, sourceDb());
  expect(result.teacherId).toBe(uid);
  expect(m.generate).toHaveBeenCalledWith({
    type: "recovery",
    email: "teacher@example.test",
  });
  expect(m.write).not.toHaveBeenCalled();
  expect(m.upserts[0]).toEqual([
    expect.objectContaining({ external_id: uid, status: "trial" }),
    { onConflict: "platform_id,external_id", ignoreDuplicates: true },
  ]);
  expect(m.mail.mock.calls[0][0].html).toContain("/login/password#token_hash=");
  expect(m.mail.mock.calls[0][0].text).not.toContain("password=");
  expect(JSON.stringify(result)).not.toContain("a".repeat(64));
  expect(JSON.stringify(m.audits)).not.toContain("a".repeat(64));
});
it("nova conta usa convite sem senha provisória e aplica tier autoritativo do plano", async () => {
  m.existing = false;
  await inviteTeacher(
    fakeDb(),
    actor,
    { ...input, planId: "plan-id" },
    sourceDb(),
  );
  expect(m.generate).toHaveBeenCalledWith({
    type: "invite",
    email: "teacher@example.test",
    options: { data: { name: input.name } },
  });
  expect(m.write).toHaveBeenCalledWith(
    actor,
    expect.objectContaining({ teacherId: uid, plan: "pro", suspended: false }),
  );
  expect(m.filters).toContainEqual(["plans", "platform_id", "platform-id"]);
});
it("plano de outra plataforma e troca implícita em conta existente são recusados", async () => {
  m.planError = true;
  await expect(
    inviteTeacher(fakeDb(), actor, { ...input, planId: "foreign" }, sourceDb()),
  ).rejects.toThrow("plano ativo");
  expect(m.generate).not.toHaveBeenCalled();
  m.planError = false;
  await expect(
    inviteTeacher(fakeDb(), actor, { ...input, planId: "plan-id" }, sourceDb()),
  ).rejects.toThrow("outro plano");
  expect(m.write).not.toHaveBeenCalled();
});
it("rate limit evita gerar outro token e invalidar email anterior imediatamente", async () => {
  m.limit.mockResolvedValue({ data: false, error: null });
  await expect(
    inviteTeacher(fakeDb(), actor, input, sourceDb()),
  ).rejects.toThrow("minuto");
  expect(m.generate).not.toHaveBeenCalled();
});
it("falha na associação ou ausência de teacher impede envio", async () => {
  m.profile = false;
  await expect(
    inviteTeacher(fakeDb(), actor, input, sourceDb()),
  ).rejects.toThrow("confirmado");
  expect(m.mail).not.toHaveBeenCalled();
  m.profile = true;
  m.accountError = true;
  await expect(
    inviteTeacher(fakeDb(), actor, input, sourceDb()),
  ).rejects.toThrow("vincular");
  expect(m.mail).not.toHaveBeenCalled();
});
it("vínculo divergente do usuário gerado impede acesso de outro destinatário", async () => {
  m.generate.mockResolvedValue({
    data: {
      user: { id: "other", app_metadata: {} },
      properties: { hashed_token: "a".repeat(64) },
    },
    error: null,
  });
  await expect(
    inviteTeacher(fakeDb(), actor, input, sourceDb()),
  ).rejects.toThrow("vínculo");
  expect(m.mail).not.toHaveBeenCalled();
});
it("não declara falha do envio quando apenas o acompanhamento falhou", async () => {
  m.record.mockResolvedValue({ error: {} });
  expect(
    await inviteTeacher(fakeDb(), actor, input, sourceDb()),
  ).toHaveProperty("trackingPending", true);
  expect(m.mail).toHaveBeenCalledTimes(1);
});
it("status é lido apenas para um vínculo UUID e textos do email são escapados", async () => {
  expect(await teacherInvitationStatus("manual-unlinked")).toBeNull();
  expect(await teacherInvitationStatus(uid)).toHaveProperty(
    "passwordDefinedAt",
    "2026-10-26T00:10:00Z",
  );
  expect(
    accessEmail(
      "<img src=x>",
      "https://example.test/#x",
      "invite" as unknown as boolean,
    ).html,
  ).not.toContain("<img src=x>");
});

it("não cria acesso paralelo quando o email já pertence a uma conta comercial sem o vínculo correto",async()=>{
 m.conflictingAccount=true;
 await expect(inviteTeacher(fakeDb(),actor,input,sourceDb())).rejects.toThrow("Já existe uma conta comercial");
 expect(m.generate).not.toHaveBeenCalled();
 expect(m.mail).not.toHaveBeenCalled();
});
