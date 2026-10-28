import { beforeEach, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const m = vi.hoisted(() => ({
  mail: vi.fn(),
  rpc: vi.fn(),
  valid: true,
  audit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./teacher-invitations", () => ({
  invitationClient: () => ({ rpc: m.rpc }),
}));
vi.mock("./email", () => ({ sendEmail: m.mail }));
import {
  requestSupport,
  confirmSupport,
  supportCodeHash,
} from "./support-access";
const id = "00000000-0000-4000-8000-000000000001",
  teacher = "00000000-0000-4000-8000-000000000002",
  session = "00000000-0000-4000-8000-000000000003";
function db() {
  const chain = {
    select: () => chain,
    insert: m.audit,
    eq: vi.fn(() => chain),
    maybeSingle: async () => ({
      error: null,
      data: m.valid
        ? {
            external_id: teacher,
            platform_id: id,
            platform: { slug: "lessonara", active: true },
          }
        : null,
    }),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SECRET_KEY", "fixture-private-key");
  m.valid = true;
  m.rpc.mockResolvedValue({ data: true, error: null });
  m.mail.mockResolvedValue("delivery");
  m.audit.mockResolvedValue({ error: null });
});
it("sends the code only to the verified admin and binds the target and session", async () => {
  const challenge = await requestSupport(
    db(),
    "admin@example.test",
    session,
    id,
  );
  expect(m.mail).toHaveBeenCalledWith(
    expect.objectContaining({ to: "admin@example.test" }),
  );
  expect(m.mail.mock.calls[0][0].text).not.toContain("fixture-private-key");
  expect(m.rpc).toHaveBeenCalledWith(
    "request_support_challenge",
    expect.objectContaining({
      p_id: challenge,
      p_actor: "admin@example.test",
      p_admin_session: session,
      p_teacher: teacher,
      p_code_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }),
  );
});
it("returns only an opaque one-time fragment token after confirmation", async () => {
  const link = await confirmSupport(
    db(),
    "admin@example.test",
    session,
    id,
    id,
    "123456",
  );
  expect(link).toMatch(
    /^https:\/\/lessonara\.mosaic-labs\.co\/support\/access#token=[A-Za-z0-9_-]{43}$/,
  );
  expect(m.rpc).toHaveBeenCalledWith(
    "verify_support_challenge",
    expect.objectContaining({
      p_teacher: teacher,
      p_admin_session: session,
      p_code_hash: supportCodeHash(id, "123456"),
    }),
  );
  expect(link).not.toContain("123456");
  expect(m.mail).not.toHaveBeenCalled();
});
it("fails closed for unavailable account, provider failures and invalid code", async () => {
  m.valid = false;
  await expect(
    requestSupport(db(), "admin@example.test", session, id),
  ).rejects.toThrow();
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.mail).not.toHaveBeenCalled();
  m.valid = true;
  m.rpc.mockResolvedValue({ data: false, error: null });
  await expect(
    confirmSupport(db(), "admin@example.test", session, id, id, "123456"),
  ).rejects.toThrow(/inválido/);
  await expect(
    confirmSupport(db(), "admin@example.test", session, id, id, "123"),
  ).rejects.toThrow(/seis/);
});
