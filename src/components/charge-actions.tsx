import { ChargeControls } from "./charge-payment-form";
import { todaySP } from "@/lib/billing";
const METHODS = [
  ["pix", "Pix"],
  ["transfer", "Transferência"],
  ["card", "Cartão"],
  ["cash", "Dinheiro"],
  ["other", "Outro"],
] as const;
export const methodLabel = (method: string | null) =>
  METHODS.find(([value]) => value === method)?.[1] ?? "—";
export function ChargeActions({
  charge,
}: {
  charge: { id: string; status: string; amount_cents: number };
}) {
  return <ChargeControls charge={charge} today={todaySP()} />;
}
