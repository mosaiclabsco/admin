export type ChargeStatus = "pending" | "paid" | "waived";
export type BillableAccount = {
  id: string;
  status: string;
  billing_day: number;
  price_override_cents: number | null;
  plan: { price_cents: number } | null;
};

/** Período = primeiro dia do mês, formato "YYYY-MM-01". Aceita "YYYY-MM" vindo da URL. */
export function toPeriod(input?: string | null, now = new Date()): string {
  if (input && /^\d{4}-(0[1-9]|1[0-2])(-01)?$/.test(input)) return `${input.slice(0, 7)}-01`;
  return `${todaySP(now).slice(0, 7)}-01`;
}

export function shiftPeriod(period: string, months: number): string {
  const index = Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1 + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

export function dueDate(period: string, billingDay: number): string {
  return `${period.slice(0, 8)}${String(Math.min(Math.max(billingDay, 1), 28)).padStart(2, "0")}`;
}

export function monthlyPrice(account: Pick<BillableAccount, "price_override_cents" | "plan">): number | null {
  return account.price_override_cents ?? account.plan?.price_cents ?? null;
}

/** Cobranças do mês para contas ativas com preço definido. Trial/suspensa/cancelada não geram. */
export function buildCharges(accounts: BillableAccount[], period: string) {
  return accounts.flatMap((account) => {
    const amount = monthlyPrice(account);
    if (account.status !== "active" || amount === null) return [];
    return [{ account_id: account.id, period, amount_cents: amount, due_on: dueDate(period, account.billing_day) }];
  });
}

export type ChargeRow = { status: ChargeStatus; due_on: string; amount_cents: number; paid_amount_cents: number | null };

export function isOverdue(charge: Pick<ChargeRow, "status" | "due_on">, today: string) {
  return charge.status === "pending" && charge.due_on < today;
}

export function summarize(charges: ChargeRow[], today: string) {
  const sum = { expected: 0, received: 0, open: 0, overdue: 0, overdueCount: 0, waived: 0 };
  for (const charge of charges) {
    if (charge.status === "waived") { sum.waived += charge.amount_cents; continue; }
    sum.expected += charge.amount_cents;
    if (charge.status === "paid") sum.received += charge.paid_amount_cents ?? charge.amount_cents;
    else if (isOverdue(charge, today)) { sum.overdue += charge.amount_cents; sum.overdueCount++; }
    else sum.open += charge.amount_cents;
  }
  return sum;
}

/** Data de hoje em São Paulo, "YYYY-MM-DD". */
export function todaySP(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}
