import "server-only";
import { createClient as remoteClient } from "@supabase/supabase-js";
import { createServiceClient } from "./supabase/server";
import { resolveScope } from "./platforms";
import {
  ADMIN_JOB,
  LESSONARA_JOBS,
  type JobSource,
  type JobsSnapshot,
} from "./job-model";
export async function loadJobsSnapshot(slug: string): Promise<JobsSnapshot> {
  const scope = await resolveScope(slug);
  const sources: JobSource[] = [];
  const db = createServiceClient();
  const own = await db.rpc("admin_jobs_snapshot");
  sources.push({
    name: "Mosaic Labs Admin",
    definitions: [ADMIN_JOB],
    runs: own.data?.runs ?? [],
    cron: [],
    renewals: [],
    queues: [],
    ...(own.error
      ? { error: "Não foi possível consultar os jobs do admin." }
      : {}),
  });
  if (!scope.platform || scope.platform.slug === "lessonara") {
    const url = process.env.LESSONARA_SUPABASE_URL,
      key = process.env.LESSONARA_SUPABASE_SECRET_KEY;
    if (!url || !key)
      sources.push({
        name: "Lessonara",
        definitions: LESSONARA_JOBS,
        runs: [],
        cron: [],
        renewals: [],
        queues: [],
        error: "Conector Lessonara não configurado.",
      });
    else {
      const remote = remoteClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const result = await remote.rpc("worker_operations_snapshot");
      sources.push({
        name: "Lessonara",
        definitions: LESSONARA_JOBS,
        runs: result.data?.runs ?? [],
        cron: result.data?.cron ?? [],
        renewals: result.data?.renewals ?? [],
        queues: result.data?.queues ?? [],
        ...(result.error
          ? { error: "Não foi possível consultar os jobs do Lessonara." }
          : {}),
      });
    }
  }
  return { generatedAt: new Date().toISOString(), sources };
}
