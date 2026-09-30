# Preparação de produção — VPS

`compose.production.yml` é um ponto de partida para a aplicação e o proxy; ainda não representa homologação nem autorização para publicar. O PostgreSQL é externo a esse Compose (por exemplo, serviço PostgreSQL no host/VPS), sem porta publicada pelo arquivo. O usuário informado em `DATABASE_URL` deve ser o papel de runtime restrito, nunca o proprietário/migrador.

## Antes de subir

1. Instalar Docker Compose, configurar firewall permitindo somente SSH administrativo, HTTP e HTTPS, e preparar o PostgreSQL com backups e WAL externos.
2. Aplicar migrações usando uma credencial de migração separada e protegida; nunca passar essa credencial à web ou ao worker.
3. Configurar `baixada_runtime` e confirmar seus privilégios efetivos: sem `SUPERUSER`/`BYPASSRLS`, sem acesso ao papel verificador e sem SELECT na chave HMAC. Revisar o script `infra/database/runtime-role.sql` e validar todas as políticas sob essa identidade.
4. Criar, fora do repositório, as variáveis obrigatórias `APP_URL`, `DATABASE_URL`, `MFA_ENCRYPTION_KEY`, `RLS_CONTEXT_KEY_ID`, `RLS_CONTEXT_HMAC_KEY`, `RLS_SYSTEM_CONTEXT_KEY_ID`, `RLS_SYSTEM_CONTEXT_HMAC_KEY`, `APP_DOMAINS` e `TLS_EMAIL`. Usar chave MFA aleatória de 32 bytes codificada em base64url e guardá-la em backup seguro: perdê-la impede decifrar fatores MFA existentes. Usar segredos HMAC distintos para web e worker (mínimo 32 caracteres), inserindo cada segredo em `app.rls_context_keys` sob credencial de migração e limitando seus escopos a `PUBLIC,TENANT,PLATFORM,REGISTRATION,TOKEN,PASSWORD_RESET` para web e `SYSTEM` para worker.
5. Até o Resend estar configurado, manter `EMAIL_PROVIDER=console`; isso não valida entrega real. Para produção com e-mail, configurar `EMAIL_PROVIDER=resend`, `EMAIL_FROM` verificado e chave exclusiva do Baixada.
6. Preparar o diretório/volume de mídia, backups externos, alertas de disco e teste de restauração antes de receber uploads reais.
7. Verificar DNS A/AAAA dos domínios para a VPS. Caddy só emitirá certificados quando DNS e portas públicas estiverem corretos.

## Verificação local do Compose

Com os valores preenchidos apenas no ambiente seguro do operador:

```sh
docker compose -f compose.production.yml config --quiet
docker compose -f compose.production.yml build
```

Em 30/09/2026, `config --quiet` passou e os builds locais web/worker passaram com placeholders não secretos. As imagens foram verificadas como usuário `node`; isso valida empacotamento e build, não conexão ou readiness em VPS.

O comando de configuração pode exibir valores interpolados se for executado sem `--quiet`; não cole saídas contendo segredos em tickets ou logs.

## Fronteira RLS assinada (implementada e validada localmente; ainda não liberar)

As políticas usam contexto HMAC validado no PostgreSQL; GUCs antigos deixam de ser autoridade. Os fluxos web e o worker assinam escopos com chaves distintas. A migração 0015 foi aplicada no banco local `baixada` após dump validado; os testes SQL passaram em base descartável e os signers web/worker foram exercitados contra o banco local com papel runtime sem `SUPERUSER`/`BYPASSRLS`. Isso não valida produção. Ainda faltam cadastrar chaves exclusivas de produção, backup validado no destino, aplicar a migração sob o procedimento aprovado e executar homologação completa com runtime. Não exponha dados de clientes até esses gates serem aprovados.

O alvo específico, domínio, topologia, checklist e dados de VPS ainda pendentes estão em [`docs/infraestrutura/deploy.md`](../docs/infraestrutura/deploy.md). O domínio informado `baixadafc.com.br` ainda não foi verificado no DNS nem cadastrado como domínio ativo na aplicação.

## Ainda exige ambiente/decisão externa

- Destino e credenciais de backup externo, arquivo contínuo de WAL, retenção, alertas e restauração real.
- Domínios/DNS, firewall, certificado TLS e teste externo.
- Remetente e chave Resend exclusivos, com teste real de entrega.
- Homologação jurídica da política LGPD e UAT com contas/tenants de teste.
- Medição real de RPO/RTO e decisão de aceite do ponto único de falha da VPS.
