# Jobs e filas

Publicado em 24/10/2026: deploy READY, migração do admin aplicada e conector Lessonara validado pelo snapshot privado. Migrações 0030/0031/0032 e agendamentos Lessonara ativos.

A tela `/{plataforma}/jobs` (incluindo `/all/jobs` e `/lessonara/jobs`) centraliza jobs do admin e do Lessonara. Requer sessão e autorização administrativa. O conector Lessonara só roda no backend; nenhuma chave de serviço vai para o navegador.

## O que mostra

- Jobs cadastrados e cron real do Supabase, com horários em UTC e explicação em Brasília.
- Últimas execuções por job, início, duração, conclusão/falha e métricas em painel lateral.
- Filas de email e Calendar: pendentes, em processamento, falhas, tentativas esgotadas e idade das pendências.
- Janelas de renovação e progresso por lote.
- Lembretes de horário exclusivos do Pro, acompanhados como job separado.
- Falhas de entrega conhecidas, separadas do aceite do provedor.

No admin, `/api/cron/health` roda diariamente às 09h de Brasília pelo cron da Vercel: verifica alvos HTTP, aplica trocas de assinatura agendadas para renovação e limpa verificações com mais de 30 dias. O horário vem do `vercel.json`, não do catálogo pg_cron. A telemetria de execução requer a migração `20261024000006_job_monitoring.sql`. Sem execução desde sua ativação, a tela informa ausência de registro; não presume sucesso.

Detalhes dos workers do Lessonara: `lessonara/docs/workers.md` no repositório do produto. Migrações Lessonara 0030/0031/0032 e novo agendamento aplicados na publicação conjunta.

## Atualização sem SSE

O navegador faz consulta HTTP a cada 30 segundos somente enquanto a aba está visível e online. Ao ocultar, fechar ou sair da tela, o timer para e a requisição em andamento é abortada. Há atualização manual e opção para desligar a automática. A sessão expirada interrompe a atualização automática.

Não existe conexão SSE persistente. Com um operador, duas consultas por minuto enquanto a tela está visível são suficientes para jobs de cinco minutos ou diários. Os jobs continuam no servidor quando o admin está fechado. Atualizar a tela não executa trabalhos nem reenvia emails.

O painel oferece alertas visuais; não há notificação externa independente para avisar quando ninguém está conectado. Essa limitação deve orientar o acompanhamento operacional do piloto.

## Privacidade e falhas

O endpoint `/api/jobs` valida sessão, `is_admin()` e plataforma antes das leituras privilegiadas. Respostas não são armazenadas em cache compartilhado. A ausência de migração/conector é exibida como indisponibilidade, sem fingir fila vazia saudável. Snapshots omitem credenciais, comandos cron, destinatários e conteúdo dos emails.

Histórico de aplicação e sucesso do agendador são separados: enfileirar uma requisição HTTP não prova que o processamento terminou. Um email aceito pelo provedor ainda pode falhar na entrega.


Conferência de implantação: os cinco workers Lessonara responderam 200 via Vault/pg_net, com conclusão registrada. Houve execução automática das janelas de renovação e dos jobs periódicos; filas sem pendências/falhas. O job diário administrativo não foi antecipado e terá seu primeiro registro após a ativação na rotina das 09h. O endpoint de consulta exige login; a sessão do administrador estava expirada e não foi contornada para QA visual.
