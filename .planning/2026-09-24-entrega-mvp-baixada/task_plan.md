# Task Plan: Entrega MVP Baixada

## Goal

Concluir e acompanhar a entrega do MVP multi-tenant do Baixada, do piloto funcional atual até a operação homologada na VPS.

## Next Step

Próxima ação: obter e validar o inventário da VPS/EasyPanel/Git/PostgreSQL e destino de backup para preencher `docs/infraestrutura/deploy.md`; não fazer operações remotas até host, usuário, porta e caminho serem confirmados.

## Current Phase

Fatia 8 — qualidade, LGPD, operação e lançamento

## Phases

### Phase 1: Base, design e piloto multi-tenant

- [x] Consolidar requisitos e arquitetura do MVP
- [x] Entregar design de referência do Baixada e `BAIXADA_BASE v1`
- [x] Criar piloto local de Superusuário, tenant, Administrador Principal e aparência
- [x] Concluir identidade textual/cromática, auditoria consultável e feedback de erro
- [x] Validar domínio canônico, release e tema em dois tenants locais independentes
- **Status:** complete

### Phase 2: Identidade, MFA e autorização

- [x] MFA TOTP, códigos de recuperação, sessões administrativas e escolha de tenant implementados
- [x] Implementar redefinição de senha com token de uso único, resposta anti-enumeração e revogação das sessões
- [x] Completar identidade reutilizável em vários tenants e convites de administradores
- [x] Disponibilizar overrides de permissões granulares e transferência auditada do Administrador Principal pelo Superusuário
- [x] Implementar entrega transacional para recuperação, confirmação de responsável e convites; chave própria Baixada configurável sem reutilizar credencial de outro produto
- [x] Revisar proteções e validar invariantes de rate limit e isolamento tenant no banco local
- [x] Sincronizar documentos e executar typecheck/testes locais
- **Status:** complete (implementação e validação local concluídas; entrega real de e-mail depende de configuração externa do Resend e não bloqueia a Fatia 7)

### Phase 3: Conteúdo, release e criador visual

- [ ] Implementar conteúdo esportivo/editorial e páginas de detalhe
- [ ] Ligar home, menus e rotas à release atômica
- [ ] Implementar modelos, blocos, prévia e menus
- **Status:** in_progress — primeira entrega editorial e snapshot de release implementados; ainda faltam agenda, partidas, detalhes e criador visual.

### Phase 4: Mídia, moderação e comunidade

- [x] Implementar mídia, worker, consentimento e moderação
- [ ] Implementar enquetes, comentários, avisos e notificações
- **Status:** in_progress — núcleo de enquete e comentários entregue por API; avisos editoriais e entregas de notificação serão conectados às páginas da Fatia 3.

### Phase 5: Operação SaaS e lançamento

- [x] Implementar domínio, cotas, financeiro manual e suspensão
- [x] Iniciar painel do Superusuário com indicadores financeiros, cobranças/pagamentos manuais e suspensão comercial auditada
- [x] Bloquear publicação e restringir painel de tenant durante suspensão
- [x] Configurar e verificar domínio customizado (fluxo no app; proxy/TLS exige operação externa)
- [x] Calcular uso real, exibir alertas suaves e reconstruir contadores
- [x] Automatizar avisos e suspensão financeira após 10 dias vencidos (e-mail fica pendente até configurar provedor)
- [ ] Validar LGPD, backup, RLS, VPS, UAT e go-live
- **Status:** implementation_complete — release/produção pendente de gates externos e homologação

### Phase 7: Operação SaaS — aceite operacional

- [x] Revisar o estado do código e confirmar domínios, contratos, cotas, financeiro manual, comprovantes privados e suspensão automática já implementados
- [x] Criar smoke local protegido para recebimentos parciais/totais, baixa financeira, contrato versionado, suspensão/reativação e painel Superusuário
- [x] Executar o smoke local da Fatia 7 e manter fixture estritamente local/reversível
- [x] Validar worker de reconciliação de cotas, alertas suaves e suspensão no décimo dia em fixture controlada
- [x] Testar normalização, token persistido como hash, bloqueio pré-verificação e troca canônica atômica com TLS probe simulado; sem domínio real
- [x] Revisar APIs da plataforma e exigir sessão administrativa após MFA nas rotas de domínio e comprovante
- [x] Sincronizar os critérios de aceite e separar validações locais dos gates externos
- **Status:** complete locally — implementação e validação da aplicação concluídas; DNS/TLS real, Resend e VPS ficam como gates externos da Fatia 8.

### Phase 8: Qualidade, LGPD, operação e lançamento

- [x] Preparar Compose de produção, contexto Docker sem segredos e execução das imagens como não-root
- [x] Validar `docker compose config --quiet` e compilar imagens web/worker localmente com placeholders
- [x] Registrar domínio pretendido e checklist específico EasyPanel sem presumir IP/host/credenciais
- [x] Aplicar e validar migração RLS assinada apenas no PostgreSQL local, com backup anterior
- [ ] Revisar fluxo LGPD, retenções e exclusão com relatório minimizado
- [ ] Homologar isolamento/RLS, acessibilidade, responsividade e fluxos críticos em dois tenants
- [ ] Definir e validar proxy/TLS, domínio, segredos, logs e observabilidade da VPS
- [ ] Configurar e testar Resend do Baixada sem reutilizar credenciais de outros produtos
- [ ] Configurar backup PostgreSQL/WAL e cópia de mídia; executar restauração e registrar RPO/RTO observados
- [ ] Executar UAT, checklist de conteúdo, rollback e aceite de produção
- **Status:** in_progress — preparação técnica local concluída e documentada; homologação do domínio e operação dependem de inventário/serviços externos.

### Decisões adicionais da Fatia 8

| Decision | Rationale |
| --- | --- |
| Pedido de exclusão no MVP apaga somente os dados elegíveis do tenant solicitante; a identidade global e os vínculos dos demais tenants são preservados. | Confirmado pelo usuário em 27/09/2026; reduz impacto cruzado entre clubes. |

**Progresso atual:** imagens Compose compiladas localmente, fronteira RLS HMAC aplicada/testada apenas no PostgreSQL local e preparação específica do domínio registrada. Produção segue bloqueada por inventário confirmado da VPS/EasyPanel/Git/PostgreSQL, DNS/TLS, e-mail, backup/restauração e UAT.

## Decisions Made

| Decision | Rationale |
| --- | --- |
| Baixada é o tema-base global v1 | O design aprovado vira padrão seguro e versionado para novos tenants. |
| Entrega vertical por fatias | Permite demonstrar valor sem abrir mão de isolamento e publicação coerente. |
| MFA é bloqueador de produção | O bypass local só existe para testar o piloto e não segue para a VPS. |
| MFA administrativo usa TOTP e códigos de recuperação | Não depende de serviço externo, é compatível com autenticadores comuns e protege a entrada privilegiada. |
| Comentário inapropriado é bloqueado por moderação e comunicado ao autor por notificação interna | O comentário deixa de ficar público; o autor recebe aviso persistente no sistema, apresentado em modal no próximo acesso. Não suspende automaticamente a associação e não envia e-mail no MVP. |
| Comentários são publicados imediatamente e moderados posteriormente | Outros usuários podem denunciar; a denúncia cria um caso para análise, mas não oculta o comentário automaticamente. A ação administrativa pode ocultar ou remover e notifica o autor pelo sistema. IA de moderação fica para fase futura, com fornecedor/modelo a definir. |
| Envio real de e-mail exige credencial separada do Baixada | O código aceita `EMAIL_PROVIDER=resend`, `EMAIL_FROM` e `RESEND_API_KEY`; nenhuma credencial de outro produto é reutilizada ou armazenada no repositório. Até a configuração de domínio/remetente e chave própria, o worker mantém a fila sem enviar e-mails externos. |

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Script de resolução de plano não tinha permissão de execução | 1 | Executado com `sh`; plano isolado inicializado. |
| `pnpm typecheck` solicitou limpeza interativa de dependências | 1 | Validação realizada com `tsc` instalado, sem alterar dependências. |
| `pnpm --filter @baixada/web typecheck` tentou limpar dependências sem TTY | 1 | Usado `tsc` local diretamente; a compilação passou. |
| SQL de seed de validação tinha referência ambígua a `theme_version_id` | 1 | Coluna qualificada e operação repetida com sucesso, sem dados parciais. |
| Runner da migração 0011 bloqueado ao criar pipe local no sandbox | 1 | Reexecutado com permissão aprovada; migração aditiva aplicada no PostgreSQL local. |
| Migração 0015 falhou no banco descartável por comparação `uuid=text` em política de auditoria | 1 | Comparação corrigida para UUID; migração e testes de isolamento passaram em base descartável antes do banco local. |
| `pnpm --filter ...` tentou buscar metadados e limpar dependências sem TTY | 1 | Sem limpar módulos; testes e typechecks foram executados por binários locais, e os Docker builds resolveram dependências em ambiente autorizado. |
| Docker BuildKit não conseguiu escrever estado fora do workspace no sandbox | 1 | Build repetido após autorização explícita; imagens web e worker compilaram com sucesso. |
