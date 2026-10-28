import { expect, it } from "vitest";
import { subscriptionQuote, initialSubscriptionChoice } from "./subscriptions";
it("uses actual cycle days and shows a refund estimate for a downgrade", () => {
  const q = subscriptionQuote("2026-10-23", 10, 20000, 10000);
  expect(q).toMatchObject({
    cycleStart: "2026-10-10",
    effectiveOn: "2026-11-10",
    totalDays: 31,
    usedDays: 13,
    remainingDays: 18,
    currentUsed: 8387,
    currentRemaining: 11613,
    nextRemaining: 5806,
    difference: -5807,
  });
  expect(q.currentUsed + q.currentRemaining).toBe(q.currentPrice);
});
it("handles the renewal day, February and leap years without using local timezone", () => {
  expect(subscriptionQuote("2026-10-10", 10, 10000, 20000)).toMatchObject({
    usedDays: 0,
    remainingDays: 31,
    difference: 10000,
    effectiveOn: "2026-11-10",
  });
  expect(subscriptionQuote("2024-02-20", 10, 10000, 20000).totalDays).toBe(29);
  expect(subscriptionQuote("2026-01-02", 10, 10000, 20000)).toMatchObject({
    cycleStart: "2025-12-10",
    effectiveOn: "2026-01-10",
  });
});
it("rejects invalid days, money and dates", () => {
  expect(() => subscriptionQuote("2026-10-23", 31, 1, 2)).toThrow();
  expect(() => subscriptionQuote("2026-10-23", 10, -1, 2)).toThrow();
  expect(() => subscriptionQuote("2026-02-31", 10, 1, 2)).toThrow();
});

it("keeps both amounts equal to the monthly fee and an equal-price change at zero on half-cent boundaries", () => {
  const q = subscriptionQuote("2026-04-25", 10, 4999, 4999);
  expect(q).toMatchObject({
    totalDays: 30,
    usedDays: 15,
    currentUsed: 2500,
    currentRemaining: 2499,
    nextUsed: 2500,
    nextRemaining: 2499,
    difference: 0,
  });
  expect(q.nextUsed + q.nextRemaining).toBe(q.nextPrice);
});

it("opens on the current plan without selecting a downgrade or losing a custom zero price", () => {
  const plans = [
    { id: "essential", active: true },
    { id: "pro", active: true },
  ];
  expect(initialSubscriptionChoice(plans, "pro", null)).toEqual({
    target: "pro",
    override: "",
  });
  expect(initialSubscriptionChoice(plans, "pro", 0)).toEqual({
    target: "pro",
    override: "0,00",
  });
  expect(initialSubscriptionChoice(plans, "inactive", null).target).toBe("");
});
