import { expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lessonaraAccounts } from "./lessonara";

/** Fake do query builder do supabase-js com paginação por range. */
function fakeDb(tables: Record<string, unknown[]>) {
  return {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        order: () => chain,
        range: async (from: number, to: number) => ({ data: tables[table].slice(from, to + 1), error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

it("professores viram contas com contagem de alunos (paginando além de 1000)", async () => {
  const students = Array.from({ length: 1500 }, (_, i) => ({ teacher_id: i < 1200 ? "t1" : "t2", active: i % 3 !== 0 }));
  const accounts = await lessonaraAccounts(fakeDb({
    teachers: [
      { id: "t1", name: "Ana", email: "Ana@X.com", created_at: "2026-01-01T00:00:00Z" },
      { id: "t2", name: "", email: "b@x.com", created_at: "2026-02-01T00:00:00Z" },
      { id: "t3", name: "Sem alunos", email: "c@x.com", created_at: "2026-03-01T00:00:00Z" },
    ],
    students,
  }));
  expect(accounts).toEqual([
    { externalId: "t1", name: "Ana", email: "ana@x.com", createdAt: "2026-01-01T00:00:00Z", metrics: { students: 1200, active_students: 800 } },
    { externalId: "t2", name: "b@x.com", email: "b@x.com", createdAt: "2026-02-01T00:00:00Z", metrics: { students: 300, active_students: 200 } },
    { externalId: "t3", name: "Sem alunos", email: "c@x.com", createdAt: "2026-03-01T00:00:00Z", metrics: { students: 0, active_students: 0 } },
  ]);
});
