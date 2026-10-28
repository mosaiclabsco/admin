"use client";
import { Overlay } from "./overlay";
import { useId } from "react";
import { settleCharge, setChargeStatus } from "@/app/(shell)/actions";
import { Form } from "./form";
import { SubmitButton } from "./submit-button";
import { Icon } from "./icon";
const methods = [
  ["pix", "Pix"],
  ["transfer", "Transferência"],
  ["card", "Cartão"],
  ["cash", "Dinheiro"],
  ["other", "Outro"],
];
export function ChargePaymentForm({
  charge,
  today,
  close,
}: {
  charge: { id: string; amount_cents: number };
  today: string;
  close: () => void;
}) {
  const id = useId();
  return (
    <Form action={settleCharge} onSuccess={close}>
      <input type="hidden" name="id" value={charge.id} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${id}-amount`}>
            Valor recebido (R$)
          </label>
          <input
            className="input"
            id={`${id}-amount`}
            name="amount"
            inputMode="decimal"
            required
            defaultValue={(charge.amount_cents / 100)
              .toFixed(2)
              .replace(".", ",")}
          />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-date`}>
            Pago em
          </label>
          <input
            className="input"
            id={`${id}-date`}
            type="date"
            name="paid_on"
            required
            max={today}
            defaultValue={today}
          />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-method`}>
            Forma de pagamento
          </label>
          <select
            className="input"
            id={`${id}-method`}
            name="method"
            defaultValue="pix"
            required
          >
            {methods.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${id}-reference`}>
            Referência (opcional)
          </label>
          <input
            className="input"
            id={`${id}-reference`}
            name="reference"
            placeholder="ID do Pix, nota…"
            maxLength={200}
          />
        </div>
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn-ghost" onClick={close}>
          <Icon name="x" />
          Cancelar
        </button>
        <SubmitButton pendingLabel="Confirmando…">
          <Icon name="check" />
          Confirmar pagamento
        </SubmitButton>
      </div>
    </Form>
  );
}
export function ChargeStatusForm({
  id,
  status,
  close,
}: {
  id: string;
  status: "pending" | "waived";
  close: () => void;
}) {
  return (
    <Form action={setChargeStatus} onSuccess={close}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <div className="dialog-actions">
        <button type="button" className="btn-ghost" onClick={close}>
          <Icon name="x" />
          Cancelar
        </button>
        <SubmitButton>
          <Icon name={status === "pending" ? "refresh" : "archive"} />
          {status === "pending" ? "Reabrir cobrança" : "Confirmar isenção"}
        </SubmitButton>
      </div>
    </Form>
  );
}

export function ChargeControls({
  charge,
  today,
}: {
  charge: { id: string; status: string; amount_cents: number };
  today: string;
}) {
  if (charge.status !== "pending")
    return (
      <Overlay
        title="Reabrir cobrança"
        description="A cobrança voltará a ficar em aberto. Isso não executa estorno nem movimenta dinheiro."
        trigger={
          <>
            <Icon name="refresh" />
            Reabrir
          </>
        }
        triggerClass="btn-xs"
      >
        {(close) => (
          <ChargeStatusForm id={charge.id} status="pending" close={close} />
        )}
      </Overlay>
    );
  return (
    <div className="charge-row-actions">
      <Overlay
        title="Registrar pagamento"
        description="Informe os dados do pagamento já recebido. Esta ação apenas registra a baixa da cobrança."
        trigger={
          <>
            <Icon name="check" />
            Dar baixa
          </>
        }
        triggerClass="btn-xs"
      >
        {(close) => (
          <ChargePaymentForm charge={charge} today={today} close={close} />
        )}
      </Overlay>
      <Overlay
        title="Isentar cobrança"
        description="Esta cobrança será marcada como isenta, sem registrar recebimento. O plano e as funcionalidades do professor permanecem os mesmos."
        trigger={
          <>
            <Icon name="archive" />
            Isentar
          </>
        }
        triggerClass="btn-xs"
      >
        {(close) => (
          <ChargeStatusForm id={charge.id} status="waived" close={close} />
        )}
      </Overlay>
    </div>
  );
}
