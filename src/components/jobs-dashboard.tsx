"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHead, Notice, Stat } from "./ui";
import { Icon } from "./icon";
import { Overlay } from "./overlay";
import { dateTime, relative } from "@/lib/format";
import { jobState, type JobsSnapshot } from "@/lib/job-model";
const metricLabels: Record<string, string> = {
  checked: "Verificados",
  queued: "Enfileirados",
  sent: "Aceitos pelo provedor",
  failed: "Falhas",
  pending: "Aguardando nova tentativa",
  cancelled: "Cancelados",
  done: "Lote concluído",
  busy: "Outra execução ativa",
  sessions: "Sessões expiradas removidas",
  codes: "Códigos expirados removidos",
  limits: "Janelas de limite removidas",
  removed: "Originais removidos",
  subscriptionsApplied: "Trocas aplicadas",
  subscriptionsFailed: "Trocas com falha",
  healthFailed: "Alvos fora do ar",
};
export function JobsDashboard({
  initial,
  platform,
}: {
  initial: JobsSnapshot;
  platform: string;
}) {
  const [snapshot, setSnapshot] = useState(initial),
    [automatic, setAutomatic] = useState(true),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (
      request.current ||
      document.visibilityState !== "visible" ||
      !navigator.onLine
    )
      return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    try {
      const response = await fetch(
        `/api/jobs?platform=${encodeURIComponent(platform)}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (
        response.redirected ||
        response.status === 401 ||
        response.status === 403
      ) {
        setAutomatic(false);
        throw new Error(
          "Sua sessão precisa ser renovada. Recarregue a página.",
        );
      }
      if (!response.ok)
        throw new Error(
          "Falha na atualização. Os dados abaixo são da última consulta.",
        );
      const value: JobsSnapshot = await response.json();
      if (!controller.signal.aborted) {
        setSnapshot(value);
        setError("");
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Falha na atualização.",
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  }, [platform]);
  useEffect(() => {
    if (!automatic) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
      request.current?.abort();
    };
    const visibility = () => {
      stop();
      if (document.visibilityState === "visible" && navigator.onLine) {
        void refresh();
        timer = setInterval(() => void refresh(), 30000);
      }
    };
    if (document.visibilityState === "visible" && navigator.onLine)
      timer = setInterval(() => void refresh(), 30000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", visibility);
    window.addEventListener("offline", visibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", visibility);
      window.removeEventListener("offline", visibility);
    };
  }, [automatic, refresh]);
  const all = snapshot.sources.flatMap((source) =>
    source.definitions.map((job) => ({
      source,
      job,
      state: jobState(job, source),
    })),
  );
  const queues = snapshot.sources.flatMap((s) => s.queues);
  const waiting = queues.reduce((n, q) => n + q.pending + q.working, 0),
    failures = queues.reduce((n, q) => n + q.failed, 0);
  return (
    <>
      <PageHead
        eyebrow="Operação"
        title="Jobs e filas"
        description="Agendamentos, execuções e trabalhos pendentes das plataformas."
      >
        <button
          className="btn-ghost"
          disabled={pending}
          onClick={() => void refresh()}
        >
          <Icon
            name="refresh"
            className={`h-4 w-4 ${pending ? "animate-spin" : ""}`}
          />
          {pending ? "Atualizando…" : "Atualizar"}
        </button>
      </PageHead>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>
          Atualizado {dateTime(snapshot.generatedAt)} ·{" "}
          {relative(snapshot.generatedAt)}
        </span>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={automatic}
            onChange={(e) => setAutomatic(e.target.checked)}
          />
          Atualizar a cada 30s enquanto esta aba estiver visível
        </label>
      </div>
      {error && <Notice tone="warn">{error}</Notice>}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Jobs acompanhados" value={all.length} />
        <Stat
          label="Pendentes ou em processamento"
          value={waiting}
          tone={waiting ? "warn" : undefined}
        />
        <Stat
          label="Itens com falha"
          value={failures}
          tone={failures ? "bad" : undefined}
        />
      </div>
      {snapshot.sources.map((source) => (
        <section key={source.name} className="card mb-6">
          <div className="border-b border-line px-6 py-4">
            <h2 className="h2">{source.name}</h2>
            {source.error && (
              <p className="mt-2 text-sm text-bad">{source.error}</p>
            )}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Frequência</th>
                  <th>Situação</th>
                  <th>Última execução</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {source.definitions.map((job) => {
                  const state = jobState(job, source),
                    history = source.runs.filter((r) => r.job_key === job.key),
                    last = history[0],
                    cron = source.cron.find((c) => c.name === job.cronName);
                  return (
                    <tr key={job.key}>
                      <td>
                        <span className="font-medium">{job.name}</span>
                        <p className="mt-1 max-w-sm text-xs text-muted">
                          {job.description}
                        </p>
                      </td>
                      <td className="text-xs">
                        {job.schedule}
                        {cron && (
                          <span className="mt-1 block font-mono text-muted">
                            {cron.schedule} · UTC
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`badge badge-${state.tone}`}>
                          {state.label}
                        </span>
                      </td>
                      <td className="tabular whitespace-nowrap text-xs">
                        {dateTime(last?.started_at)}
                        {last?.finished_at && (
                          <span className="mt-1 block text-muted">
                            {Math.max(
                              0,
                              Math.round(
                                (Date.parse(last.finished_at) -
                                  Date.parse(last.started_at)) /
                                  1000,
                              ),
                            )}
                            s de duração
                          </span>
                        )}
                      </td>
                      <td>
                        <Overlay
                          title={job.name}
                          description="Execuções registradas pelo aplicativo. O agendador disparar não significa que o trabalho foi concluído."
                          variant="drawer"
                          trigger={
                            <>
                              <Icon name="list" className="h-4 w-4" />
                              Histórico
                            </>
                          }
                        >
                          {() => (
                            <div className="space-y-4">
                              {!history.length && (
                                <p className="text-sm text-muted">
                                  Nenhuma execução registrada desde a ativação
                                  do monitoramento.
                                </p>
                              )}
                              {history.map((run) => (
                                <article
                                  key={run.id}
                                  className="rounded-xl border border-line p-4"
                                >
                                  <div className="flex justify-between gap-3">
                                    <span className="text-xs">
                                      {dateTime(run.started_at)}
                                    </span>
                                    <span
                                      className={`badge badge-${run.status === "failed" ? "bad" : run.status === "running" ? "info" : "ok"}`}
                                    >
                                      {run.status === "failed"
                                        ? "Falhou"
                                        : run.status === "running"
                                          ? "Em execução"
                                          : run.status === "skipped"
                                            ? "Sem trabalho"
                                            : "Concluído"}
                                    </span>
                                  </div>
                                  {run.error_code && (
                                    <p className="mt-3 text-sm text-bad">
                                      {run.error_code === "lease_expired"
                                        ? "A execução não confirmou conclusão dentro do prazo."
                                        : "O processamento registrou uma falha."}
                                    </p>
                                  )}
                                  <dl className="mt-3 space-y-2">
                                    {Object.entries(run.metrics).map(
                                      ([key, value]) => (
                                        <div
                                          key={key}
                                          className="flex justify-between gap-4 text-sm"
                                        >
                                          <dt className="text-muted">
                                            {metricLabels[key] ?? key}
                                          </dt>
                                          <dd className="tabular">
                                            {typeof value === "boolean"
                                              ? value
                                                ? "Sim"
                                                : "Não"
                                              : value}
                                          </dd>
                                        </div>
                                      ),
                                    )}
                                  </dl>
                                </article>
                              ))}
                            </div>
                          )}
                        </Overlay>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {source.queues.length > 0 && (
            <div className="border-t border-line p-6">
              <h3 className="h2 mb-4">Filas</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {source.queues.map((queue) => (
                  <article
                    key={queue.key}
                    className="rounded-xl border border-line p-4"
                  >
                    <h4 className="font-medium">
                      {queue.key === "emails" ? "Emails" : "Google Calendar"}
                    </h4>
                    <p className="mt-2 text-sm">
                      {queue.pending} aguardando · {queue.working} em
                      processamento
                    </p>
                    <p
                      className={`mt-2 text-sm ${queue.failed ? "text-bad" : "text-muted"}`}
                    >
                      {queue.failed} com falha · {queue.exhausted} com
                      tentativas esgotadas
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Pendência mais antiga:{" "}
                      {queue.oldestPendingAt
                        ? `${dateTime(queue.oldestPendingAt)} (${relative(queue.oldestPendingAt)})`
                        : "nenhuma"}
                    </p>
                    {queue.key === "emails" && (
                      <p className="mt-2 text-xs text-muted">
                        {queue.deliveryFailures} falhas de entrega conhecidas.
                        Aceite do provedor não comprova entrega.
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
          {source.renewals.length > 0 && (
            <div className="border-t border-line p-6">
              <h3 className="h2 mb-3">Janelas de renovação</h3>
              <div className="space-y-2">
                {source.renewals.slice(0, 4).map((run) => (
                  <div
                    key={run.scheduled_for}
                    className="flex flex-wrap justify-between gap-2 text-sm"
                  >
                    <span>{dateTime(run.scheduled_for)}</span>
                    <span className="text-muted">
                      {run.status === "completed"
                        ? "Concluída"
                        : run.status === "failed"
                          ? "Falhou"
                          : run.status === "running"
                            ? "Em execução"
                            : "Pendente"}{" "}
                      · {run.checked} alunos verificados · {run.queued} avisos
                      preparados
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {source.cron.length > 0 && (
            <div className="border-t border-line p-6">
              <h3 className="h2 mb-3">Agendamentos cadastrados no Supabase</h3>
              <div className="space-y-2">
                {source.cron.map((cron) => (
                  <div
                    key={cron.name}
                    className="flex flex-wrap justify-between gap-2 text-xs"
                  >
                    <span>{cron.name}</span>
                    <span className="font-mono text-muted">
                      {cron.schedule} UTC · {cron.active ? "ativo" : "pausado"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted">
                A retomada confere pendências a cada cinco minutos; só chama o
                aplicativo se uma janela ficou sem concluir. A limpeza não
                remove aulas, pagamentos ou histórico.
              </p>
            </div>
          )}
        </section>
      ))}
      <p className="text-xs text-muted">
        A consulta é somente de leitura. Atualizar esta tela não executa jobs
        nem reenvia emails. Os jobs continuam no servidor mesmo com o admin
        fechado.
      </p>
    </>
  );
}
