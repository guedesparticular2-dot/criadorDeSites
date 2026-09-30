# Baixada FC — Documento e Especificação de Requisitos

| Campo | Valor |
| --- | --- |
| Projeto | Plataforma SaaS de sites esportivos — Baixada FC como primeira instância |
| Versão | 1.0 — Diretrizes visuais dos painéis administrativos |
| Data | 23 de setembro de 2026 |
| Status | Rascunho para validação |
| Plataforma | Aplicação web responsiva |
| Stack-base | TypeScript, Node.js e PostgreSQL |

## 1. Objetivo do documento

Este documento consolida os requisitos da plataforma SaaS que terá o Baixada FC como primeira instância de referência. Ele registra a visão do produto, o escopo inicial, os perfis de acesso, as regras de negócio, os requisitos funcionais e não funcionais e os critérios gerais de aceitação.

O documento servirá como referência para arquitetura, experiência do usuário, modelagem de dados, desenvolvimento, testes, implantação e futuras decisões de produto.

## 2. Visão do produto

O produto será uma plataforma SaaS capaz de operar inúmeras instâncias independentes do mesmo site. Cada cliente terá seu próprio espaço lógico, conteúdo, usuários, configurações e identidade de apresentação, usando a mesma aplicação e a mesma base tecnológica. O Baixada FC será a primeira instância de referência.

Cada instância funcionará como o canal digital oficial de um clube ou organização. A plataforma apresentará informações institucionais, notícias, destaques, agenda, jogos, resultados, fotos e vídeos. Parte do conteúdo será pública e parte ficará disponível somente para usuários cadastrados e aprovados daquela instância.

Além do site público, o produto contará com um painel administrativo e um criador visual de páginas baseado em blocos. O objetivo é permitir que pessoas autorizadas mantenham o portal atualizado sem editar código.

A arquitetura deverá permitir uma evolução futura para uma comunidade privada formada por atletas, familiares, amigos e demais pessoas envolvidas com cada cliente. Os recursos sociais completos, entretanto, não fazem parte do MVP.

## 3. Objetivos de negócio

- Oferecer uma plataforma comercial reutilizável para múltiplos clubes e organizações.
- Centralizar a presença digital e a memória esportiva de cada cliente.
- Divulgar notícias, eventos, jogos, resultados, fotos e vídeos.
- Permitir manutenção editorial sem dependência cotidiana da equipe técnica.
- Proteger conteúdos relacionados às crianças por meio de controle de acesso e visibilidade.
- Criar uma experiência institucional coerente e responsiva.
- Preparar a base técnica para uma futura comunidade privada.
- Executar a plataforma na VPS da operação SaaS usando a stack padrão.
- Permitir criação, ativação, suspensão e manutenção de inúmeras instâncias sem duplicar o código da aplicação.

## 4. Perfis de usuário

### 4.1 Visitante

Pessoa não autenticada. Pode acessar somente páginas e conteúdos classificados como públicos.

### 4.2 Usuário cadastrado

Pessoa com cadastro aprovado em uma ou mais instâncias. Pode autenticar-se, escolher em qual projeto/instância deseja atuar na sessão corrente, manter o próprio perfil e acessar conteúdos restritos aos membros daquele contexto. Poderá comentar quando o recurso estiver habilitado.

### 4.3 Administrador

Usuário promovido pelo Administrador Principal. Atua na operação editorial e na moderação, de acordo com permissões concedidas. Pode administrar notícias, destaques, agenda, partidas, resultados, galerias, fotos, vídeos e comentários.

### 4.4 Administrador Principal

É o proprietário funcional do produto. Possui plenos poderes editoriais e administrativos, exceto atribuições técnicas exclusivas. Pode promover usuários a Administrador e revogar essas promoções.

### 4.5 Superusuário Técnico

É o engenheiro responsável pela plataforma SaaS. Possui acesso técnico, de segurança, provisionamento de clientes e recuperação emergencial. Essa conta é criada por procedimento de implantação e não por cadastro público. Seu uso cotidiano para publicação de conteúdo deve ser evitado.

### 4.6 Administrador da plataforma

No MVP, essa responsabilidade poderá ser acumulada pelo Superusuário Técnico. Em uma evolução comercial, o papel poderá ser separado para uma equipe interna responsável por provisionar clientes, acompanhar instâncias e administrar configurações globais, sem acessar o conteúdo privado de cada cliente além do estritamente necessário.

## 5. Hierarquia e separação de responsabilidades

A hierarquia será:

> Superusuário Técnico → Administrador Principal → Administradores → Usuários cadastrados → Visitantes

Regras gerais:

- O Superusuário Técnico pode intervir em configurações da plataforma, segurança, provisionamento de instâncias, permissões e recuperação emergencial.
- O Administrador Principal pertence a uma instância específica e não pode acessar dados de outra instância.
- O Administrador Principal pode nomear e destituir Administradores.
- Administradores comuns não podem nomear outros Administradores nem alterar o Administrador Principal.
- Nenhum perfil pode visualizar senhas de usuários.
- A recuperação de senha deve ocorrer por redefinição segura, nunca pela exibição da senha atual.
- O Administrador Principal e os Administradores não terão acesso a segredos de infraestrutura, banco de dados ou VPS.
- Operações administrativas relevantes devem produzir registros de auditoria.

## 6. Matriz inicial de permissões

| Capacidade | Visitante | Usuário | Administrador | Adm. Principal | Superusuário Técnico |
| --- | :---: | :---: | :---: | :---: | :---: |
| Ver conteúdo público | Sim | Sim | Sim | Sim | Sim |
| Ver conteúdo restrito | Não | Sim | Sim | Sim | Sim |
| Editar o próprio perfil | Não | Sim | Sim | Sim | Sim |
| Criar comentários | Não | Conforme permissão | Conforme permissão | Sim | Sim |
| Moderar comentários | Não | Não | Conforme permissão | Sim | Sim |
| Gerenciar conteúdo editorial | Não | Não | Conforme permissão | Sim | Sim |
| Editar a home no construtor | Não | Não | Conforme permissão | Sim | Sim |
| Publicar alterações da home | Não | Não | Conforme permissão | Sim | Sim |
| Aprovar cadastros | Não | Não | Conforme permissão | Sim | Sim |
| Promover Administradores | Não | Não | Não | Sim | Sim, em emergência |
| Alterar o Administrador Principal | Não | Não | Não | Não | Sim, em emergência |
| Acessar configurações técnicas | Não | Não | Não | Não | Sim |
| Consultar auditoria completa | Não | Não | Limitada | Sim | Sim |

As permissões devem ser granulares, mesmo quando forem inicialmente agrupadas por perfil. Exemplos: `noticias.criar`, `noticias.publicar`, `home.editar`, `home.publicar`, `midia.enviar`, `comentarios.moderar` e `usuarios.aprovar`.

## 7. Escopo funcional do MVP

### 7.0 Plataforma SaaS

- Cadastro e provisionamento de novas instâncias de clientes.
- Identificação de cada instância por subdomínio, domínio configurado ou identificador equivalente.
- Isolamento lógico de dados, usuários, mídias, configurações e auditoria entre instâncias.
- Um Administrador Principal para cada instância.
- Configuração individual de nome, logotipo, cores, textos institucionais e conteúdo.
- Operação de várias instâncias com a mesma versão do software.
- Ativação, suspensão e reativação de uma instância pelo Superusuário Técnico.
- Painel técnico para o Superusuário Técnico informar nome adotado do cliente, plano, domínio, DNS e demais configurações de provisionamento.
- Dashboard global do SaaS para acompanhar clientes, planos, operação e situação comercial de cada instância.
- Registro administrativo de valores contratados, cobrança mensal, situação de cobrança e vigência do serviço.
- Suspensão manual ou agendada da publicação de uma instância por motivos operacionais ou comerciais, sem exclusão dos dados.
- Suporte a subdomínio da plataforma e domínio próprio registrado pelo cliente.
- Três planos iniciais: Simples, Médio e Ilimitado.
- Associação do mesmo usuário a múltiplos projetos/instâncias, com seleção explícita do contexto a cada sessão.
- Inclusão, edição, ordenação, publicação, arquivamento e exclusão segura de páginas por instância.
- Criação de menus, submenus e páginas de detalhes sem alteração do código da aplicação.
- Não incluir cobrança automática nem integração de pagamentos no MVP; incluir, entretanto, o cadastro e acompanhamento administrativo das informações comerciais e de cobrança.

### 7.1 Site público e área autenticada

- Página inicial dinâmica.
- Página institucional do clube.
- Listagem e detalhes de notícias.
- Listagem e detalhes de destaques.
- Agenda de jogos e eventos.
- Histórico de partidas e resultados.
- Galerias de fotos.
- Enquetes interativas e estatísticas agregadas.
- Avisos e comunicados com possibilidade de contagem regressiva.
- Incorporação de vídeos autorizados.
- Cadastro, autenticação e recuperação de acesso.
- Conteúdo público e conteúdo restrito a usuários aprovados.
- Painel administrativo responsivo.
- Criador visual baseado em blocos para a home e páginas internas.
- Catálogo inicial de páginas: Institucional, Notícias e Contatos, além das telas de autenticação.

### 7.2 Fora do MVP, mas previsto para evolução

- Perfis sociais completos de atletas e familiares.
- Mural com publicações feitas diretamente pelos membros.
- Amizades, seguidores, grupos ou conexões sociais.
- Mensagens privadas.
- Reações, menções e notificações sociais avançadas.
- Estatísticas esportivas detalhadas por atleta.
- Transmissão própria de vídeo.
- Aplicativos móveis nativos.
- Automação de moderação por IA.
- Upload direto de vídeos; no MVP serão aceitos links do YouTube.

## 8. Estrutura da página inicial

A home deverá funcionar como vitrine dinâmica e poderá conter:

1. Cabeçalho e navegação principal.
2. Hero com a matéria principal.
3. Últimas notícias.
4. Destaques.
5. Últimos resultados.
6. Próximos jogos e eventos.
7. Galerias recentes ou selecionadas.
8. Seções personalizadas criadas no editor visual.
9. Rodapé institucional.

O Hero deverá, por padrão, referenciar uma notícia ou destaque existente, evitando duplicação de conteúdo. O Administrador poderá escolher manualmente o conteúdo principal e substituí-lo sem excluir a publicação original.

## 9. Requisitos funcionais

### 9.1 Plataforma SaaS e multi-tenancy

- **RF-SAS-001:** O sistema deve permitir que o Superusuário Técnico crie uma nova instância de cliente sem duplicar o código da aplicação.
- **RF-SAS-002:** Cada instância deve possuir identificador único e não ambíguo.
- **RF-SAS-003:** Cada instância deve poder ser acessada por subdomínio, domínio personalizado ou mecanismo equivalente definido na implantação.
- **RF-SAS-003a:** O painel do Superusuário Técnico deve permitir informar e editar nome adotado, plano contratado, domínio, dados de DNS e status de configuração do domínio.
- **RF-SAS-003b:** O sistema deve suportar subdomínio gerenciado pela plataforma e domínio próprio do cliente, exibindo instruções de DNS quando a configuração depender do cliente.
- **RF-SAS-004:** O sistema deve associar cada usuário, conteúdo, mídia, comentário, configuração e registro de auditoria a uma única instância, salvo entidades explicitamente globais.
- **RF-SAS-005:** O sistema deve impedir que usuários de uma instância consultem ou alterem dados de outra instância.
- **RF-SAS-006:** Cada instância deve possuir um Administrador Principal próprio.
- **RF-SAS-007:** O Superusuário Técnico deve poder ativar, suspender e reativar uma instância.
- **RF-SAS-008:** Uma instância suspensa não deve aceitar novas sessões nem exibir conteúdo público, devendo apresentar uma mensagem operacional apropriada.
- **RF-SAS-009:** O sistema deve permitir configurar, por instância, nome, logotipo, cores, textos institucionais, domínio, parâmetros de contato e identidade visual.
- **RF-SAS-010:** O conteúdo publicado em uma instância deve ser independente do conteúdo publicado em qualquer outra instância.
- **RF-SAS-011:** O sistema deve permitir clonar apenas a estrutura ou modelos editoriais de uma instância para outra, sem copiar usuários ou conteúdo privado por padrão.
- **RF-SAS-012:** O sistema deve manter auditoria das operações de criação, suspensão, reativação e alteração de configuração de instâncias.
- **RF-SAS-013:** O provisionamento de uma nova instância deve criar a configuração inicial e o convite ou cadastro do respectivo Administrador Principal.
- **RF-SAS-014:** A arquitetura deve permitir a evolução para planos, limites de uso e cobrança recorrente, sem exigir essa funcionalidade no MVP.
- **RF-SAS-015:** O sistema deve oferecer inicialmente os planos Simples, Médio e Ilimitado.
- **RF-SAS-016:** O plano de uma instância deve ser armazenado e exibido no painel técnico, mesmo que cobrança automática não esteja implementada.
- **RF-SAS-017:** O sistema deve permitir que um mesmo usuário esteja associado a múltiplas instâncias com papéis e permissões independentes.
- **RF-SAS-018:** Após a autenticação, quando o usuário possuir mais de uma associação ativa, o sistema deve solicitar a escolha do projeto/instância da sessão.
- **RF-SAS-019:** O sistema deve permitir trocar o projeto/instância corrente sem misturar conteúdo, permissões ou sessão de trabalho.
- **RF-SAS-020:** Somente o Superusuário Técnico poderá criar novas instâncias.
- **RF-SAS-021:** O sistema deve oferecer um catálogo inicial de páginas Institucional, Notícias e Contatos, além das telas de login, recuperação e cadastro.
- **RF-SAS-022:** O Superusuário Técnico deve possuir um dashboard global de administração do SaaS, separado dos painéis administrativos de cada tenant.
- **RF-SAS-023:** O dashboard global deve listar e permitir localizar instâncias por nome adotado, identificador, domínio, plano, situação operacional e situação comercial.
- **RF-SAS-024:** O cadastro de uma instância deve permitir registrar, no mínimo, cliente responsável, nome adotado, plano, valor contratado, periodicidade de cobrança, valor recorrente, data de início, data de renovação ou vencimento e observações administrativas.
- **RF-SAS-025:** O sistema deve manter a situação de cobrança da instância, com estados mínimos `Não configurada`, `Ativa`, `Em atraso`, `Suspensa` e `Encerrada`.
- **RF-SAS-026:** O sistema deve manter a situação operacional da instância, com estados mínimos `Em configuração`, `Ativa`, `Suspensa`, `Agendada para suspensão` e `Encerrada`.
- **RF-SAS-027:** O Superusuário Técnico deve poder registrar cobranças e pagamentos manualmente, incluindo competência, valor previsto, valor cobrado, data de vencimento, data de pagamento, status e observações.
- **RF-SAS-028:** O sistema deve exibir um resumo por instância com valor mensal contratado, total previsto, total recebido, valores em aberto e próxima cobrança registrada.
- **RF-SAS-029:** O sistema deve permitir suspender ou reativar a visualização pública de uma instância sem excluir seus dados, mídias, configurações, usuários ou histórico financeiro.
- **RF-SAS-030:** O Superusuário Técnico deve poder agendar uma suspensão operacional para uma data e hora, com motivo e mensagem exibida ao visitante.
- **RF-SAS-031:** O sistema deve permitir definir se uma instância permanecerá publicada quando houver cobrança vencida ou se deverá ser suspensa automaticamente após um prazo configurável.
- **RF-SAS-032:** Suspensões automáticas por regra comercial devem gerar registro de auditoria e notificação interna ao Superusuário Técnico.
- **RF-SAS-033:** O sistema deve permitir consultar o histórico de alterações de plano, valores, status de cobrança, suspensões, reativações e encerramentos de cada instância.
- **RF-SAS-034:** O dashboard global deve oferecer indicadores consolidados, no mínimo: instâncias ativas, suspensas, em configuração, cobranças em aberto, receita mensal contratada e receita recebida no período selecionado.
- **RF-SAS-035:** O sistema não deve expor dados financeiros de uma instância ao Administrador Principal ou aos usuários daquele tenant, salvo informações explicitamente publicadas pelo próprio cliente.
- **RF-SAS-036:** O Superusuário Técnico deve poder exportar os registros administrativos e financeiros em formato estruturado, respeitando os controles de acesso e a auditoria.

### 9.2 Identidade, cadastro e autenticação

- **RF-AUT-001:** O sistema deve permitir o cadastro público de usuários.
- **RF-AUT-002:** Todo cadastro público deve iniciar com status `Pendente`.
- **RF-AUT-003:** O sistema deve permitir que um usuário pendente consulte uma mensagem clara sobre o estado da solicitação.
- **RF-AUT-004:** O Administrador Principal e usuários com permissão devem poder aprovar ou rejeitar solicitações.
- **RF-AUT-005:** O Administrador Principal deve poder cadastrar um usuário diretamente.
- **RF-AUT-006:** O sistema deve suportar os estados `Pendente`, `Aprovado`, `Rejeitado` e `Suspenso`.
- **RF-AUT-007:** Somente usuários aprovados e não suspensos podem acessar conteúdos restritos.
- **RF-AUT-008:** O usuário deve poder autenticar-se e encerrar a sessão.
- **RF-AUT-009:** O usuário deve poder solicitar redefinição segura de senha.
- **RF-AUT-010:** O sistema não deve revelar se uma determinada conta existe durante a solicitação pública de recuperação de senha.
- **RF-AUT-011:** O usuário deve poder editar os dados permitidos do próprio perfil.
- **RF-AUT-012:** O sistema deve permitir a suspensão e reativação de contas.
- **RF-AUT-013:** O Administrador Principal deve poder promover um usuário aprovado a Administrador.
- **RF-AUT-014:** O Administrador Principal deve poder revogar o papel de um Administrador nomeado.
- **RF-AUT-015:** Administradores comuns não devem poder promover outros usuários.
- **RF-AUT-016:** A conta do Superusuário Técnico deve ser provisionada por procedimento técnico seguro.
- **RF-AUT-017:** Um usuário associado a múltiplas instâncias deve visualizar claramente o projeto/instância corrente durante a navegação autenticada.
- **RF-AUT-018:** O sistema deve impedir que a troca de projeto/instância preserve uma rota, permissão ou conteúdo incompatível com o novo contexto.

### 9.3 Notícias

- **RF-NOT-001:** O sistema deve oferecer CRUD de notícias.
- **RF-NOT-002:** Uma notícia deve conter título, slug, resumo, conteúdo, autor exibido, responsável pelo cadastro, data e status.
- **RF-NOT-003:** Uma notícia pode conter imagem de capa, imagens adicionais e vídeo incorporado.
- **RF-NOT-004:** Uma notícia deve possuir página de detalhes.
- **RF-NOT-005:** O Administrador deve poder classificar uma notícia como destaque da home.
- **RF-NOT-006:** O sistema deve suportar rascunho, agendamento, publicação e arquivamento.
- **RF-NOT-007:** Uma notícia deve ter visibilidade pública, restrita ou oculta.
- **RF-NOT-008:** O sistema deve permitir busca, filtros, ordenação e paginação no painel.
- **RF-NOT-009:** O sistema deve permitir pré-visualização antes da publicação.

### 9.4 Destaques

- **RF-DES-001:** O sistema deve oferecer CRUD de destaques.
- **RF-DES-002:** Um destaque pode representar uma conquista, pessoa, equipe, homenagem, participação, evento ou momento relevante.
- **RF-DES-003:** Um destaque deve aceitar título, chamada, texto, imagem, data, autor, visibilidade e status.
- **RF-DES-004:** Um destaque pode estar associado a galerias, vídeos, pessoas e categorias.
- **RF-DES-005:** Um destaque pode possuir página de detalhes.
- **RF-DES-006:** O Administrador pode selecionar destaques para exibição na home.
- **RF-DES-007:** O Administrador pode habilitar ou desabilitar comentários por destaque.

### 9.5 Agenda e eventos

- **RF-AGE-001:** O sistema deve oferecer CRUD de eventos da agenda.
- **RF-AGE-002:** Um evento deve conter título, tipo, data, horário, local, descrição e status.
- **RF-AGE-003:** O evento pode estar relacionado a uma categoria, equipe ou partida.
- **RF-AGE-004:** O sistema deve suportar eventos como jogos, treinos, campeonatos, reuniões e confraternizações.
- **RF-AGE-005:** O evento deve aceitar os estados agendado, adiado, cancelado e realizado.
- **RF-AGE-006:** A home deve exibir automaticamente os próximos eventos elegíveis.
- **RF-AGE-007:** Eventos passados devem sair da área de próximos eventos sem serem removidos do histórico.
- **RF-AGE-008:** O evento deve possuir visibilidade pública, restrita ou oculta.

### 9.6 Partidas e resultados

- **RF-JOG-001:** O sistema deve oferecer CRUD de partidas.
- **RF-JOG-002:** Uma partida deve registrar data, horário, adversário, competição, rodada, local e categoria quando aplicável.
- **RF-JOG-003:** O sistema deve registrar o placar do Baixada FC e do adversário.
- **RF-JOG-004:** Uma partida deve suportar os estados agendada, adiada, cancelada, em andamento e encerrada.
- **RF-JOG-005:** Partidas futuras devem alimentar a agenda e partidas encerradas devem alimentar os últimos resultados.
- **RF-JOG-006:** Uma partida pode possuir página de detalhes.
- **RF-JOG-007:** A página da partida poderá conter resumo, escalação, fotos, vídeos e estatísticas quando esses recursos forem habilitados.
- **RF-JOG-008:** O sistema deve manter histórico de resultados.

### 9.7 Galerias, fotos e vídeos

- **RF-MID-001:** O sistema deve oferecer CRUD de galerias.
- **RF-MID-002:** Uma galeria deve possuir título, descrição, data, capa, status e visibilidade.
- **RF-MID-003:** A visibilidade deve aceitar `Pública`, `Restrita` e `Oculta/Rascunho`.
- **RF-MID-004:** O Administrador deve poder definir a visibilidade da galeria inteira.
- **RF-MID-005:** Uma foto individual pode sobrescrever a visibilidade herdada da galeria.
- **RF-MID-006:** O Administrador deve poder enviar, editar informações, reordenar, mover, ocultar e remover fotos.
- **RF-MID-007:** O Administrador deve poder selecionar a capa de uma galeria.
- **RF-MID-008:** O sistema deve validar formato, tipo real e tamanho dos arquivos enviados.
- **RF-MID-009:** O sistema deve corrigir orientação, remover metadados desnecessários, comprimir e gerar versões responsivas das imagens.
- **RF-MID-010:** O editor de imagem deve permitir corte e definição de ponto focal.
- **RF-MID-011:** O sistema deve permitir o preenchimento de texto alternativo para acessibilidade.
- **RF-MID-012:** Arquivos restritos devem ser entregues por mecanismo protegido, sem depender apenas de ocultação visual.
- **RF-MID-013:** O sistema deve permitir vídeos incorporados somente a partir de provedores autorizados.
- **RF-MID-014:** O sistema pode oferecer filtros visuais predefinidos, sem permitir código arbitrário de processamento.
- **RF-MID-015:** Somente um Administrador poderá autorizar a publicação de uma foto ou mídia relacionada ao conteúdo do cliente.
- **RF-MID-016:** O sistema deve permitir registrar o administrador que autorizou cada foto ou mídia publicada.
- **RF-MID-017:** A página institucional deve oferecer um canal para questionamentos ou reclamações sobre fotos e conteúdos.
- **RF-MID-018:** Uma reclamação sobre foto ou conteúdo deve ser encaminhada a todos os Administradores ativos da instância correspondente.
- **RF-MID-019:** Administradores devem poder analisar uma reclamação e decidir por manter, ocultar, suspender ou remover logicamente o conteúdo.
- **RF-MID-020:** O sistema deve registrar a decisão, os responsáveis, a data e a justificativa da moderação.
- **RF-MID-021:** Vídeos do MVP devem ser referenciados por links do YouTube, sem upload direto de vídeo.

### 9.8 Comentários e moderação

- **RF-COM-001:** O sistema deve permitir habilitar ou desabilitar comentários por conteúdo compatível.
- **RF-COM-002:** Todos os usuários autenticados e aprovados da instância corrente podem comentar, respeitadas as regras de moderação.
- **RF-COM-003:** O sistema deve permitir moderação prévia ou posterior, conforme configuração.
- **RF-COM-004:** Administradores autorizados devem poder aprovar, ocultar e excluir comentários.
- **RF-COM-005:** O sistema deve permitir reportar conteúdo ou comentário inadequado.
- **RF-COM-006:** As ações de moderação devem ser auditadas.

### 9.9 Gerenciamento de páginas e navegação

- **RF-PAG-001:** O sistema deve oferecer CRUD de páginas por instância.
- **RF-PAG-002:** Cada página deve possuir título, slug, status, visibilidade, metadados básicos e configuração de indexação quando aplicável.
- **RF-PAG-003:** O Administrador autorizado deve poder criar páginas a partir de modelo, página vazia controlada ou duplicação de uma página existente.
- **RF-PAG-004:** O sistema deve permitir páginas institucionais, landing pages, páginas de listagem e páginas de detalhes.
- **RF-PAG-004a:** Ao criar uma página, o sistema deve solicitar o tipo da página: Institucional, Listagem, Detalhe, Landing Page ou Personalizada.
- **RF-PAG-004b:** Ao criar uma página, o sistema deve oferecer as opções “começar com modelo”, “começar em branco” ou “duplicar página existente”, conforme a permissão do usuário.
- **RF-PAG-004c:** O sistema deve informar, antes da criação, quais elementos o modelo escolhido incluirá, como cabeçalho, título, imagem de capa, metadados, corpo e seções iniciais.
- **RF-PAG-004d:** Páginas de detalhe devem permitir vinculação a um tipo de conteúdo e apresentar estrutura compatível com esse conteúdo.
- **RF-PAG-004e:** O usuário deve poder escolher se uma página terá cabeçalho próprio, herdará o cabeçalho institucional ou não exibirá cabeçalho.
- **RF-PAG-004f:** O cabeçalho de uma página deve poder conter título, subtítulo, imagem ou vídeo de capa, breadcrumbs, metadados e ação principal, conforme o tipo de página.
- **RF-PAG-005:** O sistema deve permitir definir uma página como filha de outra, formando uma hierarquia de páginas e subpáginas.
- **RF-PAG-006:** O sistema deve permitir associar uma página de detalhes a um tipo de conteúdo, como notícia, destaque, partida, evento ou galeria.
- **RF-PAG-007:** O sistema deve permitir criar, editar, ordenar, ocultar e excluir itens de menu.
- **RF-PAG-008:** O sistema deve permitir menus e submenus com profundidade limitada e validada para preservar a usabilidade.
- **RF-PAG-009:** Um item de menu deve poder apontar para página interna, conteúdo, âncora, URL externa ou ação suportada.
- **RF-PAG-010:** O usuário deve poder definir em qual menu uma página aparece, sem que toda página criada seja automaticamente exibida na navegação.
- **RF-PAG-011:** O sistema deve permitir configurar a ordem das páginas no menu por arraste e por controles acessíveis de teclado.
- **RF-PAG-012:** O sistema deve impedir slugs duplicados dentro da mesma instância e deve gerar sugestão amigável para novos slugs.
- **RF-PAG-013:** O sistema deve validar conflitos entre slug, página pai, item de menu, rota reservada e conteúdo dinâmico.
- **RF-PAG-014:** Uma página deve poder permanecer em rascunho, ser agendada, publicada, arquivada ou enviada para a lixeira.
- **RF-PAG-015:** Alterações na hierarquia e nos menus devem possuir prévia antes da publicação.
- **RF-PAG-016:** Ao solicitar exclusão de uma página, o sistema deve informar conteúdos, páginas filhas, itens de menu, links internos e referências dependentes.
- **RF-PAG-017:** O sistema deve impedir a exclusão direta de uma página com dependências não resolvidas.
- **RF-PAG-018:** O usuário deve poder escolher entre arquivar, remover dos menus, redirecionar ou excluir logicamente uma página, conforme as dependências.
- **RF-PAG-019:** O sistema deve permitir configurar redirecionamento de uma URL antiga para uma página ou destino válido.
- **RF-PAG-020:** A exclusão definitiva deve exigir permissão elevada, confirmação explícita e registro de auditoria.
- **RF-PAG-021:** O sistema deve manter a versão publicada enquanto a nova estrutura de páginas estiver em rascunho.
- **RF-PAG-022:** O sistema deve oferecer uma visão visual da árvore de páginas e da estrutura dos menus.
- **RF-PAG-023:** O sistema deve permitir ocultar uma página da navegação sem necessariamente impedir seu acesso por URL, respeitando sua visibilidade.
- **RF-PAG-024:** A arquitetura deve permitir que cada instância tenha conjunto, quantidade e hierarquia de páginas diferentes.

### 9.10 Enquetes e votação

- **RF-ENQ-001:** O sistema deve oferecer CRUD de enquetes por instância.
- **RF-ENQ-002:** Uma enquete deve possuir pergunta, descrição opcional, opções de resposta, status, período de validade e visibilidade.
- **RF-ENQ-003:** O Administrador deve poder criar, editar, publicar, encerrar, arquivar e excluir logicamente uma enquete.
- **RF-ENQ-004:** O sistema deve permitir associar uma enquete a uma página, notícia, destaque, partida, evento ou seção criada pelo editor.
- **RF-ENQ-005:** O criador por blocos deve oferecer um bloco de votação que permita selecionar uma enquete existente.
- **RF-ENQ-006:** O bloco de votação deve exibir a pergunta e as opções de resposta de forma responsiva e acessível.
- **RF-ENQ-007:** O sistema deve oferecer um bloco de resultados/estatísticas vinculado a uma enquete existente.
- **RF-ENQ-008:** O bloco de estatísticas deve exibir, no mínimo, total de votos, quantidade por opção e percentual por opção.
- **RF-ENQ-009:** O Administrador deve poder configurar se os resultados aparecem antes do voto, depois do voto, somente após o encerramento ou nunca para o público.
- **RF-ENQ-010:** O sistema deve permitir restringir a votação a usuários autenticados e aprovados da instância corrente.
- **RF-ENQ-011:** O sistema deve registrar o voto associado ao usuário, à enquete, à instância e à opção escolhida.
- **RF-ENQ-012:** O sistema deve impedir mais de um voto do mesmo usuário na mesma enquete, salvo configuração futura que permita alteração do voto.
- **RF-ENQ-013:** O sistema deve informar ao usuário que ele já votou quando tentar votar novamente.
- **RF-ENQ-014:** O sistema deve permitir configurar data de abertura e encerramento da votação.
- **RF-ENQ-015:** Enquetes encerradas devem continuar podendo exibir resultados, conforme a configuração de visibilidade.
- **RF-ENQ-016:** A alteração ou remoção de uma opção deve ser bloqueada depois que ela receber votos, salvo procedimento administrativo de correção auditado.
- **RF-ENQ-017:** O sistema deve preservar o histórico agregado de votos quando a enquete for encerrada ou arquivada.
- **RF-ENQ-018:** O sistema deve proteger a privacidade, exibindo resultados agregados e não a escolha individual de cada usuário.
- **RF-ENQ-019:** O sistema deve registrar auditoria das ações administrativas sobre enquetes e opções.
- **RF-ENQ-020:** O sistema deve permitir reutilizar uma enquete em mais de um bloco dentro da mesma instância, sem duplicar seus votos.
- **RF-ENQ-021:** O sistema deve impedir que uma enquete de uma instância seja vinculada a página, bloco ou conteúdo de outra instância.

### 9.11 Avisos e comunicados

- **RF-AVI-001:** O sistema deve oferecer CRUD de avisos por instância.
- **RF-AVI-002:** Um aviso deve possuir título, mensagem, data e hora do acontecimento, status, visibilidade e responsável pela publicação.
- **RF-AVI-003:** Um aviso pode possuir imagem, ícone, link, conteúdo relacionado ou chamada para uma página de detalhes.
- **RF-AVI-004:** O sistema deve permitir indicar se o acontecimento é futuro, atual ou passado.
- **RF-AVI-005:** O Administrador deve poder configurar uma contagem regressiva para acontecimentos futuros.
- **RF-AVI-006:** A contagem regressiva deve permitir ativar ou desativar a exibição de dias, horas, minutos e segundos.
- **RF-AVI-007:** A contagem regressiva deve respeitar data, hora e fuso horário configurados para a instância.
- **RF-AVI-008:** O sistema deve encerrar automaticamente a contagem regressiva no momento do acontecimento e apresentar estado configurável após o término.
- **RF-AVI-009:** O sistema deve oferecer um bloco nativo de avisos na página inicial.
- **RF-AVI-010:** O Administrador deve poder selecionar, ordenar e limitar os avisos exibidos no bloco nativo da home.
- **RF-AVI-011:** O criador por blocos deve permitir inserir um bloco de aviso em qualquer página autorizada, inclusive no Hero ou em uma seção personalizada.
- **RF-AVI-012:** Um mesmo aviso pode ser exibido em mais de uma posição sem duplicar seu registro ou seus dados.
- **RF-AVI-013:** O sistema deve permitir criar avisos em rascunho, agendados, publicados, expirados, arquivados ou na lixeira.
- **RF-AVI-014:** O sistema deve permitir configurar período de publicação e data de expiração do aviso.
- **RF-AVI-015:** O sistema deve permitir consultar o histórico de avisos da instância, inclusive avisos expirados e arquivados.
- **RF-AVI-016:** Avisos devem possuir visibilidade pública, restrita ou oculta.
- **RF-AVI-017:** O sistema deve permitir destacar um aviso como principal, respeitando a regra de apenas um aviso principal por posição e período.
- **RF-AVI-018:** O sistema deve impedir que um aviso de uma instância seja vinculado a página, Hero ou bloco de outra instância.
- **RF-AVI-019:** A exclusão de um bloco de aviso não deve excluir o aviso armazenado.
- **RF-AVI-020:** A exclusão de um aviso deve ser lógica, com possibilidade de restauração e auditoria.

### 9.12 Configuração da home

- **RF-HOM-001:** O Administrador autorizado deve poder selecionar a matéria principal do Hero.
- **RF-HOM-002:** O Administrador deve poder selecionar notícias, destaques e galerias em evidência.
- **RF-HOM-003:** A home deve atualizar automaticamente listagens dinâmicas de notícias, agenda e resultados.
- **RF-HOM-004:** O Administrador deve poder ativar, desativar e reordenar seções permitidas.
- **RF-HOM-005:** Alterações em rascunho não devem modificar a versão pública antes da publicação explícita.

### 9.13 Criador visual baseado em blocos

- **RF-EDT-001:** Usuários com permissão devem poder adicionar seções à página inicial sem editar código.
- **RF-EDT-002:** O fluxo deve começar pela escolha de um modelo visual pronto.
- **RF-EDT-003:** O sistema deve oferecer modelos como título e texto, imagem e texto, chamada com botão, vídeo, galeria, cards, patrocinadores, estatísticas, divisores e colunas.
- **RF-EDT-004:** O usuário deve poder inserir blocos de título, subtítulo, texto, imagem, vídeo, botão, link, ícone, divisor, galeria, cards e espaçamento.
- **RF-EDT-005:** O editor deve oferecer blocos dinâmicos de notícias, destaques, próximos jogos, resultados, galerias recentes, avisos, votação e estatísticas de enquetes.
- **RF-EDT-006:** O usuário deve poder editar textos diretamente na representação visual da seção.
- **RF-EDT-007:** O usuário deve poder substituir imagens sem recriar a seção.
- **RF-EDT-008:** O usuário deve poder selecionar opções semânticas de layout, incluindo imagem à esquerda, direita, acima, abaixo ou centralizada.
- **RF-EDT-009:** O sistema não deve permitir posicionamento livre por coordenadas ou pixels no MVP.
- **RF-EDT-010:** O editor deve usar cores, tipografia, espaçamentos e estilos provenientes do design system.
- **RF-EDT-011:** O usuário deve poder reordenar seções por arraste e por comandos acessíveis de teclado.
- **RF-EDT-012:** O usuário deve poder duplicar, ocultar, arquivar e excluir logicamente uma seção.
- **RF-EDT-013:** O editor deve salvar automaticamente o rascunho.
- **RF-EDT-014:** O editor deve oferecer desfazer e refazer.
- **RF-EDT-015:** O editor deve exibir prévia de desktop, tablet e celular.
- **RF-EDT-016:** O sistema deve permitir publicar uma nova versão sem apagar a versão anteriormente publicada.
- **RF-EDT-017:** O sistema deve manter histórico e permitir restauração de versões anteriores.
- **RF-EDT-018:** O sistema deve permitir agendar publicação e retirada de uma seção.
- **RF-EDT-019:** O sistema deve impedir HTML, CSS e JavaScript arbitrários.
- **RF-EDT-020:** O painel lateral deve exibir apenas as opções compatíveis com o elemento selecionado.
- **RF-EDT-021:** O editor deve separar configurações básicas, de estilo e avançadas por complexidade progressiva.
- **RF-EDT-022:** O sistema deve alertar sobre contraste insuficiente, imagem de baixa resolução, link inválido e conteúdo de exemplo não substituído.
- **RF-EDT-023:** Deve ser possível definir permissões distintas para editar e publicar a home.
- **RF-EDT-024:** O editor deve funcionar na home e nas páginas internas autorizadas.
- **RF-EDT-025:** O usuário deve conseguir iniciar a edição de uma página a partir da árvore de páginas ou da visualização do site.
- **RF-EDT-026:** O editor deve apresentar claramente em qual página e instância o usuário está trabalhando.
- **RF-EDT-027:** O usuário deve poder criar uma nova seção dentro de qualquer página que tenha permissão de edição.
- **RF-EDT-028:** Ao criar uma seção, o sistema deve solicitar um formato de layout pré-concebido.
- **RF-EDT-029:** O catálogo inicial de layouts deve incluir uma coluna, duas colunas iguais, três colunas iguais, duas colunas em proporção 2/3 + 1/3 e duas colunas em proporção 1/3 + 2/3.
- **RF-EDT-030:** O usuário deve poder escolher a orientação visual da seção, incluindo conteúdo alinhado à esquerda, centralizado ou à direita quando o layout permitir.
- **RF-EDT-031:** O usuário deve poder definir a posição relativa de imagem e texto dentro dos layouts compatíveis, incluindo imagem acima, abaixo, à esquerda ou à direita.
- **RF-EDT-032:** Cada coluna de uma seção deve aceitar apenas blocos compatíveis com o seu tipo e largura.
- **RF-EDT-033:** O sistema deve exibir a grade e as proporções da seção antes da confirmação da criação.
- **RF-EDT-034:** O usuário deve poder alterar o layout de uma seção existente quando a conversão não causar perda de conteúdo; caso haja risco de perda, o sistema deve solicitar duplicação ou confirmação explícita.
- **RF-EDT-035:** O usuário deve poder duplicar uma seção mantendo seu conteúdo e seus vínculos dinâmicos.
- **RF-EDT-036:** O editor deve permitir definir o comportamento responsivo de cada coluna por meio de opções semânticas, como empilhar, inverter ordem ou manter proporção adaptativa.
- **RF-EDT-037:** O sistema deve preservar a ordem dos blocos ao adaptar uma seção para telas menores.
- **RF-EDT-038:** O editor deve permitir inserir uma nova seção acima, abaixo ou entre seções existentes.
- **RF-EDT-039:** O editor deve mostrar se a seção está vazia, incompleta, em rascunho ou pronta para publicação.
- **RF-EDT-040:** O usuário deve poder remover uma seção sem remover os conteúdos reutilizáveis que estavam vinculados a ela.
- **RF-EDT-041:** O sistema deve oferecer modelos de seção com conteúdo demonstrativo claramente marcado para substituição.
- **RF-EDT-042:** O sistema deve permitir salvar uma composição de seção como modelo reutilizável dentro da instância, respeitando permissões.

### 9.14 Sistema de design e personalização visual

- **RF-DSN-001:** A plataforma deve possuir um design system global, mantido pelo Superusuário Técnico.
- **RF-DSN-002:** O design system deve definir tokens de espaçamento, tipografia, cores, bordas, sombras, largura de conteúdo, breakpoints, componentes e estados de interface.
- **RF-DSN-003:** O sistema deve usar escala semântica de espaçamento, sem exigir valores livres por pixel no editor.
- **RF-DSN-004:** O sistema deve definir papéis tipográficos como título de página, título de seção, subtítulo, corpo, legenda, botão, metadado e destaque.
- **RF-DSN-005:** O sistema deve permitir fonte de interface, fonte de conteúdo e fonte de destaque opcional, com catálogo aprovado.
- **RF-DSN-006:** O sistema deve validar disponibilidade de caracteres, licenciamento, legibilidade e desempenho das fontes selecionadas.
- **RF-DSN-007:** O sistema deve definir tokens semânticos de cor, incluindo primária, secundária, destaque, fundo, superfície, texto, texto secundário, sucesso, alerta, erro e foco.
- **RF-DSN-008:** O sistema deve validar contraste das combinações de cor e alertar ou impedir combinações ilegíveis.
- **RF-DSN-009:** Cada instância deve poder selecionar um tema visual e personalizar logo, cores, fontes aprovadas, estilo de componentes e pacote de ícones permitido.
- **RF-DSN-010:** A personalização visual do tenant deve ser aplicada globalmente, sem exigir ajustes manuais página por página.
- **RF-DSN-011:** O sistema deve oferecer temas padrão e permitir temas personalizados conforme o plano ou permissão da instância.
- **RF-DSN-012:** O sistema deve oferecer pacotes de ícones coerentes, e cada instância deve selecionar um pacote visual principal.
- **RF-DSN-013:** O sistema deve impedir mistura arbitrária de pacotes de ícones dentro do mesmo tema.
- **RF-DSN-014:** Administradores editoriais devem poder usar componentes e estilos disponíveis, mas não alterar tokens globais do design system.
- **RF-DSN-015:** O Administrador Principal deve poder selecionar e configurar o tema permitido para sua instância.
- **RF-DSN-016:** O Superusuário Técnico deve poder criar, editar, ativar, desativar e versionar temas, fontes, tokens e pacotes de ícones.
- **RF-DSN-017:** Alterações de tema devem possuir prévia antes da publicação e não devem alterar a versão publicada sem confirmação.
- **RF-DSN-018:** O sistema deve validar cada tema nos principais tamanhos de tela antes da publicação.
- **RF-DSN-019:** O sistema não deve permitir CSS, JavaScript, fontes ou componentes arbitrários inseridos pelo cliente no MVP.
- **RF-DSN-020:** O sistema deve permitir níveis de personalização compatíveis com os planos Simples, Médio e Ilimitado.
- **RF-DSN-021:** O sistema deve manter histórico e auditoria das alterações de tema e identidade visual.
- **RF-DSN-022:** Os painéis administrativos do Superusuário Técnico e dos Administradores de cada tenant devem utilizar um tema administrativo próprio, independente do tema público selecionado pelo tenant.
- **RF-DSN-023:** O tema administrativo deve utilizar fundo branco como superfície principal, preservando leitura, contraste e sensação de espaço visual.
- **RF-DSN-024:** Bordas, divisórias e linhas estruturais dos painéis devem ser finas, discretas e elegantes, usadas para organizar a informação sem criar excesso de molduras.
- **RF-DSN-025:** A cor predominante de textos e elementos estruturais deve ser um azul escuro, com variações semânticas para títulos, corpo, metadados e estados desabilitados.
- **RF-DSN-026:** O vermelho bordô deve ser a cor de contraste do tema administrativo, aplicado de forma controlada a ações primárias, estados de atenção, indicadores selecionados e elementos de destaque.
- **RF-DSN-027:** O uso do vermelho bordô não deve ser a única forma de comunicar estado, erro, alerta ou ação; sempre que necessário, deve ser acompanhado por texto, ícone ou outro indicador acessível.
- **RF-DSN-028:** Formulários, tabelas, cards, filtros, menus e modais administrativos devem compartilhar os mesmos tokens de fundo, azul escuro, borda, raio, espaçamento e estados de foco.
- **RF-DSN-029:** O painel do Superusuário deve priorizar densidade informacional organizada para gestão de tenants, cobrança e operação, enquanto o painel do tenant deve priorizar clareza editorial e facilidade de uso.
- **RF-DSN-030:** O sistema deve validar o tema administrativo em desktop, tablet e celular, mantendo hierarquia, legibilidade, áreas de toque e navegação equivalentes entre os dois tipos de painel.

### 9.15 Biblioteca visual

- **RF-BIB-001:** O sistema deve disponibilizar elementos gráficos predefinidos e coerentes com a identidade do Baixada FC.
- **RF-BIB-002:** A biblioteca poderá conter escudo, logotipo, padrões, texturas, formas, ícones, fundos e divisórias.
- **RF-BIB-003:** O Superusuário Técnico deve poder manter a biblioteca institucional.
- **RF-BIB-004:** Administradores devem poder usar os elementos aprovados sem modificar os arquivos-base protegidos.

### 9.16 Auditoria, versionamento e lixeira

- **RF-AUD-001:** O sistema deve registrar autor, data e tipo das ações administrativas relevantes.
- **RF-AUD-002:** Devem ser auditadas aprovações, rejeições, suspensões, promoções, publicações, alterações, exclusões e restaurações.
- **RF-AUD-003:** Conteúdos editoriais devem usar exclusão lógica antes da remoção definitiva.
- **RF-AUD-004:** Usuários autorizados devem poder restaurar conteúdo da lixeira.
- **RF-AUD-005:** Logs de auditoria não devem ser editáveis por Administradores comuns.
- **RF-AUD-006:** Versões publicadas da home devem ser recuperáveis.

## 10. Regras de negócio

- **RN-001:** Conteúdo restrito só pode ser acessado por usuário autenticado, aprovado e não suspenso.
- **RN-002:** A simples posse da URL não concede acesso a uma mídia restrita.
- **RN-003:** Toda publicação deve possuir um responsável administrativo identificável.
- **RN-004:** O autor exibido de uma matéria pode ser diferente do usuário que realizou o cadastro.
- **RN-005:** Uma publicação agendada só se torna pública quando alcançar a data programada e estiver válida.
- **RN-006:** A retirada de destaque não exclui a notícia ou destaque correspondente.
- **RN-007:** A versão em edição da home é independente da versão publicada.
- **RN-008:** Somente usuários com permissão de publicação podem tornar um rascunho público.
- **RN-009:** A visibilidade herdada da galeria vale para a foto, salvo sobrescrita explícita.
- **RN-010:** Uma sobrescrita nunca deve tornar pública, por acidente, uma mídia cuja publicação esteja bloqueada por regra legal ou administrativa.
- **RN-011:** Administradores comuns não podem conceder privilégios administrativos.
- **RN-012:** Senhas devem ser armazenadas exclusivamente por hash seguro e nunca podem ser recuperadas em texto legível.
- **RN-013:** Conteúdos relacionados a menores devem respeitar autorização de uso de imagem e solicitações de remoção.
- **RN-014:** Exclusões definitivas de mídia devem respeitar período de retenção e autorização adequada.
- **RN-015:** Vídeos incorporados devem respeitar lista de provedores permitidos.
- **RN-016:** Toda requisição autenticada deve operar dentro do contexto de uma única instância.
- **RN-017:** O Administrador Principal só pode administrar usuários e conteúdo da própria instância.
- **RN-018:** O Superusuário Técnico pode atuar entre instâncias somente pelas operações globais autorizadas e deve deixar registro de auditoria.
- **RN-019:** Suspender uma instância não deve excluir seus dados, mídias ou configurações.
- **RN-020:** O mesmo endereço de e-mail pode participar de mais de uma instância, desde que suas associações e permissões sejam mantidas separadamente.
- **RN-021:** Uma instância nova deve iniciar sem usuários comuns, exceto o Administrador Principal provisionado ou convidado.
- **RN-022:** Cada instância pode possuir quantidade, nomes, hierarquia e ordem de páginas diferentes das demais.
- **RN-023:** Uma página publicada não deve desaparecer da navegação pública apenas porque outra versão da árvore está em edição.
- **RN-024:** Excluir uma página não deve excluir automaticamente conteúdos reutilizados por outras páginas.
- **RN-025:** Antes da exclusão lógica, o sistema deve exigir resolução das dependências ou uma decisão explícita de arquivamento/redirecionamento.
- **RN-026:** Páginas filhas sem novo destino não devem ser apagadas silenciosamente quando a página pai for removida.
- **RN-027:** Uma página de detalhes vinculada a conteúdo deve respeitar a visibilidade e o estado editorial do conteúdo de origem.
- **RN-028:** Itens de menu apontando para páginas arquivadas, excluídas ou inacessíveis devem ser identificados e tratados antes da publicação.
- **RN-029:** A criação de uma nova instância é uma operação exclusiva do Superusuário Técnico.
- **RN-030:** Os planos Simples, Médio e Ilimitado são classificações operacionais no MVP; regras de cobrança e limites comerciais detalhados serão definidos posteriormente.
- **RN-031:** Um usuário associado a várias instâncias deve escolher um único contexto corrente por sessão.
- **RN-032:** Nenhuma consulta ou ação da sessão corrente pode atravessar o limite da instância selecionada.
- **RN-033:** A publicação de uma foto depende de autorização explícita de um Administrador da instância.
- **RN-034:** Reclamações de pais ou responsáveis devem ser visíveis a todos os Administradores ativos da instância.
- **RN-035:** A decisão de moderação pode manter, ocultar, suspender ou remover logicamente o conteúdo, sem exclusão física imediata.
- **RN-036:** Todos os usuários aprovados podem comentar, mas Administradores são os moderadores no MVP.
- **RN-037:** A identidade visual de cada instância pode ser alterada pelo cliente dentro das capacidades oferecidas pelo editor e pela configuração do tenant.
- **RN-038:** “Categoria/equipe” significa uma subdivisão esportiva ou editorial do cliente, como Sub-7, Sub-9, feminino, masculino ou equipe principal; seu uso poderá ser habilitado conforme a realidade de cada instância.
- **RN-SAS-001:** A administração comercial e operacional das instâncias é exclusiva do Superusuário Técnico no MVP.
- **RN-SAS-002:** Suspender a visualização pública de uma instância é uma operação reversível e não equivale à exclusão lógica ou física dos dados do tenant.
- **RN-SAS-003:** O status financeiro e o status operacional devem ser independentes; uma instância pode estar adimplente e suspensa por manutenção, ou ativa com cobrança em atraso durante um período de tolerância.
- **RN-SAS-004:** Nenhuma suspensão automática poderá remover conteúdo, usuários, mídias ou histórico financeiro.
- **RN-SAS-005:** Alterações em valores, periodicidade, plano, datas de cobrança e regras de suspensão devem ser auditáveis, com autor, data, valor anterior e novo valor quando aplicável.
- **RN-SAS-006:** O MVP terá controle administrativo de cobrança, mas não processará pagamentos automaticamente nem substituirá um sistema contábil.
- **RN-039:** No MVP, cada usuário aprovado pode votar uma vez em cada enquete da instância corrente.
- **RN-040:** Os resultados de uma enquete devem ser agregados e não devem revelar o voto individual.
- **RN-041:** Uma enquete fora do período de validade não aceita novos votos.
- **RN-042:** Alterações estruturais em opções que já receberam votos devem preservar a integridade histórica da enquete.
- **RN-043:** A remoção do bloco de votação ou do bloco de estatísticas não exclui a enquete nem seus votos.
- **RN-044:** Avisos são registros editoriais próprios e não substituem notícias, eventos ou partidas, embora possam referenciá-los.
- **RN-045:** Cada aviso pertence a exatamente uma instância e pode ser reutilizado em várias posições dessa instância.
- **RN-046:** A contagem regressiva só deve aparecer para avisos com acontecimento futuro e data/hora válidas.
- **RN-047:** Ao expirar ou alcançar o horário do acontecimento, o aviso deve seguir a configuração de estado pós-evento definida pelo Administrador.
- **RN-048:** O bloco nativo de avisos da home deve existir mesmo que ainda não haja aviso publicado, apresentando estado vazio coerente ou não ocupando espaço indevido.
- **RN-049:** A exclusão lógica de um aviso deve remover sua exibição pública, mas preservar histórico, auditoria e possibilidade de restauração.
- **RN-050:** Toda página nova deve nascer a partir de um tipo e de um modo de criação identificáveis.
- **RN-051:** O cabeçalho padrão de uma página deve ser definido pelo tipo ou modelo escolhido, mas poderá ser alterado pelo usuário autorizado.
- **RN-052:** Páginas de detalhe devem respeitar a estrutura e a visibilidade do conteúdo ao qual estão vinculadas.
- **RN-053:** Uma seção deve possuir um layout estrutural único, com número de colunas e proporções conhecidos pelo sistema.
- **RN-054:** O layout de uma seção não pode depender de coordenadas absolutas ou de ajustes exclusivos para um tamanho de tela.
- **RN-055:** Em telas pequenas, colunas devem empilhar ou adaptar-se conforme regra responsiva do layout, sem cortar ou ocultar conteúdo silenciosamente.
- **RN-056:** Alterar o layout de uma seção não deve destruir blocos incompatíveis sem confirmação explícita e possibilidade de recuperação.
- **RN-057:** Uma seção vazia ou com conteúdo de exemplo não substituído não deve ser publicada sem alerta ao usuário.
- **RN-058:** O design system global é propriedade da plataforma e não pode ser alterado por Administradores editoriais.
- **RN-059:** A personalização de um tenant deve ocorrer por tokens e temas aprovados, nunca por regras visuais arbitrárias por página.
- **RN-060:** Um tema deve possuir uma combinação coerente de tipografia, cores, espaçamento, componentes e iconografia.
- **RN-061:** A troca de tema não pode apagar conteúdo, estrutura de páginas ou dados editoriais.
- **RN-062:** Se uma personalização causar contraste insuficiente ou falha de legibilidade, o sistema deve bloquear a publicação ou exigir correção.
- **RN-063:** Um pacote de ícones selecionado para o tenant deve ser aplicado de forma consistente nos componentes do sistema.
- **RN-064:** Os limites de personalização podem variar por plano, mas nunca podem remover requisitos mínimos de acessibilidade, segurança ou responsividade.

## 11. Requisitos de experiência do usuário

- **RX-001:** O produto deve ser responsivo e priorizar a navegação em dispositivos móveis no site público.
- **RX-002:** O painel administrativo deve ser plenamente utilizável em computador e adequadamente utilizável em tablet.
- **RX-003:** Uma pessoa sem conhecimento de HTML ou CSS deve conseguir criar uma seção simples.
- **RX-004:** O editor deve sempre oferecer um ponto de partida funcional, evitando telas vazias sem orientação.
- **RX-005:** O usuário deve visualizar continuamente o estado `Salvando`, `Salvo`, `Rascunho` ou `Publicado`.
- **RX-006:** Ações destrutivas devem apresentar confirmação clara e, quando possível, opção de restauração.
- **RX-007:** Mensagens de erro devem explicar o problema e indicar como corrigi-lo.
- **RX-008:** O sistema deve utilizar complexidade progressiva, mantendo opções avançadas fora do fluxo básico.
- **RX-009:** Operações que dependam de arrastar devem possuir alternativa por teclado ou botões.
- **RX-010:** Um Administrador novo deve conseguir criar, revisar e publicar uma seção básica com mínima orientação.
- **RX-011:** Antes da implementação completa do editor, deverá ser validado um protótipo navegável com o Administrador Principal.
- **RX-012:** O gerenciamento de páginas deve apresentar uma árvore visual simples, com busca e indicação clara de página pai, filha e status.
- **RX-013:** A criação de uma página deve usar linguagem compreensível e oferecer modelos recomendados para os casos mais comuns.
- **RX-014:** A edição do menu deve mostrar uma prévia da navegação no desktop e no celular.
- **RX-015:** O fluxo de exclusão deve explicar consequências, dependências e alternativas seguras antes da confirmação.
- **RX-016:** O usuário deve conseguir remover uma página da navegação sem confundir essa ação com apagar a página.
- **RX-017:** O sistema deve sinalizar visualmente páginas sem acesso no menu, sem conteúdo publicado, com links quebrados ou com redirecionamentos pendentes.
- **RX-018:** Operações de mover, indentar, desindentar e reordenar páginas e menus devem possuir alternativa por teclado e botões explícitos.
- **RX-019:** O seletor de projeto/instância deve aparecer de forma clara quando a conta estiver associada a mais de um cliente.
- **RX-020:** O painel técnico deve apresentar um formulário simples para provisionar uma instância com nome, plano, domínio e dados de DNS.
- **RX-021:** O fluxo de reclamação deve ser simples para pais e responsáveis, sem exigir conhecimento técnico ou criação de uma conta administrativa.
- **RX-022:** A tela de moderação deve reunir reclamação, conteúdo, mídia, histórico e decisão em uma única visão compreensível.
- **RX-023:** O bloco de enquete deve ser compreensível sem treinamento, exibindo pergunta, opções, ação de votar e estado do voto.
- **RX-024:** O bloco de resultados deve usar números e visualizações simples, com legenda acessível e alternativa textual.
- **RX-025:** O usuário deve saber se ainda pode votar, se já votou ou se a enquete está encerrada.
- **RX-026:** O bloco de avisos deve destacar visualmente título, acontecimento, data e estado da contagem regressiva.
- **RX-027:** A contagem regressiva deve ser compreensível e acessível sem depender exclusivamente de animação ou cor.
- **RX-028:** O editor deve mostrar uma prévia do aviso na home, em uma seção comum e no Hero.
- **RX-029:** O painel deve separar claramente avisos ativos, futuros, expirados, arquivados e excluídos logicamente.
- **RX-030:** O fluxo de criação de página deve apresentar uma escolha visual entre modelo, página em branco e duplicação.
- **RX-031:** O sistema deve explicar em linguagem simples quando o cabeçalho será incluído automaticamente.
- **RX-032:** O seletor de layout da seção deve representar visualmente as colunas e suas proporções antes da escolha.
- **RX-033:** O editor deve exibir rótulos compreensíveis como “duas colunas iguais” e “2/3 + 1/3”, evitando exigir conhecimento de CSS ou grid.
- **RX-034:** O usuário deve conseguir identificar a área de cada coluna e inserir blocos sem confundir seção, coluna e página.
- **RX-035:** O editor deve oferecer prévia de desktop, tablet e celular antes da publicação da página.
- **RX-036:** Ao alterar um layout com conteúdo, o sistema deve mostrar uma prévia da conversão e alertar qualquer bloco que precise ser reposicionado.
- **RX-037:** A configuração visual deve apresentar controles agrupados por identidade, tipografia, cores, componentes e iconografia.
- **RX-038:** O usuário deve visualizar uma amostra do tema aplicado a cabeçalho, notícia, botão, formulário, card e menu antes de publicar.
- **RX-039:** O sistema deve informar de forma compreensível por que uma cor, fonte ou combinação foi rejeitada.
- **RX-040:** O editor deve oferecer apenas valores semânticos como “pequeno”, “médio” e “grande” quando a alteração livre puder comprometer a consistência.
- **RX-041:** A prévia mobile deve ser a primeira visualização da personalização visual, com desktop e tablet como modos adicionais.
- **RX-042:** Os painéis administrativos devem apresentar fundo branco, linhas finas e azul escuro como linguagem visual predominante, evitando aparência genérica ou excessivamente carregada.
- **RX-043:** O vermelho bordô deve criar pontos de atenção visual claros, sem transformar toda a interface em uma sucessão de alertas ou botões chamativos.
- **RX-044:** Tabelas e cartões do dashboard do Superusuário devem manter separação visual suficiente para leitura rápida de status, valores e ações, sem depender de sombras fortes.
- **RX-045:** A mesma linguagem visual deve ser reconhecível no painel global do SaaS e no painel administrativo do tenant, mesmo quando o conteúdo e as permissões forem diferentes.

## 12. Requisitos não funcionais

### 12.1 Tecnologia e arquitetura

- **RNF-TEC-001:** O backend e o frontend devem utilizar TypeScript.
- **RNF-TEC-002:** A execução do servidor deve utilizar Node.js.
- **RNF-TEC-003:** Os dados relacionais devem ser persistidos em PostgreSQL.
- **RNF-TEC-004:** A aplicação deve ser implantável na VPS por processo automatizado e documentado.
- **RNF-TEC-005:** Arquivos de mídia não devem ser armazenados diretamente como binários no PostgreSQL.
- **RNF-TEC-006:** O armazenamento de mídia deve utilizar serviço de objetos compatível com S3 ou solução equivalente protegida.
- **RNF-TEC-007:** A arquitetura deve separar conteúdo, apresentação, autorização e armazenamento de mídia.
- **RNF-TEC-008:** A aplicação deve usar arquitetura multi-tenant, com contexto de instância resolvido e validado no servidor.
- **RNF-TEC-009:** O modelo de dados deve possuir estratégia consistente de isolamento por instância, preferencialmente com chaves de tenant obrigatórias e controles adicionais no banco quando aplicável.
- **RNF-TEC-010:** O armazenamento de mídia deve separar chaves, caminhos ou namespaces por instância.
- **RNF-TEC-011:** A criação de uma instância não deve exigir uma nova implantação da aplicação.
- **RNF-TEC-012:** Atualizações de código devem ser planejadas para preservar todas as instâncias compatíveis.
- **RNF-TEC-013:** O roteamento deve suportar páginas hierárquicas, slugs amigáveis, páginas de detalhes e redirecionamentos por instância.
- **RNF-TEC-014:** A estrutura de navegação publicada deve poder ser cacheada e invalidada de forma segura após publicação.

### 12.2 Segurança e privacidade

- **RNF-SEG-001:** Todo tráfego em produção deve utilizar HTTPS.
- **RNF-SEG-002:** O controle de acesso deve ser validado no servidor, e não somente na interface.
- **RNF-SEG-003:** Senhas devem usar algoritmo de hash moderno, com parâmetros configuráveis.
- **RNF-SEG-004:** Sessões e tokens devem possuir expiração, revogação e proteção adequada.
- **RNF-SEG-005:** Formulários sensíveis devem ser protegidos contra abuso, automação e tentativas excessivas.
- **RNF-SEG-006:** Uploads devem ser verificados quanto a extensão, MIME real, tamanho e conteúdo permitido.
- **RNF-SEG-007:** O sistema deve adotar proteção contra XSS, CSRF, injeção, escalada de privilégios e enumeração de contas.
- **RNF-SEG-008:** Segredos devem ser mantidos fora do repositório e injetados por configuração segura.
- **RNF-SEG-009:** A solução deve observar LGPD, especialmente por envolver imagens e dados de menores.
- **RNF-SEG-010:** O projeto deve prever registro ou referência à autorização de uso de imagem e fluxo de solicitação de remoção.
- **RNF-SEG-011:** O sistema deve aplicar autorização por instância em todas as APIs, consultas, comandos administrativos e URLs de mídia.
- **RNF-SEG-012:** Testes automatizados devem verificar que um usuário de uma instância não consegue ler, inferir ou alterar recursos de outra instância.
- **RNF-SEG-013:** Dados globais da plataforma e dados privados de clientes devem ser claramente separados por classificação e permissão.

### 12.3 Desempenho

- **RNF-DES-001:** Imagens devem ser servidas em dimensões e formatos adequados ao dispositivo.
- **RNF-DES-002:** As páginas públicas devem usar carregamento tardio para mídias fora da área visível.
- **RNF-DES-003:** Listagens devem utilizar paginação ou carregamento incremental.
- **RNF-DES-004:** Conteúdo público deve ser compatível com cache, sem expor conteúdo restrito.
- **RNF-DES-005:** A publicação de conteúdo não deve exigir reinicialização ou nova compilação da aplicação.

### 12.4 Disponibilidade, backup e recuperação

- **RNF-OPE-001:** O PostgreSQL deve possuir rotina de backup automatizada.
- **RNF-OPE-002:** O armazenamento de mídia deve possuir estratégia de backup, replicação ou retenção compatível.
- **RNF-OPE-003:** O procedimento de restauração deve ser documentado e testado periodicamente.
- **RNF-OPE-004:** A aplicação deve fornecer logs técnicos e mecanismos básicos de monitoramento.
- **RNF-OPE-005:** Falhas no processamento de mídia não devem corromper a publicação original.

### 12.5 Acessibilidade e compatibilidade

- **RNF-ACE-001:** O site deve buscar conformidade com WCAG 2.2 nível AA nos fluxos principais.
- **RNF-ACE-002:** Elementos interativos devem ser acessíveis por teclado.
- **RNF-ACE-003:** Imagens editoriais devem aceitar texto alternativo.
- **RNF-ACE-004:** Textos e controles devem respeitar contraste adequado.
- **RNF-ACE-005:** O sistema deve suportar versões atuais dos principais navegadores.
- **RNF-ACE-006:** A árvore de páginas e o editor de menus devem expor hierarquia e estado sem depender apenas de cor ou arraste.

### 12.6 Qualidade e manutenção

- **RNF-QUA-001:** Regras críticas de permissão, publicação e visibilidade devem possuir testes automatizados.
- **RNF-QUA-002:** Fluxos essenciais devem possuir testes de integração ou ponta a ponta.
- **RNF-QUA-003:** O esquema do banco deve evoluir por migrações versionadas.
- **RNF-QUA-004:** As APIs devem validar entradas e retornar erros padronizados.
- **RNF-QUA-005:** O projeto deve manter documentação de implantação e operação.

## 13. Modelo conceitual inicial

Entidades sugeridas:

- `Usuario`
- `InstanciaCliente`
- `DominioInstancia`
- `ConfiguracaoInstancia`
- `Plano`
- `Perfil`
- `Permissao`
- `UsuarioPerfil`
- `PerfilPermissao`
- `SolicitacaoCadastro`
- `Sessao` ou `TokenAcesso`
- `TokenRedefinicaoSenha`
- `Noticia`
- `Destaque`
- `Evento`
- `Partida`
- `CategoriaEquipe`
- `Galeria`
- `Midia`
- `Comentario`
- `Denuncia`
- `Pagina`
- `VersaoPagina`
- `SecaoPagina`
- `BlocoPagina`
- `ElementoBiblioteca`
- `RegistroAuditoria`
- `ConsentimentoImagem`, sujeito a validação da regra operacional
- `AutorizacaoMidia`
- `ReclamacaoConteudo`
- `Menu`
- `ItemMenu`
- `RedirectUrl`
- `SessaoInstancia` ou contexto de instância da sessão
- `Enquete`
- `OpcaoEnquete`
- `VotoEnquete`
- `Aviso`
- `ModeloPagina`
- `ModeloSecao`
- `LayoutSecao`
- `CabecalhoPagina`
- `TemaVisual`
- `TokenDesign`
- `PacoteIcones`
- `CatalogoFonte`
- `ConfiguracaoTemaInstancia`

`InstanciaCliente` é o tenant da plataforma. Usuários de negócio, conteúdos, mídias, comentários, configurações e auditoria devem referenciar essa entidade direta ou indiretamente. Entidades globais, como catálogo de modelos do criador por blocos e biblioteca institucional aprovada, devem ser explicitamente marcadas como globais.

Relacionamentos relevantes:

- Conteúdos podem estar associados a uma ou mais categorias/equipes.
- Cada conteúdo de negócio pertence a uma `InstanciaCliente`.
- Um usuário pode ter associações distintas a uma ou mais instâncias, com papel e permissões próprios em cada uma.
- Uma instância possui um ou mais domínios de acesso e uma configuração visual própria.
- Uma instância possui um plano operacional e dados de configuração de domínio/DNS.
- Uma mídia pode possuir autorização de publicação e reclamações de moderação.
- Galerias possuem várias mídias.
- Notícias e destaques podem referenciar galerias e vídeos.
- Partidas podem estar ligadas a eventos e galerias.
- Páginas possuem versões; versões possuem seções; seções possuem blocos.
- Páginas podem formar uma árvore por meio de relação pai/filha.
- Menus possuem itens ordenáveis; itens podem apontar para páginas, conteúdos, âncoras ou URLs externas.
- Redirecionamentos pertencem à instância e devem ser únicos por origem.
- Enquetes possuem opções e votos; blocos de votação e estatísticas referenciam a enquete sem duplicá-la.
- Votos pertencem simultaneamente à instância, ao usuário, à enquete e à opção escolhida.
- Páginas possuem tipo, modo de criação, configuração de cabeçalho e composição de seções.
- Seções possuem layout, colunas ordenadas e blocos; o layout é semântico e responsivo.
- Modelos de página e seção podem ser globais ou personalizados por instância.
- Temas, tokens, fontes e pacotes de ícones podem ser globais da plataforma ou habilitados para instâncias específicas.
- Usuários recebem perfis e, quando necessário, permissões específicas.
- Registros de auditoria referenciam usuário, ação e recurso afetado.

## 14. Estados editoriais padronizados

Quando aplicável, conteúdos devem usar:

- `Rascunho`
- `Agendado`
- `Publicado`
- `Arquivado`
- `Na lixeira`

Visibilidades padronizadas:

- `Público`
- `Restrito a usuários aprovados`
- `Oculto`

Partidas e eventos possuem estados operacionais próprios, sem substituir o estado editorial.

## 15. Critérios gerais de aceitação do MVP

O MVP será considerado funcionalmente apto quando:

1. Visitantes conseguirem navegar por todo conteúdo público sem autenticação.
2. Usuários conseguirem solicitar cadastro e acompanhar o estado da solicitação.
3. Administradores autorizados conseguirem aprovar, rejeitar, suspender e reativar usuários.
4. Usuários aprovados conseguirem acessar conteúdo restrito, e usuários não autorizados não conseguirem acessá-lo nem por URL direta.
5. O Administrador Principal conseguir promover e destituir Administradores.
6. Notícias, destaques, agenda, partidas, resultados, galerias e fotos possuírem seus fluxos de CRUD.
7. O Administrador conseguir escolher a matéria principal e administrar as seções da home.
8. Um usuário autorizado conseguir criar uma seção a partir de um modelo, editar conteúdo, visualizar responsivamente, salvar rascunho e publicar.
9. A versão pública permanecer intacta enquanto houver alterações apenas em rascunho.
10. O sistema conseguir restaurar uma versão anterior da home.
11. Uploads de imagens serem validados, processados e servidos em versões responsivas.
12. Ações administrativas críticas aparecerem na auditoria.
13. A aplicação ser implantada e executada na VPS com PostgreSQL e armazenamento de mídia configurados.
14. Backup e restauração possuírem procedimento documentado.
15. O Superusuário Técnico conseguir criar uma segunda instância de teste sem nova cópia do código.
16. Usuários, conteúdos e mídias de duas instâncias de teste permanecerem isolados entre si.
17. Cada instância conseguir exibir sua própria identidade visual e conteúdo em seu domínio ou subdomínio.
18. Suspender uma instância bloquear seu acesso sem apagar seus dados.
19. Um Administrador conseguir criar uma página nova, colocá-la em um submenu, publicar e acessá-la pela URL correta.
20. Um Administrador conseguir criar uma página de detalhes vinculada a um conteúdo existente.
21. O sistema impedir slugs duplicados e informar conflitos de rota antes da publicação.
22. O sistema detectar dependências antes de permitir arquivamento ou exclusão de uma página.
23. A remoção de uma página do menu não apagar a página nem seu conteúdo.
24. Uma página excluída logicamente deixar uma opção de restauração e, quando necessário, um redirecionamento configurável.
25. A árvore de páginas, os menus e os submenus permanecerem isolados por instância.
26. Somente o Superusuário Técnico conseguir criar uma nova instância pelo painel.
27. Uma instância conseguir ser criada nos planos Simples, Médio ou Ilimitado.
28. Um usuário associado a dois projetos conseguir escolher o projeto na entrada e trocar de contexto sem visualizar dados cruzados.
29. O painel aceitar domínio próprio e apresentar os dados/instruções de DNS correspondentes.
30. Uma foto não autorizada por Administrador não ser publicada.
31. Uma reclamação enviada pela página institucional chegar a todos os Administradores da instância e gerar registro de decisão.
32. Usuários aprovados conseguirem comentar e Administradores conseguirem moderar os comentários.
33. O catálogo inicial permitir publicar páginas Institucional, Notícias e Contatos.
34. Um Administrador conseguir criar uma enquete com pergunta e opções de resposta.
35. Um Administrador conseguir inserir um bloco de votação em uma página e vinculá-lo à enquete.
36. Usuários aprovados conseguirem votar uma única vez na enquete da instância corrente.
37. O sistema impedir votos duplicados e informar quando o usuário já tiver votado.
38. Um bloco de estatísticas conseguir exibir total, quantidade e percentual por opção.
39. O Administrador conseguir configurar quando os resultados serão exibidos.
40. Uma enquete encerrada preservar seus resultados sem aceitar novos votos.
41. A exclusão lógica do bloco não apagar a enquete nem seus resultados.
42. Um Administrador conseguir criar um aviso com título, mensagem, data e hora.
43. O aviso aparecer no bloco nativo da home quando publicado e elegível.
44. O Administrador conseguir posicionar o mesmo aviso em uma seção comum ou no Hero.
45. Um aviso futuro conseguir exibir contagem regressiva configurável.
46. A contagem regressiva respeitar o fuso horário da instância e terminar no horário configurado.
47. Avisos expirados permanecerem consultáveis no histórico do tenant.
48. Remover o bloco de um aviso não apagar o registro do aviso.
49. A exclusão lógica de um aviso retirar sua exibição pública e permitir restauração.
50. Um Administrador conseguir criar uma página escolhendo tipo, modelo, página em branco ou duplicação.
51. O sistema informar quais elementos serão criados automaticamente pelo modelo de página.
52. Uma página institucional conseguir nascer com cabeçalho padrão e permitir sua edição.
53. Uma página de detalhe conseguir ser vinculada a uma notícia, partida, evento, galeria ou destaque.
54. Um Administrador conseguir inserir uma seção com uma, duas ou três colunas.
55. O editor oferecer layouts de colunas iguais e proporções 2/3 + 1/3 e 1/3 + 2/3.
56. O usuário conseguir alinhar o conteúdo e posicionar imagem/texto conforme o layout escolhido.
57. A seção se adaptar ao celular sem cortar conteúdo e respeitando a ordem configurada.
58. O sistema alertar antes de uma alteração de layout que possa causar perda ou incompatibilidade de blocos.
59. O usuário conseguir mover, duplicar e excluir logicamente uma seção sem apagar conteúdos reutilizáveis.
60. O Superusuário Técnico conseguir manter temas, tokens, fontes e pacotes de ícones da plataforma.
61. O Administrador Principal conseguir escolher e configurar um tema permitido para seu tenant.
62. A configuração visual aplicar a identidade do tenant de forma consistente em páginas, menus, cards, formulários e blocos.
63. O sistema validar contraste e bloquear ou alertar combinações ilegíveis.
64. O sistema oferecer papéis tipográficos e escalas de espaçamento sem exigir edição livre em pixels.
65. O tenant conseguir escolher um pacote de ícones e o sistema mantê-lo consistente nos componentes.
66. A prévia mobile aparecer antes das prévias desktop e tablet na configuração do tema.
67. A troca de tema preservar páginas, conteúdo, mídias, usuários e configurações editoriais.

## 16. Proposta inicial de arquitetura

Esta seção é indicativa e deverá ser confirmada na etapa de arquitetura técnica:

- Aplicação web full-stack em TypeScript.
- Arquitetura multi-tenant com uma única base de código e isolamento lógico entre clientes.
- Framework web compatível com renderização no servidor e páginas públicas indexáveis, como Next.js.
- Backend em Node.js com camada explícita de autorização.
- PostgreSQL com ORM e migrações versionadas, como Prisma ou Drizzle.
- Armazenamento de objetos compatível com S3 para fotos e demais mídias.
- Processador de imagens para gerar tamanhos e formatos derivados.
- Filas ou tarefas assíncronas para processamento pesado de mídia e publicações agendadas.
- Docker para empacotamento e implantação na VPS.
- Proxy reverso com TLS.
- Rotinas de backup, logs e monitoramento.
- Resolução de tenant por domínio, subdomínio ou identificador de rota, com validação no servidor.
- Estratégia de migração de banco compatível com todas as instâncias ativas.
- Métricas e logs com identificação de instância, sem misturar dados privados entre clientes.

## 17. Estratégia de entrega sugerida

### Fase 0 — Descoberta e validação

- Validar identidade visual e mapa do site.
- Prototipar a home e o criador por blocos.
- Testar o editor com o Administrador Principal.
- Fechar regras de privacidade, consentimento e comentários.

### Fase 1 — Fundação

- Projeto técnico, banco, autenticação e permissões.
- Modelo de instâncias, provisionamento e isolamento multi-tenant.
- Configuração de domínio, identidade visual e Administrador Principal por instância.
- Catálogo de planos Simples, Médio e Ilimitado.
- Cadastro com aprovação.
- Painel administrativo base.
- Auditoria e armazenamento de mídia.

### Fase 2 — Conteúdo esportivo e editorial

- Notícias e destaques.
- Agenda, partidas e resultados.
- Galerias, fotos e vídeos.
- Enquetes, votação e resultados agregados.
- Avisos, contagem regressiva e bloco nativo da home.
- CRUD de páginas, árvore de páginas, páginas de detalhes e menus/submenus.
- Home dinâmica.

### Fase 3 — Criador por blocos

- Biblioteca de modelos e componentes.
- Design system global, temas por tenant, tokens, tipografia, cores e iconografia.
- Editor, prévias e salvamento automático.
- Versionamento, publicação e restauração.
- Alertas de qualidade e acessibilidade.

### Fase 4 — Qualidade e implantação

- Testes, desempenho e segurança.
- Migração ou carga de conteúdo inicial.
- Backups e observabilidade.
- Implantação na VPS e treinamento operacional.

## 18. Pontos pendentes para validação

As decisões abaixo ainda precisam ser fechadas antes da especificação técnica definitiva:

1. Quais dados serão exigidos no cadastro público.
2. Como a autorização de uso de imagem de menores será registrada, validada e eventualmente revogada.
3. Volume inicial e crescimento esperado de fotos e mídias por instância.
4. Serviço de e-mail para confirmação, recuperação e notificações.
5. Política de retenção de usuários, mídias, reclamações e logs.
6. Identidade visual-base, paleta, tipografia e biblioteca gráfica global.
7. Se partidas e eventos terão páginas detalhadas já no primeiro lançamento.
8. Quais Administradores poderão publicar diretamente e quais dependerão de aprovação editorial.
9. Limites de quantidade de páginas, armazenamento, usuários e mídias para os planos Simples e Médio.
10. Cobrança recorrente e painel comercial dos planos, previstos para uma fase posterior.
11. Profundidade máxima de submenus e regras de acessibilidade da navegação.
12. Catálogo exato de modelos visuais para as páginas Institucional, Notícias e Contatos.
13. Se haverá categorias/equipes no primeiro cliente. Neste documento, categoria significa uma subdivisão esportiva ou editorial, como Sub-7, Sub-9, feminino, masculino ou equipe principal.
14. Se a votação aceitar somente uma opção ou múltiplas opções por enquete.
15. Se o usuário poderá alterar o próprio voto antes do encerramento.
16. Se haverá enquetes anônimas no futuro; o MVP considera usuários autenticados e aprovados.
17. Quais gráficos serão usados no bloco de estatísticas, além da tabela textual acessível.
18. Qual será o comportamento pós-evento padrão dos avisos: ocultar, exibir “aconteceu” ou manter a mensagem.
19. Se a contagem regressiva exibirá segundos no celular ou somente dias/horas.
20. Se avisos poderão ser enviados por e-mail ou notificação, além da exibição no site.
21. Quais modelos de página terão cabeçalho obrigatório, opcional ou oculto.
22. Quais layouts adicionais de seção entrarão no primeiro catálogo.
23. Se o usuário poderá criar layouts personalizados no futuro ou somente usar layouts pré-concebidos.
24. Quais temas, fontes e pacotes de ícones estarão disponíveis no catálogo inicial.
25. Quais diferenças práticas de personalização existirão entre os planos Simples, Médio e Ilimitado.
26. Se clientes poderão solicitar temas avançados desenvolvidos pelo fornecedor como serviço.
27. Quais meios externos serão usados para receber pagamentos e se haverá integração com gateway ou apenas lançamento manual no MVP.
28. Qual será o prazo de tolerância após o vencimento antes de uma suspensão automática e quais notificações deverão ser emitidas.
29. Se a suspensão comercial deverá bloquear somente o site público ou também o acesso ao painel do tenant.
30. Quais indicadores financeiros serão considerados oficiais para a operação do SaaS e qual período padrão do dashboard.

## 19. Glossário

- **Conteúdo público:** acessível sem autenticação.
- **Conteúdo restrito:** acessível apenas a usuários autenticados, aprovados e autorizados.
- **CRUD:** criação, consulta, atualização e exclusão de um recurso.
- **Hero:** área principal de destaque no topo da página inicial.
- **Bloco:** unidade de conteúdo ou funcionalidade utilizada dentro de uma seção.
- **Seção:** agrupamento visual de blocos dentro de uma página.
- **Modelo de seção:** composição predefinida que serve como ponto de partida no editor.
- **Exclusão lógica:** remoção reversível em que o registro permanece armazenado até descarte definitivo.
- **Superusuário Técnico:** responsável técnico máximo, distinto do proprietário funcional do produto.
- **Administrador Principal:** proprietário funcional e autoridade administrativa do portal.
- **SaaS:** modelo em que uma mesma aplicação atende vários clientes, normalmente com cobrança ou contratação por instância.
- **Multi-tenant:** arquitetura em que várias instâncias de clientes compartilham a aplicação, mantendo dados e configurações isolados.
- **Tenant/instância:** espaço lógico independente de um cliente dentro da plataforma.
- **Plataforma:** camada global operada pelo fornecedor do SaaS.

## 20. Controle de alterações

| Versão | Data | Descrição |
| --- | --- | --- |
| 0.1 | 22/09/2026 | Primeira consolidação da visão, escopo e especificação de requisitos a partir da conversa de descoberta. |
| 0.2 | 23/09/2026 | Inclusão do modelo SaaS multi-tenant, provisionamento de instâncias, isolamento de dados e requisitos de evolução comercial. |
| 0.3 | 23/09/2026 | Inclusão de páginas customizáveis por tenant, páginas de detalhes, menus, submenus, rotas, redirecionamentos e exclusão segura. |
| 0.4 | 23/09/2026 | Registro das decisões sobre domínios, planos, associação de usuários a múltiplas instâncias, catálogo inicial, autorização de mídias, reclamações, comentários e YouTube. |
| 0.5 | 23/09/2026 | Inclusão de enquetes, votos, blocos de votação, estatísticas agregadas e regras de integridade dos resultados. |
| 0.6 | 23/09/2026 | Inclusão de avisos, histórico por tenant, contagem regressiva e bloco nativo reposicionável na home e no Hero. |
| 0.7 | 23/09/2026 | Detalhamento da criação de páginas, cabeçalhos, páginas de detalhe, seções, colunas, proporções, alinhamento e responsividade. |
| 0.8 | 23/09/2026 | Inclusão do design system global, temas por tenant, tokens de design, tipografia, cores, espaçamento, iconografia e níveis controlados de personalização. |
| 0.9 | 23/09/2026 | Inclusão do dashboard global do Superusuário Técnico para gestão de clientes, operação das instâncias, planos, cobrança manual, indicadores, suspensão e encerramento. |
| 1.0 | 24/09/2026 | Definição da linguagem visual dos painéis administrativos: fundo branco, linhas finas, azul escuro e vermelho bordô como cor de contraste. |
