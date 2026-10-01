# Preparação de produção — VPS

`compose.production.yml` define web, worker e PostgreSQL dedicado do Baixada. A stack está implantada em modo privado em `/srv/apps/baixada`: Postgres 17, 15 migrações e runtime healthy na revisão `c0b7418ad84a`. O banco não publica porta; a rede do banco é interna. A web só está exposta em `127.0.0.1:13002` para bootstrap por túnel SSH; nenhuma rota pública foi adicionada ao Traefik. Isso ainda não é homologação para clientes.

## Antes de subir

1. Concluído: usar a VPS inventariada, Compose dedicado em `/srv/apps/baixada` e rede externa `servicos-padrao`, preservando os outros projetos.
2. Concluído: migrações aplicadas por credencial separada e protegida; não enviada à web nem worker.
3. Concluído inicialmente: `baixada_runtime_login` confirmou conexão sem `SUPERUSER`/`BYPASSRLS`; ainda falta homologar os testes multi-tenant/RLS na instância.
4. Concluído: os quatro arquivos em `infra/secrets/` foram gerados no próprio VPS com modo `0600`; chaves HMAC separadas e chave MFA aleatória. Falta incluir as chaves de recuperação MFA em backup externo criptografado.
5. Pendente: configurar `EMAIL_PROVIDER=resend`, remetente verificado `Baixada Futsal Clube <nao-responda@baixadafc.com.br>`, `EMAIL_REPLY_TO=baixadafc5@gmail.com` e chave exclusiva do Baixada. Não reutilizar chave de outro projeto.
6. Volume local de mídia criado; backups externos, alertas de disco e teste de restauração pendentes antes de receber uploads reais.
7. Pendente: apontar apex por A para o IPv4 da VPS e `www` por CNAME para apex; após propagação, adicionar rotas isoladas no Traefik e testar TLS/redirect.

## Verificação local do Compose

Com os valores preenchidos apenas no ambiente seguro do operador:

```sh
docker compose -f compose.production.yml config --quiet
docker compose -f compose.production.yml build
```

Em 01/10/2026, `config --quiet` passou; builds amd64 web/worker/migrador passaram. O teste na VPS confirmou `/api/v1/health` HTTP 200, `/setup` HTTP 200 pelo túnel, Postgres healthy, 15 migrações e worker sem reinícios após correção dos imports ESM. O Superusuário ainda não foi criado.

O comando de configuração pode exibir valores interpolados se for executado sem `--quiet`; não cole saídas contendo segredos em tickets ou logs.

## Fronteira RLS assinada (implementada e validada localmente; ainda não liberar)

As políticas usam contexto HMAC validado no PostgreSQL; GUCs antigos deixam de ser autoridade. A migração 0015 foi aplicada tanto localmente quanto no banco dedicado do VPS. Chaves exclusivas de produção foram cadastradas; login runtime confirmado sem `SUPERUSER`/`BYPASSRLS`. Ainda faltam testes de isolamento nesta base, backups/restauração externos e homologação completa. Não exponha dados de membros até esses gates serem aprovados.

O alvo específico, domínio, topologia, checklist e dados de VPS ainda pendentes estão em [`docs/infraestrutura/deploy.md`](../docs/infraestrutura/deploy.md). O domínio informado `baixadafc.com.br` ainda não foi verificado no DNS nem cadastrado como domínio ativo na aplicação.

## Ainda exige ambiente/decisão externa

- OAuth para o Drive de `baixadafc5@gmail.com` (a sessão atualmente conectada corresponde a outra conta), backup criptografado, WAL contínuo, retenção, alertas e restauração real.
- Domínios/DNS, firewall, certificado TLS e teste externo.
- Remetente e chave Resend exclusivos, com teste real de entrega.
- Homologação jurídica da política LGPD e UAT com contas/tenants de teste.
- Medição real de RPO/RTO e decisão de aceite do ponto único de falha da VPS.
