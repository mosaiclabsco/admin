# Node.js e Next.js — atualização de 24/10/2026

Semana revisada: 19 a 24/10/2026. Node.js: boletim de 21/10; Next.js: último boletim publicado encontrado em 14/10, sem novo aviso nesta semana na listagem oficial consultada.

- Desenvolvimento e CI: Node **24.22.1**, selecionado por `.nvmrc`.
- Vercel: `engines.node = "24.x"`; o provedor gerencia as versões minor/patch. Uma configuração 24.x não comprova sozinha que o patch chegou ao processo em execução.
- Next.js e pacotes relacionados: **16.4.3**. É uma atualização de manutenção que inclui as correções de segurança de 16.4.1.
- React e React DOM: **19.3.1**, alinhados com a atualização do protocolo RSC.
- Lockfile atualizado. O build imprime a versão do Node; a inicialização do servidor registra `node_runtime_version`, sem dados de requisições ou segredos, para conferir o runtime gerenciado.

Usar `nvm install && nvm use` antes de instalar ou compilar localmente. O Node global de outros projetos não foi substituído. O binário utilizado nas validações foi baixado de nodejs.org e conferido pelo SHA256 publicado pelo projeto.

## Fontes oficiais

- [Node.js: segurança de outubro](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [Node.js 24.22.1](https://nodejs.org/en/blog/release/v24.22.1)
- [Next.js: atualização de segurança de 14/10](https://nextjs.org/blog/nextjs-security-update-october-14-2026)
- [Next.js 16.4.3](https://github.com/vercel/next.js/releases/tag/v16.4.3)
- [React 19.3.1](https://github.com/react/react/releases/tag/v19.3.1)
- [Vercel: rollout do runtime e limites da proteção WAF](https://vercel.com/kb/bulletin/node-js-security-advisory)

A auditoria de pacotes não verifica o binário do Node e não substitui a leitura dos boletins. Validação de build, publicação e evidência de runtime devem ser registradas separadamente.
