# Fluxo de Design do Baixada FC

Este documento define como as skills de design devem ser utilizadas no projeto. A finalidade é evitar sobreposição de decisões e preservar uma única direção visual para a plataforma SaaS.

## Ordem oficial

### 1. Planejamento — `designer-skills`

Usar a coleção `designer-skills` para:

- conduzir o briefing;
- definir a direção estética;
- organizar arquitetura de informação;
- definir navegação e hierarquia de páginas;
- criar tokens de design;
- dividir a implementação em fatias verticais.

Skills principais: `design-flow`, `grill-me`, `design-brief`, `information-architecture`, `design-tokens` e `brief-to-tasks`.

### 2. Implementação — `frontend-design`

Usar `frontend-design` para implementar páginas, componentes e superfícies com a direção visual aprovada no briefing e nos tokens.

Regras obrigatórias:

- respeitar `DESIGN.md` e os tokens existentes;
- começar pela experiência mobile;
- reutilizar componentes antes de criar variações;
- evitar estética genérica de IA;
- entregar estados de carregamento, vazio, erro, foco e desabilitado;
- considerar acessibilidade e performance durante a implementação.

### 3. Controle de qualidade e acabamento — `impeccable`

Usar `impeccable` depois que uma superfície funcional estiver implementada. Ele é a camada de auditoria, refinamento e acabamento, não o responsável por substituir o briefing.

Comandos preferenciais:

- `impeccable audit`: acessibilidade, responsividade, performance e problemas técnicos visuais;
- `impeccable critique`: hierarquia, clareza, carga cognitiva e qualidade da experiência;
- `impeccable polish`: acabamento visual e correção de inconsistências;
- `impeccable adapt`: adaptação entre mobile, tablet e desktop;
- `impeccable harden`: estados de erro, bordas, casos extremos e prontidão de produção;
- `impeccable optimize`: problemas de performance de interface;
- `impeccable typeset`: revisão de tipografia;
- `impeccable layout`: revisão de espaçamento, ritmo e hierarquia.

O Impeccable não deve inventar uma nova identidade visual sem decisão explícita. O briefing, o `DESIGN.md`, os tokens e as restrições do produto têm precedência.

### 4. Revisão final — `design-review`

Usar `design-review` para a avaliação final baseada em screenshots reais da aplicação. A revisão deve cobrir desktop, tablet e mobile quando a superfície for responsiva.

## Precedência em caso de conflito

1. Requisitos funcionais e regras de negócio.
2. Decisões explícitas do usuário.
3. `DESIGN.md` e tokens oficiais do projeto.
4. Briefing da superfície.
5. `frontend-design`.
6. `impeccable`.
7. `design-review` como avaliação e recomendação.

Uma skill de revisão pode apontar um problema, mas não deve alterar uma decisão de produto ou marca sem confirmação.

## Gate mínimo antes de considerar uma tela pronta

- fluxo funcional verificado;
- mobile revisado primeiro;
- tablet e desktop verificados;
- estados de carregamento, vazio, erro e sucesso presentes;
- navegação e foco acessíveis;
- contraste validado;
- tokens usados sem valores arbitrários desnecessários;
- screenshots capturadas;
- `impeccable audit` executado;
- `impeccable polish` executado quando houver problemas de acabamento;
- `design-review` concluído;
- nenhuma alteração visual conflitante com o briefing ou o design system.

## Hooks automáticos

O hook automático do Impeccable não será ativado por padrão. Ele somente deve ser habilitado depois de validarmos o comportamento em um ambiente de desenvolvimento e confirmarmos que os alertas não interrompem fluxos legítimos de implementação.
