import { expect, it } from "vitest";
import { date, money, parseMoney, relative } from "./format";

it("converte valores digitados em centavos", () => {
  expect(parseMoney("149,90")).toBe(14990);
  expect(parseMoney("149.9")).toBe(14990);
  expect(parseMoney("R$ 1.249,90")).toBe(124990);
  expect(parseMoney("49")).toBe(4900);
  expect(parseMoney("abc")).toBeNull();
  expect(parseMoney("1,999")).toBeNull();
  expect(parseMoney("")).toBeNull();
});

it("formata moeda e data sem deslocar fuso", () => {
  expect(money(14990).replace(/\s/g, " ")).toBe("R$ 149,90");
  expect(date("2026-10-01")).toBe("01/10/2026");
  expect(date("2026-10-01T02:00:00+00:00")).toBe("01/10/2026");
});

it("tempo relativo", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  expect(relative("2026-10-09T11:55:00Z", now)).toBe("há 5 min");
  expect(relative("2026-10-09T09:00:00Z", now)).toBe("há 3 h");
  expect(relative(null, now)).toBe("nunca");
});
