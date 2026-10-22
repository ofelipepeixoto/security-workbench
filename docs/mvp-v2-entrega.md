# MVP v2 — implementação revisável e matriz de aceite

Registro de 21/10/2026 em Brasília (verificações após 00:00 UTC de 22/10).
Documento autoritativo desta entrega; os relatórios anteriores permanecem como
histórico. O prompt v2 completo foi lido. Nenhum comando REA foi repetido no PC.

## Reconciliação e decisões

GitHub consultado pelo conector: PRs #29–#36 continuam em rascunho e abertas;
#36 está em `e1570843520614feed239e9a87996fbfbd751ee8`. A base local anterior,
`63d694f705191bec6c7692fc68c554907d10a212`, tinha árvore idêntica à desse head:
`git diff e157084 HEAD` não apontou diferenças antes dos incrementos. A sequência
nova foi ligada ao head remoto, preservando a cadeia existente, sem merge.

Sites consultado em leitura: versão atual **15**, origem
`bc23b52fa5f48dbc98982938bf95da8baaa8b349`, arquivo fonte registrado com 90 arquivos
e SHA-256 `bd4b5e9797f848a94d53dfdac033cde1a68a124541630eab160a578d39120062`.
Não foi baixado/comparado novamente esse arquivo nem refeito QA autenticado.
REA local/importação, logout e login são evidências anteriores do operador/chat,
não novas execuções desta rodada. Não houve nova consulta Dependabot ou de quota;
38 alertas e `github_rate_limited` são o último estado registrado, não contagens
atuais verificadas nesta execução.

**Persistência:** manter D1 como fonte única, com FKs compostas e autorização de
servidor. Supabase não é necessário agora; storage privado pode ser reavaliado
se uma necessidade medida justificar. Nenhum projeto Supabase foi alterado.
**Execução:** outbox D1 e consumidor Queue separado, com agendamento de recuperação
preparado. Banco com jobs não prova transporte operacional. Flags App,
multiusuário e jobs continuam desligadas por padrão. A produção fica owner-only.
**OpenAI:** sem integração real/SDK/chaves; orçamento proposto de chamadas reais
R$ 0 nesta fase. A explicação por IA é opcional e posterior a orçamento, política
de dados, contrato estruturado e avaliação. Não é dependência do MVP.

## Camadas de código e roteiro de revisão

| Ordem | Branch local / commit | Objetivo | Leitura e teste principal |
| --- | --- | --- | --- |
| 1 | `feat/mvp-v2-workspace-foundation` / `4f3f24f` | Relações por owner, preservação do legado, schema de conexões/jobs/catálogo | ADR; `web/drizzle/0002`–`0005`; `workspace-migration.test.mjs`; `scripts/audit-d1-migrations.mjs` |
| 2 | `feat/mvp-v2-github-app` / `751ec3b` | Login preservado, piloto por allowlist e autorização separada da App | `github-auth.mjs`, `github-app-auth.mjs`, `github-app-client.mjs`, testes correspondentes e guia da App |
| 3 | `feat/mvp-v2-analysis-jobs` / `df4ca24` | Autorização por objeto, scanner App, fila durável, cancelamento e recuperação | `workbench-service.mjs`, `analysis-jobs.mjs`, consumidor e testes de serviço/jobs |
| 4 | `feat/mvp-v2-catalog-ui` | Catálogo e acompanhamento sem prometer acesso ou execução inexistente; relatório final | Componentes `github-catalog*`, `/repositories`, tipos, testes SSR e este registro |

As camadas dependem da anterior e devem virar PRs empilhadas sobre #36. Migrações,
snapshots e schema formam uma camada única de dados; cerca de três mil linhas
nessa camada são principalmente snapshots gerados do Drizzle, não lógica nova.
Não aplicar as quatro migrações em produção por estarem presentes no repositório.
Os PRs ainda não foram abertos: o envio das branches foi bloqueado pela revisão
automática de aprovação. Não se contornou esse bloqueio por API ou outro remoto.

## Matriz única atual

CI e publicação das camadas novas estão pendentes. “Independente” abaixo designa
revisão de código/testes por outro agente, nunca teste real com segunda conta.

| Requisito | Evidência/commit | Implementado em branch | Merge | CI | Publicado | Validado por operador | Validado independentemente | Pendência | Próximo critério de aceite |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Produção e histórico preservados | Sites v15; #36 `e157084` | Base existente | Não nesta rodada | Histórico, não reexecutado | v15 confirmada em metadados | REA/login anteriores | Não nesta rodada | Jornada hospedada anterior parcial | Abrir exportação e concluir revisão/comparação reais |
| Owner administrativo + ID GitHub estável | `751ec3b`; testes auth/access | App | Não | Pendente | Não | Não | Revisão sintética | Flags e allowlist QA | Duas sessões autorizadas; ID/browser adulterados recusados |
| Conectar App; catálogo paginado | `751ec3b`; testes App client/auth | App | Não | Pendente | Não | Não | Revisão sintética | App, instalação e segredos aprovados | Conferir todas as páginas, organização e privado autorizados |
| Selecionar SHA e confirmar limites | `df4ca24`; teste de enqueue revogado/renomeado/SHA diferente | Jobs + UI | Não | Pendente | Não | Não | Revisão sintética | Integração real | Seleção não executa; commit revalidado no enqueue e consumidor |
| Isolamento projetos/resultados/revisão/compare/export/jobs/exclusão | `df4ca24`; testes `mvp-service` A/B | Jobs | Não | Pendente | Não | Não | 55 testes focados e leitura | Duas contas reais | Todos os IDs cruzados recusados sem nomes/conteúdo privado |
| Relações compostas e migração compatível | `4f3f24f`; auditoria Miniflare D1 local | Banco | Não | Pendente | Não | Não | Não na hospedagem | Backup/restore QA e revisão SQL | Preservar legado; inconsistente aborta com rollback completo |
| Jobs duráveis/idempotência/lease/retry/cancelamento | `df4ca24`; testes jobs/consumer | Jobs | Não | Pendente | Não | Não | Revisão sintética | Queue + scheduler + binding QA | Falha de envio recuperada; duplicatas sem efeito duplicado; limite global respeitado |
| Exclusão não remove reserva de consumidor ativo | `df4ca24`; dois casos running/cancelled | Jobs | Não | Pendente | Não | Não | Consumidor pausado recusou delete com 409 | Validar no transporte QA | Excluir só após lease expirar, inclusive após cancelamento |
| Revisão persistida/comparação/Markdown | teste serviço A/B, reabertura e Markdown em memória | Jobs + UI | Não | Pendente | Não | Homologação anterior parcial | Testes sintéticos | Download browser real | Arquivo salvo, aberto e conferido; nova análise não prova correção |
| Cobertura e limites explícitos | Scanner `workbench-static/1.1`; manifesto | Jobs + UI | Não | Pendente | Não | Não | Testes sintéticos | QA de resultado real | Evidência rastreável; inventário não vira zero CVEs; omissões visíveis |
| REA | Fixture anterior: 342 bytes/7 s; importação anterior | Base | Não nesta rodada | Não reexecutado | Importador existente v15 | Sim, anteriormente | Não nesta rodada | Typecheck, loopback repetido e entradas externas | Aprovar controles externos antes de ampliar; nenhuma reinstalação |
| UX/acessibilidade | Testes SSR de estados, filtros, URLs e identidade | UI | Não | Pendente | Não | Não | Não visualmente | QA navegador/teclado/mobile | Sem conteúdo privado na demo; foco, reflow e estados exercitados |
| Piloto e lançamento | Flags desligadas | Todas | Não | Pendente | Não | Não | Não | Aprovações e dependências operacionais | Piloto homologado e lançamento são aceites separados |

## Como funciona o catálogo e a autorização

O login identifica a conta por ID numérico; só o administrador ou a allowlist
do piloto recebe principal de servidor. A App exige consentimento próprio.
Um user access token da App fornece a interseção do acesso do usuário com o da
instalação via `/user/installations` e
`/user/installations/{installation_id}/repositories`. O catálogo pagina, distingue
instalação suspensa, desconexão, expiração, erro, vazio e incompletude. Filtros
cobrem somente páginas carregadas; não anunciam busca global completa.

O servidor verifica instalação, repository ID e SHA; IDs do navegador não são
autorização. A App usa envelope AES-GCM com chave externa ao banco, vinculado ao
principal/configuração/expiração; token em texto puro e refresh token não são
persistidos. Expiração pede reconexão. Desconectar apaga o envelope local e informa
se a revogação no provedor foi confirmada. Segredos não foram configurados.
Não há webhook operacional presumido; a API revalida acesso por operação.
Histórico privado fica bloqueado quando o acesso não pode ser confirmado;
exclusão aprovada do próprio projeto continua disponível após desconexão, salvo
reserva ativa do consumidor. Prazo de retenção e purga de backups exigem política.

## Motores e papel dos plugins

| Motor | Execução real/preparada | Limites |
| --- | --- | --- |
| Scanner autoral | JS Workers; aquisição pública legada e caminho App preparado; consumidor Queue separado ainda sem deploy | 20 arquivos, 2 MiB totais, 256 KiB/arquivo, 45 s; duas regras textuais de candidatos; não executa alvo |
| Dependências | Inventário de manifestos raiz no mesmo passe | Não resolve transitivas nem consulta base CVE; não é SCA |
| REA importado | Parser backend já existente; projeção limitada | Não executa motor nem autentica declarações do produtor |
| REA nativo | PC WSL do proprietário, somente fixture própria homologada anteriormente | Typecheck completo e alvos externos pendentes; PC não é worker público |
| REA hospedado | Ausente | Worker isolado separado precisa de aprovação e testes próprios; não roda nativamente em Workers/D1/Supabase |
| IA operacional | Ausente/desligada | Nenhum plugin ChatGPT é invocado pelo Site como API |

Os plugins orientaram engenharia, segurança, UX e operação. Seus controles viraram
validações, contratos, testes e documentação; não foram apresentados como scanner
instalado, backend de segurança ou agente autônomo conectado. n8n não é necessário
para este transporte e não foi alterado.

GitGuard: somente o estudo público anterior (HTML e dois scripts, manifestos de
origem/digest no registro histórico) foi reutilizado. Não houve nova análise REA,
login, envio de repositórios, exploração ou acesso ao backend. A matriz autoral
está em `mvp-v2-cobertura.md` e distingue anúncio, observação e não verificável.

## Verificações observadas e limites

| Verificação executada | Resultado | Ambiente / limite |
| --- | --- | --- |
| `node --test tests/*.test.mjs` em web | **195/195 passaram** | Identidades/provedor/transporte simulados; SQLite em memória com relações reais |
| `python3 -m unittest discover -s tests -v` | **27/27 passaram** | Núcleo local; não WSL do operador |
| `npm run lint` | Passou | Nenhuma regra enfraquecida |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Passou | Web; não typecheck do REA |
| `npm run build` | Passou; repetido após as duas correções pontuais de serviço | Fonte final do código validada; build não equivale a deploy |
| `node scripts/audit-d1-migrations.mjs` | `passed:true` | D1 Miniflare efêmero, rede externa bloqueada, sem produção: legado, defaults, FKs cruzadas e rollback de dados/schema |
| Revisão independente | 55 testes focados passaram; falha da reserva de exclusão corrigida | Recorte código auth/App/jobs/serviço; não certificação ou homologação de duas contas |
| `git diff --check` | Passou | Sem merge, publicação ou migração de produção |

Também foram corrigidas nesta retomada duas condições demonstráveis: enqueue
precisava verificar o commit exato novamente; exclusão precisava conservar leases
vigentes. Os testes negativos confirmam ausência de escrita/dispatch no primeiro
caso e 409 sem apagar dados no segundo. O consumidor continua revalidando acesso.

## Pendências, responsáveis e aceite indispensável

| Prioridade / pendência | Responsável proposto | Dependência | Critério de aceite |
| --- | --- | --- | --- |
| P0 — enviar branches e abrir PRs empilhadas | Proprietário + engenharia | Aprovação explícita após bloqueio automático do push | Heads exatos no GitHub, CI do commit e revisão humana; sem merge automático |
| P0 — cadastro/conexão App em QA | Proprietário GitHub + engenharia | Autorização para cadastro/instalação e segredos protegidos | Metadata/Contents somente leitura; privado/org/SSO e paginação reais verificados |
| P0 — consumidor/fila/recuperação QA | Engenharia de infraestrutura | Ambiente isolado, bindings e orçamento aprovados | Outbox recupera falha de envio; lease, cancelamento, limites e reentrega exercitados |
| P0 — migração/backup/restauração | Engenharia + proprietário | QA isolado e cópia aprovada | Backup realmente restaurado; legacy/identidades preservados e reversão ensaiada |
| P0 — jornada real A/B | Dois operadores autorizados | QA/App/consumidor disponíveis | Dois scans comparáveis, candidato revisado após recarga, IDs cruzados recusados e Markdown salvo/aberto |
| P0 — retenção privada/revogação | Proprietário + engenharia | Política aprovada | Conteúdo bloqueado após revogação; prazo, exclusão e backups documentados e testados |
| P1 — QA visual/acessibilidade | UX + operador | Preview controlado autorizado | Teclado/foco, zoom/mobile, estados quota/expiração e recuperação sem duplicação |
| P1 — revisão de alertas existentes | Segurança + mantenedor | Leitura atual Dependabot e branches candidatas | Triagem atual por alcance; não suprimir por ser dev ou não haver patch |
| Fora — REA externo/hospedado | Segurança + infraestrutura | Typecheck/isolações/autorização próprios | Nenhum alvo externo antes de aprovação dos controles |
| Fora — IA paga/SCA amplo/billing/marketplace | Produto + engenharia | Caso demonstrado, dados/orçamento/licenças | Não bloquear MVP determinístico nem prometer cobertura ausente |

Reversão do código: manter flags desligadas e retornar à base #36 antes de ativar
o piloto. Não apagar tabelas/dados como rollback; migração de produção e política
de retorno dependem de backup/restauração QA aprovados. Não restaurar sessão/token
revogado por recuperação indiscriminada do banco.

**Marcos:** (1) código revisável e testado localmente preparado; envio remoto
bloqueado; (2) piloto controlado ainda não homologado; (3) lançamento multiusuário
não autorizado/realizado. Nenhum desses pendentes foi transformado em sucesso.

Próxima ação indispensável: aprovar especificamente o envio das quatro branches
novas ao repositório público `ofelipepeixoto/security-workbench`, sem merge/deploy.
Depois, obter CI e revisar a sequência antes do cadastro/ativação do piloto.
