# Interface administrativa

Use a identidade visual Mosaic Labs: logo oficial, fundo creme, azul #1464c0, coral #ef6545, amarelo #f4b942 e teal #0b9e8a. Admin e login usam esses mesmos componentes e tokens. O verde Lessonara fica restrito à identidade desse produto, sem definir a marca do admin.

- Tipografia de sistema compartilhada em `--font-sans`: SF Pro no macOS e Segoe UI no Windows, com fallback sans-serif. Usar em títulos, tabelas, indicadores, menus, campos e login. Clash Grotesk fica somente no wordmark da marca. Não aplicar fontes de display nas telas operacionais.
- Texto e campos de 14 px; títulos de página de 26 px/600, seções de 15 px/600 e indicadores de 30 px/600 com números tabulares. Manter espaçamento discreto e entrelinha confortável.
- Reutilize `WorkspaceShell`, `Icon`, `Form`, `SubmitButton` e componentes de `ui.tsx`.
- Header fixo e conteúdo com scroll próprio. Menu recolhível com transição; links e controle ocupam 44 px no mesmo eixo. Respeite movimento reduzido.
- Conta no header, com iniciais e menu sem bordas individuais. Menu lateral dedicado à navegação.
- Cores pelos tokens; ação principal azul, secundária com texto/borda azul. Cinza para informações secundárias e bloqueio real. O admin usa apenas tema claro, inclusive quando o sistema operacional está em modo escuro.
- Campos de linha única com pelo menos 46 px, fonte de 14 px, raio de 12 px e foco de 3 px. Textareas podem crescer.
- Botões de ação com ícone e texto; controles apenas com ícone precisam de nome acessível.
- Confirmar/salvar à direita; cancelar/voltar à esquerda; pelo menos 24 px entre campos e ações.
- Se forem introduzidas confirmações, usar um diálogo compartilhado acessível, nunca `window.confirm`.
- Separar assinatura comercial de acesso efetivo ao produto. Pagamentos de assinatura não criam créditos de aulas.
- Nenhuma tela de prévia pode ler dados reais ou estar disponível em produção.

- Edição e criação de planos em `Overlay` modal; detalhes de auditoria em `Overlay` drawer. Não expandir formulários ou JSON dentro das linhas das tabelas. Dialog nativo mantém foco, Escape e retorno ao acionador; animação respeita movimento reduzido.
- Trocas de assinatura sempre mostram a prévia proporcional e são agendadas para a próxima renovação. Não executar cobranças, créditos ou reembolsos pela prévia.
