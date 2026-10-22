import { describe, expect, it } from "vitest";
import { buildCharges, dueDate, isOverdue, shiftPeriod, summarize, toPeriod, todaySP } from "./billing";

describe("períodos", () => {
  it("normaliza YYYY-MM e rejeita lixo", () => {
    expect(toPeriod("2026-10")).toBe("2026-10-01");
    expect(toPeriod("2026-10-01")).toBe("2026-10-01");
    expect(toPeriod("2026-13", new Date("2026-03-15T12:00:00Z"))).toBe("2026-03-01");
  });
  it("usa o mês de São Paulo, não o UTC", () => {
    // 01/11 01:00 UTC = 31/10 22:00 em SP
    expect(toPeriod(null, new Date("2026-11-01T01:00:00Z"))).toBe("2026-10-01");
    expect(todaySP(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10-31");
  });
  it("anda meses atravessando o ano", () => {
    expect(shiftPeriod("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftPeriod("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftPeriod("2026-05-01", -17)).toBe("2024-12-01");
  });
  it("vencimento limitado a 1..28", () => {
    expect(dueDate("2026-02-01", 5)).toBe("2026-02-05");
    expect(dueDate("2026-02-01", 31)).toBe("2026-02-28");
  });
});

describe("buildCharges", () => {
  const plan = { price_cents: 4900 };
  it("cobra só contas ativas com preço, usando valor personalizado quando houver", () => {
    const rows = buildCharges([
      { id: "a", status: "active", billing_day: 10, price_override_cents: null, plan },
      { id: "b", status: "active", billing_day: 5, price_override_cents: 2500, plan },
      { id: "c", status: "trial", billing_day: 10, price_override_cents: null, plan },
      { id: "d", status: "suspended", billing_day: 10, price_override_cents: null, plan },
      { id: "e", status: "active", billing_day: 10, price_override_cents: null, plan: null },
      { id: "f", status: "active", billing_day: 10, price_override_cents: 0, plan: null },
    ], "2026-10-01");
    expect(rows).toEqual([
      { account_id: "a", period: "2026-10-01", amount_cents: 4900, due_on: "2026-10-10" },
      { account_id: "b", period: "2026-10-01", amount_cents: 2500, due_on: "2026-10-05" },
      { account_id: "f", period: "2026-10-01", amount_cents: 0, due_on: "2026-10-10" },
    ]);
  });
});

describe("summarize", () => {
  it("separa recebido, em aberto e atrasado; isento fora do previsto", () => {
    const today = "2026-10-12";
    const s = summarize([
      { status: "paid", due_on: "2026-10-05", amount_cents: 4900, paid_amount_cents: 4500 },
      { status: "pending", due_on: "2026-10-10", amount_cents: 8900, paid_amount_cents: null },
      { status: "pending", due_on: "2026-10-12", amount_cents: 4900, paid_amount_cents: null },
      { status: "waived", due_on: "2026-10-01", amount_cents: 4900, paid_amount_cents: null },
    ], today);
    expect(s).toEqual({ expected: 18700, received: 4500, open: 4900, overdue: 8900, overdueCount: 1, waived: 4900 });
    expect(isOverdue({ status: "pending", due_on: "2026-10-12" }, today)).toBe(false);
  });
});
