# Sistema de design e integração — Baixada Base v1

## Decisão

O Baixada Futsal Clube é o tenant de referência da plataforma e inaugura o tema global **`BAIXADA_BASE`**, versão 1. Todo tenant novo começa com esse tema, uma estrutura inicial de páginas e componentes compatíveis. O Administrador Principal poderá trocar apenas opções aprovadas do catálogo ou configurar propriedades seguras; nunca CSS, JavaScript ou layouts arbitrários.

Os tokens legíveis por máquina estão em [`design-tokens/BAIXADA_BASE_v1.json`](design-tokens/BAIXADA_BASE_v1.json). Este documento é a referência de produto para o painel, a API, o provisionamento e futuras versões de tema.

## Situação verificada em 24/09/2026

| Área | Já existe | Estado atual |
| --- | --- | --- |
| Site público do Baixada | Home, cabeçalho, hero, próximo jogo, histórias, agenda, editorial, rodapé e página de detalhe de jogo | Implementação visual estática para validação do design |
| Tema e tokens no banco | `design_system_versions`, `design_tokens`, `themes`, `theme_versions`, `tenant_theme_configs` | Modelagem pronta; ainda sem carregamento pelo runtime |
| Conteúdo e publicação | páginas, versões, seções, blocos, menus, releases e rotas | Modelagem pronta; home atual não consulta a release |
| Isolamento de tenant | contexto, FKs compostas e RLS | Base de banco pronta; resolução de domínio ainda não foi conectada à web |
| Painel `/admin` e plataforma `/platform` | Interface de demonstração | Ainda não há autenticação, autorização, persistência ou ações reais |
| Worker/outbox | Processo e polling da outbox | Estrutura presente; integrações de domínio ainda pendentes |

Portanto, o visual aprovado não será perdido: ele está em código e agora está documentado/versionado. Porém, até a integração abaixo ser concluída, o Baixada é uma **demonstração visual**, não um tenant administrável por dados reais.

## Padrão visual aprovado

### Identidade e cores

- Azul institucional: `#1E638C`; azul profundo: `#0B2D48`, `#104463`, `#1C5A7E`.
- Verde institucional: `#247348`; verde editorial escuro: `#1B5D39`.
- Dourado: `#D5B16B`; vinho de apoio: `#7F1D32` e `#98283F`.
- Fundos: papel `#FFFEFA`; editorial `#F7F7F6`.
- O site é deliberadamente **somente claro**. Ele não herda modo escuro do navegador ou do sistema operacional.
- Tipografia de leitura: Avenir Next/Trebuchet; editorial: Georgia; saudação manuscrita: família cursiva do catálogo.
- Largura máxima do conteúdo: `1180px`; raio visual padrão: `2px`.

### Componentes e composição da home

1. **Cabeçalho:** duas faixas externas superiores de 4px — azul e verde —, borda dourada externa inferior de 4px, logo do tenant, brilho no nome a cada dez segundos e bola girando em usos de ícone.
2. **Hero:** imagem de fundo do tenant, máscara preta em gradiente sem contaminar o card do próximo jogo; boas-vindas em duas linhas, “Nossa casa · nossa história”, chamada principal, CTA dourado com ornamento verde e assinatura alinhada à ação. O conteúdo não pode encobrir o rosto no ponto focal da mídia.
3. **Próximo jogo:** faixa azul, borda superior verde de 5px, marca-d’água tática branca a até 10% de opacidade, confronto clicável com página de detalhes, escudos e nomes em destaque.
4. **Últimas histórias:** slogan “Isso aqui é Baixada”, respiro de 20px até o título, cards clicáveis; imagem amplia levemente e o card sobe no hover/foco; barra branca translúcida de 40px e 40% no rodapé da imagem; sem numeração decorativa.
5. **Agenda:** seção azul profunda, faixa verde superior e dourada inferior de 5px, encontros elegíveis ordenados por data.
6. **Editorial do clube:** fundo `#F7F7F6`, título central “Isso aqui é O Baixada”, mídia quadrada à esquerda e história à direita. A mídia do Baixada é o vídeo sem capa, silencioso, em loop e com fundo visualmente integrado à seção.
7. **Rodapé:** logo e identidade à esquerda, navegação secundária, linha dourada próxima à base e aviso legal alinhado à direita.

### Interação e acessibilidade

- A bola decorativa gira por CSS; respeitar `prefers-reduced-motion` interrompe animações não essenciais.
- Brilho do nome é discreto e não interfere na legibilidade.
- Elementos acionáveis devem ter foco visível, rótulo acessível e não depender apenas de hover.
- Imagens recebem texto alternativo editorial; marcas meramente decorativas usam `alt=""`.
- A interface deve permanecer clara sob Chrome, Safari, Firefox e navegador do aplicativo.

## O que é padrão e o que cada tenant pode alterar

| Camada | Regra do sistema | Responsável |
| --- | --- | --- |
| Tema-base | `BAIXADA_BASE v1` é aplicado no provisionamento | Sistema / Superusuário |
| Identidade | nome adotado, razão social, logo, mídias, textos e menus | Administrador autorizado |
| Conteúdo | notícias, destaques, agenda, partidas, páginas e mídias dentro das permissões | Administrador autorizado |
| Escolhas visuais | cores de marca permitidas, combinação tipográfica e pacote de ícones do catálogo | Administrador Principal, conforme plano |
| Estrutura | modelos, blocos, responsividade e comportamento de componentes vêm do catálogo | Sistema; extensões por serviço adicional |
| Segurança visual | sem CSS/JS do cliente; sem quebra de contraste, foco, modo claro ou isolamento | Sistema |

As personalizações criam um novo `tenant_theme_configs` em `DRAFT`. A prévia usa esse rascunho; a publicação promove-o para `PUBLISHED` e torna o anterior `SUPERSEDED`. Há somente uma configuração publicada por tenant. O tema global não é alterado quando um cliente personaliza a própria instância.

## Como o design se liga ao sistema

```text
Domínio/URL
  → resolvedor de tenant
  → tenant ativo + configuração de tema publicada
  → BAIXADA_BASE v1 + overrides seguros do tenant
  → variáveis CSS e componentes do catálogo

Release pública do tenant
  → páginas/menus/rotas fixados na release
  → conteúdos, partidas, agenda e mídias permitidas
  → renderização do site público
```

### Fonte de verdade e leitura pública

1. O domínio identifica o tenant de forma explícita.
2. A web lê a única `tenant_theme_configs` publicada do tenant e a versão de tema correspondente.
3. A versão de tema aponta para `design_system_versions` e seus `design_tokens`.
4. Apenas tokens da lista segura podem ser sobrepostos pelo tenant; o renderer converte esse resultado em variáveis CSS.
5. A web lê `tenants.current_release_id`. `site_release_pages`, `site_release_menus` e `routes` definem exatamente o que está público.
6. Conteúdo e mídias são buscados sempre com o `tenant_id` corrente; RLS é a segunda barreira contra vazamento entre clientes.

O site nunca deve ler rascunhos como conteúdo público, nem inferir o tenant somente de dados enviados pelo navegador.

### Fluxo administrativo que será entregue

1. Administrador autentica e escolhe o tenant corrente quando tiver mais de um vínculo.
2. O painel exibe dados reais daquele contexto, inclusive o tema e a release em uso.
3. Em **Aparência**, ele troca logo, catálogo de fontes/ícones e tokens permitidos; o painel mostra prévia antes de salvar.
4. Em **Conteúdo**, ele cria ou altera páginas, notícias, partida, agenda e mídia. Toda alteração nasce como rascunho e usa versão otimista.
5. Em **Publicar**, ele prepara uma release. A operação troca `current_release_id` em uma transação: site, menus e rotas mudam juntos.
6. Auditoria registra autor, tenant, alteração, versão anterior/nova e horário. O Superusuário usa suporte identificado, sem personificação.

## Provisionamento de um novo tenant

O Superusuário cria a instância e o Administrador Principal. A rotina deve, na mesma operação de negócio, criar:

1. `tenant`, plano, domínio inicial e convite/nomeação do Administrador Principal;
2. `tenant_theme_configs` em `DRAFT`, apontando para `BAIXADA_BASE v1`;
3. logo provisório ou a logo enviada pelo cliente;
4. catálogo inicial: home, institucional, contato, listagem de notícias e detalhe de conteúdo;
5. menus e uma primeira `site_release` com as páginas iniciais;
6. configuração de tema `PUBLISHED` e a release inicial como `current_release_id`.

O tenant nasce com o padrão Baixada, mas sua identidade, conteúdo e opções permitidas são imediatamente editáveis no painel. Um tema totalmente exclusivo continua como serviço adicional e também precisa ser versionado.

## Como testar agora

### O que já pode ser validado

Com o servidor local em execução:

- [Home do Baixada](http://localhost:3000/): composição, responsividade, animações, tema claro e links âncora.
- [Detalhe do próximo jogo](http://localhost:3000/jogos/proximo): navegação do confronto.
- [Prévia do painel do tenant](http://localhost:3000/admin): apenas layout de referência.
- [Prévia da plataforma](http://localhost:3000/platform): apenas layout de referência.

Os últimos dois endereços ainda exibem números e ações fictícias: não criarão conteúdo, usuários, releases ou tenants.

### Critérios de aceite da próxima etapa funcional

- Abrir dois hosts/tenants diferentes e nunca visualizar conteúdo, sessão ou tema do outro.
- Editar a identidade de um tenant, pré-visualizar e publicar sem afetar outro.
- Criar uma notícia, uma partida e um evento; confirmar que cada um aparece na home somente depois da release.
- Abrir duas abas editoriais e validar conflito de versão, sem sobrescrita silenciosa.
- Trocar uma configuração de tema e confirmar que há uma única versão publicada para o tenant.
- Validar desktop, tablet, celular e modo escuro do navegador, confirmando a permanência do tema claro.

## Ordem recomendada de implementação

1. **Resolver tenant por host e dados seed do Baixada:** remove o conteúdo estático da home e estabelece a primeira instância real.
2. **Resolver de tema e Aparência no painel:** lê `BAIXADA_BASE v1`, aplica tokens permitidos e oferece prévia/publicação.
3. **Conteúdo e release:** páginas, notícias, partidas e agenda passam a alimentar os blocos da home; publicação atômica entra em operação.
4. **Autenticação, membros e permissões:** deixa de haver painel de demonstração e aplica o contexto de tenant por requisição.
5. **Mídia, processamento e worker:** uploads protegidos, variantes, consentimento e backup.

Essa ordem preserva o visual aprovado, prova o isolamento logo no início e evita construir um editor que ainda não tem conteúdo real ou release para publicar.
