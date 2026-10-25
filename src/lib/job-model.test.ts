import { expect, it } from "vitest";
import {
  jobState,
  LESSONARA_JOBS,
  type JobSource,
  type JobRun,
} from "./job-model";
const now = Date.parse("2026-10-24T12:00:00Z");
const job = LESSONARA_JOBS.find((j) => j.key === "emails")!;
const source = (): JobSource => ({
  name: "Test",
  definitions: [job],
  runs: [],
  cron: [
    {
      name: job.cronName!,
      schedule: "*/5 * * * *",
      active: true,
      lastStart: null,
      lastEnd: null,
      schedulerStatus: null,
    },
  ],
  renewals: [],
  queues: [],
});
const run = (status: JobRun["status"], minutes = 1): JobRun => ({
  id: "r",
  job_key: "emails",
  status,
  started_at: new Date(now - minutes * 60000).toISOString(),
  finished_at:
    status === "running"
      ? null
      : new Date(now - minutes * 60000 + 1000).toISOString(),
  metrics: {},
  error_code: null,
});
it("não confunde disparo do agendador com conclusão do aplicativo", () => {
  expect(jobState(job, source(), now).label).toBe("Sem execução registrada");
});
it("identifica agendamento ausente ou pausado", () => {
  const s = source();
  s.cron = [];
  expect(jobState(job, s, now).label).toBe("Não cadastrado");
  s.cron = source().cron;
  s.cron[0].active = false;
  expect(jobState(job, s, now).label).toBe("Pausado");
});
it("detecta execução interrompida, falha e ausência de execução recente", () => {
  for (const [status, minutes, label] of [
    ["running", 3, "Execução interrompida"],
    ["failed", 1, "Falhou"],
    ["succeeded", 20, "Sem execução recente"],
  ] as const) {
    const s = source();
    s.runs = [run(status, minutes)];
    expect(jobState(job, s, now).label).toBe(label);
  }
});
it("consulta indisponível não aparece saudável", () => {
  const s = source();
  s.error = "Unavailable";
  expect(jobState(job, s, now).tone).toBe("bad");
});
it("janela de renovação sem concluir prevalece sobre chamada HTTP bem sucedida", () => {
  const s = source(),
    renewal = LESSONARA_JOBS.find((job) => job.key === "renewals")!;
  s.cron[0].name = renewal.cronName!;
  s.runs = [{ ...run("succeeded"), job_key: "renewals" }];
  s.renewals = [
    {
      scheduled_for: new Date(now - 60 * 60000).toISOString(),
      status: "pending",
      checked: 100,
      queued: 2,
      failures: 1,
      dispatches: 2,
      updated_at: new Date(now).toISOString(),
      completed_at: null,
    },
  ];
  expect(jobState(renewal, s, now).label).toBe("Janela sem conclusão");
});

it("backup tolera duração própria e detecta ausência diária sem depender do cron Supabase", () => {
  const backup = LESSONARA_JOBS.find((j) => j.key === "backup")!;
  const s = source();
  s.cron = [];
  s.runs = [{ ...run("running", 15), job_key: "backup" }];
  expect(jobState(backup, s, now).label).toBe("Em execução");
  s.runs = [{ ...run("running", 121), job_key: "backup" }];
  expect(jobState(backup, s, now).label).toBe("Execução interrompida");
  s.runs = [{ ...run("succeeded", 31 * 60), job_key: "backup" }];
  expect(jobState(backup, s, now).label).toBe("Sem execução recente");
  s.runs = [{ ...run("succeeded", 24 * 60), job_key: "backup" }];
  expect(jobState(backup, s, now).label).toBe("Concluído");
});
