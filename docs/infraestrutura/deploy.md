# Deploy do Baixada FC — VPS / Docker Compose

Este é o registro específico do projeto. O guia institucional disponível no workspace é legado e descreve EasyPanel, que não será usado neste deploy. Nenhum valor secreto deve ser copiado para este arquivo.

## Estado e alvo

| Item | Estado atual |
| --- | --- |
| Domínio pretendido | `baixadafc.com.br` (informado como registrado; DNS não resolveu nas consultas feitas em 2026-09-30) |
| URL canônica pretendida | `https://baixadafc.com.br` |
| Domínio na base local | Ainda não; os domínios locais são `baixada.localhost` e `aurora.localhost` |
| VPS / acesso observado | `129.121.54.111`, SSH na porta `22022`; o acesso disponível usa `root` (não usar essa identidade para deploy recorrente) |
| Capacidade observada | 2 vCPU, 3.6 GiB RAM (1.2 GiB disponíveis no momento da consulta), disco raiz 98 GiB com 54 GiB livres (43% usado); banda contratada não verificada |
| Plataforma/proxy observado | Docker Compose e Traefik compartilhado ativo nas portas públicas 80/443; vários serviços de outros projetos compartilham a VPS |
| Protocolo institucional de deploy atual | Ainda não localizado como documento. `/srv/servicos-padrao` contém configuração operacional do Traefik/Compose, não um procedimento documentado de deploy de aplicações |
| Projeto Baixada / PostgreSQL | Nenhum container, projeto Compose ou volume ativo identificável como Baixada; não foi possível confirmar banco/hostname para este projeto |
| Repositório remoto / branch ou tag | Pendente: a pasta de trabalho atual não é um repositório Git (`git rev-parse` falhou); GitHub está sendo criado pelo usuário |
| Caminho operacional observado | Projetos ativos usam caminhos sob `/srv`; nenhum caminho do Baixada foi encontrado/confirmado |
| Responsável / e-mail para TLS | Pendente |

## Topologia preparada

- Build context: raiz deste monorepo (`.`), necessária para dependências `workspace:*`.
- Serviço `web`: Next.js standalone, escuta internamente na porta `3000`.
- Serviço `worker`: outbox e trabalhos assíncronos; compartilha o volume persistente `media_data` com `web`.
- O servidor já possui Traefik compartilhado escutando em 80/443. A configuração atual deste projeto ainda prevê um proxy Caddy próprio; ela precisa ser reconciliada com o protocolo institucional antes do primeiro deploy, para não introduzir um segundo proxy nem disputar portas públicas.
- Healthcheck web: `/api/v1/health` verifica processo/HTTP, não a conexão PostgreSQL; o banco deve ser validado separadamente no smoke pós-deploy. O worker não expõe health endpoint próprio no momento.
- PostgreSQL deve ser um serviço privado e dedicado ao Baixada. Não publicar sua porta na Internet nem reutilizar banco de outro projeto.
- Confirmar no protocolo institucional como volumes persistentes, TLS/roteamento e segredos são provisionados. Configurar cópia externa independente para mídia e backup/WAL do PostgreSQL.

## Domínio e TLS

`APP_URL` deve ser `https://baixadafc.com.br`. O DNS precisa apontar para o IPv4 confirmado da VPS; só publicar AAAA se IPv6 estiver configurado e testado. Confirmar no protocolo atual como declarar rotas/hostnames no Traefik e como o TLS é emitido/renovado; não alterar a configuração compartilhada do proxy sem esse procedimento.

Depois do DNS/TLS, cadastrar `baixadafc.com.br` para o tenant Baixada no fluxo de domínios do Superusuário, validar o challenge e ativá-lo como canônico. A resolução pública exige `verification_status=VERIFIED` e `tls_status=ACTIVE`; registrar o domínio não é suficiente. `www.baixadafc.com.br` não está incluído nem configurado neste alvo. Se for desejado, definir antes se será alias verificado ou redirecionado para o apex e configurar DNS/TLS compatíveis.

## Configuração e banco

Use `infra/baixada.production.env.example` como lista de variáveis, não como arquivo de segredos. Provisionar valores somente pelo mecanismo seguro definido no protocolo atual. Web e worker devem ter chaves HMAC diferentes, cadastradas em `app.rls_context_keys` com escopos mínimos. `DATABASE_URL` usa `baixada_runtime`; a credencial migradora fica fora dos serviços.

Antes da primeira migração no destino: backup consistente, SHA-256, leitura via `pg_restore --list`, confirmação de restauração e janela/rollback definidos. Aplicar migrações com credencial separada; validar `0015_signed_rls_context.sql` com o papel efetivo de runtime antes de habilitar tráfego público.

O banco local `baixada` recebeu a migração 0015 depois de um dump validado e foi testado com runtime sem `SUPERUSER`/`BYPASSRLS`. Isso não migra nem homologa o banco de produção.

## Pré-deploy e aceite

- [x] Inventariar VPS, acesso SSH observado, capacidade atual, disco, Docker e serviços ativos. Confirmado: `129.121.54.111:22022`, 2 vCPU, 3.6 GiB RAM e 54 GiB livres; host compartilhado. O acesso observado é `root`; antes de operar produção, definir identidade nominal/deploy com privilégio mínimo.
- [ ] Obter/confirmar o protocolo institucional vigente e então criar os serviços Baixada por ele; confirmar caminho operacional e hostname privado do PostgreSQL dedicado. Não reutilizar banco de outro projeto.
- [ ] Conferir CPU/RAM/disco/banda disponíveis e estimar capacidade com tráfego real; alertas de disco devem preceder o bloqueio de uploads a 80%.
- [ ] Criar/confirmar remoto Git, deploy key, branch/tag e revisão do conteúdo a publicar. Excluir `.env*`, mídia pessoal e backups do commit.
- [ ] Confirmar hostname/porta/banco PostgreSQL internos e criar papel migrador separado do runtime.
- [ ] Gerar segredos próprios de produção e carregá-los pelo mecanismo seguro aprovado; registrar hashes/chaves na tabela protegida.
- [ ] Confirmar DNS A por consulta confiável; validar AAAA se publicado; abrir somente portas necessárias. As consultas disponíveis nesta inspeção não resolveram `baixadafc.com.br` nem `www.baixadafc.com.br`, portanto o DNS permanece não confirmado.
- [ ] Configurar Remetente/Resend próprio do Baixada e testar recuperação de senha e convite. `EMAIL_PROVIDER=console` não satisfaz esse aceite.
- [ ] Configurar backups completos, WAL contínuo e mídia externa; restaurar em ambiente isolado e registrar RPO/RTO observados.
- [ ] Executar `docker compose -f compose.production.yml config --quiet` e build a partir do repositório revisado.
- [ ] Executar migrations, healthcheck, fluxo de autenticação/MFA, acesso público, leitura/escrita autorizada e testes multi-tenant sob runtime.
- [ ] Definir janela, commit/imagem anterior e rollback; registrar versão, resultado e responsável.

## Informações necessárias para executar o deploy

Ainda faltam: localizar/confirmar o protocolo de deploy atual; criar serviços do Baixada por esse protocolo; identidade nominal de deploy; hostname interno e banco PostgreSQL dedicados; remoto GitHub e branch/tag depois de criado; DNS A/AAAA confirmado; e-mail/fluxo de TLS; remetente/chave Resend do Baixada; destino de backups. A inspeção remota desta data foi somente de leitura. Não foi encontrada instalação ativa do Baixada nesta VPS; nenhuma migração, publicação, reinicialização ou alteração remota foi feita.
