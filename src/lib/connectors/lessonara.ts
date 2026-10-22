import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Connector, ExternalAccount } from "./types";

const PAGE = 1000;

async function readAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(`Lessonara: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Professores do Lessonara = contas. Lê teachers + contagem de alunos (somente select). */
export async function lessonaraAccounts(db: SupabaseClient): Promise<ExternalAccount[]> {
  const teachers = await readAll<{ id: string; name: string; email: string; created_at: string }>((from, to) =>
    db.from("teachers").select("id,name,email,created_at").order("created_at").range(from, to));
  const students = await readAll<{ teacher_id: string; active: boolean }>((from, to) =>
    db.from("students").select("teacher_id,active").order("id").range(from, to));
  const counts = new Map<string, { students: number; active_students: number }>();
  for (const s of students) {
    const c = counts.get(s.teacher_id) ?? { students: 0, active_students: 0 };
    c.students++;
    if (s.active) c.active_students++;
    counts.set(s.teacher_id, c);
  }
  return teachers.map((t) => ({
    externalId: t.id,
    name: t.name || t.email,
    email: t.email?.toLowerCase() ?? null,
    createdAt: t.created_at,
    metrics: counts.get(t.id) ?? { students: 0, active_students: 0 },
  }));
}

export const lessonara: Connector = {
  description: "Supabase do Lessonara (teachers + students), somente leitura",
  configured: () => Boolean(process.env.LESSONARA_SUPABASE_URL && process.env.LESSONARA_SUPABASE_SECRET_KEY),
  async listAccounts() {
    const db = createClient(process.env.LESSONARA_SUPABASE_URL!, process.env.LESSONARA_SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return lessonaraAccounts(db);
  },
};
