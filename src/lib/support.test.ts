import { expect, it } from "vitest";
import { htmlToText, normalizeSubject, parseAddress, referencedIds } from "./support";

it("extrai nome e email do remetente", () => {
  expect(parseAddress("Maria Souza <Maria@Exemplo.com>")).toEqual({ email: "maria@exemplo.com", name: "Maria Souza" });
  expect(parseAddress('"Souza, Maria" <m@x.com>')).toEqual({ email: "m@x.com", name: "Souza, Maria" });
  expect(parseAddress("m@x.com")).toEqual({ email: "m@x.com", name: null });
});

it("assunto de resposta encadeia no original", () => {
  expect(normalizeSubject("Re: RES: Fwd: Problema no login")).toBe("problema no login");
  expect(normalizeSubject("Problema no login")).toBe("problema no login");
});

it("HTML vira texto legível sem scripts", () => {
  expect(htmlToText("<style>p{}</style><p>Oi &amp; tudo</p><p>linha<br>2</p><script>x()</script>")).toBe("Oi & tudo\nlinha\n2");
});

it("ids referenciados", () => {
  expect(referencedIds({ inReplyTo: "<a@x>", references: "<b@x> <c@x>" })).toEqual(["<a@x>", "<b@x>", "<c@x>"]);
  expect(referencedIds({})).toEqual([]);
});
