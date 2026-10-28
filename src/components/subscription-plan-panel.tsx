"use client";
import { useState } from "react";
import Link from "next/link";
import type { AccountRow, PlanRow } from "@/lib/queries";
import { monthlyPrice } from "@/lib/billing";
import { date, money, parseMoney } from "@/lib/format";
import {
  subscriptionQuote,
  initialSubscriptionChoice,
  type SubscriptionChange,
} from "@/lib/subscriptions";
import {
  scheduleSubscriptionChange,
  cancelSubscriptionChange,
  retrySubscriptionChange,
} from "@/app/(shell)/actions";
import { Form } from "./form";
import { SubmitButton } from "./submit-button";
import { Icon } from "./icon";
import { Overlay } from "./overlay";

type Account = Pick<
  AccountRow,
  "id" | "plan_id" | "plan" | "price_override_cents" | "billing_day"
>;
function ChangeForm({
  account,
  plans,
  today,
  close,
}: {
  account: Account;
  plans: PlanRow[];
  today: string;
  close: () => void;
}) {
  const options = plans.filter((p) => p.active);
  const initial = initialSubscriptionChoice(
    plans,
    account.plan_id,
    account.price_override_cents,
  );
  const [target, setTarget] = useState(initial.target);
  const [override, setOverride] = useState(initial.override);
  const [timing, setTiming] = useState("renewal");
  const [operation] = useState(() => crypto.randomUUID());
  const nextPlan = options.find((p) => p.id === target);
  const nextPrice = override.trim()
    ? parseMoney(override)
    : (nextPlan?.price_cents ?? null);
  const oldPrice = monthlyPrice(account) ?? 0;
  const quote =
    nextPrice !== null && nextPrice <= 9900000
      ? subscriptionQuote(today, account.billing_day, oldPrice, nextPrice)
      : null;
  return (
    <Form action={scheduleSubscriptionChange} onSuccess={close}>
      <input type="hidden" name="id" value={account.id} />
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="expected_current" value={oldPrice} />
      <input type="hidden" name="expected_new" value={nextPrice ?? ""} />
      <input type="hidden" name="expected_day" value={account.billing_day} />
      <input type="hidden" name="quote_date" value={today} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="subscription-target">
            Novo plano
          </label>
          <select
            className="input"
            id="subscription-target"
            name="target_plan"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setOverride("");
            }}
            required
          >
            <option value="" disabled>
              Selecione um plano
            </option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {money(p.price_cents)}/mês
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="subscription-override">
            Valor personalizado (opcional)
          </label>
          <input
            className="input"
            id="subscription-override"
            name="next_override"
            inputMode="decimal"
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            placeholder="Usar preço do plano"
          />
        </div>
      </div>
      <fieldset className="mt-6">
        <legend className="label mb-3">Quando aplicar?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              value: "now",
              label: "Aplicar agora",
              description: "Atualiza o plano e os recursos após a confirmação.",
            },
            {
              value: "renewal",
              label: "Na próxima renovação",
              description: "Mantém o plano atual até o próximo vencimento.",
            },
          ].map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${timing === option.value ? "border-accent bg-accent/5" : "border-line"}`}
            >
              <input
                type="radio"
                className="mt-1 accent-accent"
                name="timing"
                value={option.value}
                checked={timing === option.value}
                onChange={(e) => setTiming(e.target.value)}
              />
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="mt-1 block text-xs text-muted">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {quote ? (
        <>
          <div className="mt-6 rounded-xl border border-line p-4">
            <p className="font-medium">
              {timing === "now"
                ? "Vigência imediata após a confirmação"
                : `Vigência em ${date(quote.effectiveOn)}`}
            </p>
            <p className="mt-1 text-sm text-muted">
              {timing === "now"
                ? `O vencimento segue em ${date(quote.effectiveOn)}. Não será necessário sair da conta; basta recarregar o Lessonara.`
                : "O plano atual segue até a próxima renovação."}{" "}
              Novo valor mensal: {money(quote.nextPrice)}.
            </p>
          </div>
          <h3 className="h2 mt-6 mb-2">Comparação proporcional de hoje</h3>
          <p className="mb-4 text-xs text-muted">
            Ciclo de {date(quote.cycleStart)} a {date(quote.effectiveOn)} ·{" "}
            {quote.totalDays} dias. {quote.usedDays} usados e{" "}
            {quote.remainingDays} restantes. O dia de hoje entra no período
            restante.
          </p>
          <div className="table-wrap rounded-xl border border-line">
            <table className="table">
              <thead>
                <tr>
                  <th>Comparação</th>
                  <th>Atual</th>
                  <th>Novo plano</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Mensalidade</td>
                  <td>{money(oldPrice)}</td>
                  <td>{money(quote.nextPrice)}</td>
                </tr>
                <tr>
                  <td>{quote.usedDays} dias usados</td>
                  <td>{money(quote.currentUsed)}</td>
                  <td>{money(quote.nextUsed)}</td>
                </tr>
                <tr>
                  <td>{quote.remainingDays} dias restantes</td>
                  <td>{money(quote.currentRemaining)}</td>
                  <td>{money(quote.nextRemaining)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 rounded-xl bg-sunken p-4">
            <p className="font-medium">
              {quote.difference < 0
                ? "Reembolso proporcional de referência se a troca fosse hoje"
                : "Diferença estimada se a troca fosse hoje"}
              : {money(Math.abs(quote.difference))}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Referência baseada na mensalidade cadastrada; confira o pagamento
              efetivo antes de decidir um ajuste ou reembolso manual. Nenhum
              reembolso, crédito ou cobrança extra é criado ao confirmar. A
              troca imediata mantém o vencimento atual. Cobranças já emitidas
              são preservadas e devem ser revisadas separadamente.
            </p>
          </div>
        </>
      ) : (
        <p role="alert" className="mt-4 text-bad">
          Informe um valor válido até R$ 99.000,00.
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn-ghost" onClick={close}>
          <Icon name="x" className="h-4 w-4" />
          Cancelar
        </button>
        <SubmitButton
          disabled={
            !quote ||
            !target ||
            (target === account.plan_id && nextPrice === oldPrice)
          }
        >
          <Icon
            name={timing === "now" ? "check" : "calendar"}
            className="h-4 w-4"
          />
          {timing === "now"
            ? "Confirmar e aplicar agora"
            : "Agendar na renovação"}
        </SubmitButton>
      </div>
    </Form>
  );
}
export function SubscriptionPlanPanel({
  account,
  plans,
  pending,
  today,
  slug,
}: {
  account: Account;
  plans: PlanRow[];
  pending: SubscriptionChange | null;
  today: string;
  slug: string;
}) {
  return (
    <div className="mb-6 rounded-xl border border-line p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Plano atual</p>
          <p className="mt-1 font-semibold">
            {account.plan?.name ?? "Sem plano comercial"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {monthlyPrice(account) !== null
              ? `${money(monthlyPrice(account))}/mês`
              : "Mensalidade ainda não definida"}
          </p>
        </div>
        {!pending && plans.some((p) => p.active) && (
          <Overlay
            title="Revisar troca de plano"
            description="Compare os valores proporcionais e escolha quando aplicar a troca."
            trigger={
              <>
                <Icon name="refresh" className="h-4 w-4" />
                Trocar plano
              </>
            }
          >
            {(close) => (
              <ChangeForm
                account={account}
                plans={plans}
                today={today}
                close={close}
              />
            )}
          </Overlay>
        )}
      </div>
      {!plans.some((p) => p.active) && (
        <p className="text-xs text-muted">
          Cadastre um plano ativo em{" "}
          <Link className="link" href={`/${slug}/plans`}>
            Planos
          </Link>{" "}
          para configurar uma assinatura.
        </p>
      )}
      {pending && (
        <div className="border-t border-line pt-4">
          <span
            className={`badge ${pending.status === "failed" || pending.last_error ? "badge-warn" : "badge-info"}`}
          >
            {pending.status === "processing"
              ? "Aplicando troca"
              : pending.status === "failed"
                ? "Revisão necessária"
                : pending.application_mode === "now"
                  ? "Aplicação imediata pendente"
                  : "Troca agendada"}
          </span>
          <p className="mt-3 text-sm font-medium">
            {pending.target_name} · {money(pending.new_price_cents)}/mês
          </p>
          <p className="mt-1 text-xs text-muted">
            A partir de {date(pending.effective_on)}
          </p>
          {pending.last_error && (
            <p className="mt-3 text-xs text-bad">
              {pending.last_error} · {pending.attempts} tentativa(s).
            </p>
          )}
          {pending.last_error &&
            pending.effective_on <= today &&
            pending.status !== "processing" && (
              <Form action={retrySubscriptionChange} className="mt-4">
                <input type="hidden" name="change_id" value={pending.id} />
                <SubmitButton>
                  <Icon name="refresh" className="h-4 w-4" />
                  Tentar aplicar novamente
                </SubmitButton>
              </Form>
            )}
          {pending.status !== "processing" &&
            pending.attempts === 0 &&
            !pending.execution_started && (
              <div className="mt-4">
                <Overlay
                  title="Cancelar troca pendente?"
                  description="A troca ainda não começou. A assinatura e o acesso atuais serão mantidos. Nenhum pagamento será alterado."
                  trigger={
                    <>
                      <Icon name="x" className="h-4 w-4" />
                      Cancelar troca
                    </>
                  }
                >
                  {(close) => (
                    <Form action={cancelSubscriptionChange} onSuccess={close}>
                      <input
                        type="hidden"
                        name="change_id"
                        value={pending.id}
                      />
                      <div className="dialog-actions">
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={close}
                        >
                          <Icon name="arrow" className="h-4 w-4 rotate-180" />
                          Voltar
                        </button>
                        <SubmitButton>
                          <Icon name="x" className="h-4 w-4" />
                          Cancelar troca
                        </SubmitButton>
                      </div>
                    </Form>
                  )}
                </Overlay>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
