# Mosaic Labs Admin

Portal interno para gerir as contas das plataformas da Mosaic Labs (Lessonara primeiro): planos, cobrança mensal com baixa manual, suporte por email, saúde dos sistemas e auditoria.

Mesma base do Lessonara: Next.js 16.4, React 19.3, Supabase (`@supabase/ssr`), Tailwind 4, Resend e Vercel.

## Deploy Vercel — 22/10/2026

- Projeto `mosaic-labs-admin`, repositório `mosaiclabsco/admin`, branch de produção `main`.
- Endereço de produção: https://mosaic-labs-admin.vercel.app. A proteção de deployment da Vercel foi preservada; acesso ao painel também exige OTP e allowlist do admin.
- Next.js explícito, Node 24, instalação `pnpm install --frozen-lockfile`, build `pnpm build` e funções em São Paulo (`gru1`).
- Oito variáveis configuradas somente em Production: URL/chave publishable do admin, secret key do admin, URL/secret key do Lessonara, Resend, remetente e cron. As chaves privadas e o cron são do tipo Sensitive. Preview não recebe credenciais de produção.
- Cron diário em `/api/cron/health`, autorizado por segredo exclusivo deste projeto. O Auth administrativo aponta para a URL de produção e mantém cadastro público desligado.
- Suporte configurado com caixa em `support.mosaic-labs.co`, chave de leitura dedicada e webhook Resend assinado. O envio de OTP mantém a chave restrita existente. Ver operação de suporte abaixo.
- As seções locais abaixo também documentam os testes anteriores à publicação; a instância em `127.0.0.1:3100` continua disponível para desenvolvimento.

## Decisões

**Multiplataforma.** A plataforma fica na URL: `/{plataforma}/{seção}`, com `all` como visão consolidada. Um seletor no topo troca a plataforma e mantém a seção (`/lessonara/billing` → `/invoicy/billing`). Plataformas novas são cadastradas em **/platforms**, sem código.

**Onde ficam os dados.** O admin tem um projeto Supabase próprio, separado das plataformas.

| Dado | Dono | Por quê |
|---|---|---|
| Plano, preço, status comercial, cobranças, baixas | **admin** | É gestão do negócio. A plataforma não precisa saber de Pix nem de mensalidade. |
| Identidade da conta (nome, email) e métricas (nº de alunos) | **plataforma** (origem) | O admin lê por **conector** e faz upsert em `accounts` (`external_id` = id na origem). |
| Tickets de suporte | **admin** | Os emails chegam pelo webhook do Resend. |

O conector de sincronização (`src/lib/connectors/lessonara.ts`) lê professores e contagens de alunos. A gestão de acesso (`src/lib/management.ts`) usa a RPC `manage_teacher_access` no Lessonara: altera somente plano de funcionalidades e suspensão do professor, com revisão otimista, motivo obrigatório, operação idempotente e auditoria transacional. Plataforma sem conector funciona com cadastro comercial manual.

> ⚠️ O conector usa a secret key do Supabase do Lessonara, que dá acesso total ao banco de lá. A chave é usada somente no backend e permite acesso amplo ao banco; o código de gestão limita as operações à RPC administrativa. Guarde-a só na Vercel. O caminho mais seguro, para depois, é o Lessonara expor `GET /api/admin/accounts` com token próprio e o conector chamar esse endpoint.

**Login.** Só código por email (OTP), sem senha, no mesmo padrão do portal do aluno do Lessonara:
- O código é gerado por `auth.admin.generateLink` e enviado pelo Resend.
- Só emails em `public.admins` recebem código. A resposta é a mesma para qualquer email.
- Há rate limit por IP e por email.
- A sessão administrativa tem prazo absoluto de 12 horas. O proxy verifica a sessão e `is_admin()` também exige sessão válida no banco, inclusive no acesso direto pela Data API.
- O signup público fica desligado.

**Segurança.**
- Todas as tabelas têm RLS com `is_admin()`. O painel usa a sessão do admin, não a secret key.
- A secret key só é usada no login (antes de existir sessão), no webhook e no cron.
- A auditoria não pode ser editada nem apagada pelo painel.

## Módulos

| Seção | O que faz |
|---|---|
| Visão geral | MRR, recebido no mês, em aberto, atrasado, suporte em andamento e status dos sistemas |
| Contas | Lista com filtro e busca; sincronização com a plataforma; detalhe com plano, valor personalizado, dia de vencimento, notas, histórico de cobranças, tickets e auditoria |
| Cobranças | Por mês. Mostra previsto, recebido, em aberto e atrasado. **Gerar cobranças** cria a do mês para cada conta ativa com plano, de forma idempotente. **Dar baixa** registra valor, data, forma (Pix, transferência…) e referência. Também dá para isentar e reabrir |
| Planos | Cada plano tem um **ID** escolhido por você (ex.: `LSN-PRO`), único por plataforma, além de preço, ativo/inativo e contas usando |
| Suporte | Emails recebidos viram tickets. A plataforma é definida pelo destinatário, e a conta pelo email do remetente. Respostas são encadeadas por In-Reply-To ou pelo assunto. Dá para responder pelo Resend, deixar nota interna e mudar o status |
| Saúde | Alvos HTTP por plataforma, com status, latência, uptime de 24h, barras das últimas 30 verificações e log de falhas. Verificação sob demanda ou por cron |
| Auditoria | Toda alteração feita no painel: quem, o quê e quando, com antes/depois |

## Rodar local

Requisitos: Docker, Node ≥ 22 e pnpm.

```bash
pnpm install
pnpm db:start                         # Supabase local (sem studio/storage/realtime)
pnpm db:reset                         # schema + dados de demonstração (supabase/seed.sql)
cp .env.example .env.local            # preencher com as chaves do `supabase status`
pnpm admin:add voce@exemplo.com       # libera o email no portal
pnpm dev                              # http://localhost:3100
```

Sem `RESEND_API_KEY`, em desenvolvimento com Supabase em localhost/127.0.0.1, o código é enviado ao Mailpit local: http://127.0.0.1:54324. Nenhum email externo é enviado nesse modo; códigos não são escritos no log.

Para parar: `Ctrl+C` no dev e `pnpm db:stop`.

## Produção

1. **Supabase.** Crie um projeto novo (o free permite dois) e aplique `supabase/migrations/` com `supabase link` + `supabase db push`. Em *Auth → Providers → Email*, desligue *Allow new users to sign up*.
2. **Vercel.** Importe o repo e configure as variáveis do `.env.example`. Use `EMAIL_FROM` com o domínio verificado no Resend (o mesmo do Lessonara, `mosaic-labs.co`).
3. **Admin.** Rode `pnpm admin:add <seu email>` com o `.env.local` apontando para produção.
4. **Conector do Lessonara.** Configure `LESSONARA_SUPABASE_URL` e `LESSONARA_SUPABASE_SECRET_KEY` só na Vercel. Depois, em **Contas → Sincronizar do Lessonara**.
5. **Suporte (receber email).**
   - No Resend, habilite *Receiving* no domínio. Isso exige um MX, por exemplo no subdomínio `support.mosaic-labs.co`, para não mexer no email atual.
   - Crie um webhook `email.received` → `https://<admin>/api/inbound/email` e copie o segredo para `RESEND_WEBHOOK_SECRET`.
   - O email de suporte de cada plataforma (em /platforms) precisa ser o endereço que recebe.
6. **Health check.** O `vercel.json` agenda `/api/cron/health` uma vez por dia (limite do plano Hobby). Para checar a cada 5 min, use um pinger grátis (cron-job.org, UptimeRobot) chamando `GET /api/cron/health` com o header `Authorization: Bearer <CRON_SECRET>`. Os resultados ficam guardados por 30 dias.

## Testes

```bash
pnpm test        # unit: cobrança/períodos (fuso SP), dinheiro, suporte, health, assinatura do webhook, conector
pnpm test:db     # banco local: RLS (admin/não admin/anônimo), auditoria imutável, rate limit, unicidade, ingestão de email, sync
node --env-file=.env.local test/e2e.mjs   # navegador (CDP) — ver cabeçalho do arquivo
```

### Verificado em 09/10/2026

- Unit 19/19, banco 6/6, E2E 19/19, `tsc`, `eslint` e `next build` passando.
- O E2E cobre:
  - login OTP: email sem acesso não gera código nem usuário, e código errado é recusado;
  - baixa de pagamento, geração de cobranças e troca de plataforma;
  - criação de plano, edição de conta, nota e fechamento de ticket;
  - health check sob demanda, auditoria e logout.
- Rotas testadas com curl:
  - cron: 401 sem token e 200 com token;
  - webhook: 401 com assinatura inválida, 200 com assinatura válida (ticket roteado para o Lessonara e vinculado à conta).
- O claim `amr` (base da expiração da sessão) se mantém após o refresh do token.

### Não verificado no projeto original

- Envio real pelo Resend (código de login e resposta de ticket), porque não há chave local.
- Formato real do webhook de recebimento do Resend. Foi testado com um payload montado a partir dos tipos do SDK `resend@6.32`.
- Conector real: validado na ativação de 21/10/2026 descrita abaixo; a ressalva original era anterior à conexão cloud.

## Próximos passos sugeridos

- **Bloqueio automático por falta de pagamento.** Ainda não implementado. A suspensão manual no card de acesso é independente do status comercial, preserva dados e precisa de decisão explícita do administrador.
- **Pix automático** (Asaas, Mercado Pago ou Efí): um webhook de pagamento faria a baixa sozinho, e a baixa manual vira exceção.
- Lembrete automático por email antes do vencimento e no atraso.
- Health check também do Jitsi (`/about/health` do JVB), quando a sala de aula for para produção.

## Atualização de 21/10/2026 — gestão do Lessonara

O projeto existente foi reaproveitado. A interface mantém a identidade Mosaic Labs: logo oficial, fundo creme, azul/coral/amarelo/teal, menu com recolhimento animado, header fixo e conta com iniciais. A tipografia foi ajustada em 23/10: fonte de sistema em toda a interface e no login; Clash Grotesk somente no wordmark, conforme `STYLE_GUIDE.md`. Login e painel compartilham os mesmos tokens, com tema escuro e movimento reduzido. `STYLE_GUIDE.md` centraliza as regras.

### Prévia sem banco

`pnpm dev` (escuta somente em 127.0.0.1) e abrir http://127.0.0.1:3100/preview. A prévia usa somente dados fictícios, permite alternar professores/pagamentos/auditoria e testar o recolhimento. A rota responde 404 em build de produção e não altera contas. O painel real continua exigindo banco e login de administrador.

### O que está implementado no código

- Card de acesso do Lessonara no detalhe da conta: plano Essencial/Plus/Pro, suspensão/liberação, motivo, detecção de edição concorrente e auditoria na origem.
- Assinatura comercial e pagamentos ficam separados de créditos/pacotes das aulas. Alterar o estado comercial não suspende automaticamente ninguém.
- Baixa manual usa `settle_platform_charge`: pagamento e auditoria na mesma transação; só cobrança pendente, data válida não futura e valor positivo até R$ 99.000,00.
- Sessão de admin de 12 horas também no banco. Plano comercial não pode pertencer a outra plataforma.
- Suspensão bloqueia sessão do professor, Data API/RLS/Storage e emissão/refresh de token. Preserva dados, portal do aluno e filas existentes. Não encerra retroativamente uma reunião Jitsi já conectada.
- Acesso de suporte ao perfil do professor fica como tarefa futura, sem impersonação nesta versão.

### Estado na ativação inicial — bancos cloud conectados; frontend ainda local

- O admin usa um projeto Supabase próprio no plano Free, em São Paulo. Não usa o banco do Lessonara como banco administrativo.
- Schema administrativo aplicado sem `seed.sql`; cadastro público desligado; identidade do proprietário separada, allowlist e sessão administrativa absoluta de 12 horas no banco.
- Conector backend configurado e cinco professores reais sincronizados por ID. Nenhuma cobrança fictícia nem plano comercial foi atribuído automaticamente. O preço de demonstração do schema inicial está inativo e exige revisão comercial.
- `0026_platform_management.sql` aplicada no Lessonara depois de executar a migração e as fixtures numa transação com rollback. Somente o proprietário foi habilitado na allowlist privada de operadores.
- Acesso efetivo e mensalidade seguem independentes. Nenhum professor real teve plano ou suspensão alterados durante a ativação. Operações de alteração foram exercitadas com fixtures descartadas por rollback.
- O erro de carregamento vinha das duas relações entre contas e planos. As consultas agora escolhem explicitamente `accounts_plan_id_fkey`.
- Painel: http://127.0.0.1:3100/login. O frontend continua local e não foi publicado. Com o banco cloud, solicitar código usa o Resend para o email do proprietário; Mailpit atende apenas o ambiente de banco local anterior. Nenhum email externo foi enviado pelos testes desta ativação.
- `.env.local` contém chaves do admin e do conector; somente a chave publishable do admin tem prefixo público. Segredos ficam fora do Git. O ambiente local anterior foi preservado em backup privado.

### Validação da conexão real

- Verificações finais: 34 testes unitários, 8 testes locais de banco e 1 verificação cloud passaram; ESLint e build/typecheck aprovados.

- Oito testes de integração no Supabase local: RLS, join de plano, identidade estável, unicidade, preservação de cobranças, auditoria, limitador, email recebido e sincronização. A suíte com fixtures locais recusa banco cloud.
- Verificação cloud opt-in: OTP gerado/verificado sem envio, membership do proprietário, sincronização real repetida com IDs estáveis, leitura de acesso na origem, anônimo e usuário sem allowlist recusados. O usuário temporário foi removido e a sessão de teste encerrada.
- Quatro páginas autenticadas responderam 200 sem erro de renderização: visão geral, contas, cobranças e detalhe do professor.
- As operações SQL do Lessonara validaram allowlist, recusa de professor, auditoria atômica, replay, concorrência, suspensão, hook, restauração, expiração e grants com rollback.
- QA visual e uso humano completo de pagamento/alteração de acesso continuam pendentes. Prévia é apenas de desenvolvimento e responde 404 em produção. Acesso de suporte ao perfil do professor permanece futuro.

Para repetir a verificação cloud, preparar um arquivo privado com as variáveis usuais,
`ADMIN_OWNER_EMAIL`, `LIVE_CONNECTOR_VALIDATE=1`, `LIVE_ADMIN_EXPECTED_URL` e
`LIVE_LESSONARA_EXPECTED_URL`. Executar somente `test/live-connector.integration.test.ts`
com esse ambiente e o frontend local ativo. O teste sincroniza contas e registra auditoria;
não altera planos ou pagamentos. Não executar a suíte `test:db` contra cloud.

## Vínculo entre assinante e professor

`accounts.id` identifica a assinatura no admin. O par único e imutável
`(platform_id, external_id)` identifica a conta na plataforma de origem.
Para Lessonara, `external_id` é exatamente `public.teachers.id` (UUID), nunca email.
Não há foreign key entre projetos: o conector resolve o vínculo no backend.

A sincronização atualiza nome, contato e métricas por esse par, preservando o ID
administrativo, plano comercial, situação e cobranças. Trocar email não cria outra
assinatura. Uma conta removida na origem é marcada `source_missing`, preservando
seu histórico. Correção de vínculo exige procedimento de migração revisado; a API
não permite transferir a assinatura para outro professor ou plataforma.

Hoje há um assinante por professor. Organizações com vários professores ficam
para uma evolução futura. O plano comercial e seus pagamentos pertencem ao admin;
o plano de funcionalidades e a suspensão efetiva pertencem ao Lessonara e só são
alterados pela operação administrativa autenticada e auditada.

### Tipografia e dependências — 23/10/2026

Títulos de página de 26 px, texto/menus/campos de 14 px e indicadores de 30 px, com a mesma família de sistema e pesos consistentes. Os indicadores mantêm números tabulares. As cores e o wordmark da Mosaic Labs foram preservados. Next.js e eslint-config-next atualizados para 16.4.1 após o aviso de segurança da versão 16.4.0 durante o build.

## Ajustes administrativos — 23/10/2026

### Interface

Tema claro fixo, tipografia de sistema em títulos, tabelas e formulários. `Overlay` centraliza modal e drawer com diálogo nativo, foco contido, Escape, retorno ao botão e movimento reduzido. Criar/editar planos abre modal; dados de auditoria aparecem em drawer à direita. As tabelas preservam a altura das linhas.

### Troca de assinatura e proporcionalidade

A troca de plano ou de valor personalizado é agendada para a próxima renovação. A prévia mostra início/fim do ciclo, dias reais usados/restantes, mensalidades, valores proporcionais de ambos os planos e a diferença caso a troca fosse hoje. O dia atual entra no período restante. A estimativa parte da mensalidade cadastrada; o administrador deve conferir o pagamento efetivo antes de decidir um reembolso.

A prévia não movimenta dinheiro, não registra crédito e não executa reembolso. Cobranças já emitidas permanecem intactas e precisam de revisão manual. Novas cobranças de períodos futuros respeitam a troca agendada. Não se gera cobrança para uma troca vencida que ainda não foi aplicada.

`subscription_changes` preserva o acordo e a prévia. O banco revalida administrador, plataforma/plano ativo, preços, vencimento e data. O agendamento é idempotente e não troca o plano atual imediatamente. Alterações diretas dos termos pelo cliente são recusadas. Cancelar mantém o plano atual; o vencimento fica protegido enquanto há uma troca aberta.

No Lessonara, o plano comercial informa `feature_tier`. O worker aplica o acesso pela RPC já auditada, usando a revisão/suspensão capturadas e um identificador estável; só depois confirma assinatura e auditoria no admin. Uma repetição recupera a operação sem aplicar duas vezes. Mudança concorrente de acesso exige revisão e preserva os termos atuais. Suspender/liberar segue imediato, mas não altera o plano pela tela de acesso.

O cron diário existente executa as trocas vencidas às 09:00 de São Paulo. Há lote de 10, lease de cinco minutos, cinco tentativas e marcação de falha após esgotamento ou interrupção da última tentativa. Pendências e falhas aparecem em Saúde e na conta; reprocessamento manual exige administrador. Se a revisão da origem mudou, revisar/cancelar o acordo antes de reagendar. A geração de cobranças também tenta concluir as trocas vencidas antes de cobrar.

Migração: `20261023000004_subscription_changes.sql`. Validação: `supabase/operations/verify-subscriptions.sql`, com fixtures e rollback, cobrindo data de renovação, dias, replay, prévia obsoleta, proteção dos termos, cancelamento, lease, aplicação/auditoria atômicas, preservação de cobranças, tentativas esgotadas e reprocessamento.

### Suporte por email

- Caixa interna: `lessonara@support.mosaic-labs.co`; o endereço público `lessonara@mosaic-labs.co` é encaminhado pela Cloudflare para essa caixa mediante autorização do proprietário. Os demais endereços e os MX do domínio raiz são preservados.
- Subdomínio de recebimento em São Paulo no Resend, separado do envio. `RESEND_RECEIVING_API_KEY` lê o corpo do email; `RESEND_API_KEY` continua restrita a envio.
- Respostas usam remetente verificado do domínio principal (`SUPPORT_EMAIL_FROM`) e Reply-To da caixa interna. `SUPPORT_RECEIVING_DOMAIN` limita os eventos ao domínio de suporte.
- Webhook `email.received` com `RESEND_WEBHOOK_SECRET`, assinatura/timestamp verificados e deduplicação por Message-ID. Falha ao obter o corpo retorna 502 para permitir nova entrega. Eventos inválidos são recusados.
- A barreira da Vercel permanece ativa. O endpoint cadastrado no Resend contém o segredo de automação aprovado pelo proprietário; não copiar essa URL para documentação, tickets ou logs. Essa autorização não substitui OTP/allowlist do painel. Em rotação desse segredo, atualizar o endpoint do webhook e validar novamente.
- Chaves e assinatura apenas em variáveis de backend de Production, fora do Git. Não publicar valores nem URLs com credenciais.

### Validação

40 testes unitários aprovados. Migração exercitada no Postgres real em transações com rollback e aplicada ao banco administrativo. Build/typecheck aprovados. Next.js e eslint-config-next no patch 16.4.1; `pnpm audit --prod` sem alertas após a atualização. Conferir os fluxos visuais e o webhook no deployment final antes de considerar o recebimento ponta a ponta validado.
