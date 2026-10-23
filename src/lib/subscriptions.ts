import { dueDate, shiftPeriod } from "./billing";

export function subscriptionQuote(today: string, billingDay: number, currentPrice: number, nextPrice: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isInteger(billingDay) || billingDay < 1 || billingDay > 28 || ![currentPrice, nextPrice].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 9900000)) throw new Error("Dados da assinatura inválidos.");
  if (new Date(today + "T00:00:00Z").toISOString().slice(0, 10) !== today) throw new Error("Data inválida.");
  const period = today.slice(0, 8) + "01";
  let start = dueDate(period, billingDay);
  if (start > today) start = dueDate(shiftPeriod(period, -1), billingDay);
  const end = dueDate(shiftPeriod(start.slice(0, 8) + "01", 1), billingDay);
  const day = (s: string) => Date.parse(s + "T00:00:00Z") / 86400000;
  const totalDays = day(end) - day(start);
  const usedDays = day(today) - day(start);
  if (!Number.isInteger(usedDays) || usedDays < 0 || usedDays >= totalDays) throw new Error("Data inválida.");
  const remainingDays = totalDays - usedDays;
  const currentUsed = Math.round(currentPrice * usedDays / totalDays);
  const currentRemaining = currentPrice - currentUsed;
  const nextUsed = Math.round(nextPrice * usedDays / totalDays);
  const nextRemaining = Math.round(nextPrice * remainingDays / totalDays);
  return { today, cycleStart: start, effectiveOn: end, totalDays, usedDays, remainingDays, currentPrice, nextPrice, currentUsed, currentRemaining, nextUsed, nextRemaining, difference: nextRemaining - currentRemaining };
}
export type SubscriptionChange = {
  id: string; account_id: string; target_plan_id: string; new_price_cents: number; effective_on: string; status: "scheduled" | "processing" | "applied" | "cancelled" | "failed"; attempts: number; last_error: string | null; target_name: string; actor: string;
};
