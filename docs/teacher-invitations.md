# Acesso inicial de professores

Em **Lessonara → Contas**, use **Convidar professor**. O professor escolhe a própria senha pelo link enviado por email. Em contas novas, o plano inicial é lido do cadastro ativo de planos e aplicado ao acesso efetivo do Lessonara; a conta comercial começa em avaliação, sem pagamento registrado.

Em contas existentes, o envio usa recuperação de senha e preserva plano, assinatura e dados. Não é possível usar o convite para mudar o plano. A tela da conta permite reenviar o acesso e consultar envio aceito, definição da senha e último acesso conhecido. A aceitação pelo provedor não confirma entrega na caixa de entrada.

As ações exigem sessão administrativa no servidor, verificam plataforma e vínculo com o professor e registram auditoria sem o link nem a senha. O mesmo email no Mosaic Admin e no Lessonara representa autenticações independentes. Convites não concedem acesso ao painel administrativo.

O reenvio tem intervalo mínimo de um minuto por email. Links são temporários e de uso único. A página de destino só consome o token quando o professor envia a senha. Solicite reenvio quando o link expirar.

A conta da professora do piloto permanece sem convite até a aprovação do teste pelo responsável. A documentação técnica da definição de senha fica no Lessonara em `docs/teacher-access.md`.

Validação: 59 testes do admin aprovados, build e lint dos arquivos alterados aprovados, publicação pronta na Vercel. Um envio real para a conta de teste existente foi aceito pelo provedor, com acompanhamento e auditoria registrados e plano preservado. A escolha da senha pelo destinatário permanece como verificação manual antes do convite do piloto.

O email usa o logo completo oficial hospedado no Lessonara e orienta usar o link de recuperação em até 10 minutos, conforme o limite de OTP configurado.

A migração `20261026000007_account_email_unique.sql` impede contas comerciais com o mesmo email na mesma plataforma, desconsiderando caixa e espaços. O cadastro manual valida o email e apresenta mensagem de duplicidade; o índice protege requisições simultâneas. Um convite não cria um professor paralelo quando já existe conta comercial com esse email e outro vínculo: é preciso revisar a identidade existente. Reenviar para o professor já vinculado continua permitido e não cria nova conta.
