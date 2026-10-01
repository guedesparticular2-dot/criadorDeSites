# Deploy do Baixada FC — VPS / Docker Compose

Este é o registro específico do projeto. O guia institucional disponível no workspace é legado e descreve EasyPanel, que não será usado neste deploy. Nenhum valor secreto deve ser copiado para este arquivo.

## Estado e alvo

| Item | Estado atual |
| --- | --- |
| Domínios pretendidos | `baixadafc.com.br` canônico; `www.baixadafc.com.br` redireciona ao canônico. DNS ainda não apontava para a VPS na consulta de 2026-09-30. |
| URL canônica pretendida | `https://baixadafc.com.br` |
| Domínio na base local | Ainda não; os domínios locais são `baixada.localhost` e `aurora.localhost` |
| VPS / acesso observado | `129.121.54.111`, SSH na porta `22022`; o acesso disponível usa `root` (não usar essa identidade para deploy recorrente) |
| Capacidade observada | 2 vCPU, 3.6 GiB RAM (1.2 GiB disponíveis no momento da consulta), disco raiz 98 GiB com 54 GiB livres (43% usado); banda contratada não verificada |
| Plataforma/proxy observado | Docker Compose e Traefik compartilhado ativo nas portas públicas 80/443; vários serviços de outros projetos compartilham a VPS |
| Protocolo institucional de deploy atual | Não há runbook atualizado localizado. Evidência observada: Docker Compose, aplicações em `/srv/apps`, rede externa `servicos-padrao` e arquivo dinâmico do Traefik em `/srv/servicos-padrao/dynamic.yml`, com recarga automática. |
| Projeto Baixada / PostgreSQL | Implantação privada em `2026-10-01`; Compose dedicado, PostgreSQL 17 healthy, 15 migrações aplicadas, web e worker ativos. Superusuário e MFA configurados pelo operador em `2026-10-01`; consulta em `2026-10-01` confirmou zero tenants e zero contratos, então a instância Baixada ainda precisa ser provisionada. |
| Repositório remoto / branch | `https://github.com/guedesparticular2-dot/criadorDeSites.git`, branch `main`; imagem web da revisão `16940b9`. |
| Caminho operacional | `/srv/apps/baixada`; segredos sob `infra/secrets/`, root-only, modo `0600`. |
| E-mail para TLS | Usar o endereço operacional do proxy já configurado; certificado é gerido pelo Traefik compartilhado. |

## Topologia preparada

- Build context: raiz deste monorepo (`.`), necessária para dependências `workspace:*`.
- A VPS tinha cerca de 1.2 GiB livres no inventário; por isso os builds são feitos fora dela para `linux/amd64`, etiquetados pelo SHA do commit e carregados como imagens. Use `docker buildx build --platform linux/amd64 --load` para cada Dockerfile e `docker compose up --no-build`; não compilar Next.js dentro do host compartilhado.
- Serviço `web`: Next.js standalone, escuta internamente na porta `3000`.
- Serviço `worker`: outbox e trabalhos assíncronos; compartilha o volume persistente `media_data` com `web`.
- O servidor já possui Traefik compartilhado escutando em 80/443, ligado à rede `servicos-padrao`; o arquivo dinâmico observado usa o provider de arquivo com watch e ACME TLS challenge. O Compose do Baixada não publica portas públicas nem inicia outro proxy. A porta web `13002` fica presa a `127.0.0.1` apenas para o bootstrap privado por túnel SSH; depois da configuração inicial pode ser removida.
- Estado em 2026-10-01: os três serviços estão no VPS (`baixada-postgres-1`, `baixada-web-1`, `baixada-worker-1`). A imagem web `16940b9` está ativa e saudável; healthcheck `/api/v1/health` retornou HTTP 200. O operador confirmou a criação do Superusuário e configuração de MFA; uma consulta somente de contagens confirmou zero tenants e zero contratos.
- Healthcheck web: `/api/v1/health` verifica processo/HTTP, não a conexão PostgreSQL; o banco deve ser validado separadamente no smoke pós-deploy. O worker não expõe health endpoint próprio no momento.
- PostgreSQL deve ser um serviço privado e dedicado ao Baixada. Não publicar sua porta na Internet nem reutilizar banco de outro projeto.
- O VPS usa volumes persistentes nomeados e segredos root-only. A mídia e WAL ainda estão apenas no disco da VPS; configurar e testar cópia externa antes de aceitar dados de usuários.

## Domínio e TLS

`APP_URL` deve ser `https://baixadafc.com.br`. Criar no Registro.br (nameservers observados: `a.auto.dns.br`, `b.auto.dns.br`) um registro A para `@` → `129.121.54.111` e CNAME `www` → `baixadafc.com.br`; não criar AAAA sem IPv6 confirmado. O apex será canônico e `www` fará redirect no Traefik. Antes de alterar o arquivo compartilhado de rotas, copiar uma versão de segurança e validar o YAML; não tocar nos routers dos outros projetos.

Depois do DNS/TLS, cadastrar `baixadafc.com.br` para o tenant Baixada no fluxo de domínios do Superusuário, validar o challenge e ativá-lo como canônico. A resolução pública exige `verification_status=VERIFIED` e `tls_status=ACTIVE`; registrar o domínio não é suficiente. `www.baixadafc.com.br` será apenas redirect, para respeitar a regra do app de um domínio canônico por tenant.

## Configuração e banco

Use `infra/baixada.production.env.example` como lista de variáveis, não como arquivo de segredos. Segredos de produção ficam em `/srv/apps/baixada/infra/secrets/` com permissões somente para root. Web e worker devem ter chaves HMAC diferentes, cadastradas em `app.rls_context_keys` com escopos mínimos. `DATABASE_URL` usa o login `baixada_runtime_login`, membro do papel restrito `baixada_runtime`; a credencial migradora fica fora dos serviços web/worker.

O banco de produção foi criado vazio em 2026-10-01; as 15 migrações foram aplicadas pela imagem migradora versionada. O login `baixada_runtime_login` conectou, e seu papel foi confirmado sem `SUPERUSER` ou `BYPASSRLS`. Como não havia dados anteriores, não havia dump para migrar. Ainda faltam testes reais de isolamento/RLS na instância e backup restaurável antes de expor tráfego.

O banco local `baixada` recebeu a migração 0015 depois de um dump validado e foi testado com runtime sem `SUPERUSER`/`BYPASSRLS`. Isso não migra nem homologa o banco de produção.

## Pré-deploy e aceite

- [x] Inventariar VPS, acesso SSH observado, capacidade atual, disco, Docker e serviços ativos. Confirmado: `129.121.54.111:22022`, 2 vCPU, 3.6 GiB RAM e 54 GiB livres; host compartilhado. O acesso observado é `root`; antes de operar produção, definir identidade nominal/deploy com privilégio mínimo.
- [x] Reconstruir a convenção de deploy: Compose sob `/srv/apps`, Traefik compartilhado por `servicos-padrao`, rotas via arquivo dinâmico com watch.
- [ ] Conferir CPU/RAM/disco/banda disponíveis e estimar capacidade com tráfego real; alertas de disco devem preceder o bloqueio de uploads a 80%.
- [x] Criar remoto Git, branch `main`, validar e publicar as imagens `linux/amd64` identificadas pelo commit; segredos não foram commitados.
- [x] Criar PostgreSQL privado dedicado `postgres:5432/baixada`, volumes próprios e papéis migrador/runtime separados; aplicar 15 migrações.
- [x] Gerar segredos únicos de produção diretamente no VPS; arquivos `infra/secrets/*.env` estão em modo `0600`; chaves HMAC web/worker distintas registradas em `app.rls_context_keys`.
- [ ] Confirmar DNS A por consulta confiável; validar AAAA se publicado; abrir somente portas necessárias. As consultas disponíveis nesta inspeção não resolveram `baixadafc.com.br` nem `www.baixadafc.com.br`, portanto o DNS permanece não confirmado.
- [ ] Verificar `baixadafc.com.br` no Resend, configurar `nao-responda@baixadafc.com.br`, usar Reply-To `baixadafc5@gmail.com`, criar chave API exclusiva do Baixada e testar entrega. Não reutilizar chaves de outros projetos.
- [ ] Autorizar o destino Google Drive `baixadafc5@gmail.com` (a sessão Drive atualmente conectada é outra conta), configurar backups criptografados externamente: PostgreSQL diário + WAL até 5 minutos, mídia diária, retenção 30 diários/12 mensais; restaurar em ambiente isolado e medir RPO/RTO.
- [x] Validar Compose e builds, incluindo arquitetura amd64; corrigir falhas reais do worker ESM e bind do Next encontradas no teste operacional.
- [x] Executar cadastro de Superusuário e MFA pelo bootstrap privado (confirmado pelo operador em 2026-10-01).
- [ ] Confirmar provisionamento do primeiro tenant e executar testes reais de isolamento/RLS, leitura/escrita autorizada e depois teste externo; o smoke HTTP local passou, mas não substitui homologação multi-tenant.
- [ ] Definir janela, commit/imagem anterior e rollback; registrar versão, resultado e responsável.

## Informações necessárias para executar o deploy

Bloqueadores para disponibilizar ao público: apontar DNS no Registro.br (A `@` → `129.121.54.111`; CNAME `www` → apex); concluir o setup privado do Superusuário e MFA; verificar o domínio no Resend, instalar chave exclusiva e testar envio; reautorizar o Drive na conta `baixadafc5@gmail.com`, configurar cópias criptografadas de banco/WAL e mídia, e concluir teste de restauração. Nenhuma rota pública do Traefik foi criada; a porta 13002 continua só em loopback e há um túnel SSH local para a tela de setup.
