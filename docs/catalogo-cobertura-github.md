# Catálogo GitHub: descoberta, autorização e cobertura

Este ajuste complementa #44 sobre a árvore cumulativa de #46. Não amplia escopos, muda instalações, consente em nome de alguém ou implanta o código. Consulta de documentação oficial: 26/10/2026.

## Capacidades separadas

| Capacidade | Autoridade e comportamento |
| --- | --- |
| Identidade/sessão | Login GitHub valida a identidade e a sessão do Workbench. Não é consentimento para ler repositórios. O login existente pede scope vazio e não conserva o token do provedor. O indicador verde representa somente uma sessão validada. |
| Descoberta de metadados | GitHub App **user access token**, vinculado à identidade estável do usuário, lista instalações e seus repositórios pela interseção usuário × App. Não usa o inventário de projetos cadastrados. |
| Leitura de código/análise | Exige instalação ativa, permissão Contents read/write, acesso de leitura do usuário ao ID estável do repositório e revalidação no servidor. A listagem não concede essa capacidade. |
| QA | A política de fixtures e a ativação da janela/canário continuam adicionais à permissão GitHub. Catálogo amplo autorizado não permite analisar fora das fixtures. |

`listRepositories` deixa de exigir Contents apenas para a descoberta. A API GitHub ainda precisa autorizar e retornar cada nome: não há busca alternativa sem autenticação nem inferência de nomes privados ausentes. Repositórios retornados sem permissão de conteúdo permanecem visíveis com `analysis_access.can_analyze=false` e caminho explícito para o titular revisar o acesso. Suspensão, identidade diferente, 401/403 e falhas de paginação não viram lista vazia de sucesso.

## O que significa “todos”

O backend devolve `coverage.scope=installation_user_intersection`, `repository_selection`, `contents_permission` e `global_complete=false`. `total_count` corresponde à instalação consultada e à interseção do token; não é o total da conta GitHub. Concluir as páginas de uma instalação não demonstra cobertura global de organizações, colaborações ou instalações ausentes.

A menor mudança preserva a GitHub App existente, sem PAT e sem OAuth scope `repo`. Trocar a URL para `/user/repos` não amplia um GitHub App user token. Para descobrir repositórios omitidos pela seleção atual, o titular precisa conceder acesso a esses repositórios na instalação correspondente. Se não puder consentir, o catálogo continua parcial e explica o motivo.

Uma seleção **All repositories**, feita pelo titular na tela protegida do GitHub, alcança repositórios atuais e futuros daquela conta/organização que a App possa acessar. Na App atual, a permissão de Contents já solicitada também se estenderia a essa seleção: não é uma ampliação só de metadados. Esta entrega não altera a seleção nem recomenda fazê-lo silenciosamente no QA. Organizações/colaborações podem exigir administrador, aprovação da App e SAML SSO; instalar na conta pessoal não cobre automaticamente essas organizações. Negar ou cancelar o consentimento mantém os controles existentes e não inventa os itens ausentes.

## Paginação e limites

- Páginas de até 100 itens; IDs e URLs de continuação conferidos no servidor. Instalações e repositórios são paginados separadamente.
- Até `maxPages` páginas por coleção (10 por padrão, teto de configuração 20); `page_limit` e `limit_reached` tornam a interrupção explícita. Ao atingir o teto, a cobertura continua incompleta; não se declara ausência de outros itens.
- Deduplicação por ID estável, sem descartar forks, arquivados ou repositórios internos. A interface mostra o universo das páginas carregadas e não atribui ao filtro local uma busca global.
- Retentativa de página é explícita. Rate limit oferece horário mínimo indicado pelo servidor, sem retry automático. O prazo compartilhado de 45 s, limite de resposta e transporte sem cache continuam preservados.
- Listar e escolher não consultam commit, não escrevem projeto, não reservam quota e não criam job. A ação separada de preparar análise revalida acesso e fixa o SHA; a solicitação confirmada e o consumidor repetem as verificações pertinentes.
- Negação em uma observação atual invalida capacidades de leitura anteriores no cliente server-side. Nenhum cache é compartilhado entre usuários. O escopo de interface já existente invalida seleção, respostas atrasadas e efeitos de exportação em logout, troca de conta ou revogação conhecida.

## Evidência local e limites da evidência

Os testes de transporte sintético cobrem descoberta sem Contents, análise negada, cobertura selected/all parcial, mais de 100 itens, múltiplas instalações, limite de páginas, deduplicação, forks/arquivados/internos, 401/403, rate limit, invalidação de autorização anterior e identidade A/B. Os testes do serviço SQLite cobrem ausência de análise/job na descoberta e projeção da visibilidade internal após autorização atual, mantendo o registro D1 legado conservador como não público.

Isso não equivale a consentimento ou catálogo real no QA. A descoberta de um repositório autorizado nunca analisado exige ser observada no candidato efetivamente implantado, com token/consentimento reais e sem ampliar a política de análise das fixtures.

Referências oficiais: [user access token e interseção](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [endpoints de instalações](https://docs.github.com/en/rest/apps/installations), [instalação e autorização](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party), [instalar a própria App](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app).
