import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ claims: vi.fn(), rpc: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: m.claims }, rpc: m.rpc }),
}));
vi.mock("@/lib/jobs", () => ({ loadJobsSnapshot: m.load }));
import { GET } from "./route";
beforeEach(() => {
  vi.resetAllMocks();
  m.claims.mockResolvedValue({ data: { claims: { sub: "admin" } } });
  m.rpc.mockResolvedValue({ data: true, error: null });
  m.load.mockResolvedValue({ sources: [] });
});
it("nega anônimo sem ler conector remoto", async () => {
  m.claims.mockResolvedValue({ data: null });
  expect((await GET(new Request("https://example.com/api/jobs"))).status).toBe(
    401,
  );
  expect(m.load).not.toHaveBeenCalled();
});
it("nega usuário sem papel administrativo", async () => {
  m.rpc.mockResolvedValue({ data: false });
  expect((await GET(new Request("https://example.com/api/jobs"))).status).toBe(
    403,
  );
  expect(m.load).not.toHaveBeenCalled();
});
it("valida plataforma e nunca permite cache compartilhado", async () => {
  const response = await GET(
    new Request("https://example.com/api/jobs?platform=lessonara"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("private");
  expect(m.load).toHaveBeenCalledWith("lessonara");
  expect(
    (await GET(new Request("https://example.com/api/jobs?platform=../")))
      .status,
  ).toBe(400);
});
