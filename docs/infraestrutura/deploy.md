# Deploy do Baixada FC — VPS / Docker Compose

Este é o registro específico do projeto. O guia institucional disponível no workspace é legado e descreve EasyPanel, que não será usado neste deploy. Nenhum valor secreto deve ser copiado para este arquivo.

## Estado e alvo

| Item | Estado atual |
| --- | --- |
| Domínios pretendidos | `baixadafc.com.br` canônico; `www.baixadafc.com.br` redireciona ao canônico. DNS ainda não aponta para a VPS nas consultas de 2026-09-30. |
| URL canônica pretendida | `https://baixadafc.com.br` |
| Domínio na base local | Ainda não; os domínios locais são `baixada.localhost` e `aurora.localhost` |
| VPS / acesso observado | `129.121.54.111`, SSH na porta `22022`; o acesso disponível usa `root` (não usar essa identidade para deploy recorrente) |
| Capacidade observada | 2 vCPU, 3.6 GiB RAM (1.2 GiB disponíveis no momento da consulta), disco raiz 98 GiB com 54 GiB livres (43% usado); banda contratada não verificada |
| Plataforma/proxy observado | Docker Compose e Traefik compartilhado ativo nas portas públicas 80/443; vários serviços de outros projetos compartilham a VPS |
| Protocolo institucional de deploy atual | Não há runbook atualizado localizado. Evidência observada: Docker Compose, aplicações em `/srv/apps`, rede externa `servicos-padrao` e arquivo dinâmico do Traefik em `/srv/servicos-padrao/dynamic.yml`, com recarga automática. |
| Projeto Baixada / PostgreSQL | Ainda não implantados. Este repositório agora define um PostgreSQL dedicado e privado no Compose do Baixada; não reutilizar outro banco. |
| Repositório remoto / branch | `https://github.com/guedesparticular2-dot/criadorDeSites.git`, branch `main`; confirmar commit mais recente antes do deploy. |
| Caminho operacional proposto | `/srv/apps/baixada`, seguindo o padrão observado; verificar inexistência antes de criar. |
| E-mail para TLS | Usar o endereço operacional do proxy já configurado; certificado é gerido pelo Traefik compartilhado. |

## Topologia preparada

- Build context: raiz deste monorepo (`.`), necessária para dependências `workspace:*`.
- A VPS tinha cerca de 1.2 GiB livres no inventário; por isso os builds são feitos fora dela para `linux/amd64`, etiquetados pelo SHA do commit e carregados como imagens. Use `docker buildx build --platform linux/amd64 --load` para cada Dockerfile e `docker compose up --no-build`; não compilar Next.js dentro do host compartilhado.
- Serviço `web`: Next.js standalone, escuta internamente na porta `3000`.
- Serviço `worker`: outbox e trabalhos assíncronos; compartilha o volume persistente `media_data` com `web`.
- O servidor já possui Traefik compartilhado escutando em 80/443, ligado à rede `servicos-padrao`; o arquivo dinâmico observado usa o provider de arquivo com watch e ACME TLS challenge. O Compose do Baixada não publica portas públicas nem inicia outro proxy. A porta web `13002` fica presa a `127.0.0.1` apenas para o bootstrap privado por túnel SSH; depois da configuração inicial pode ser removida.
- Healthcheck web: `/api/v1/health` verifica processo/HTTP, não a conexão PostgreSQL; o banco deve ser validado separadamente no smoke pós-deploy. O worker não expõe health endpoint próprio no momento.
- PostgreSQL deve ser um serviço privado e dedicado ao Baixada. Não publicar sua porta na Internet nem reutilizar banco de outro projeto.
- Confirmar no protocolo institucional como volumes persistentes, TLS/roteamento e segredos são provisionados. Configurar cópia externa independente para mídia e backup/WAL do PostgreSQL.

## Domínio e TLS

`APP_URL` deve ser `https://baixadafc.com.br`. Criar no Registro.br (nameservers observados: `a.auto.dns.br`, `b.auto.dns.br`) um registro A para `@` → `129.121.54.111` e CNAME `www` → `baixadafc.com.br`; não criar AAAA sem IPv6 confirmado. O apex será canônico e `www` fará redirect no Traefik. Antes de alterar o arquivo compartilhado de rotas, copiar uma versão de segurança e validar o YAML; não tocar nos routers dos outros projetos.

Depois do DNS/TLS, cadastrar `baixadafc.com.br` para o tenant Baixada no fluxo de domínios do Superusuário, validar o challenge e ativá-lo como canônico. A resolução pública exige `verification_status=VERIFIED` e `tls_status=ACTIVE`; registrar o domínio não é suficiente. `www.baixadafc.com.br` será apenas redirect, para respeitar a regra do app de um domínio canônico por tenant.

## Configuração e banco

Use `infra/baixada.production.env.example` como lista de variáveis, não como arquivo de segredos. Segredos de produção ficam em `/srv/apps/baixada/infra/secrets/` com permissões somente para root. Web e worker devem ter chaves HMAC diferentes, cadastradas em `app.rls_context_keys` com escopos mínimos. `DATABASE_URL` usa o login `baixada_runtime_login`, membro do papel restrito `baixada_runtime`; a credencial migradora fica fora dos serviços web/worker.

Antes da primeira migração no destino: backup consistente, SHA-256, leitura via `pg_restore --list`, confirmação de restauração e janela/rollback definidos. Aplicar migrações com credencial separada; validar `0015_signed_rls_context.sql` com o papel efetivo de runtime antes de habilitar tráfego público.

O banco local `baixada` recebeu a migração 0015 depois de um dump validado e foi testado com runtime sem `SUPERUSER`/`BYPASSRLS`. Isso não migra nem homologa o banco de produção.

## Pré-deploy e aceite

- [x] Inventariar VPS, acesso SSH observado, capacidade atual, disco, Docker e serviços ativos. Confirmado: `129.121.54.111:22022`, 2 vCPU, 3.6 GiB RAM e 54 GiB livres; host compartilhado. O acesso observado é `root`; antes de operar produção, definir identidade nominal/deploy com privilégio mínimo.
- [x] Reconstruir a convenção de deploy por inspeção read-only: Compose sob `/srv/apps`, Traefik compartilhado por `servicos-padrao`, rotas via arquivo dinâmico com watch. Ainda falta implantar o projeto em `/srv/apps/baixada`.
- [ ] Conferir CPU/RAM/disco/banda disponíveis e estimar capacidade com tráfego real; alertas de disco devem preceder o bloqueio de uploads a 80%.
- [x] Criar remoto Git, branch `main` e revisão inicial; mudanças de preparação posteriores ainda precisam de validação, commit e push. Excluir `.env*`, mídia pessoal e backups do commit.
- [x] Definir hostname e banco PostgreSQL privados (`postgres:5432/baixada`) e papéis migrador/runtime distintos; ainda falta provisionar no VPS.
- [ ] Gerar segredos próprios de produção e carregá-los pelo mecanismo seguro aprovado; registrar hashes/chaves na tabela protegida.
- [ ] Confirmar DNS A por consulta confiável; validar AAAA se publicado; abrir somente portas necessárias. As consultas disponíveis nesta inspeção não resolveram `baixadafc.com.br` nem `www.baixadafc.com.br`, portanto o DNS permanece não confirmado.
- [ ] Verificar `baixadafc.com.br` no Resend, configurar `nao-responda@baixadafc.com.br`, usar Reply-To `baixadafc5@gmail.com`, criar chave API exclusiva do Baixada e testar entrega. Não reutilizar chaves de outros projetos.
- [ ] Autorizar o destino Google Drive `baixadafc5@gmail.com` (a sessão Drive atualmente conectada é outra conta), configurar backups criptografados externamente: PostgreSQL diário + WAL até 5 minutos, mídia diária, retenção 30 diários/12 mensais; restaurar em ambiente isolado e medir RPO/RTO.
- [ ] Executar `docker compose -f compose.production.yml config --quiet` e build a partir do repositório revisado.
- [ ] Executar migrations, healthcheck, fluxo de autenticação/MFA, acesso público, leitura/escrita autorizada e testes multi-tenant sob runtime.
- [ ] Definir janela, commit/imagem anterior e rollback; registrar versão, resultado e responsável.

## Informações necessárias para executar o deploy

Bloqueadores para disponibilizar ao público: apontar DNS no Registro.br; provisionar no VPS (ainda sem mudanças remotas) após validação de build e commit; criar a conta Superusuário em sessão privada de setup, digitando a senha diretamente; configurar Resend com domínio verificado e chave exclusiva; reconectar/configurar Google Drive para `baixadafc5@gmail.com`; testar backup e restauração. O VPS continua sem instalação ativa do Baixada e nenhuma migração, publicação, reinicialização ou alteração remota foi feita.
