# Trocas de assinatura

Permissão exclusiva de administradores existentes. O backend valida sessão e a role administrativa, conta, plataforma, plano ativo e valores da prévia. O plano de funcionalidades do Lessonara é aplicado pela RPC autoritativa do produto; a assinatura comercial isolada não concede acesso. A função administrativa não fica disponível ao professor.

O modal oferece Aplicar agora ou Na próxima renovação. A aplicação imediata registra vigência na data atual de São Paulo e processa somente a operação confirmada durante a requisição; o agendamento conserva a próxima renovação. Ambos preservam vencimento, sessões, pagamentos e cobranças emitidas. A prévia proporcional é referência para ajuste manual, sem cobrança, crédito ou reembolso automático.

O registro guarda modalidade, valores, operador e UUID da operação. A migração 20261027000008 acrescenta request_subscription_change com p_timing (padrão renewal) e claim_requested_subscription_change com filtro p_id. As funções schedule_subscription_change e claim_subscription_changes anteriores são preservadas para compatibilidade. O cron sem filtro mantém o processamento normal. Revisões do acesso e preços protegem contra estado obsoleto; índice único impede duas trocas abertas na mesma conta. O worker confere os termos atuais antes de alterar o acesso.

Acesso no produto e assinatura comercial ficam em bancos separados. O acesso é aplicado primeiro com operação idempotente; depois a assinatura é finalizada. Falhas ficam pendentes para retry e nunca são apresentadas como aplicação concluída. O fluxo mantém lease, até cinco tentativas automáticas e revisão manual. Depois de uma tentativa não se oferece cancelamento: a origem pode já ter aplicado o acesso; é necessário concluir/revisar a operação. Antes da primeira tentativa, cancelamento permanece disponível.

Nenhuma sessão é revogada. O professor recarrega o Lessonara para atualizar a interface; autorizações do servidor e do banco usam o plano atual. Os testes de banco usam PGlite com schemas descartáveis e executam as migrações reais, sem chamadas ao Supabase de produção. QA visual usa dados fictícios e não altera planos reais.

Validação em 27/10/2026: 70 testes aprovados, lint e build Node 24.22.1 aprovados; QA visual do modal e do retry com dados fictícios. Migração aplicada ao banco do admin sem remover as funções existentes. Nenhuma conta real teve o plano alterado nesta validação.
