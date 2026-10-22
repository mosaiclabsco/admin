import { Icon } from "./icon";
import { Form } from "./form";
import { SubmitButton } from "./submit-button";
import { settleCharge, setChargeStatus } from "@/app/(shell)/actions";
import { todaySP } from "@/lib/billing";

const METHODS = [["pix", "Pix"], ["transfer", "Transferência"], ["card", "Cartão"], ["cash", "Dinheiro"], ["other", "Outro"]] as const;
export const methodLabel = (m: string | null) => METHODS.find(([v]) => v === m)?.[1] ?? "—";

/** Ações de uma cobrança: dar baixa (com valor/data/método), isentar ou reabrir. */
export function ChargeActions({ charge }: { charge: { id: string; status: string; amount_cents: number } }) {
  if (charge.status !== "pending") {
    return (
      <Form action={setChargeStatus} className="flex justify-end">
        <input type="hidden" name="id" value={charge.id} />
        <input type="hidden" name="status" value="pending" />
        <SubmitButton className="btn-xs" pendingLabel="…"><Icon name="refresh" className="h-4 w-4" />Reabrir</SubmitButton>
      </Form>
    );
  }
  return (
    <details className="inline-form">
      <summary className="flex justify-end"><span className="btn-xs border-accent/40 text-accent"><Icon name="check" className="h-4 w-4" />Dar baixa</span></summary>
      <div className="flex flex-col items-end gap-2">
        <Form action={settleCharge} className="flex flex-wrap items-end justify-end gap-2">
          <input type="hidden" name="id" value={charge.id} />
          <label className="text-xs text-muted">Valor<input className="input mt-1 w-24 py-1" name="amount" defaultValue={(charge.amount_cents / 100).toFixed(2).replace(".", ",")} /></label>
          <label className="text-xs text-muted">Data<input className="input mt-1 w-36 py-1" type="date" name="paid_on" defaultValue={todaySP()} /></label>
          <label className="text-xs text-muted">Forma<select className="input mt-1 w-32 py-1" name="method" defaultValue="pix">{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-xs text-muted">Referência<input className="input mt-1 w-36 py-1" name="reference" placeholder="ID do Pix, nota…" /></label>
          <SubmitButton className="btn py-1.5" pendingLabel="Confirmando…"><Icon name="check" className="h-4 w-4" />Confirmar pagamento</SubmitButton>
        </Form>
        <Form action={setChargeStatus}>
          <input type="hidden" name="id" value={charge.id} />
          <input type="hidden" name="status" value="waived" />
          <SubmitButton className="text-xs text-muted hover:text-fg" pendingLabel="…"><Icon name="archive" className="h-4 w-4" />Isentar este mês</SubmitButton>
        </Form>
      </div>
    </details>
  );
}
