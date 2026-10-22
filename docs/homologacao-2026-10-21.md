# Continuidade: auditoria, UX e homologação — 21/10/2026

Estado reconciliado nesta rodada. Resultados datados em UTC e BRT; a data local
é 21/10. Os PRs continuam em rascunho e não houve merge ou nova release.
A demonstração permanece pública/fictícia; operação real exige o proprietário.

## Fonte efetiva e mudanças entregues

Antes da mudança, Sites v13/fonte `5074b95d7ce5fd6e84cb12ccc7881e6e3155e748`,
ambiente revisão 6 e audiência pública foram reconferidos. A v14 foi publicada
com `succeeded` em 22/10/2026 às 00:33:07 UTC / 21/10 às 21:33:07 BRT,
fonte Sites `4d5a960b6444a21b5c98b4682f6c814445f64c7f`, mesmo ambiente revisão 6,
deployment `appgdep_6ad959ae18d08191bfd6a468a5b91ba0`. Domínio preservado:
https://security-workbench.camaleaoweb3.com.br/ . Nenhum segredo ou schema mudou.

| Capacidade | Implementação | Publicação | Teste realizado | Evidência | Pendência |
| --- | --- | --- | --- | --- | --- |
| Login GitHub exclusivo | Implementado, ID estável/owner canônico | Publicado antes e preservado na v14 | Sessão legítima leu histórico e importação existente no navegador; testes de autenticação | `github-auth`, `workbench-access`, suites e D1 por owner | Outra conta, consentimento externo, expiração real e logout em produção têm aceites próprios |
| Projetos/histórico/filtros | Implementados | Publicados | Dois projetos e três registros anteriores conferidos por UI/D1; filtros SSR | Rotas `/projects`, `/runs`, `/findings` | Registrar os novos testes operacionais abaixo sem inferir ausência por erro |
| Retentativa da importação | Implementada no #29 | Incorporada agora à v14 | Teste com rota/SQLite: persistência seguida de resposta perdida não duplica no mesmo formulário | `rea-import-attempt.mjs`, `service.test.mjs` | Recarga/fechar/reabrir perde identidade em memória; consultar histórico antes de reenviar |
| Limpeza do transporte GitHub | Corrigida no #33 | Incorporada à v14 | 503/tamanho/overflow com cancelamento pendente, rejeitado ou síncrono | [PR #33](https://github.com/ofelipepeixoto/security-workbench/pull/33), [CI](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39699796214) | Não foi alegada exploração ou indisponibilidade observada em produção |
| Contagens e motivos REA | Implementados em JS e Python no #34 | Parser web publicado na v14; Python continua proposta separada em GitHub | 11 Node/10 Python do importador, paridade de quatro fixtures e legado | [PR #34](https://github.com/ofelipepeixoto/security-workbench/pull/34), [CI](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39699887238) | Novos motivos só valem para futuras importações; histórico não é reescrito |
| Detalhe da análise | Resultado/próxima ação, contexto, revisão e cobertura; detalhes recolhidos | Publicado na v14 | 16 SSR, TypeScript, lint; baseline real e nova tela real observados no navegador | [PR #35](https://github.com/ofelipepeixoto/security-workbench/pull/35), [CI do código](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39700066811) | Verificações de viewport/teclado e outras jornadas registradas separadamente |
| Demais seções | Dashboard/projetos/achados/histórico/comparação/relatórios/perfil/conta/ajuda já implementados | Preservados; CSS transversal melhora controles/quebra/formulários | 19 rotas no build, SSR das jornadas | `web/app`, `workbench-ui.test.mjs` | Não foi alegado redesign integral de todas as telas |
| Importação existente | Persistida, parcial e sem candidatos | Observada na v13 e preservada na v14 | Banco, UI, recarga e prévia Markdown coerentes | Registro da fixture abaixo | Download efetivo e revisão de outro candidato são aceites diferentes |
| REA nativo local | Fixture própria concluída pelo operador | Não é executor hospedado | Uma fonte/342 bytes, zero falhas, sete segundos, unidade encerrada | #32 e `rea-execucao-2026-10-21.md` | Typecheck completo, entradas externas e executor remoto não homologados |
| GitGuard | Observação pública e aquisição limitada | Nenhum código/marca de terceiro incorporado | HTML e amostra de dois JS, origem/bytes/digests registrados | [Observação pública](gitguard-observacao-2026-10-21.md) | REA sobre GitGuard não executado; nenhum backend privado recuperado |

## Análise REA existente: não reimportar

Foi encontrado no D1 o registro `c6a31d9d-e6c0-4480-8f13-5b1ca84f75cd`,
criado em 22/10 às 00:07:50.258 UTC / 21/10 às 21:07:50 BRT. Projeto
`ofelipepeixoto/security-workbench`, ID `1419403320`, commit declarado
`1b0c93114d7a215aa73844e5a7edd62620dd25eb`, método `rea-import`, status complete,
1 arquivo/342 bytes declarados, cobertura parcial e zero candidatos projetados.

SHA-256 do Evidence recebido, efetivamente calculado na importação:
`a0919437dff28879897da289284199daea0f88ccb57a3dea047f61ef8e6581a4`.
É igual ao resumo da execução WSL. O digest estrutural da raiz declarado pelo REA,
`fbb1642452f6296f6113c9978a5af9f8ee769592e226ca98f5d01e6359dffc41`,
é distinto do hash medido do arquivo JS; não autentica sua origem.

D1, tela e prévia Markdown apresentaram o mesmo projeto, commit, hash e tamanho.
A recarga preservou o registro. Não havia decisão humana nesse registro: não há
candidato para revisar. JSON bruto, logs, cookies, owner interno e capturas de
sessão não foram publicados no Git. A consulta administrativa D1 é evidência
separada do fluxo de autorização da API; tabelas de sessão/OAuth não foram lidas.

### Por que quatro observações foram omitidas?

O legado tem `observations_seen=4` e `observations_omitted=4`; não gravou o total
importado como metadado nem motivos individuais. Não é possível atribuir a cada
observação uma razão exata sem o Evidence privado. A nova interface conserva
os campos ausentes como “não registrado” e não pede reimportação para corrigi-los.

A leitura do motor fixado `3e7c6302233ecbcb9b92e43ee5a60337738961bd` oferece uma
inferência compatível: a fixture exporta um objeto, o que gera vínculo de módulo;
`statistics.findings` inclui fatos/vínculos, não somente candidatos. A construção
do grafo prevê nós de inventário artifact/javascript-asset/javascript-module,
fora dos tipos estruturais projetados pelo Workbench. Campos com nomes de endpoint
ou armazenamento num objeto não bastam para o motor demonstrar tais comportamentos.
Essa é uma inferência do código, não reconstrução das quatro observações privadas,
perda confirmada de uma vulnerabilidade ou motivo para forçar novos candidatos.

O #34 corrige transparência futura: recebidas/importadas/omitidas, findings nativos
declarados e motivos fixos por primeiro filtro (tipo, autoridade, estado,
artefato/localização indisponível, formato de localização, duplicação ou limite).
Duplicatas passam a compor omitidas. Conserva `recebidas=importadas+omitidas`,
soma de motivos igual ao total omitido, candidate/low e todas as flags de
execução/isolamento/bytes não verificados. Não executa ou autentica o produtor.

## Participação do plugin de cibersegurança

| Nível | Estado | Evidência verificável | Limite |
| --- | --- | --- | --- |
| A — orientação no desenvolvimento | Utilizado | Skill e referências de software/APIs e política de execução aplicadas nesta auditoria; decisões e revisão independente | Não é um serviço instalado no produto |
| B — controles no software | Implementado/testado | `github-auth`, `workbench-access`, `workbench-service`, `scanner`, `rea-import` e respectivas suites | Controle determinístico, não diagnóstico de um modelo |
| C — política incorporada a agente | Ausente | Não há agente operacional, prompt de sistema ou ciclo de ferramentas no backend | Markdown de roadmap não constitui agente |
| D — modelo/API em execução | Ausente | Sem chamada LLM, modelo/provedor/orçamento ou SDK operacional configurado | Nenhuma IA paga foi ativada ou é necessária para homologar agora |

Controles inspecionados: identidade numérica GitHub, owner canônico, PKCE/state de
uso único, sessão opaca com hash e TTL, geração de revogação, Origin/CSRF,
consultas filtradas por owner, aquisição de identidade/commit/blobs e importação
UTF-8/JSON estrita com projeção. Revisão continua humana. Documentos e código são
tratados como dados; não instruem execução. Testes de protótipos/JSON/Markdown
hostil não são avaliações de prompt injection de um agente LLM inexistente.

Se houver IA futura, a primeira função útil é explicar evidências/auxiliar triagem,
com saída estruturada e orçamento explícito. Não confirmar vulnerabilidades,
executar comandos, alterar repositórios ou publicar por decisão do modelo.

## APIs e agentes: inventário

| Integração | Finalidade | Implementada? | Credencial | Permissões | Custo | Teste | Próximo passo / classe |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OAuth GitHub | Identidade | Sim | Segredo só no servidor, já configurado | Escopo vazio; ID permitido | Sem nova contratação | Sessão real observada; testes PKCE/replay/negação/TTL | Completar casos externos; necessária agora |
| API GitHub pública | Aquisição | Sim | Sem token no Worker | Namespace próprio, leitura limitada | Cota pública por IP | CLI/HTTP Actions e testes de identidade/hash | Duas aquisições hospedadas fixadas; necessária agora |
| GitHub App | Privados/organizações | Não | App/instalação/token curto futuros | Leitura mínima por IDs; não inferida pelo login | Avaliar depois | Não testada | Expansão futura |
| APIs internas | Histórico/decisões/relatório | Sim | Sessão GitHub + CSRF | Owner por consulta/operação | Stack atual | Testes auth/erro/idempotência; leitura real | Jornadas da v14; necessária agora |
| Importador REA | Projeção offline | Sim | Sessão hospedada; nenhum token REA | 1 MiB/limites de estrutura, até 100 candidatos | Sem IA | Parser/legado/paridade + importação persistida | Exportação/revisão proporcionais; necessária agora |
| Executor local REA | Análise estática | Fixture própria | Nenhuma credencial encaminhada | Sem rede, RO, cgroup/tempo/bytes | Máquina existente | Resultado fornecido pelo operador | Typecheck/gates externos; preservar instalação |
| D1 | Persistência hospedada | Sim | Binding isolado | Consultas por owner | Stack atual, sem contratação | Testes e metadados da fixture | Preservar dados; necessária agora |
| SQLite | Núcleo Python local | Sim | Acesso local, separado do D1 | Loopback/arquivos locais | Máquina existente | 27 testes Python nesta rodada | Windows nativo não homologado; ambiente separado |
| Advisories/CVEs | Correlação de versões dos alvos | Não | Fonte/cache a definir | Consultas limitadas | Avaliar fonte | Inventário não consulta CVE | Expansão futura |
| IA/agentes | Explicação e triagem | Não | Provedor/modelo não configurados | Autoridade a delimitar | Não ativado | Sem avaliações LLM | Opcional após homologação |
| MCP/conectores | Ferramentas de agente | Não operacional | Nenhuma integração instalada no backend | Site não declara MCP; helpers starter sem chamadores | Não ativado | Consulta Sites confirmou ausência MCP | Expansão futura |
| Webhooks/notificações | Atualização recorrente | Não | Assinatura/segredos futuros | Replay/quotas/revogação a definir | Não ativado | Sem teste operacional | Expansão futura |

As APIs atuais são GET start/callback, POST logout, GET/POST `/api/workbench`
e POST `/api/workbench/rea`. Relatório é ação POST autenticada, não URL pública
que entregue Markdown. OAuth upstream: host fixo, até 10 s e 16/32 KiB; corpo de
operações: 8 KiB/10 s; REA até 1 MiB e envelope limitado; GitHub até 20 arquivos,
256KiB por arquivo/2MiB no total e 45 s. Métodos, erros, rate limit e entradas
malformadas têm testes; isso não prova toda jornada no navegador.

## Correção posterior de diagnóstico — v15

A tentativa hospedada na v14 foi registrada em `905e724f-7608-4766-bae3-ab73f5772a05`,
às 00:35:10UTC, para o commit próprio `b6652136a1047ff11b11c348608a0db354e2e0c1`.
Ela falhou em 175 ms com o código legado genérico acquisition_failed. Isso não
identifica cota, transporte ou outra causa. Não foi considerada análise limpa.

O [PR #36](https://github.com/ofelipepeixoto/security-workbench/pull/36) introduz
códigos fechados por tipos conhecidos: github_rate_limited/acquisition_timeout,
com aquisição genérica preservada e falhas D1 tratadas como 503, sem atribuí-las ao
GitHub. O UI explica cada código sem retry automático. Exceções/respostas/URLs
brutas não são persistidas. A [CI 39701266214](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39701266214) passou.

A v15 foi publicada em22/10 às 00:44:17UTC / 21/10 às 21:44:17 BRT, fonte Sites
`bc23b52fa5f48dbc98982938bf95da8baaa8b349`, deployment
`appgdep_6ad95c4efef881918fd0c61ddf085c88`, ambiente revisão 6 e mesma audiência.
É a versão vigente, posterior à v14 acima. Após essa mudança relevante, cabe
uma única tentativa para obter o diagnóstico seguro, sem reinterpretar o legado.

No ambiente de engenharia, uma aquisição pública única do mesmo commit
concluiu 20 arquivos/76.125 bytes, 4 candidatos e cobertura parcial, digest
`005316206bfd44fba556fbb516bd7cac15ccf34a0a57156dbae1423c04ed8af5`.
Não houve execução de código alvo ou envio de credenciais. Essa execução é
separada do Worker e não homologa aquisição/revisão hospedada.

## Validação e limites

O primeiro conjunto passou em 112 testes Node/27 Python. Após a correção de
diagnóstico, passaram **117 testes Node, TypeScript, lint direcionado e build
de 19 rotas**; Python não mudou nesse último incremento e os 27 testes anteriores
permanecem identificados separadamente. O Python local da engenharia executou os testes disponíveis;
o CI usa Python 3.12. Não houve execução do REA ou JavaScript do alvo na engenharia.
As três CIs dos PRs #33–#35 passaram. Só novas mudanças/falhas justificam repetição.

Smoke anônimo da v14: oito páginas HTTP 200 com `no-store, must-revalidate`, sem
ID/hash do registro privado no HTML; GET `/api/workbench`401/no-store, GET REA 405
e callback inválido 303/no-store. Isso não prova todas as operações POST ou IDs.
A prévia Markdown foi lida no navegador e consistente com a importação. A espera
da ferramenta por download não concluiu; não foi alegado arquivo baixado/inspecionado.

O navegador permitiu observar baseline v13 e detalhe v14 na sessão legítima.
A conexão foi intermitente em parte das navegações; não houve tentativa de contornar
autenticação. Resultados adicionais de homologação seguem abaixo quando observados.

## Riscos residuais e decisão

Classificação inicial desta entrega: **homologado parcialmente, com limitações
identificadas**. A importação da fixture está persistida e o núcleo da interface
foi publicado; isso não encerra os issues #13/#14.

- Teto global de 20 fluxos OAuth pode impedir novos logins por até 10 min; limitação
  de disponibilidade testada com mocks, sem teste de exaustão em produção.
- Revogar a App no GitHub não encerra imediatamente a sessão local de até 12 h.
  Suspensão por flag não substitui revogação durável/geração monotônica.
- Revisões guardam decisão atual e horário; não há trilha append-only de alterações.
- Retentativa REA tem identidade só no formulário aberto; reload exige histórico.
- A reconsulta posterior confirmou 38 abertos no painel da main; PRs e Site
  continuam fontes distintas. Exceções npm/undici permanecem no registro de
  triagem e a política de idade mínima não foi reduzida.
- GitGuard/REA externo, privados, CVEs dos alvos, IA/MCP e notificações não foram
  ativados automaticamente. VPS e outros bancos continuam fora desta mudança.

Reversão: revisão normal dos commits #33/#34/#35/#36 ou publicação de uma fonte revisada
que reverta somente a camada de UX/transporte/parser. Schema, dados e credenciais
permanecem preservados; não restaurar D1 antigo ou reduzir geração de sessão.
Retornar à v13 também perde a correção de retry; não usar rollback para apagar
histórico ou trazer novamente autenticação anterior por ChatGPT.

QA adicional observado: viewport 390×844 na demonstração fictícia, sem overflow horizontal (scrollWidth375≤innerWidth390); navegação abriu, Escape fechou e foco voltou ao botão Abrir navegação. O viewport foi restaurado. O detalhe real foi observado em desktop na v14 e o estilo não mudou na v15. Isso não constitui auditoria completa de acessibilidade, contraste ou zoom.

### Resultado da tentativa diagnóstica na v15

Em 22/10/2026 às 00:45:21.947 UTC / 21/10 às 21:45:21 BRT, a tentativa
`479f072e-4300-421f-9b04-77f475e3c09b`, mesmo projeto/commit autorizado,
terminou em 203 ms com `github_rate_limited`, sem resultado/revisão fixada.
A tela e o D1 concordam: **cota pública compartilhada por IP atingida no Worker**.
Esse código é gerado quando a resposta 403/429 traz x-ratelimit-remaining=0.
O resultado não atribui retrospectivamente essa causa ao run anterior genérico.
Nenhuma nova tentativa de aquisição será feita antes da recuperação da cota
ou de uma mudança autorizada de transporte. Não foi solicitada senha/token.

Isso bloqueia as duas aquisições GitHub elegíveis, a revisão persistida de um
candidato e a comparação hospedada da issue #14. O registro REA existente tem
zero candidatos e não foi adulterado para preencher essa lacuna. A aquisição
real de engenharia e os testes da API continuam provas de ambientes diferentes.

### Logout e recusa depois da sessão

Na v15, Sair da conta levou à tela de acesso. Voltar à página anterior mostrou
somente a demonstração/sem sessão operacional. GET `/api/workbench` no mesmo
navegador retornou a mensagem de autenticação necessária. A URL direta da análise
REA real, após logout, mostrou “Esta análise não faz parte do exemplo” e não
revelou seus dados. O histórico D1 foi preservado. Isso verifica logout e recusa
nessa sessão; não equivale à expiração natural de 12 horas ou teste de outra conta.

### Dependabot: reconsulta autenticada disponível posteriormente

O navegador autenticado permitiu ler as duas páginas completas: 38 alertas abertos,
34 fechados, 16 altos, 15 moderados, 7 baixos e nenhum crítico. A consulta foi feita em
21/10 nesta rodada. O painel informa arquivos verificados em 17/10: é o estado
analisado da main, não dos PRs abertos ou do artefato Sites. Não houve descarte,
merge ou nova execução do Dependabot. O [agrupamento](dependabot-painel-2026-10-21.md)
relaciona pacote, manifesto, escopo e caminhos; 11 pacotes em 12 grupos de manifesto.
As limitações anteriores da integração foram superadas somente para essa leitura
pelo navegador; não passou a existir uma API de alertas no conector.

Correspondência final de fonte: 90 arquivos web rastreados conferidos byte a byte
contra o checkout Sites publicado, sem diferenças. package.json SHA-256
`b4735a52775a731759c27edf013b61c5dbda56a32439910aa4225a3bdb84fd30`;
pnpm-lock.yaml SHA-256
`8449ddd502e9380316fcda678d4d1dc52c7fd31e29384f3c3dd21c8adf6d5032`.
Nenhuma dependência mudou nesta rodada. Os patches anteriores já presentes nesse
lockfile permanecem no artefato v15; isso não resolve os alertas da main sem merge
nem elimina as exceções documentadas.

O retorno pelo login GitHub também foi exercitado após logout: seleção explícita
da conta proprietária já autenticada, retorno à Visão geral e mesma identidade.
Nenhuma senha, token ou outra conta foi solicitada; projetos e histórico foram
preservados. Consentimento negado externo e expiração natural continuam aceites
separados dos casos já cobertos por testes locais.

O botão de exportação na v15 retornou “Download solicitado”; a espera limitada pelo evento de download não o confirmou. Nenhum arquivo baixado foi declarado inspecionado. O menor passo manual restante para esse item é conferir o Markdown gerado na pasta de downloads; não exige nova análise ou importação.
