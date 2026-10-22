// E2E no navegador: login OTP + fluxos principais. Pré-requisitos: pnpm db:start, pnpm db:reset,
// pnpm admin:add admin@mosaic-labs.test, `pnpm dev > DEV_LOG` (sem RESEND_API_KEY: código vai pro log)
// e Chrome com --remote-debugging-port (CDP_URL). Uso: DEV_LOG=... node --env-file=.env.local test/e2e.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const CDP = process.env.CDP_URL ?? "http://127.0.0.1:9223";
const LOG = process.env.DEV_LOG;
const ADMIN = "admin@mosaic-labs.test";
const OUT = new URL("../test-results/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`); };

const { webSocketDebuggerUrl } = await (await fetch(`${CDP}/json/version`)).json();
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0;
const pending = new Map();
ws.onmessage = ({ data }) => { const m = JSON.parse(data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

const { browserContextId } = await send("Target.createBrowserContext");
const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);

async function js(expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}
async function waitFor(expression, timeout = 15_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { try { const v = await js(expression); if (v) return v; } catch {} await sleep(250); }
  return null;
}
async function go(path) { await send("Page.navigate", { url: `${APP}${path}` }, sessionId); await sleep(400); await waitFor(`document.readyState === "complete" && !document.querySelector('[aria-busy="true"][aria-label="Carregando"]')`); }
const fill = (selector, value) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement : el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return 1; })()`);
const clickText = (text, scope = "document") => js(`(() => { const el = [...${scope}.querySelectorAll("button, a, summary span")].find(e => e.textContent.trim() === ${JSON.stringify(text)}); if (!el) throw new Error("não achei: ${text}"); el.click(); return 1; })()`);
const bodyHas = (text, timeout) => waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`, timeout);
async function shot(name) { const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId); writeFileSync(new URL(`${name}.png`, OUT), Buffer.from(data, "base64")); }
const codeFor = async (email) => { for (let i = 0; i < 40; i++) { const m = [...readFileSync(LOG, "utf8").matchAll(new RegExp(`código de acesso para ${email.replace(".", "\\.")}: (\\d+)`, "g"))].pop(); if (m) return m[1]; await sleep(250); } return null; };

try {
  await go("/all");
  check("sem sessão redireciona para /login", (await js("location.pathname")) === "/login");

  // Email sem acesso: mesma resposta, nenhum código gerado.
  await fill("#email", "intruso@exemplo.com");
  await clickText("Receber código");
  check("email sem acesso recebe resposta genérica", !!(await bodyHas("Se este email tiver acesso")));
  await sleep(1500);
  const users = (await db.auth.admin.listUsers({ perPage: 1000 })).data.users;
  check("nenhum código nem usuário criado para email sem acesso", !readFileSync(LOG, "utf8").includes("código de acesso para intruso@") && !users.some((u) => u.email === "intruso@exemplo.com"));
  await clickText("Usar outro email ou pedir novo código");
  await waitFor(`!!document.querySelector("#email")`);

  await fill("#email", ADMIN);
  await clickText("Receber código");
  await waitFor(`!!document.querySelector("#code")`);
  const code = await codeFor(ADMIN);
  check("código OTP gerado para admin", !!code);
  await fill("#code", "000000");
  await clickText("Entrar");
  check("código errado é recusado", !!(await bodyHas("Código inválido ou expirado")));
  await fill("#code", code);
  await clickText("Entrar");
  check("código certo entra no painel", !!(await waitFor(`location.pathname === "/all" && document.body.innerText.includes("MRR")`)));
  await shot("01-visao-geral");

  // Baixa de pagamento.
  await go("/lessonara/billing");
  await shot("02-cobrancas");
  const before = (await db.from("charges").select("id,status,account:accounts!inner(name)").eq("status", "pending").eq("account.name", "Mariana Souza").order("period", { ascending: false }).limit(1).single()).data;
  await js(`(() => { const row = [...document.querySelectorAll("tr")].find(r => r.innerText.includes("Mariana Souza") && r.innerText.includes("Dar baixa")); row.querySelector("summary").click(); return 1; })()`);
  await js(`(() => { const row = [...document.querySelectorAll("tr")].find(r => r.innerText.includes("Mariana Souza") && r.querySelector("details[open]")); row.querySelector('input[name="reference"]').value = "E2E-PIX-123"; return 1; })()`);
  await clickText("Confirmar pagamento", `[...document.querySelectorAll("tr")].find(r => r.innerText.includes("Mariana Souza") && r.querySelector("details[open]"))`);
  await bodyHas("Pagamento confirmado.");
  const after = (await db.from("charges").select("status,method,reference,settled_by").eq("id", before.id).single()).data;
  check("dar baixa grava pagamento", after.status === "paid" && after.reference === "E2E-PIX-123" && after.settled_by === ADMIN, JSON.stringify(after));
  await shot("03-baixa");

  // Gerar cobranças do mês seguinte.
  const next = new Date(); next.setMonth(next.getMonth() + 1);
  const m = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  await go(`/lessonara/billing?m=${m}`);
  await js(`[...document.querySelectorAll("button")].find(b => b.textContent.startsWith("Gerar cobranças")).click(), 1`);
  check("gera cobranças do próximo mês", !!(await bodyHas("cobranças geradas")));

  // Seletor de plataforma mantém a seção.
  await clickText("Invoicy");
  check("seletor troca plataforma mantendo a seção", !!(await waitFor(`location.pathname === "/invoicy/billing"`)));

  // Plano novo com ID.
  await go("/lessonara/plans");
  await fill('input[name="code"]:not([value])', "lsn-teste");
  await js(`(() => { const f = [...document.querySelectorAll("form")].find(f => f.innerText.includes("Criar plano")); const set = (n, v) => { const el = f.querySelector('[name="' + n + '"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); }; set("code", "lsn-teste"); set("name", "Teste"); set("price", "19,90"); return 1; })()`);
  await clickText("Criar plano");
  await bodyHas("Plano criado.");
  const plan = (await db.from("plans").select("code,price_cents").eq("code", "LSN-TESTE").maybeSingle()).data;
  check("cria plano com ID normalizado", plan?.price_cents === 1990, JSON.stringify(plan));
  await shot("04-planos");

  // Conta: trocar plano e conferir auditoria.
  const account = (await db.from("accounts").select("id").eq("external_id", "t-003").single()).data;
  await go(`/lessonara/accounts/${account.id}`);
  const planId = (await db.from("plans").select("id").eq("code", "LSN-TESTE").single()).data.id;
  await fill("#plan_id", planId);
  await fill("#status", "active");
  await clickText("Salvar");
  await bodyHas("Conta atualizada.");
  const acc = (await db.from("accounts").select("status,plan_id").eq("id", account.id).single()).data;
  check("atualiza plano/status da conta", acc.plan_id === planId && acc.status === "active");
  check("formulário mantém os valores salvos", (await js(`document.querySelector("#status").value + "|" + document.querySelector("#plan_id").value`)) === `active|${planId}`);
  await shot("05-conta");

  // Suporte: nota interna.
  await go("/all/support");
  await shot("06-suporte");
  await js(`document.querySelector('a[href*="/support/"]').click(), 1`);
  await waitFor(`location.pathname.includes("/support/")`);
  await bodyHas("Recebido");
  await fill('textarea[name="body"]', "Verificado no log: fila de email parada. E2E.");
  await clickText("Salvar como nota");
  check("nota interna no ticket", !!(await bodyHas("Nota adicionada.")) && !!(await bodyHas("Verificado no log")));
  await clickText("Fechar");
  check("fecha ticket", !!(await waitFor(`document.body.innerText.includes("Fechado")`)));
  await shot("07-ticket");

  // Saúde.
  await go("/all/health");
  await clickText("Verificar agora");
  check("health check sob demanda grava resultado", !!(await bodyHas("com falha.", 20_000)));
  await go("/all/health");
  check("resultado aparece na tabela", !!(await bodyHas("No ar")));
  await shot("08-saude");

  await go("/all/audit");
  const actions = await js(`[...document.querySelectorAll("td.font-mono")].map(td => td.textContent)`);
  check("auditoria registra as ações", ["charge.settle", "charges.generate", "plan.create", "account.update", "ticket.note"].every((a) => actions.includes(a)), actions.slice(0, 8).join(","));
  await shot("09-auditoria");

  await go("/lessonara/accounts");
  await shot("10-contas");

  // Sessão expirada pede novo código (simula SESSION_MAX_HOURS com cookie adulterado? não: confere logout).
  await js(`document.querySelector('button[aria-label="Sair"]').click(), 1`);
  check("sair volta ao login", !!(await waitFor(`location.pathname === "/login"`)));
  await go("/lessonara/billing");
  check("após sair, painel exige login", (await js("location.pathname")) === "/login");
} finally {
  await send("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
  ws.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
