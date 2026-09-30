# Arquitetura Baixada FC

## Forma do sistema

O produto começa como um monólito modular, implantado em dois processos: `web` e `worker`. Os processos compartilham contratos e regras de domínio, mas o worker é o único responsável por tarefas demoradas, agendamentos, processamento de mídia e entrega da outbox.

O PostgreSQL é a fonte de verdade. Mídias ficam no filesystem da VPS e são referenciadas pelo banco. Backups de banco, WAL e mídia precisam sair da VPS para que uma perda do servidor não destrua também a recuperação.

## Invariantes protegidas

- Toda operação de negócio pertence a exatamente um tenant explícito.
- FKs compostas e RLS impedem relações cruzadas entre tenants.
- Uma instância possui um único Administrador Principal ativo.
- Um usuário vota uma única vez por enquete.
- O site público aponta para uma única release coerente.
- Escritas editoriais usam versão otimista.
- O original de mídia só é descartado depois da geração de todas as variantes obrigatórias.
- Auditoria, outbox e alteração principal são persistidas na mesma transação.

## Consistência e falhas

Papéis, votos, cobrança, publicação e consentimentos usam consistência transacional. Cache público, notificações e contadores de uso são derivados e podem ser reconstruídos. O worker usa `FOR UPDATE SKIP LOCKED`; efeitos externos devem adotar idempotência e registrar tentativas.

## Segurança

O contexto de tenant é definido dentro da transação do banco. A aplicação valida a associação e as permissões antes de abrir a transação; RLS funciona como segunda barreira. A conexão de runtime não deve ser proprietária das tabelas nem possuir `BYPASSRLS`. Ações administrativas exigem MFA e usam sessão de no máximo oito horas, com expiração por inatividade em trinta minutos.

## Limitações aceitas no MVP

A única VPS é um ponto único de falha. A meta de 99,9% é operacional, não um SLA. A mídia local reduz custo, mas exige bloqueio preventivo de uploads aos 80% de disco e backup externo diário.
