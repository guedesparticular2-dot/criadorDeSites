# Preparação de produção — VPS

`compose.production.yml` define web, worker e PostgreSQL dedicado do Baixada. O banco não publica porta; a rede do banco é interna. O proxy é o Traefik compartilhado da VPS e não é criado por este Compose. Este arquivo não significa que a produção esteja homologada nem autoriza tráfego público antes dos gates abaixo.

## Antes de subir

1. Usar a VPS já inventariada: deployment em `/srv/apps/baixada`, conectada à rede externa `servicos-padrao`; preservar firewall/proxy existentes e não alterar serviços de outros projetos. Preparar PostgreSQL com backup/WAL externo antes de dados reais.
2. Aplicar migrações usando uma credencial de migração separada e protegida; nunca passar essa credencial à web ou ao worker.
3. Configurar `baixada_runtime` e o login `baixada_runtime_login`; confirmar privilégios efetivos: sem `SUPERUSER`/`BYPASSRLS`, sem associação ao papel verificador e sem leitura da chave HMAC. Revisar os scripts de roles e validar políticas sob essa identidade.
4. Criar em `infra/secrets/` (root-only, não commitado) os arquivos `postgres.env`, `migrator.env`, `web.env` e `worker.env`. Web e worker precisam de HMAC distintos, mínimo 32 caracteres, cadastrados em `app.rls_context_keys` com escopos mínimos. Criar chave MFA aleatória de 32 bytes codificada em base64url e guardá-la em backup seguro: perdê-la impede decifrar fatores MFA existentes.
5. Configurar `EMAIL_PROVIDER=resend`, remetente verificado `Baixada Futsal Clube <nao-responda@baixadafc.com.br>`, `EMAIL_REPLY_TO=baixadafc5@gmail.com` e chave exclusiva do Baixada. Não reutilizar chave de outro projeto.
6. Preparar o diretório/volume de mídia, backups externos, alertas de disco e teste de restauração antes de receber uploads reais.
7. Apontar apex por A para o IPv4 da VPS e `www` por CNAME para apex; o Traefik compartilhado fornecerá HTTPS e redirect de `www` para o domínio canônico quando DNS já tiver propagado.

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

- OAuth para o Drive de `baixadafc5@gmail.com` (a sessão atualmente conectada corresponde a outra conta), backup criptografado, WAL contínuo, retenção, alertas e restauração real.
- Domínios/DNS, firewall, certificado TLS e teste externo.
- Remetente e chave Resend exclusivos, com teste real de entrega.
- Homologação jurídica da política LGPD e UAT com contas/tenants de teste.
- Medição real de RPO/RTO e decisão de aceite do ponto único de falha da VPS.
