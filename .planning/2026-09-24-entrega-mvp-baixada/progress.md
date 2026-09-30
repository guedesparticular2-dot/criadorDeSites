# Progress Log

## Session: 29–30/09/2026 — fronteira de confiança RLS

- **Status:** implementação de código concluída; gate de implantação permanece aberto até configurar chaves e validar no ambiente de destino.
- Reproduzida em teste de regressão a falsificação do tenant e do marcador Superusuário por GUCs PostgreSQL não assinados.
- Adicionada migração `0015_signed_rls_context.sql`: PostgreSQL valida HMAC, escopo, expiração, status global, vínculo aprovado e papel Superusuário; políticas tenant exigem contexto assinado e leituras públicas ficam limitadas a conteúdo publicado do tenant assinado.
- Adicionado signer TypeScript para a web e signer SYSTEM isolado para o worker, com chaves independentes.
- Convertidos os fluxos web e worker para contexto assinado; `rg` não encontra mais setters de tenant/Superusuário legados em código de runtime.
- A resolução de domínio público foi separada em função SECURITY DEFINER de saída mínima; tema/conteúdo passam a ser consultados sob PUBLIC assinado.
- Votos individuais passaram a ser privados por RLS; leitura pública usa função de agregação, sem expor quem votou.
- Atualizados Compose, `.env.example`, instruções de produção e privilégios de execução; nenhuma chave real foi criada ou gravada.
- Sequência completa de migrações aplicada em base descartável limpa `baixada_rls_test_20260929d`; regressões `isolation.sql` e `phase2_access_invariants.sql` passaram com runtime sem BYPASSRLS.
- A regressão inclui GUC adulterado, assinatura tenant válida sem membership, assinatura PLATFORM válida sem papel SUPERUSER, replay de assinatura com claims alterados e leitura pública isolada.
- Nenhuma chave real foi gerada e nenhuma migração foi aplicada ao banco de desenvolvimento/operacional ou produção; aguardando escolha/armazenamento seguro das chaves de ambiente antes de ativar o novo contrato de contexto nesse banco.
- Verificações: TypeScript de database, worker e web; build TypeScript do worker; testes Vitest do signer (3/3); duas suítes SQL em base descartável.

## Session: 24/09/2026

### Phase 1: Base, design e piloto multi-tenant

- **Status:** complete
- Actions taken:
  - Consolidado o plano do MVP em entregas verticais.
  - Registrado o estado atual: design, banco, piloto de provisionamento e limitações.
  - Criado o plano persistente para orientar as próximas sessões.
  - Delimitado o fechamento da Fatia 1: domínio canônico, feedback, auditoria e isolamento; upload de logo fica na Fatia 5 com o pipeline de mídia.
  - Ajustada a leitura da configuração visual para estabelecer o contexto RLS do tenant antes de consultar `tenant_theme_configs` para usuários não-superusuários.
  - Removido o fallback público entre hosts: domínio não canônico ou inexistente retorna 404.
  - Criado o tenant Aurora apenas no banco local de desenvolvimento para validar isolamento efetivo de domínio, tema e release.
- Files created/modified:
  - `docs/PLANO_DE_ENTREGA_MVP.md`
  - `.planning/2026-09-24-entrega-mvp-baixada/task_plan.md`
  - `.planning/2026-09-24-entrega-mvp-baixada/findings.md`
  - `.planning/2026-09-24-entrega-mvp-baixada/progress.md`

## Test Results

| Test | Input | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| Build web | Next standalone | Compilar rotas dinâmicas | Concluído | Passou |
| Tipos | Web e database | Sem erros TypeScript | Concluído | Passou |
| Provisionamento | Superusuário → Baixada | Tema, administrador e release | Persistidos no PostgreSQL local | Passou |
| Aparência | Admin do Baixada | Nova configuração publicada | Versão publicada e anterior preservada | Passou |
| Isolamento de domínio | `aurora.localhost` | Tenant e tokens próprios | HTTP 200, nome Clube Aurora e azul `#3D87B4` | Passou |
| Host não cadastrado | `inexistente.localhost` | Não expor outro tenant | HTTP 404 | Passou |
| Invariantes de publicação | Baixada e Aurora | Uma release e um tema publicados por tenant | 1 tema e 1 release para cada tenant | Passou |
| TOTP e cifra | Vetor RFC 6238 e AES-256-GCM | Código TOTP e segredo reversível somente com chave | Validado | Passou |
| Fluxo sem desafio MFA | `/acesso/mfa` sem cookie | Retornar ao login sem criar sessão | HTTP 307 para `/acesso?erro=mfa-expirado` | Passou |
| Contexto de tenant | Admin Baixada com `app.user_id` | Ver somente associação própria | `baixada | PRIMARY_ADMIN` | Passou |
| Migrações MFA | Banco local | 0006 e 0007 aplicadas | Confirmadas em `schema_migrations` | Passou |
| Catálogo de permissões | Banco local | Papéis com permissões iniciais corretas | ADMIN: 4; PRIMARY_ADMIN: 7; aparência presente no Principal | Passou |
| Build Fatia 2 | Next standalone | Rotas MFA, escolha de tenant e autorização | Concluído | Passou |

## Error Log

| Timestamp | Error | Attempt | Resolution |
| --- | --- | --- | --- |
| 24/09/2026 | Script do plano sem permissão de execução | 1 | Executado pelo `sh`. |
| 24/09/2026 | `pnpm typecheck` exigiu limpeza interativa | 1 | Usado `tsc` direto; nenhuma dependência foi removida. |
| 24/09/2026 | Seed local de validação com coluna ambígua | 1 | Coluna SQL qualificada; transação refeita com sucesso. |
| 24/09/2026 | Caminho do executável `tsx` inexistente no pacote web | 1 | Usado o runtime instalado no pacote database. |
| 24/09/2026 | `tsx` não pôde abrir pipe IPC no sandbox | 1 | Teste local reexecutado com permissão aprovada; passou. |
| 24/09/2026 | Seletor CSS de auditoria não correspondia à folha atual | 1 | Localizado o seletor atualizado e inseridos estilos MFA sem alterar regras existentes. |

## 5-Question Reboot Check

| Question | Answer |
| --- | --- |
| Where am I? | Fatia 1 concluída, piloto multi-tenant validado. |
| Where am I going? | Fatia 2: MFA, pessoas, permissões e contexto de tenant. |
| What's the goal? | MVP multi-tenant Baixada em VPS com segurança e administração real. |
| What have I learned? | `findings.md` e plano de entrega consolidam a arquitetura e as lacunas. |
| What have I done? | Design-base, provisionamento, identidade publicada, auditoria e isolamento por domínio foram entregues e testados localmente. |

## Session: 24/09/2026 — Fatia 2

### Phase 2: Identidade, MFA e autorização

- **Status:** in_progress
- Actions taken:
  - Iniciado o incremento de autenticação administrativa: TOTP, recuperação e desafio temporário entre senha e sessão.
  - Confirmado que o schema atual já possui a exigência de MFA no usuário e sessões administrativas, mas ainda não guarda fatores ou desafios MFA.
  - Confirmado que o repositório não é um checkout Git; a verificação de diff não está disponível neste diretório.
  - Implementado MFA administrativo TOTP com segredo cifrado, desafio de dez minutos, prevenção de reuso do mesmo código, códigos de recuperação de uso único e exibição única após ativação.
  - Removido o bypass de sessão na configuração inicial: o primeiro Superusuário também passa pelo MFA.
  - Implementada a tela de escolha explícita de instância e política RLS limitada aos vínculos do próprio usuário.
  - Criado catálogo inicial de permissões e aplicada verificação granular para publicação da aparência.
  - Implementado cadastro público pendente, confirmação de responsável para menor, fila de aprovação/rejeição, promoção/revogação de administradores e suspensão de vínculo.
  - Implementado modo de suporte identificado para Superusuário, com motivo, início/fim e auditoria; não há personificação.
- Files created/modified:
  - `packages/database/migrations/0006_administrative_mfa.sql`
  - `packages/database/migrations/0007_membership_context_policy.sql`
  - `apps/web/src/lib/mfa.ts`
  - `apps/web/src/lib/auth.ts`
  - `apps/web/src/lib/tenant.ts`
  - `apps/web/src/app/acesso/mfa/**`
  - `apps/web/src/app/admin/page.tsx`
  - `packages/database/migrations/0008_permission_catalog.sql`
  - `packages/database/migrations/0009_registration_membership_link.sql`
  - `apps/web/src/lib/registration.ts`
  - `apps/web/src/lib/people.ts`
  - `apps/web/src/app/cadastro/**`
  - `apps/web/src/app/admin/[slug]/pessoas/**`
  - `apps/web/src/app/platform/suporte/**`

## Session: 24/09/2026 — Fatias 3 e 4

### Phase 3: Conteúdo e release

- **Status:** in_progress
- Actions taken:
  - Criada a migração `0010_release_content_snapshots.sql`: uma release passa a carregar uma fotografia versionada de conteúdo, isolada por tenant e protegida por RLS.
  - Criado o painel inicial de Conteúdo para salvar notícia em rascunho e publicar uma release atômica, com auditoria e rotas previstas para detalhes de histórias.
  - Adicionado o atalho Conteúdo ao painel da instância.

### Phase 4: Mídia, moderação e comunidade

- **Status:** in_progress
- Actions taken:
  - Criado o painel Mídia e o recebimento de imagem por tenant.
  - Validação no servidor cobre MIME permitido, assinatura binária, tamanho máximo de 25 MB e bloqueio preventivo a 80% de ocupação do disco.
  - O upload é salvo como `TEMPORARY_ORIGINAL`, contabilizado por evento append-only, auditado e associado a um job idempotente de geração de variantes.
  - Aplicada a migração `0010_release_content_snapshots.sql` no PostgreSQL local.
  - Implementado worker com `sharp`: reclama jobs sem corrida, gera `thumb`, `medium` e `large` em WebP, valida cada arquivo, registra variantes e só descarta o original após sucesso.
  - Implementado painel de consentimento de imagem e moderação: referência externa, revogação que oculta mídias vinculadas e ocultação preventiva com caso de prazo de 24 horas.
  - Implementadas APIs autenticadas para votar em enquete e publicar comentários; o banco impede voto duplicado e o autor pode excluir apenas o próprio comentário.
- Files created/modified:
  - `packages/database/migrations/0010_release_content_snapshots.sql`
  - `apps/web/src/lib/content.ts`
  - `apps/web/src/app/admin/[slug]/conteudo/**`
  - `apps/web/src/lib/media.ts`
  - `apps/web/src/app/admin/[slug]/midia/**`
  - `apps/web/src/app/admin/[slug]/page.tsx`
  - `apps/web/src/app/globals.css`

## Test Results (continued)

| Test | Input | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| Typecheck direto | Web, database e worker | Sem erros TypeScript | Concluído | Passou |
| Migração de release | PostgreSQL local | Criar projeção imutável por release | `0010_release_content_snapshots.sql` aplicada | Passou |
| Build de produção | Next.js standalone | Compilar upload e rotas administrativas | Concluído; `/admin/[slug]/conteudo` e `/admin/[slug]/midia` reconhecidas | Passou |
| Prévia atualizada | `GET /admin/baixada/midia` | Rota existente deve exigir sessão | HTTP 307 para `/acesso` | Passou |
| Worker de mídia | PNG de teste local | Três variantes, job concluído e original descartado | 3 variantes `READY`, job `SUCCEEDED`, `asset_stage = DERIVED` | Passou |
| Moderação | `GET /admin/baixada/moderacao` sem sessão | Tela administrativa deve exigir autenticação | HTTP 307 para `/acesso` | Passou |
| API de voto | POST sem sessão | Não aceitar participação anônima | HTTP 401 | Passou |
| Build Fatia 4 | Next.js standalone | Rotas de moderação, comentários e voto compiladas | Concluído | Passou |

## Error Log (continued)

| Timestamp | Error | Attempt | Resolution |
| --- | --- | --- | --- |
| 24/09/2026 | `pnpm --filter @baixada/web typecheck` exigiu remoção interativa de módulos | 1 | Executado `tsc` local direto, sem remover dependências. |
| 24/09/2026 | Tipos `postgres` não são dependência direta do pacote web | 1 | Reutilizado o tipo `DatabaseQuery` exportado pelo pacote database. |
| 24/09/2026 | Script de teste não encontrou o executável `tsx` na raiz | 1 | Reexecutado pelo runtime do pacote database no contexto do web. |
| 24/09/2026 | Disco local acima de 80% bloqueou upload de integração | 1 | Bloqueio confirmado como correto; worker testado com artefato temporário isolado. |

## Session: 26/09/2026 — Fechamento da implementação da Fatia 5

### Phase 5: Operação SaaS e lançamento

- **Status:** implementation_complete; produção/go-live aguardando gates externos.
- Actions taken:
  - Concluído o fluxo Superusuário de domínios personalizados com prova DNS TXT ou arquivo HTTP, token exibido uma vez e persistido apenas como hash, expiração/tentativas limitadas, auditoria, confirmação de posse e teste real de HTTPS antes da troca do domínio canônico.
  - Adicionada interface de gerenciamento de domínios em `/platform/domains`, com aviso explícito de que DNS, configuração do Caddy e certificados TLS são externos ao painel.
  - Implementada reconciliação periódica no worker de usuários aprovados, páginas da release atual e bytes físicos de mídia, lixeira, temporários, derivados e comprovantes privados; atualiza contadores reconstruíveis e gera alertas persistentes a partir de 80% sem bloqueio rígido.
  - Integrados alertas de cota às notificações persistentes no painel; entregas de e-mail ficam `PENDING` porque ainda não há transporte/provedor configurado.
  - Implementados lembretes de cobrança vencida/no quinto dia e suspensão comercial automática no décimo dia, com histórico, auditoria, flags de bloqueio, acesso administrativo limitado e reativação manual somente após regularização.
  - Protegidos comprovantes opcionais de recebimentos manuais em diretório privado, com validação de formato/assinatura e tamanho, acesso exclusivo de Superusuário e auditoria de cada leitura.
  - Atualizados os textos operacionais do financeiro/domínios para não prometer funcionalidades externas que não estão configuradas.
  - Criada a migração aditiva `0011_phase5_operations.sql` para chave idempotente de notificações e índices operacionais; aplicada no PostgreSQL local (`schema_migrations`).
  - Atualizado o checklist persistente: implementação de software da Fatia 5 concluída; validação jurídica, escolha de provedores, implantação, DNS/TLS, restauração e UAT permanecem como gates de lançamento.
- Files created/modified:
  - `packages/database/migrations/0011_phase5_operations.sql`
  - `apps/web/src/lib/platform-operations.ts`
  - `apps/web/src/lib/platform-domains.ts`
  - `apps/web/src/app/platform/finance/**`
  - `apps/web/src/app/platform/domains/**`
  - `apps/web/src/app/api/platform/finance/evidence/**`
  - `apps/web/src/app/api/platform/domains/**`
  - `apps/web/src/lib/tenant.ts`
  - `apps/web/src/lib/content.ts`
  - `apps/worker/src/platform-operations.ts`
  - `apps/worker/src/index.ts`
  - `apps/web/src/app/globals.css`
  - `apps/web/next.config.ts`
  - `.planning/2026-09-24-entrega-mvp-baixada/**`
- Remaining launch gates:
  - Configurar provedor transacional de e-mail e confirmar processamento/retry de `notification_deliveries`.
  - Escolher destino externo de backup e implementar/validar execução, retenção, criptografia, alertas e restauração de PostgreSQL/WAL e mídia.
  - Configurar VPS reforçada, segredos de produção, papel de runtime sem `BYPASSRLS`, proxy Caddy, DNS e TLS; `docker-compose.yml` atual é apenas desenvolvimento.
  - Validar política LGPD/retensão com assessoria jurídica e ensaiar solicitações de titulares.
  - Homologar com dois tenants, testar suspensão/reativação, recuperação e go-live.
  - O bloqueio de login de membro está especificado, mas o fluxo de autenticação de membros ainda não existe; conectar a política ao ser implementado.
- Verification:
  - Migração `0011_phase5_operations.sql` aplicada com sucesso no PostgreSQL local; mudança contém DDL aditivo.
  - Typechecks diretos do web e worker passaram após as alterações finais.
  - Testes automatizados, build final, UAT e restauração não executados nesta sessão.
  - O diretório não é checkout Git; não foi possível produzir diff/status de Git.

## Session: 26/09/2026 — Decisão de moderação de comentários para a Fatia 6

- Decisão consolidada: “bloquear abuso” significa ocultar ou remover o comentário inapropriado por ação de moderador; não bloqueia nem suspende automaticamente a associação do autor.
- Ao moderar, o autor recebe uma notificação interna persistente, mostrada em modal no próximo acesso e mantida até reconhecimento. E-mail não será usado para esse aviso no MVP.
- Nenhum código foi alterado nesta etapa.

## Session: 26/09/2026 — Política de comentário e denúncia para a Fatia 6

- Comentários ficam visíveis imediatamente e a moderação é posterior.
- Outros usuários podem denunciar comentários. A denúncia cria caso para a fila administrativa, sem ocultação automática; o comentário fica visível até decisão do moderador.
- A ação do moderador de ocultar/remover gera a notificação interna previamente definida ao autor, em modal no próximo acesso até reconhecimento.
- Moderação automática por IA é uma evolução futura; o nome de fornecedor/modelo (mencionado como “Jav”) ainda precisa ser confirmado. Não entra no MVP/Fatia 6.
- Nenhum código foi alterado nesta etapa. Ainda será necessário decidir quem pode denunciar (qualquer visitante autenticado ou apenas membro aprovado do tenant) e definir o escopo das notificações administrativas por e-mail.

## Session: 26/09/2026 — Início da Fatia 5

### Phase 5: Operação SaaS e lançamento

- **Status:** in_progress
- Actions taken:
  - Confirmado que o schema da fundação já contém contratos, versões contratuais, cobranças, pagamentos, alocações, cotas, contadores, desafios de domínio e suspensões; sem criar entidades duplicadas.
  - Criada a central `/platform/finance`, exclusiva do Superusuário, com os seis indicadores financeiros acordados: receita contratada mensalizada, previsto e recebido no mês, vencido, a vencer e inadimplência.
  - Implementados atualização versionada de contrato/plano, lançamento manual de cobrança e registro/alocação de recebimento em BRL, todos com auditoria. Comprovantes continuam fora deste fluxo.
  - Implementada suspensão comercial imediata com motivo, confirmação explícita, políticas de bloqueio e histórico/auditoria, além de reativação exclusivamente de suspensão comercial.
  - Ajustado o acesso ao tenant suspenso: administradores do tenant podem consultar apenas o estado de suspensão/regularização; rotas administrativas normais são bloqueadas. A suspensão bloqueia resolução do site público e a publicação também verifica o estado operacional dentro da transação.
- Files created/modified:
  - `apps/web/src/lib/platform-operations.ts`
  - `apps/web/src/app/platform/finance/**`
  - `apps/web/src/app/platform/page.tsx`
  - `apps/web/src/lib/tenant.ts`
  - `apps/web/src/lib/content.ts`
  - `apps/web/src/app/admin/[slug]/page.tsx`
  - `apps/web/src/app/globals.css`
  - `.planning/2026-09-24-entrega-mvp-baixada/**`
- Remaining in Phase 5:
  - Verificação de domínios personalizados e fluxo DNS TXT/HTTP.
  - Contadores de cota reconciliáveis e avisos suaves de consumo.
  - Avisos e suspensão automática após dez dias de atraso.
  - O login de membros ainda não faz parte dos fluxos existentes; a política de suspensão deverá ser aplicada nele quando esse acesso for introduzido. Neste incremento, a regra é aplicada ao site público, às rotas/publicação administrativas e ao painel limitado.
  - Comprovantes financeiros protegidos, validação jurídica LGPD, backups e preparação VPS/go-live.
- Verification: `tsc --noEmit --incremental false -p apps/web/tsconfig.json` passou. Nenhum teste automatizado ou alteração de dados do banco foi executado nesta sessão.
| 24/09/2026 | `sharp.metadata()` não forneceu tamanho de arquivo | 1 | Worker passou a obter tamanho via `stat` antes do rename. |
| 24/09/2026 | Execução manual do worker não recebeu `DATABASE_URL` | 1 | Reexecutada com as variáveis do container; processamento passou. |
| 26/09/2026 | Runner da migração 0011 não pôde criar pipe IPC no sandbox | 1 | Reexecução autorizada do comando do projeto aplicou a migração com sucesso. |

## Session: 27/09/2026 — Início da Fatia 8

- **Status:** in_progress; sem implantação em VPS ou uso de dados reais.
- Decisão registrada: solicitação de exclusão LGPD feita em um tenant deve excluir apenas dados elegíveis daquele tenant; preservar identidade global e demais vínculos.
- Corrigidos os contextos de build Docker para incluir `packages/database`; declarada a dependência workspace faltante do worker.
- Criado `compose.production.yml` como base de app/worker/Caddy, sem publicar PostgreSQL, com variáveis obrigatórias para URL de banco, chave MFA, domínios e TLS; mantido separado do Compose de desenvolvimento.
- Criado `infra/PRODUCAO.md` com gates de preparação e validação. Registrado bloqueador crítico: as políticas RLS confiam em GUCs customizadas (`app.is_superuser`, tenant), que podem ser alteradas pela própria conexão de runtime e não provam isolamento contra SQL arbitrário.
- Pendências locais: gerar/validar lockfile do worker, construir imagens, typecheck/testes, desenhar e testar correção real da fronteira RLS, completar fluxo de titular com escopo tenant e relatório minimizado.
- Gates para amanhã: VPS, DNS/TLS, Resend próprio, destino externo de backup/WAL, teste de restauração, validação jurídica e UAT.
- Validado `pnpm install --lockfile-only --offline`; lockfile sincronizado com a dependência workspace do worker.
- `pnpm typecheck` não conseguiu iniciar porque o pnpm tentou buscar metadados de rede e limpar `node_modules` sem TTY. Alternativa direta: `tsc --noEmit --incremental false` nos projetos web, worker e database passou.
- `vitest run`: 5 arquivos, 12 testes passaram.
- `docker compose -f compose.production.yml config --quiet`: passou com valores fictícios exclusivamente para validar interpolação. Sem segredos reais.
- Imagens `baixada-web:phase8` e `baixada-worker:phase8` construídas localmente com sucesso. A primeira tentativa web falhou por falta de `docs/design-tokens/BAIXADA_BASE_v1.json` no contexto; incluído no Dockerfile e build repetido passou.
- Não executados: migrações em produção, testes de isolamento contra banco de produção, envio real de e-mail, restauração, DNS/TLS ou deploy.

## Session: 27/09/2026 — conclusão da Fatia 2

- **Status:** implementação da Fatia 2 concluída localmente. A Fatia 7 pode começar sem dependência de código da Fatia 2; envio ao vivo de e-mail segue como configuração operacional externa.
- **Já existe:** login/sessões, TOTP obrigatório nos papéis administrativos, recuperação por códigos de uso único, cadastro/consentimento de responsável, aprovação de membros, gestão básica de papéis, contexto explícito, suporte identificado e catálogo/verificação de permissões.
- **Lacunas confirmadas:** redefinição de senha ausente apesar da tabela `password_reset_tokens`; outbox marca mensagens de responsável como processadas sem enviar; provisionamento pede senha inicial em vez de convite; gestão visual de overrides granulares e transferência do Administrador Principal não foram localizadas; login/MFA não impõem limite aos campos de tentativas existentes.
- **Decisão de credenciais:** a chave `Onboarding` foi revogada. Não reutilizar `nossas-letras-producao`; a Fatia 2 será construída para chave própria Baixada configurada fora do repositório. Testes locais não enviarão e-mail real.
- **Implementação concluída:** migrações `0013_phase2_access_completion.sql` e `0014_phase2_registration_rate_limits.sql` criam rate limits, convites administrativos e estado de recuperação de eventos da outbox. Cadastros limitados por tenant e endereço (100/h por tenant e 5/h por e-mail); convites limitados a 10/h por administrador. Adicionados fluxos de redefinição de senha e convite, autorização granular e transferência auditada do Administrador Principal; eventos de responsável, recuperação e convite passam pelo worker Resend/console com idempotência, retentativas e descarte de tokens.
- **Validação:** `pnpm typecheck`, `pnpm test` e `pnpm --filter @baixada/web build` passaram. Os testes unitários MFA passaram (3/3), os testes do core (9/9); worker e packages/database não possuem testes Vitest próprios. Invariantes SQL executadas contra PostgreSQL local sob role sem BYPASSRLS passaram após as migrações, incluindo isolamento RLS entre tenants e constraints de rate limit; fixtures foram revertidas.
- **Gate externo:** falta configurar e validar remetente/domínio e uma chave Resend exclusiva do Baixada para comprovar entrega real. Nenhuma chave de outro produto foi usada.

## Session: 27/09/2026 — início da Fatia 7

- **Reconciliação de escopo:** a implementação de software de domínios, contratos/cotas, financeiro BRL, comprovantes privados e suspensão comercial automática já existe, mas estava registrada na Fatia 5 e faltava associar sua validação de aceite à Fatia 7. A Fatia 7 passa a ser acompanhada como aceite operacional, sem reimplementar componentes existentes.
- **Primeira entrega iniciada:** adicionado `packages/database/tests/phase7-smoke.ts` e comando `pnpm --filter @baixada/database test:phase7-local`. O teste possui guarda para só executar contra `localhost/baixada`, cria tenant e usuário descartáveis e cobre pagamento parcial e integral de cobrança vencida, restauração do status financeiro, edição/versionamento de contrato, suspensão e reativação operacional independentes e leitura do painel do Superusuário; a limpeza é executada em `finally`.
- **Validação concluída:** `pnpm typecheck` passou e `RUN_PHASE7_LOCAL=1 DATABASE_URL=postgresql://baixada:baixada@localhost:5435/baixada pnpm --filter @baixada/database test:phase7-local` passou contra PostgreSQL Docker local. O teste confirmou as transições e a limpeza da fixture.
- **Validação ampliada:** o smoke executou reconciliação de um tenant específico, mediu arquivo sintético de 9 bytes, abriu alerta suave com limite comercial de 10 bytes, gerou quatro notificações administrativas e suspendeu automaticamente no exato 10º dia. O segundo tenant manteve cobrança, status e contador intocados. Testou reativação manual/comercial, contrato e financeiro.
- **Domínio:** desafio DNS criado com hostname normalizado e token armazenado somente como hash; ativação pendente foi recusada sem rede; após estado verificado controlado, a ativação trocou o domínio canônico de forma atômica e passou por TLS probe simulado. Nenhum DNS ou domínio real foi alterado.
- **Achado de segurança corrigido:** quatro APIs (`finance/evidence`, `domains/challenges`, `domains/[domainId]/verify` e `domains/[domainId]/activate`) verificavam somente o papel Superusuário. Agora também exigem sessão administrativa (emitida após MFA).
- **Validação final:** `pnpm typecheck`, `pnpm test` e `pnpm --filter @baixada/web build` passaram após as alterações; o smoke local da Fatia 7 passou com as fixtures removidas.
- **Status:** Fatia 7 concluída localmente. DNS/TLS real, Resend, VPS, backup e restauração seguem como gates externos da Fatia 8.
- **Limitação do workspace:** este diretório não contém `.git`; diffs Git/status de usuário não estão disponíveis. Preservar todo conteúdo e verificar as mudanças por arquivos/testes.

## Session: 30/09/2026 — preparação específica de produção Baixada

- **Skills aplicadas:** `system-design` (repositório existente; a forma monólito modular em dois processos/VPS única já está decidida nos documentos) e `oma-db`; o guia EasyPanel anexo foi lido como referência operacional, sem instruções nele serem tratadas como autorização para acessar a VPS.
- **Inventário:** domínio informado como registrado, mas DNS não checado; local DB ainda só tem `baixada.localhost`/`aurora.localhost`; workspace sem `.git`, remoto ou deploy doc. Não foram tentados hosts/caminhos SSH.
- **Hardening local:** adicionado `.dockerignore` para excluir `.env*`, dumps, mídia e artefatos locais do build context. Web e worker passam a rodar como `node`, com permissões preparadas para `.next/cache` e `/data/uploads`.
- **Configuração por projeto:** criado `infra/baixada.production.env.example` (placeholders apenas) e `docs/infraestrutura/deploy.md` com topologia, alvo apex, DNS/TLS, banco, segredos e gates EasyPanel. Atualizados `infra/PRODUCAO.md`, README e estado do plano persistente.
- **Healthcheck:** Compose passa a consultar `/api/v1/health` (liveness HTTP); documentado que não verifica PostgreSQL e que o worker ainda não tem endpoint próprio. O banco será parte do smoke pós-deploy.
- **Validação:** `docker compose -f compose.production.yml config --quiet` passou com valores fictícios; `docker compose ... build web worker` passou; `docker image inspect` confirmou `user=node` nas duas imagens. Typecheck direto dos pacotes web, worker e database passou; Vitest 6 suites / 15 testes passou.
- **Estado RLS:** migração 0015 e chaves somente no ambiente local, depois de dump prévio validado por `pg_restore --list`; login de runtime local sem `SUPERUSER`/`BYPASSRLS`; tenant e SYSTEM signer testados, GUC legado não escalou privilégio. Não há mudança em produção.
- **Erros/recuperação:** tentativa de ler `schema_migrations` no schema `app` foi corrigida para `public`; a primeira execução da migração 0015 falhou em comparação UUID/texto e foi corrigida antes de aplicar no banco local; pnpm host tentou acesso à rede/limpeza sem TTY, então typechecks/testes locais foram chamados diretamente; Docker BuildKit exigiu aprovação de acesso fora do workspace e concluiu depois.
- **Bloqueadores atuais:** inventário VPS/EasyPanel e PostgreSQL, DNS A/AAAA/IP e certificado, Git remoto/branch, chave/remetente Resend, destino backup/WAL/mídia, restore observado, UAT e aprovação jurídica. Próxima ação única: obter inventário confirmado para preencher o deploy específico antes de qualquer operação remota.
