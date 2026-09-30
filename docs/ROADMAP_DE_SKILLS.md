# Catálogo e roadmap de skills

Este arquivo é o inventário central das skills utilizadas pelo Baixada FC e que podem ser reaproveitadas em outros projetos. A regra é ativar somente as skills necessárias para a fase atual, mantendo os documentos do projeto como fonte de verdade.

## 1. Design e experiência do usuário

### `design-flow`

Orquestra o fluxo completo de design: descoberta, briefing, arquitetura de informação, tokens, implementação e revisão.

### `grill-me`

Conduz uma entrevista crítica para eliminar ambiguidades, testar decisões e fechar o escopo antes da implementação.

### `design-brief`

Cria um briefing de design persistente a partir do objetivo do produto, público, conteúdo, fluxos e decisões visuais.

### `information-architecture`

Define estrutura de páginas, hierarquia de conteúdo, navegação, menus, URLs e fluxos antes do design visual.

### `design-tokens`

Gera tokens de design para cores, tipografia, espaçamento, raios, sombras, breakpoints e temas claro/escuro.

### `frontend-design`

Implementa interfaces frontend com atenção à composição visual, hierarquia, tipografia, responsividade e acabamento de produção.

### `impeccable`

Funciona como camada de controle de qualidade e acabamento visual. Deve ser usada para criticar, polir, simplificar, melhorar responsividade, acessibilidade, animações e consistência da interface.

### `design-review`

Executa revisão estruturada do resultado implementado, verificando hierarquia visual, consistência, responsividade, acessibilidade e fidelidade ao briefing.

### `brief-to-tasks`

Transforma um briefing em uma sequência de tarefas implementáveis, organizadas por fatias verticais.

## 2. Planejamento, arquitetura e especificação

### `planning-with-files`

Mantém planejamento persistente em arquivos como `task_plan.md`, `findings.md` e `progress.md`, permitindo recuperação de contexto e acompanhamento de trabalhos longos.

### `system-design`

Projeta ou evolui sistemas a partir de requisitos, evidências do repositório, invariantes, capacidade, fluxos críticos e trade-offs explícitos.

### `code-review`

Revisa alterações por dois eixos: conformidade com os padrões técnicos do repositório e aderência à especificação original.

### `tdd`

Aplica desenvolvimento orientado por testes no ciclo red-green-refactor, priorizando comportamentos observáveis e testes nas fronteiras públicas.

## 3. Banco de dados e qualidade técnica

### `oma-db` — pendente de instalação

Skill planejada para a fase de modelagem PostgreSQL. Deve cobrir isolamento multi-tenant, entidades, normalização, índices, transações, concorrência, migrações, retenção e otimização de consultas.

### Playwright Agent Skills — pendente de instalação

Skill planejada para a fase de QA web. Deve cobrir testes E2E, fluxos de autenticação e publicação, validação mobile-first, snapshots e regressão visual.

## 4. Skills especializadas

### `brandao-layout`

Skill específica para avaliações escolares no padrão Brandão. Não deve ser ativada em projetos que não solicitem esse padrão visual.

## 5. Fluxo recomendado para novos projetos

1. `grill-me` para eliminar ambiguidades e decisões pendentes.
2. `design-brief` para registrar o objetivo e a experiência desejada.
3. `information-architecture` para definir páginas, navegação e conteúdo.
4. `design-tokens` para estabelecer o sistema visual.
5. `brief-to-tasks` para quebrar o trabalho em tarefas.
6. `planning-with-files` para acompanhar execução e decisões persistentes.
7. `system-design` para arquitetura, dados, integrações e trade-offs.
8. `frontend-design` para implementar as interfaces.
9. `tdd` para desenvolver funcionalidades com testes.
10. `impeccable` para acabamento, acessibilidade e refinamento visual.
11. `design-review` para a revisão final contra o briefing e os requisitos.
12. `code-review` para revisar padrões técnicos e conformidade com a especificação.
13. Playwright após a definição dos fluxos E2E e da infraestrutura de testes.
14. `oma-db` durante o desenho do modelo PostgreSQL e das migrações.

## 6. Regras de uso e economia de contexto

- Não ativar todas as skills ao mesmo tempo.
- Usar uma skill principal por fase e, no máximo, uma skill complementar quando necessário.
- Manter requisitos, decisões, arquitetura, tokens e planos em arquivos versionados.
- Reutilizar os artefatos gerados em outros projetos, adaptando apenas o contexto, os requisitos e a identidade visual.
- Ativar `impeccable` e `design-review` depois que houver uma interface implementada ou um protótipo concreto para avaliar.
- Instalar `oma-db` quando o modelo de dados estiver prestes a ser criado.
- Instalar Playwright quando os fluxos de navegação e autenticação estiverem implementados o suficiente para testes automatizados.

## 7. Status atual

### Instaladas

`design-flow`, `grill-me`, `design-brief`, `information-architecture`, `design-tokens`, `frontend-design`, `impeccable`, `design-review`, `brief-to-tasks`, `planning-with-files`, `system-design`, `tdd` e `code-review`.

### Pendentes

`oma-db` e Playwright Agent Skills.
