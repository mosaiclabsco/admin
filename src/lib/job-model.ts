export type JobRun = {
  id: string;
  job_key: string;
  status: "running" | "succeeded" | "failed" | "skipped";
  started_at: string;
  finished_at: string | null;
  metrics: Record<string, number | boolean>;
  error_code: string | null;
};
export type CronJob = {
  name: string;
  schedule: string;
  active: boolean;
  lastStart: string | null;
  lastEnd: string | null;
  schedulerStatus: string | null;
};
export type RenewalRun = {
  scheduled_for: string;
  status: string;
  checked: number;
  queued: number;
  failures: number;
  dispatches: number;
  updated_at: string;
  completed_at: string | null;
};
export type Queue = {
  key: string;
  pending: number;
  working: number;
  failed: number;
  exhausted: number;
  oldestPendingAt: string | null;
  deliveryFailures: number;
};
export type JobDefinition = {
  key: string;
  name: string;
  description: string;
  schedule: string;
  cronName?: string;
  maxGapMinutes: number;
};
export const LESSONARA_JOBS: JobDefinition[] = [
  {
    key: "lesson-reminders",
    name: "Lembretes de aula",
    description:
      "Prepara lembretes Pro até uma hora antes, respeitando preferências e a agenda atual.",
    schedule: "A cada 5 minutos",
    cronName: "lessonara-lessons",
    maxGapMinutes: 15,
  },
  {
    key: "renewals",
    name: "Avisos de renovação",
    description:
      "Confere saldo pelo histórico de aulas e prepara avisos para Plus e Pro.",
    schedule: "08h e 18h · Brasília",
    cronName: "lessonara-reminders",
    maxGapMinutes: 26 * 60,
  },
  {
    key: "emails",
    name: "Envio de emails",
    description:
      "Envia a fila com deduplicação, prazo e limite de cinco tentativas.",
    schedule: "A cada 5 minutos",
    cronName: "lessonara-emails",
    maxGapMinutes: 15,
  },
  {
    key: "calendar",
    name: "Sincronização Google",
    description:
      "Processa criações, alterações e exclusões pendentes no calendário.",
    schedule: "A cada 5 minutos e após ações",
    cronName: "lessonara-calendar",
    maxGapMinutes: 15,
  },
  {
    key: "cleanup",
    name: "Limpeza de registros expirados",
    description:
      "Remove sessões/códigos expirados e originais de importações encerradas.",
    schedule: "03h · Brasília",
    cronName: "lessonara-cleanup",
    maxGapMinutes: 30 * 60,
  },
];
export const ADMIN_JOB: JobDefinition = {
  key: "admin-health",
  name: "Saúde e trocas de assinatura",
  description:
    "Verifica alvos HTTP e aplica mudanças de plano previstas para a renovação.",
  schedule: "09h · Brasília (definido no deploy)",
  maxGapMinutes: 30 * 60,
};
export type JobSource = {
  name: string;
  definitions: JobDefinition[];
  runs: JobRun[];
  cron: CronJob[];
  renewals: RenewalRun[];
  queues: Queue[];
  error?: string;
};
export type JobsSnapshot = { generatedAt: string; sources: JobSource[] };
export function jobState(
  job: JobDefinition,
  source: JobSource,
  now = Date.now(),
): { label: string; tone: "ok" | "bad" | "warn" | "info" | "muted" } {
  if (source.error) return { label: "Consulta indisponível", tone: "bad" };
  if (job.cronName) {
    const cron = source.cron.find((c) => c.name === job.cronName);
    if (!cron) return { label: "Não cadastrado", tone: "warn" };
    if (!cron.active) return { label: "Pausado", tone: "muted" };
    if (cron.schedulerStatus === "failed")
      return { label: "Falha no agendador", tone: "bad" };
  }
  const latest = source.runs.find((r) => r.job_key === job.key);
  if (job.key === "renewals") {
    const day = new Date(now).toISOString().slice(0, 10);
    const morning = Date.parse(`${day}T11:00:00Z`),
      evening = Date.parse(`${day}T21:00:00Z`);
    const expected =
      now >= evening ? evening : now >= morning ? morning : evening - 86400000;
    if (
      now - expected > 20 * 60000 &&
      !source.renewals.some((r) => Date.parse(r.scheduled_for) === expected)
    )
      return { label: "Janela não iniciada", tone: "warn" };
    const due = source.renewals.find((r) => Date.parse(r.scheduled_for) <= now);
    if (due?.status === "failed")
      return { label: "Janela com falha", tone: "bad" };
    if (
      due &&
      due.status !== "completed" &&
      now - Date.parse(due.scheduled_for) > 20 * 60000
    )
      return { label: "Janela sem conclusão", tone: "warn" };
  }
  if (!latest) return { label: "Sem execução registrada", tone: "muted" };
  if (latest.status === "running")
    return now - Date.parse(latest.started_at) > 120000
      ? { label: "Execução interrompida", tone: "bad" }
      : { label: "Em execução", tone: "info" };
  if (latest.status === "failed") return { label: "Falhou", tone: "bad" };
  if (
    now - Date.parse(latest.finished_at ?? latest.started_at) >
    job.maxGapMinutes * 60000
  )
    return { label: "Sem execução recente", tone: "warn" };
  return {
    label:
      latest.status === "skipped" ? "Sem trabalho nesta chamada" : "Concluído",
    tone: "ok",
  };
}
