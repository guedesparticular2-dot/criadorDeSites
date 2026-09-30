# Plano de entrega — Plataforma Baixada FC

## Objetivo de entrega

Entregar uma plataforma SaaS multi-tenant pronta para operar o Baixada Futsal Clube e novos clubes: site público administrável, painel seguro, publicação atômica, mídia protegida e operação inicial em VPS.

O Baixada é o tenant de referência e o tema global inicial é `BAIXADA_BASE v1`. Novos tenants nascem com esse padrão, mas podem personalizar apenas itens permitidos do catálogo.

## Ponto de partida — 24/09/2026

| Situação | Entregue agora | Limite atual |
| --- | --- | --- |
| Design do Baixada | Home, detalhe de jogo, responsividade, animações, tokens e guia de design | Conteúdo editorial ainda é majoritariamente de referência visual |
| Dados | PostgreSQL, migrações, RLS, schema de conteúdo/release/mídia/financeiro | Nem todos os fluxos têm serviços e telas conectados |
| Plataforma | Setup local, login, sessão administrativa, Superusuário, criação de tenant, tema e release inicial | MFA, convite e domínio real ainda não existem |
| Administração do tenant | Alteração publicada de nome, razão social e cores seguras | Não há ainda CRUD de conteúdo, mídia, pessoas ou menus |
| Operação | Web standalone, worker e Docker local; build/typecheck passam | Backup, monitoramento, proxy e VPS ainda não foram homologados |

O piloto local atual é uma base de integração, não uma versão de produção: o bypass de MFA existe apenas sob variável de ambiente explícita para teste local.

## Visão de entregas

| Fatia | Resultado demonstrável | Dependência | Status |
| --- | --- | --- | --- |
| 0. Base e design | Baixada visualmente aprovado e documentado como tema-base | — | Concluída |
| 1. Plataforma mínima | Superusuário cria tenant e Administrador Principal publica identidade | 0 | Concluída |
| 2. Acesso seguro e contexto | Login, MFA, escolha de tenant e permissões reais | 1 | Concluída localmente; e-mail real requer configuração Resend própria |
| 3. Conteúdo e release | Notícias, agenda e partidas reais alimentam o site após publicação | 2 | Pendente |
| 4. Páginas e navegação | Editor de páginas por catálogo, menus e prévia | 3 | Pendente |
| 5. Mídia e proteção | Upload, processamento, consentimento e moderação de imagens | 2 | Pendente |
| 6. Participação e comunicação | Enquetes, comentários, avisos e notificações | 2, 3 | Concluída localmente; entrega real de e-mail depende de credenciais do provedor no ambiente de homologação |
| 7. Operação SaaS | Domínios, financeiro manual, cotas e suporte auditado | 1, 2 | Pendente |
| 8. Qualidade e lançamento | Segurança, recuperação, VPS, UAT e go-live | 3–7 | Pendente |

## Fatia 1 — Plataforma mínima e tema-base

**Objetivo:** transformar o Baixada e os próximos clubes em tenants reais, preservando isolamento e a identidade visual aprovada.

**Já entregue**

- `BAIXADA_BASE v1` documentado e serializado em tokens.
- Tema, configuração por tenant, um único tema publicado e release inicial persistidos.
- Setup do primeiro Superusuário no ambiente local.
- Provisionamento transacional de tenant com plano, domínio `*.localhost`, Administrador Principal e home inicial.
- Sessão administrativa de oito horas e inatividade de trinta minutos.
- Área de aparência com publicação de nome, razão social, azul e verde seguros.

**Concluído na fatia**

- Resolução pública pelo domínio canônico verificado, sem fallback para outro tenant em hostname desconhecido.
- Auditoria consultável das alterações de aparência e feedback explícito de sucesso ou erro nos formulários.
- Validação prática com duas instâncias locais independentes, cada uma com administrador, identidade, tema e release próprios.
- Seed e credenciais de demonstração permanecem exclusivamente locais; qualquer ambiente compartilhado terá migração operacional própria e sem credenciais de teste.

**Limite intencional:** a marca exibida continua sendo a logo-base do tema. Escolha, upload e processamento de logo por tenant pertencem à Fatia 5, pois dependem do pipeline seguro de mídia, variantes e auditoria.

**Aceite:** dois tenants em hosts locais distintos, cada um com nome/cores próprios; o painel de um não visualiza nem altera o outro; existe uma única configuração de tema publicada por tenant.

## Fatia 2 — Acesso seguro, pessoas e permissões

**Objetivo:** substituir o acesso piloto por autenticação compatível com os requisitos de segurança.

**Escopo**

- MFA obrigatório para Superusuário, Administrador Principal e Administrador; ativação, recuperação e desafio de segundo fator.
- Cadastro público, recuperação de senha, confirmação de responsável de menor e fila de aprovação.
- Vínculos multi-tenant, escolha/troca explícita de tenant e suspensão global versus suspensão local.
- Papéis fixos, permissões granulares, convite de administradores e transferência de Administrador Principal somente por Superusuário.
- Modo de suporte identificado, sem personificação; auditoria integral.

**Aceite:** administrador sem MFA não entra; usuário com vínculo em dois clubs troca de contexto sem vazamento; suspensão bloqueia exatamente o que a política determina; somente uma nomeação principal permanece ativa.

**Status em 27/09/2026:** implementação concluída e validada localmente. Inclui recuperação de senha por token de uso único, revogação de sessões, convites administrativos, identidade global reutilizável, permissões granulares, transferência auditada do Administrador Principal, limites de tentativas e processamento idempotente de e-mails com retentativas. O envio ao vivo ainda exige configurar um remetente/domínio verificado e uma chave Resend exclusiva do Baixada; isso é uma configuração operacional externa, não uma dependência de código para iniciar a Fatia 7. Não reutilizar chaves de outros projetos.

## Fatia 3 — Conteúdo esportivo e publicação por release

**Objetivo:** fazer o Baixada ser administrado por dados reais e tornar a home uma projeção da release publicada.

**Escopo**

- CRUD de notícias, destaques, agenda, partidas e resultados, com rascunho, agendamento, visibilidade e lixeira.
- Páginas públicas de notícia, partida e evento; listagem com busca/paginação quando aplicável.
- Blocos da home: hero, próximo jogo, últimas histórias, agenda e história institucional recebem fontes de dados configuráveis.
- Prévia editorial, revisão otimista por versão e publicação atômica de páginas, menus e rotas.
- Contadores de páginas/usuários reconstruíveis e validação de cotas suaves.

**Aceite:** alterar uma notícia, partida ou evento não muda o site público até publicar uma nova release; concorrência entre duas abas produz conflito explícito, nunca sobrescrita silenciosa.

## Fatia 4 — Páginas, menus e criador visual

**Objetivo:** permitir que o Administrador monte páginas sem escrever código e sem romper o padrão visual.

**Escopo**

- Cinco modelos: Institucional, Contato, Listagem de notícias, Detalhe de conteúdo e Landing page.
- Catálogo de seções e blocos, layouts de uma a três colunas, regras responsivas e opções de cabeçalho.
- Árvore de páginas, menu de até três níveis, slugs, redirects e análise de dependências antes de exclusão.
- Biblioteca de componentes de home e controles de ordenação acessíveis.
- Prévia de rascunho e publicação junto da release.

**Aceite:** criar uma página por modelo, adicionar/ordenar blocos e menu, pré-visualizar e publicar; CSS/JavaScript arbitrário é rejeitado; rota e menu permanecem consistentes.

## Fatia 5 — Mídia, consentimento e moderação

**Objetivo:** viabilizar imagem com qualidade, rastreabilidade e proteção especial a menores.

**Escopo**

- Upload de JPEG, PNG, WebP e HEIC até 25 MB, checagem do tipo real, orientação, remoção de metadados e variantes responsivas.
- Worker idempotente; original temporário só é removido após variantes válidas; bloqueio de upload aos 80% do disco.
- Biblioteca visual, corte, ponto focal, texto alternativo e vínculos de mídia a conteúdo.
- Consentimento externo referenciado, revogação com ocultação imediata e canal de denúncia.
- Caso de moderação com prazo de 24h, recurso único, ações auditadas e lixeira de 90 dias.

**Aceite:** falha de processamento preserva o original; revogação ou denúncia de foto de menor tira a mídia do público imediatamente; não há arquivo fora da política de acesso.

## Fatia 6 — Participação e comunicação

**Objetivo:** habilitar recursos de comunidade previstos para o MVP de forma moderada e acessível.

**Escopo**

- Enquetes de voto único, resultado acessível e concorrência protegida.
- Comentários sem edição após publicação, exclusão própria e moderação administrativa.
- Avisos editoriais com contagem móvel, estado “aconteceu” e sem e-mail público no MVP.
- Notificações persistentes no painel e entregas por e-mail administrativo via outbox.

**Aceite:** não há voto duplicado sob concorrência; comentários e avisos respeitam visibilidade do tenant; falha de e-mail não perde a ação original.

**Implementação local registrada em 26/09/2026**

- Notícias publicadas na release atual abrem páginas de detalhe com comentários imediatos, exclusão pelo autor e sem edição.
- Denúncias não ocultam comentários automaticamente. A fila administrativa, protegida pela permissão `comments.moderate`, permite manter, ocultar ou remover; ocultação/remoção gera aviso persistente ao autor, mostrado em modal no site até confirmação.
- Como regra inicial de participação, somente membros aprovados e ativos no tenant atual podem comentar, votar ou denunciar; a aplicação e o banco verificam o tenant em cada operação.
- Enquetes são criadas como rascunho no painel editorial, publicadas com a release e limitadas a um voto imutável por membro. Resultados respeitam a visibilidade definida e, quando liberados, incluem barras, percentuais, quantidades e tabela textual acessível.
- Avisos também são rascunhos publicados por release; mostram contagem em dias/horas/minutos e mudam para “aconteceu” até a expiração. Não enviam e-mail público.
- Denúncias geram notificações administrativas persistentes e entrega de e-mail em fila. O worker possui adaptador opcional Resend com idempotência, retentativas e atraso; sem `EMAIL_PROVIDER=resend`, chave e remetente, a entrega permanece pendente e nenhuma chamada externa é feita.
- A migração `0012_phase6_comment_reports.sql` guarda o identificador do denunciante sem copiar dados de contato, e acrescenta estado/retentativa de e-mail à fila de entregas.

**Validação local concluída em 27/09/2026:** `pnpm test` passou (9 testes existentes), `pnpm typecheck` e `pnpm --filter @baixada/web build` passaram. Os testes SQL `invariants.sql`, `isolation.sql` e `phase6_invariants.sql` passaram contra o PostgreSQL Docker local; todos encerram com `ROLLBACK`. O último cobre comentário visível enquanto a denúncia aguarda análise, conta global suspensa, aviso persistente ao autor, entrega administrativa pendente/falha de e-mail com retentativa e aviso ocorrido que permanece publicado até expirar.

O smoke test `RUN_PHASE6_LOCAL=1 DATABASE_URL=postgresql://baixada:baixada@localhost:5435/baixada pnpm --filter @baixada/database test:phase6-local` também passou chamando os serviços da aplicação com um tenant descartável. Ele verificou comentário imediato, denúncia duplicada bloqueada, fila administrativa, ocultação e notificação/modal ao autor, exclusão apenas pelo próprio autor, dois votos concorrentes aceitando exatamente um, bloqueio de conta global suspensa e vínculo pendente, isolamento de tenant e expiração do aviso. O script valida que o alvo é o banco `baixada` em localhost e remove os dados sintéticos ao final.

A migração `0012_phase6_comment_reports.sql` está aplicada ao PostgreSQL local. Nenhuma produção foi acessada e nenhum e-mail foi enviado: sem credencial `RESEND_API_KEY`, remetente e configuração `EMAIL_PROVIDER=resend`, as mensagens administrativas ficam corretamente enfileiradas. O envio real e a retentativa contra o provedor deverão ser confirmados no ambiente de homologação, sem bloquear a conclusão da implementação local da Fatia 6.

## Fatia 7 — Operação SaaS, domínio, plano e financeiro

**Objetivo:** permitir gerir comercialmente vários clientes sem expor dados da plataforma ao tenant.

**Escopo**

- Domínio canônico, desafio DNS TXT/arquivo HTTP, TLS e resolução pelo proxy reverso.
- Planos Simples, Médio e Ilimitado, contadores, alertas suaves e extensões comerciais.
- Contratos, cobranças, pagamentos manuais BRL, comprovante restrito ao Superusuário e indicadores oficiais.
- Suspensão financeira automática após dez dias, acesso administrativo limitado e notificações/auditoria.
- Dashboard de plataforma, suporte identificado e exportação administrativa auditada.

**Aceite:** tenant suspenso não expõe site/membros, mas mantém o acesso limitado definido; cobrança de um cliente jamais aparece no painel de outro; domínio só torna-se canônico após verificação.

**Validação local da operação:** `RUN_PHASE7_LOCAL=1 DATABASE_URL=postgresql://baixada:baixada@localhost:5435/baixada pnpm --filter @baixada/database test:phase7-local`. O smoke é restrito ao PostgreSQL local `baixada`, cria dois tenants descartáveis e valida cobrança vencida com pagamento parcial e total, contrato versionado, suspensão/reativação, reconciliação de bytes físicos, alerta suave, suspensão automática no 10º dia e isolamento do segundo tenant. Também verifica domínio normalizado, token armazenado apenas como hash, recusa de ativação pendente e troca canônica atômica após prova simulada com TLS probe injetado. Banco e arquivos de teste são removidos ao final.

**Status da Fatia 7:** implementação e homologação local concluídas. DNS/TLS real, Resend, VPS, backups e restauração são gates externos da Fatia 8.

## Fatia 8 — Qualidade, LGPD, operação e lançamento

**Objetivo:** tornar o produto operável na VPS com recuperação comprovada e aceite formal.

**Escopo**

- Fluxo de solicitações LGPD, eliminação física confirmada, relatório minimizado e retenções configuradas.
- Testes unitários, integração, RLS, concorrência, acessibilidade, responsividade e smoke tests de deploy.
- Caddy/TLS, papel de banco sem `BYPASSRLS`, segredos, limitação de taxa, logs estruturados e observabilidade.
- Backup diário de PostgreSQL, WAL contínuo externo, cópia diária de mídia, testes trimestrais de restauração.
- Homologação com Baixada, checklist de conteúdo, domínio, perfis, treinamento, rollback e publicação na VPS.

**Aceite de lançamento:** RPO de banco até 15 min, RPO de mídia até 24h e RTO pretendido de até 4h testados; testes críticos aprovados; MFA sem bypass; nenhuma credencial de teste ou dado fictício residual em produção.

## Regras de priorização

1. Segurança, isolamento e publicação coerente antecedem recursos visuais adicionais.
2. Cada fatia precisa terminar com uma demonstração útil do Baixada, não apenas tabelas ou endpoints.
3. Todo recurso multi-tenant é testado com pelo menos dois tenants e dois usuários antes de ser considerado pronto.
4. Mudanças de design entram primeiro em `BAIXADA_BASE`, depois no catálogo; nunca em CSS específico de um cliente sem versionamento.
5. Uma fatia só avança quando os critérios de aceite e a documentação de operação forem atualizados.

## Fora do MVP confirmado

- Processamento de pagamento/gateway.
- Upload próprio de vídeo; vídeos usam provedores autorizados.
- CSS ou JavaScript fornecido pelo cliente.
- Rede social completa, chat ou feed algorítmico.
- Alta disponibilidade multi-VPS; a VPS única é risco conscientemente aceito no MVP.

## Próxima entrega recomendada

Iniciar a Fatia 7: consolidar operação SaaS, domínio, plano e financeiro; a Fatia 2 está concluída localmente. Antes de habilitar e-mails externos, configurar domínio/remetente e chave própria do Baixada no Resend. A Fatia 3 conecta notícias, agenda e partidas reais à release pública.
