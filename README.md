# Baixada FC

Fundação da plataforma SaaS multi-tenant para sites esportivos.

## Estrutura

- `apps/web`: site público, painel do tenant, painel da plataforma e API HTTP.
- `apps/worker`: outbox, agendamentos e processamento assíncrono.
- `packages/core`: regras de domínio independentes de framework.
- `packages/contracts`: validação dos contratos de entrada e saída.
- `packages/database`: acesso ao PostgreSQL e migrações SQL.
- `infra`: contêineres, proxy e política operacional.

## Executar localmente

1. Inicie o PostgreSQL com `docker compose up -d postgres`.
2. Configure segredos locais fora do Git. O Next.js lê `apps/web/.env.local`; para o worker, carregue o `.env.local` da raiz antes de iniciá-lo (`set -a; source .env.local; set +a`). Esses arquivos locais são ignorados pelo Git.
3. Instale dependências com `pnpm install`.
4. Execute migrações com credencial administrativa: `DATABASE_URL=postgresql://baixada:baixada@localhost:5435/baixada pnpm db:migrate`. A aplicação deve usar o login `baixada_local_login`, não o usuário administrador.
5. Inicie o site com `pnpm dev` e, em outro terminal, carregue `.env.local` da raiz e inicie `pnpm dev:worker`.

As notificações administrativas permanecem no painel mesmo se o e-mail falhar. No ambiente local, `EMAIL_PROVIDER=console` mantém os envios externos desligados. Para habilitar entregas, configure `EMAIL_PROVIDER=resend`, `EMAIL_FROM` e `RESEND_API_KEY` no worker, usando uma chave exclusiva deste projeto e um remetente/domínio verificado; não reutilize credenciais de outros produtos. Recuperação de senha, confirmação de responsável e convite de administrador usam a outbox, com idempotência, retentativas e descarte do token após a entrega. Sem configuração Resend, os eventos permanecem pendentes para processamento posterior.

## Acesso seguro (Fatia 2)

- Contas globais podem ter vínculos independentes em vários tenants; o contexto é explícito por tenant.
- Superusuários e administradores passam por MFA TOTP; credenciais de recuperação são de uso único.
- Redefinição de senha usa token de uso único, resposta que não revela se o e-mail existe e revogação das sessões ativas.
- Limites de tentativas são compartilhados via PostgreSQL. Convites administrativos expiram em sete dias e são auditados.
- A Fatia 2 está concluída e validada localmente. O envio real de e-mail depende da configuração operacional da chave e domínio próprios do Baixada no Resend; isso não bloqueia iniciar a Fatia 7.

Para servir o build de produção, execute `pnpm --filter @baixada/web build` e depois
`node apps/web/.next/standalone/apps/web/server.js`. O build copia automaticamente
os arquivos CSS e JavaScript para o bundle standalone.

Rotas de demonstração:

- `/`: site público.
- `/admin`: painel editorial do tenant.
- `/platform`: painel global do SaaS.
- `/api/v1/health`: saúde básica do processo web.

## Validação

Use `pnpm typecheck`, `pnpm test` e `pnpm build`. As migrações devem ser validadas contra PostgreSQL real antes de qualquer implantação.
