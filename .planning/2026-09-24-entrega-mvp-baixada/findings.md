# Findings & Decisions

## Requirements

- Plataforma SaaS multi-tenant, PostgreSQL como fonte de verdade, RLS como segunda barreira e release atômica pública.
- Baixada é o primeiro tenant e referência visual; novos tenants começam em `BAIXADA_BASE v1`.
- Administradores precisam manter o portal sem código; Superusuário provisiona instâncias.
- Produção exige MFA administrativo, retenção/LGPD, processamento seguro de mídia, backup e recuperação.

## Research Findings

- Schema já contém entidades para tenant, domínio, membros, papéis, conteúdo, páginas, releases, temas, mídia, financeiro, auditoria e outbox.
- A implementação inicial era estática; o piloto atual persiste setup, sessão, tenant, tema, release e aparência no PostgreSQL local.
- A home já resolve tenant em `*.localhost` e aplica nome/cores publicadas; conteúdo editorial ainda é referência visual.
- A troca de arquivo de logo não deve ser antecipada como upload simples: o schema exige `media_assets`, variantes, validação e regras de publicação. Ela permanece na Fatia 5; a Fatia 1 entrega identidade textual/cromática e logo-base do tema.
- A resolução pública consulta somente `tenant_domains.hostname` canônico, verificado e associado a tenant ativo. Hostnames não cadastrados retornam 404 e não recebem o conteúdo de referência de outro clube.
- Para administradores comuns, a leitura da configuração visual é feita após estabelecer `app.tenant_id`; isso preserva a proteção RLS e evita descartar overrides de tema.
- A migração `0006_administrative_mfa.sql` adiciona fator TOTP, códigos de recuperação de uso único e desafios de 10 minutos. O segredo é persistido somente após cifragem AES-256-GCM pela aplicação.
- A migração `0007_membership_context_policy.sql` permite listar exclusivamente os vínculos do próprio usuário antes de escolher um tenant; os demais recursos continuam submetidos à política por `tenant_id`.
- A migração `0008_permission_catalog.sql` define sete permissões iniciais. Administradores recebem quatro permissões editoriais por padrão; Administrador Principal recebe o catálogo completo; um override `DENY` sempre vence um `ALLOW` de papel.
- A Fatia 3 usa `site_release_content` como fotografia imutável do conteúdo exibido: alterações no `content_items` não devem chegar ao público até a troca atômica de `tenants.current_release_id`.
- A Fatia 4 já dispõe de `media_assets`, `media_variants`, `media_processing_jobs`, `storage_usage_events`, `outbox_events` e `image_consents`. A primeira entrega grava o original somente em caminho controlado, valida assinatura binária de JPEG/PNG/WebP/HEIC e gera job idempotente para variantes.
- `MEDIA_ROOT` e `MEDIA_DISK_STOP_PERCENT` já são variáveis previstas pelo compose. O limite de 80% é aplicado antes de gravar qualquer upload.
- O worker usa `sharp` no próprio pacote para gerar `thumb` (320 px), `medium` (960 px) e `large` (1920 px) em WebP. Ele reclama o job com `FOR UPDATE SKIP LOCKED`, registra apenas variantes ainda inexistentes e mantém o original em falhas.
- A validação de integração confirmou três variantes `READY`, quatro eventos de uso (original, três derivados e descarte compensado no saldo) e `media_assets.asset_stage = DERIVED` após o processamento.

## Technical Decisions

| Decision | Rationale |
| --- | --- |
| `tenant_theme_configs` possui no máximo uma configuração `PUBLISHED` | A página pública precisa de uma origem visual inequívoca. |
| Provisionamento cria tema e release inicial na mesma transação | Evita tenant parcialmente configurado. |
| Contexto público local usa `slug.localhost` | Permite testar múltiplos tenants sem DNS externo. |
| Plano de entrega organiza segurança antes do editor visual amplo | Um editor sem autenticação, release e isolamento seguros aumentaria retrabalho e risco. |
| Upload de logo permanece na Fatia 5 | Evita criar um caminho de mídia que ignore variantes, limites, autorização e consentimento. |
| MFA será TOTP com segredo cifrado no banco | A aplicação pode validar offline, enquanto o segredo e os códigos de recuperação não ficam em texto claro. |
| Sessão administrativa só nasce após o segundo fator | A senha cria um desafio de curta duração, nunca uma sessão administrativa final. |
| Original de imagem entra como `TEMPORARY_ORIGINAL` | A aplicação não o expõe publicamente e só o worker poderá descartá-lo depois de confirmar todas as variantes obrigatórias. |
| Variantes são WebP derivadas | Reduz transferência pública e mantém um catálogo estável (`thumb`, `medium`, `large`) independente do formato recebido. |
| Financeiro SaaS da Fatia 5 permanece exclusivo do Superusuário | Contratos, valores, pagamentos e comprovantes são dados da plataforma e não ficam expostos aos administradores do tenant. |
| Receita mensal contratada é normalizada pela periodicidade | Mensal usa o ciclo integral, trimestral divide por 3 e anual divide por 12; isso permite comparar contratos diferentes no mesmo indicador. |
| Inadimplência no painel usa saldo vencido dividido por todo o saldo aberto | Pagamentos confirmados reduzem o saldo via alocação; cobrança parcialmente paga não é tratada como integralmente quitada. |
| Suspensão comercial e status financeiro/operacional são dimensões separadas | A suspensão registra políticas explícitas e histórico; reativar encerra somente suspensão comercial, sem alterar o status financeiro. |
| Suspensão limita o administrador ao painel de situação | A resolução pública e publicação exigem tenant ativo; o administrador ainda pode consultar status e buscar regularização. O Superusuário mantém acesso somente pelo suporte identificado. |
| Comentários são publicados imediatamente e moderados posteriormente | Outros usuários podem denunciar o comentário; a denúncia abre um caso e não o oculta automaticamente. Moderador autorizado pode ocultar ou remover o comentário e isso dispara notificação interna persistente ao autor, exibida em modal no próximo acesso até reconhecimento. Não suspende a associação nem envia e-mail por esse aviso no MVP. IA de moderação fica fora da Fatia 6; fornecedor/modelo ainda não definido. |

## Issues Encountered

| Issue | Resolution |
| --- | --- |
| O PostgreSQL local já tinha as três primeiras migrações aplicadas | Aplicadas apenas as migrações 0004 e 0005 pendentes. |
| Build tentou prerenderizar páginas que usam banco | Rotas administrativas foram marcadas como dinâmicas. |

## Resources

- `docs/ESPECIFICACAO_DE_REQUISITOS.md`
- `docs/ARCHITECTURE.md`
- `docs/DESIGN_SYSTEM_BAIXADA_BASE.md`
- `docs/design-tokens/BAIXADA_BASE_v1.json`
- `docs/PLANO_DE_ENTREGA_MVP.md`

## Visual/Browser Findings

- Setup, criação de tenant, login do Administrador Principal e publicação de aparência foram validados no navegador local.
- O tenant Baixada está disponível em `http://baixada.localhost:3000/` no ambiente local.
- A validação local criou o tenant de teste Aurora em `http://aurora.localhost:3000/`: recebeu HTTP 200, nome próprio, `--match-blue: #3D87B4`, tema e release publicados. Um hostname desconhecido recebeu HTTP 404.

## Phase 5 — current implementation evidence

- `/platform/finance` and `/platform/domains` are Superuser-only. Tenant suspension exposes only the regularization/operational overview to tenant administrators; tenant publication and public host resolution require active operational status.
- `tenant_domain_challenges` stores only a token hash, with a one-time token display, bounded attempts and expiry. DNS TXT or HTTP file proves ownership. A host only becomes canonical after a public HTTPS/TLS probe succeeds; Caddy configuration, DNS and ACME remain operator tasks outside the app.
- The worker derives active approved members, pages from the current published release, and physical bytes from tenant media plus private billing evidence on the same volume. It rebuilds usage counters and writes soft quota alerts at 80%; these counters are projections, not the source of truth.
- Billing reminders are idempotent in-app notifications. Email delivery records are left `PENDING` until an SMTP/provider transport and retry policy are configured; the current outbox consumer is not an email delivery implementation.
- At ten days after an unpaid due date, the worker creates an audited commercial suspension and restricts tenant administration. Manual payment clears billing status when all overdue balances are settled; the Superuser then reactivates the tenant explicitly.
- Manual payment proof files are validated by reported MIME plus signature and size, stored outside the public directory, downloaded only by Superuser, and each access is audited. Storage lifecycle/retention still needs an operational policy before production.
- Migration `0011_phase5_operations.sql` adds a notification deduplication key/index and operational indexes; it has been applied to the local development PostgreSQL database.
- The current `docker-compose.yml` is a development compose: fixed local credentials, database port published, no edge TLS proxy, and no production secret management.
- `infra/backups/README.md` records daily full PostgreSQL backup, continuous WAL, 30 daily + 12 monthly retention and daily media copy, but explicitly defers provider-specific commands because the external destination has not been chosen. No backup/restore execution was performed in this session.
- The worker's existing generic outbox consumer only logs and marks its events processed, so it must not be reused to claim email delivery; email deliveries remain pending until a provider is configured.

## Fatia 2 — revisão para conclusão em 27/09/2026

- Há divergência entre documentos: `task_plan.md` marca a Phase 2 completa, enquanto `docs/PLANO_DE_ENTREGA_MVP.md` ainda declara Fatia 2 pendente. A conclusão deve ser baseada em código, testes e critérios de aceite, e sincronizar os dois registros.
- Evidência existente: login por senha com hash scrypt; sessão opaca em cookie HttpOnly e hash no banco; sessões administrativas com prazo/inatividade; MFA TOTP com segredo AES-256-GCM, replay prevention e códigos de recuperação; cadastro público e confirmação de responsável; aprovação/rejeição, promoção/revogação de administradores e suspensão; seleção explícita de tenant; permissões granulares; suporte identificado.
- Lacunas a verificar/fechar antes de dar Fatia 2 por concluída: redefinição segura de senha; convite administrativo por e-mail (caso ainda não exista fora das páginas listadas); revogação/expiração de sessões em mudança de senha ou suspensão; proteção de força bruta/rate limit para login, MFA, cadastro e tokens; testes automatizados específicos da Fatia 2 e cobertura das invariantes de MFA/tenant/permissões.
- A chave `Onboarding` do Resend foi revogada em 27/09/2026; a chave `nossas-letras-producao` não deve ser reutilizada. O projeto deve aceitar credenciais próprias (`EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`) em configuração segura, sem segredo no repositório. Sem chave própria no ambiente de teste, os fluxos precisam ser validáveis por outbox/console sem disparo externo.
- The user has approved implementation of the phase, not a production deployment, a backup-provider purchase, DNS changes, TLS issuance, or legal sign-off. These remain external gates.

## Produção — inventário/preparação em 30/09/2026

- Arquitetura existente já fixa o desenho de MVP: monólito modular em dois processos (`web`, `worker`), PostgreSQL como fonte de verdade, arquivos de mídia em volume da VPS, Caddy no proxy e PostgreSQL fora do Compose de aplicação. VPS única é ponto único de falha conscientemente aceito; RPO/RTO continuam metas a comprovar em restauração.
- Não há design de sistema separado para retomar; `docs/ARCHITECTURE.md`, `infra/PRODUCAO.md`, `docs/PLANO_DE_ENTREGA_MVP.md` e o plano persistente registram decisões. Alternativas de arquitetura não foram reabertas porque o pedido é preparar a topologia já decidida.
- A raiz de trabalho não contém `.git`; não há remoto, branch/tag, deploy key nem `docs/infraestrutura/deploy.md` anterior. O guia EasyPanel exige confirmar esses valores e o caminho no servidor antes de qualquer acesso remoto.
- O domínio foi informado como registrado pelo usuário; DNS A/AAAA, IP da VPS, portas/firewall e TLS não foram verificados. A base local só possui `baixada.localhost` e `aurora.localhost`; `baixadafc.com.br` deve passar pelo fluxo de challenge, verificação e ativação TLS, não apenas ser escrito em configuração.
- Caddy usa a lista estática `APP_DOMAINS`; domínios futuros exigirão inclusão e deploy de configuração até haver integração dinâmica. O alvo atual documentado é apenas `baixadafc.com.br`; `www` não foi presumido.
- Achado de segurança: faltava `.dockerignore` e ambos os Dockerfiles executavam processo como root. Criado `.dockerignore` para segredos, mídia e artefatos locais; imagens web/worker agora executam como `node`, com permissões de escrita preparadas para cache/uploads. Imagens locais inspecionadas confirmam `user=node`.
- Criado `infra/baixada.production.env.example` com placeholders, sem segredos, e `docs/infraestrutura/deploy.md` específico do projeto. Atualizado `infra/PRODUCAO.md` e README para registrar estado e comandos locais de forma honesta.
- A migração RLS 0015 foi aplicada só ao PostgreSQL local após dump validado. Não houve conexão SSH, mudança de DNS, configuração EasyPanel ou deploy remoto.
- Compose de produção passou `config --quiet` com placeholders; imagens web e worker foram construídas com sucesso em build autorizado. Typechecks web/worker/database e Vitest (15 testes) também passaram. Suítes SQL `isolation.sql` e `phase2_access_invariants.sql` passaram em DB descartável; teste real local do signer web mostrou 5 vínculos autorizados, SYSTEM do worker leu 4 eventos outbox, e forja por GUCs antigos não expôs vínculos.
- Configuração/homologação externa ainda ausente: host/IP e acesso nominal da VPS, projeto/hostname PostgreSQL EasyPanel, remoto Git/branch, email TLS, Resend e remetente próprios, destino externo de backup/WAL/mídia, ensaio de restore, UAT e aprovação jurídica.
- Dimensionamento da VPS não foi estimado: faltam SKU/CPU/RAM/disco/banda, tamanho e crescimento da mídia e métricas de tráfego/concorrência observadas; capacidade não deve ser presumida a partir do domínio.
- Healthcheck do web usa `/api/v1/health` para liveness HTTP; ele não testa conexão PostgreSQL. Worker ainda não expõe health endpoint e deve ser acompanhado por logs/sinais operacionais até esse endpoint existir.
