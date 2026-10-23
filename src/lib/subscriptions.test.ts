import { expect, it } from "vitest";
import { subscriptionQuote } from "./subscriptions";
it("uses actual cycle days and shows a refund estimate for a downgrade", () => {
  const q = subscriptionQuote("2026-10-23", 10, 20000, 10000);
  expect(q).toMatchObject({ cycleStart: "2026-10-10", effectiveOn: "2026-11-10", totalDays: 31, usedDays: 13, remainingDays: 18, currentUsed: 8387, currentRemaining: 11613, nextRemaining: 5806, difference: -5807 });
  expect(q.currentUsed + q.currentRemaining).toBe(q.currentPrice);
});
it("handles the renewal day, February and leap years without using local timezone", () => {
  expect(subscriptionQuote("2026-10-10", 10, 10000, 20000)).toMatchObject({ usedDays: 0, remainingDays: 31, difference: 10000, effectiveOn: "2026-11-10" });
  expect(subscriptionQuote("2024-02-20", 10, 10000, 20000).totalDays).toBe(29);
  expect(subscriptionQuote("2026-01-02", 10, 10000, 20000)).toMatchObject({ cycleStart: "2025-12-10", effectiveOn: "2026-01-10" });
});
it("rejects invalid days, money and dates", () => {
  expect(() => subscriptionQuote("2026-10-23", 31, 1, 2)).toThrow();
  expect(() => subscriptionQuote("2026-10-23", 10, -1, 2)).toThrow();
  expect(() => subscriptionQuote("2026-02-31", 10, 1, 2)).toThrow();
});
