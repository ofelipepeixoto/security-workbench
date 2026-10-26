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

## Adendo — publicação e revisão do custo da listagem

Os registros de envio bloqueado/CI pendente acima são históricos. Após autorização
específica, as quatro branches foram enviadas e os PRs abertos em rascunho. Heads
remotos reconferidos nesta rodada, sem merge:

| PR / base | Head remoto exato | CI concluída com sucesso nos quatro jobs |
| --- | --- | --- |
| [#37](https://github.com/ofelipepeixoto/security-workbench/pull/37) / #36 | `d2ccf298b43c83804103e345eda7006f6e058424` | [39711082809](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39711082809) |
| [#38](https://github.com/ofelipepeixoto/security-workbench/pull/38) / #37 | `ac97928090009733e1c7e808619632cfb38ff261` | [39711107921](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39711107921) |
| [#39](https://github.com/ofelipepeixoto/security-workbench/pull/39) / #38 | `672e7fb1644e814d3d0108e53c394ee851046c8c` | [39711140091](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39711140091) |
| [#40](https://github.com/ofelipepeixoto/security-workbench/pull/40) / #39 | `e2d72f55ecfdc6067051c740e1d245b6bc2de1f6` | [39711190392](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39711190392) |

Jobs: `web-build`, `test`, `github-live`, `web-scanner`. Os hashes locais nas seções
anteriores identificam as origens testadas; o conector criou metadados/commits
novos, com árvores Git idênticas. Nenhum bundle ou log bruto foi enviado.
CI verde não homologa duas contas reais, App, Queue ou download aberto.

### Risco confirmado na base de #40

`list()` verificava até 100 projetos sequencialmente com `authorizeRepository()`:
repetia instalações, páginas de repositórios e resolução do commit padrão sob
prazo compartilhado de 45 s. Acesso ao histórico não precisa de commit atual;
branch ausente ou repositório vazio também não deve impedir a checagem de acesso.

O teste usa o serviço e cliente App reais com transporte sintético, SQLite em
memória e avanço controlado de `Date`. As métricas são de relógio **simulado**;
não houve rede GitHub, espera real de 45 s ou medição de latência de produção.

| Cenário | Antes | Depois |
| --- | --- | --- |
| 90 projetos, uma instalação/página, 200 ms por resposta | HTTP 504 aos 45.000 ms; 225 consultas; 74 leituras de commit | HTTP 200 aos 600 ms; 3 consultas; zero commits |
| 100 projetos, mesmo cenário | HTTP 504 aos 45.000 ms; 225 consultas; 74 leituras de commit | HTTP 200 aos 600 ms; 3 consultas; zero commits |
| 100 projetos, duas instalações, duas páginas de repositórios por instalação, 250 ms por resposta | HTTP 504 no prazo compartilhado | HTTP 200; 6 consultas; 1.500 ms simulados |
| 100 projetos revogados/restabelecidos | Revisão independente reproduziu 102 consultas D1/100 writes, falhando sob teto sintético de 50 consultas | 4 instruções D1 para revogar ou restabelecer os 100; 2 se já revogados, sem writes; outro proprietário intocado |
| HTTP 429 na segunda página | Erro explícito | Continua 429 com `retry_at`; sem inventário/histórico parcial ou corpo do provedor |
| Paginação lenta, 9 s por resposta | Prazo global de 45 s | Continua 504 aos 45 s simulados; timeout não foi aumentado |

### Contrato da correção

`checkRepositoriesAccess()` lê cada página necessária uma vez por instalação,
para até 100 pares de installation/repository daquela operação. Não mantém cache
de concessões entre requisições/usuários. Cada nova requisição revalida; consultas
pontuais usam `checkRepositoryAccess()` fresco. O cliente continua validando user
access token, ID GitHub, app ID e interseção usuário/instalação/repositório.
A [documentação oficial GitHub](https://docs.github.com/en/rest/apps/installations)
foi reconferida para endpoints por usuário e paginação.

O SHA permanece resolvido na preparação explícita (`catalog-authorize`), no
enqueue e nas revalidações do consumidor/scanner. Detalhes, revisão e exportação
verificam acesso sem resolver a branch atual. IDs cruzados são recusados pelo
owner no banco antes de consultar o provedor. Só projetos confirmados e suas runs
podem aparecer; grants retornados são conferidos contra os pares solicitados.

Ausência confirmada em inventário completo/suspensão/falta de Contents gera
negativa por recurso com `access_restricted`. Falhas de rede, identidade, quota,
JSON ou teto de páginas interrompem a operação explicitamente, sem lista vazia
bem-sucedida. Desconexão global é erro de conexão, não zero projetos. Páginas com
IDs solicitados duplicados são recusadas. Refresh negativo elimina grants
anteriores do par; não há fallback para token mais amplo.

Revogações/restabelecimentos no D1 só recebem writes quando mudam. Os IDs são
divididos em blocos de 98 para revogar (horário + owner + IDs) e 99 para restaurar
(owner + IDs), respeitando o [teto D1 de 100 parâmetros por query](https://developers.cloudflare.com/d1/platform/limits/).
A listagem usa duas leituras e até três UPDATEs em transições mistas, nunca um
UPDATE por projeto. O teste aplica o limite de bindings mesmo no SQLite local.
Erro de persistência continua explícito; não há exposição de dados no erro.

Casos novos: 90/100 projetos, paginação de instalações/repositórios, latência,
429 posterior, timeout, identidade errada, suspensão, falta de Contents, teto de
páginas, IDs duplicados, revogação na mesma instância e entre requisições, SHA na
análise, IDs cruzados de detalhe/revisão/exportação e transições D1 com B intocado.
Resultados da validação final constam do PR desta correção, com head/CI próprios.

### QA isolado: proposta, sem execução remota

A [proposta concreta](qa-isolado-mvp-v2.md) lista dois Workers, dois D1 (operação e
restauração), uma Queue, cron temporário e origem/callbacks/segredos exclusivos.
A=`ofelipepeixoto` e B=`radartech-news` são contas candidatas a confirmar, não
homologadas por estarem conectadas nesta conversa. Escopo: fixtures benignas,
Metadata/Contents read-only e allowlist só em QA. D1 continua fonte única;
Supabase/n8n/OpenAI/REA nativo não são necessários ao ensaio.

Estimativa incremental US$ 0 somente se plano/cotas existentes e compatibilidade
Free forem confirmados por medição. Free tem limites de CPU/subrequests que ainda
podem bloquear a carga máxima; não se promete hospedagem gratuita garantida.
Nenhuma contratação ou chamada paga. A proposta registra fontes/preços e parada
antes de qualquer gasto novo.

Ainda não executados na hospedagem: preflight/migração QA, exportação/restauração
em banco separado, duas identidades reais, organização/SSO quando disponível,
paginação/revogação App, Queue com reentrega/cancelamento/recuperação, revisão
persistida, comparação e Markdown realmente salvo, aberto e conferido. Transporte
injetado em QA deve ser rotulado como simulado, sem alegar prova do GitHub real.
Não foram repetidos instalação, compilação ou fixture REA. A v15 foi preservada.

Faltam somente as autorizações específicas da proposta para executar QA: ambiente,
conta/origem/recursos e teto sem gasto novo; participantes/repos/App e inserção
protegida de segredos; janela limitada de migrations e testes com flags apenas em
QA. Nenhum desses efeitos foi realizado nesta etapa.

Validação local final do ajuste: **209/209 testes Node**, lint, TypeScript e build
aprovados. Revisão independente: 39 testes focados passaram, sem bloqueio residual
no recorte; identificou e permitiu corrigir writes repetidos e excesso de bindings.
Os testes não usaram rede GitHub ou contas reais. A CI do novo head deve ser
consultada separadamente no PR; os quatro resultados da tabela são dos heads
anteriores exatos, não da correção. Nenhuma alteração de schema/lockfile/workflow
foi necessária neste ajuste.


## Adendo — controles para QA isolado, 22/10/2026 BRT

Base remota reconfirmada: PR [#41](https://github.com/ofelipepeixoto/security-workbench/pull/41),
head `ced53ffe3326bf2afb3f9abf94b86b6ef5f46527`, aberto em rascunho;
[CI 39713248169](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39713248169)
concluída com sucesso. Nenhuma alteração da correção de listagem foi refeita.
A v15 do Sites foi reconfirmada; nenhuma publicação/deploy/migração de produção.

Novo ajuste revisável: janela imutável de sete dias, quota transacional conjunta
50 jobs/24 h (350 totais), fixtures por identidade/instalação/repositório, limites
por aquisição e reenvio, parada automática do processamento e roteiro de
encerramento sem exclusão. Migration 0006 adiciona ledger vazio, sem ativar QA.
Cron começa ausente. A trava de aplicação não substitui retirar o cron real no
encerramento. Ferramenta offline de preflight/ativação/fechamento não chama APIs.

Validação local: **223 testes Node aprovados**, lint, TypeScript e build;
Miniflare D1 aplicou 0000–0006, confirmou preservação do legado, recusa de owner
inconsistente, rollback, FKs e QA ainda inativo. Treze casos iniciais dos controles
mais defesa D1 de fechamento (14 testes dedicados) cobrem quota A/B, concorrência
pelo último slot, idempotência, rollback, limites de transporte, janela/redeploy,
parada durante aquisição e acesso cruzado. Transporte e identidades desses casos
são sintéticos. Testes Python inalterados não foram repetidos localmente.
A CI do novo head deve ser identificada no PR correspondente; a CI acima é da
base #41. Não confundir build local com integração hospedada.

Preflight Cloudflare real: conta existente controlada pelo proprietário foi
identificada pelo conector direto e apresentada privadamente para confirmação;
associação Super Administrador aceita. Inventário completo: 0 Workers, 0 D1 e
0 Queues atuais. Nome/identificadores da conta e dados pessoais não constam da
publicação. Não deduzir consumo histórico zero desse inventário. Assinaturas e
consumo de cobrança permanecem bloqueados: endpoint exige Billing Read e não é
coberto pelo OAuth disponível. Conferência manual do plano/franquias pelo painel
é o próximo passo. Nenhuma Global API Key foi obtida/inserida. Formulário Composio
que a exigia foi descartado em favor do conector direto. Nenhuma conta nova.

A [proposta QA atualizada](qa-isolado-mvp-v2.md) registra nomes exatos dos dois
Workers, D1 operacional + D1 de restauração e Queue, custo adicional obrigatório
zero, seleção de fixtures, permissões GitHub mínimas e retenção/closeout. GitHub
App, credenciais, recursos QA, migrations remotas, duas sessões reais, restore,
Queue/scheduler, revogação, desktop/mobile/teclado e exportação realmente aberta
continuam **bloqueados na homologação hospedada**. Nenhuma contratação, chamada
paga, REA reinstalado/reexecutado, Supabase acrescentado ou lançamento público.

## Adendo — execução QA e diagnóstico do PR #42, 22/10/2026 UTC

PR [#42](https://github.com/ofelipepeixoto/security-workbench/pull/42) permanece
em rascunho, dependente da branch da correção #41. Sem merge. O
[registro verificável](qa-execucao-2026-10-22.md) e o adendo da proposta QA
descrevem recursos reais, migrations/backup/restauração e bloqueios restantes.

| Head remoto | CI concluída |
| --- | --- |
| #41 `ced53ffe3326bf2afb3f9abf94b86b6ef5f46527` | [39713248169](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39713248169): sucesso |
| #42 diagnóstico `d82775ea1fadc76f143f741db769e37d147cff75` | [39718036878](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39718036878): 4/4 aprovados |
| #42 empacotamento `f04544dc893aa05f6a5233c8c608934baf89e5ec` | [39718517124](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39718517124): 4/4 aprovados |
| #42 correção mobile/código hospedado `e361bc8b2a10cba5e2755320f4fa28bbdaadcaa0` | [39719974739](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39719974739): 3 aprovados; smoke público falhou com HTTP 403/remaining=0 comprovado |

A causa da primeira falha (39715990883) permanece inconclusiva por falta de
telemetria no log antigo. Não atribuir automaticamente o rate limit novo ao
evento antigo. Diagnóstico novo sanitizado mantém assertivas, revisão fixa,
prazo e exit code de falha, sem skip/token/retry ou timeout ampliado. Nenhum
conteúdo adquirido, bundle, credencial ou log bruto foi anexado publicamente.

Conta existente e Free confirmados; cinco recursos QA criados. D1 operacional
recebeu migrations 0000–0006 com preflight/checagem por batch; backup SQL lógico
de 12 registros sintéticos/39 objetos restaurado e comparado no segundo D1,
sem vínculo desse banco aos Workers. HTTP e interface inerte reais conferidos;
correção de overflow mobile preserva acessibilidade. Local: 230 testes Node,
lint/TypeScript/build aprovados antes da pequena extensão do gate offline;
após a extensão, a suíte completa passou com **231/231** testes, sem skips.

GitHub reautenticado pelo proprietário; App/OAuth QA registrados sob
ofelipepeixoto, sem instalações. Ativação A/B/App/processamento já autorizada,
mas ainda impedida pelos client secrets protegidos e fixtures não selecionadas.
Chave AES QA criada sem revelar valor. Flags off, cron ausente, zero consumidor
Queue, zero job/sessão/ativação da janela. Fluxos reais A/B, revogação, jobs,
scheduler, revisão/comparação/exportação continuam bloqueados tecnicamente,
nunca marcados como aprovados por mocks. Produção pública permanece v15.

### Adendo — fixtures e autenticação hospedada, 22/10/2026 BRT

As duas fixtures privadas nominalmente autorizadas foram criadas sob
ofelipepeixoto e radartech-news, sem workflows e só com dados sintéticos.
Commits: `5cd1c984ab235042da96a736d8a1f80e790cf4bc` (A) e
`e2d0537fd0525b30c54267cc98d470d6c59c5f28` (B). O registro de execução detalha
o desvio de privacidade de B, corrigido enquanto ainda vazia e antes de arquivos.
Nenhum conteúdo real ou segredo foi exposto; não omitir esse incidente.

Client secrets cadastrados nos destinos QA protegidos, sem leitura dos valores.
Dois logins OAuth reais aprovados, com dashboards próprios vazios. App B
instalada com seleção exclusiva da fixture B; conexão persistida e catálogo real
de um repositório aprovado. Não é prova de isolamento por IDs nem paginação de
90–100 projetos. Instalação A não confirmada devido a timeout da integração de
navegador, sem evidência para atribuir causa ao GitHub. A autorização já existe.

Login/multiusuário/App ligados só no web QA; jobs desligados nos dois Workers,
zero cron, zero consumidores e janela sem ativação. A v15 foi preservada.
Código hospedado continua `e361bc8b2a10cba5e2755320f4fa28bbdaadcaa0`.
Head anterior ao adendo `76f5e7031e94abbbe14f1874bd3dbb483b75074a`:
[CI 39721269070](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39721269070)
**4/4 aprovados**. Nenhum teste de implementação foi refeito neste adendo
documental. [Evidências, limites e bloqueios](qa-execucao-2026-10-22.md).

## Adendo — 26/10/2026: identidade, catálogo e revisão portátil

O estado público foi reconfirmado antes desta alteração: PR #43 em rascunho,
head `71c878533270022aa68748f73b3f9f6a6f2727db`, base da #42
`8ec2e154d8f317196908d18c4df0f318db20cbf1`. A
[CI 40237040753](https://github.com/ofelipepeixoto/security-workbench/actions/runs/40237040753),
do head da #43, está concluída com `success`; esse estado foi relido em
26/10. Não é CI dos novos ajustes locais.

O head hospedado citado no adendo anterior é um registro histórico. A entrega
privada de código de 25/10 registra o candidato da #43 nos Workers QA;
nesta etapa não houve upload, deploy, leitura de módulos remotos, migration,
ativação de janela, cron ou consumer. Nenhuma configuração da produção v15
foi alterada.

Dois ajustes dependentes foram preparados para revisão, sem publicação:

1. Identidade/sessão e catálogo, commit local
   `7224d774eb742a6aa1623864e09844d1f779c5be`: marca GitHub e verde condicionado
   à sessão validada, expiração e retomada, catálogo paginado na nova análise,
   acompanhamento por URL e bloqueio de respostas antigas após perda de acesso.
   A montagem abre o escopo antes dos efeitos filhos, preservando o fechamento
   e a reabertura do StrictMode. [Contrato e limites](github-session-catalog-2026-10-26.md).
2. Relatório com estados humanos explicados e prompt offline para uma IA do
   usuário propor correções. O prompt não executa o repositório, altera o
   GitHub ou chama modelos. [Motor atual e proposta de evolução](motor-de-revisao-e-correcao.md).

Validação local: **319 testes Node** no primeiro commit; **324 testes Node**
no conjunto dos dois ajustes, além de **27 testes Python**, TypeScript, lint
e build. Transporte, contas e respostas são sintéticos; os testes exercitam
módulos reais, SQLite em memória e renderização no servidor. A exportação
foi gerada pela rota real com fixture local e o arquivo foi reaberto no disco;
isso não equivale a download de navegador ou integração hospedada.

A revisão independente encerrou os casos de exportação tardia após troca de
sessão e invalidação prematura na montagem do catálogo. Não encontrou outro
P0/P1 no recorte. A tentativa de preview ficou bloqueada por
`ERR_CONNECTION_REFUSED` entre navegador e servidor local; não é evidência de
falha do produto nem aprovação de DOM, mobile, teclado ou StrictMode real.

CI nova, login A/B no novo build, instalações/permissões reais, processamento,
revogação hospedada e jornada de exportação continuam pendentes. O código
revisável não representa piloto homologado ou lançamento público. Não houve
alteração da lista de contas, dos repositórios permitidos no QA ou de
credenciais. A App permanece somente leitura e OpenAI permanece desligada.

## Adendo — 26/10/2026: publicação e orientador automático

As duas alterações anteriormente locais foram publicadas em rascunho, mantendo
as árvores testadas e a cadeia existente. Os heads e as CIs abaixo foram
reconfirmados em 26/10/2026:

| PR | Base | Head remoto | CI concluída |
| --- | --- | --- | --- |
| [#44](https://github.com/ofelipepeixoto/security-workbench/pull/44) — identidade e catálogo | #43 | `414faab6b044791756de1e658ad333627e782b0c` | [40326058256](https://github.com/ofelipepeixoto/security-workbench/actions/runs/40326058256), success |
| [#45](https://github.com/ofelipepeixoto/security-workbench/pull/45) — Markdown e prompt | #44 | `e071215feb21ed35207e250a7a949b5d8d592d93` | [40326275615](https://github.com/ofelipepeixoto/security-workbench/actions/runs/40326275615), success |

As árvores são, respectivamente, `2413910ed18f382016f04fd7211ceb5f2cb27455`
e `87cf3a028c26123f1ae076a0cc94ca6cb40b6b78`. Os hashes locais anteriores
continuam sendo referência da validação local, não os heads públicos.
Autoria genérica foi definida explicitamente e conferida nos novos heads.
Nenhum bundle, log bruto ou artefato real foi anexado aos PRs.

O novo [orientador automático](orientador-automatico.md) é um complemento por
regras versionadas: gera orientações na leitura autorizada e no Markdown,
sem revisão humana prévia para gerar o texto. A saída é rastreável, mantém
incertezas e decisões existentes e não aplica código. Não contém provider,
chave, rede, execução do alvo ou persistência adicional. São no máximo 100
entradas e 192 KiB por bloco de orientação, com omissões explícitas.

A revisão contextual por modelo não foi executada nem implementada como
serviço ativo. O orçamento vigente continua zero, e destino/projeto, modelo,
dados permitidos e credencial protegida precisam ser delimitados antes dessa
etapa. A orientação por regras não deve ser apresentada como análise por IA.
A produção v15 e as permissões/recursos existentes não foram alterados.

## Adendo — reconciliação e candidato cumulativo de 26/10/2026

Os quatro heads remotos foram reconfirmados abertos em rascunho, sem merge:

| PR | Head remoto exato | CI reconfirmada |
| --- | --- | --- |
| #43 | `71c878533270022aa68748f73b3f9f6a6f2727db` | [40237040753](https://github.com/ofelipepeixoto/security-workbench/actions/runs/40237040753), success |
| #44 | `414faab6b044791756de1e658ad333627e782b0c` | [40326058256](https://github.com/ofelipepeixoto/security-workbench/actions/runs/40326058256), success |
| #45 | `e071215feb21ed35207e250a7a949b5d8d592d93` | [40326275615](https://github.com/ofelipepeixoto/security-workbench/actions/runs/40326275615), success |
| #46 | `1044098259bc1881e74a541ef54cb1f98ed0677f` | [40331645416](https://github.com/ofelipepeixoto/security-workbench/actions/runs/40331645416), success |

O QA foi conferido somente leitura e continua com a fonte #43; não recebeu #44–#46. O candidato local acrescenta descoberta de metadados sem Contents, cobertura explícita e estados de análise, integração contextual server-side desligada, controle de canário e de INSERT da janela, telemetria numérica opt-in e empacotamento com preservação revisada da autenticação existente. Nenhum novo push, PR, deploy, migration remota, consentimento, job, cron, janela ou chamada de IA foi executado nesta preparação.

A implementação contextual é distinta de um serviço ativo: possui autorização, aquisição mínima pinada, projeção estrutural, respostas/citações validadas, reserva atômica de custo, idempotência, retenção e controles de falha. Ainda exige projeto/modelo/dados/orçamento/purga aprovados e prova do provedor. O limite de custo vigente continua R$0 e chamadas reais permanecem bloqueadas. O teste local não comprova qualidade de modelo nem integração hospedada.

Matriz pedido/entrega em [reconciliação](reconciliacao-entregas-2026-10-26.md), contrato e limites em [IA contextual](ia-contextual-integracao.md), roteiro de homologação/custo/rollback em [candidato QA](qa-candidato-2026-10-26.md). O relatório privado conserva o commit final local, os digests, recursos exatos e resultados do conjunto. A fonte testada do candidato só poderá ser implantada após autorização específica; a CI dos heads anteriores não é CI do candidato novo.
