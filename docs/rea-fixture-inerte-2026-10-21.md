# Primeira prova REA com fixture própria — 21/10/2026

O runtime foi preparado sem typecheck, segundo o resultado do operador registrado
na [preparação](rea-runtime-preparacao-2026-10-21.md). Este procedimento propõe a
primeira análise estática nativa; ainda não há resultado do operador. Site v13,
login GitHub, D1 e homologação hospedada são etapas separadas.

## Escopo fixo

O helper `scripts/rea-run-inert-fixture.sh` não aceita argumentos ou caminhos de
alvo. Materializa somente os bytes da fixture própria
[`fixtures/rea/inert-app.js`](https://github.com/ofelipepeixoto/security-workbench/blob/1b0c93114d7a215aa73844e5a7edd62620dd25eb/fixtures/rea/inert-app.js),
do repositório `ofelipepeixoto/security-workbench`, ID `1419403320`, no commit
`1b0c93114d7a215aa73844e5a7edd62620dd25eb`. São 342 bytes e SHA-256
`d99e67189229b7c47492d92fa3995ad9ae4110490ffeeb16483efeb420c3b29e`.
A identidade do repositório e os bytes fixados foram reconferidos pela integração
GitHub nesta etapa. A fixture tem somente comentários e um objeto exportado;
rótulos de endpoint e armazenamento não representam falha ou credencial.

O helper usa o REA no commit `3e7c6302233ecbcb9b92e43ee5a60337738961bd`,
pacote 6.4.0, lockfile e cinco sentinelas com hashes fornecidos pelo operador.
Confere também o Node Linux 24.19.0 e o Bubblewrap privado 0.13.1. O provider
nativo do Evidence é `rea-javascript-application`, versão de contrato `1`, que
não deve ser confundida com a versão do pacote.

Nenhuma dependência é instalada, nenhum pacote é atualizado e nenhuma requisição
de rede é feita pelo helper. A obtenção do helper fixado antes da execução é uma
etapa de transporte separada. Nenhum JavaScript do alvo é importado ou executado;
o engine e o código de verificação próprios são executados como ferramentas.

## Isolamento e orçamento

A unidade transitória solicita 1 GiB para a família de processos, swap zero,
64 tarefas, quota de uma CPU, prazo global de 30 segundos e até dois segundos de
encerramento. Memória/swap/tarefas/CPU são conferidos dentro da mesma unidade antes
do Bubblewrap. O cliente tem limite externo de 40 segundos, com mais dois segundos
até KILL. Esses são limites, não medições de consumo.

O pai Node recebe heap antigo de 320 MiB e semi-space de 8 MiB; o worker recebe
128 MiB e orçamento de análise de 5000 ms. Heap não substitui o limite externo da
família. Os 5000 ms do worker não cobrem todo o inventário, preparação, serialização
ou cleanup: por isso o prazo global permanece necessário. Esses valores vêm do
comando confiável; o Evidence de sucesso pode não exportá-los em `parameters`.

Os cinco namespaces são explícitos, capacidades removidas e ambiente mínimo.
Somente arquivos necessários da ferramenta e sua árvore `dist` completa são
montados somente leitura. A fixture fica em `/input`, também somente leitura;
`/tmp` é privado. Home, discos Windows, `.git`, sessões, bancos e cgroups do host
não são montados. `/proc` pertence ao namespace de processos novo; `ps` de procps
permanece disponível para a supervisão legítima do worker.

Antes de iniciar a CLI, um verificador próprio no mesmo sandbox confere namespace
de rede distinto do host, ausência de interfaces externas, bytes da fixture,
escrita recusada com `EROFS` e ausência de caminhos privados. O teste com listener
de loopback positivo/negativo foi observado no pré-flight anterior; este helper
não repete esse teste e não deve anunciar sua repetição.

## Saída e classificação

`--json` puro preserva o Evidence na raiz. Não usar `--full-output`, filtros ou
janelas de tokens. O helper grava stdout e stderr em arquivos locais privados,
com teto de 1 MiB por arquivo regular; isso não é quota de disco global. O resumo
compartilhável é limitado a 4 KiB e contém somente códigos, contagens, cobertura,
horários e hashes. Não imprime o Evidence, código ou valores estruturais.

Exit zero da CLI não basta: erros também podem ter representação JSON. O resumo
exige operação, predicate, provider e resultado nativos coerentes, um arquivo
relevante e analisado, 342 bytes lidos, zero falhas de parse, cobertura da aplicação completa,
fixture intacta e término da unidade confirmado. Se esses gates não passarem, o
aceite permanece bloqueado ou parcial. Nenhum truncamento vira sucesso.

Há uma distinção do contrato fixado: `graph.coverage` da aplicação usa
`omitted_count`, enquanto `semantic_graph.coverage` usa `omitted_nodes` e
`omitted_relations`. No código do motor fixado, a cobertura semântica normal é
`unknown`, mesmo sem truncamento; exigir `complete` impediria todo aceite dessa
rota. A prova exige esse `unknown` declarado, sem truncamento, nós/relações omitidos
ou limites ativos. O resumo preserva `semantic_coverage:"unknown"`; o término da
execução e do parse não comprova completude semântica.

`typecheck_complete=false` e `ready_for_untrusted_targets=false` permanecem
explícitos mesmo se a prova mínima da fixture passar. Isso não habilita análise
arbitrária, execução dinâmica, providers adicionais, MCP remoto ou IA paga.
Uma contagem de observações estruturais não é contagem de vulnerabilidades.

O resumo verifica somente o contrato necessário a esta fixture; não autentica
criptograficamente todos os digests internos ou assinaturas REA. O hash da entrada
é medido a partir dos bytes; o digest da raiz no Evidence é identificado como
declarado pelo engine. A validação estrita pelo importador Workbench existente
permanece um próximo aceite, sem duplicar seu parser neste helper.

## Pendências e reversão

| Item | Estado | Evidência | Bloqueio | Próxima ação | Responsável | Aceite |
| --- | --- | --- | --- | --- | --- | --- |
| Runtime local sem typecheck | Preparado segundo o operador | Emit 4 s, bundle 2 s, status zero e cinco hashes | Typecheck completo pendente | Preservar os mesmos artefatos | Proprietário + engenharia | Pins e hashes continuam iguais antes e depois da prova |
| Primeira fixture nativa | Helper implementado para revisão; sem resultado do operador | Escopo e limites deste documento | Execução no WSL necessária | Executar somente o helper fixado e compartilhar resumo | Proprietário com apoio da engenharia | Evidence nativo e todos os gates da fixture aprovados; ausência de candidatos é resultado válido |
| Importação do Evidence real | Pendente | Importador já existe no produto; só fixtures sintéticas foram usadas até aqui | Evidence nativo ainda não observado | Conferir projeção com parser existente e homologar persistência/revisão/exportação | Engenharia + proprietário | Sem JSON bruto persistido ou achados inventados; vínculo e cobertura declarados explícitos |
| Entradas adversariais ou arbitrárias | Não habilitadas por este teste | `ready_for_untrusted_targets=false` | Só uma fixture inerte tem escopo definido | Preparar próxima fixture estática controlada após resultado | Engenharia + proprietário | Rede/escrita/execução do alvo recusadas e limites verificados no executor adequado |

Reversão: não usar a saída e preservar a tentativa local para inspeção. O helper
não altera fonte, dependências, runtime, configuração global, Site ou bancos.
Se houver falha/interrupção com término incerto, verificar somente a unidade
própria da tentativa antes de repetir. Não remover diretórios ou encerrar processos
alheios como forma de retomada. O resultado bruto deve permanecer local.

## Execução e validação deste incremento

Em uma cópia confiável do Security Workbench que contenha o helper, após conferir
o checksum da versão fixada, executar sem argumentos:

~~~bash
bash scripts/rea-run-inert-fixture.sh
~~~

O resultado esperado contém `terminacao_unidade=confirmada`, o resumo JSON limitado
e o marcador `FIXTURE_NATIVA_CONCLUIDA`. O JSON deve manter cobertura semântica
`unknown`; typecheck, importação Workbench e prontidão para entradas não confiáveis
continuam false. Só esse retorno observado no WSL poderá concluir a prova. Em
falha, compartilhar apenas o código fixo e os marcadores; o Evidence e logs ficam
no diretório privado da tentativa. Não repetir antes de resolver término incerto.

Passaram 41 testes Node da base deste PR, incluindo seis do novo helper: sintaxe,
recusa de argumentos antes de comandos/escritas, Node ausente sem escritas, bytes
exatos da fixture, resumo sintético válido e 21 casos negativos de JSON/contrato.
Os seis testes do helper foram repetidos após acrescentar o digest declarado da
raiz ao resumo. A suíte não chamou REA, compilador, systemd ou Bubblewrap.
Passaram também sintaxe Bash externa/interna, Node `--check` do verificador e
`git diff --check`; revisão independente sem bloqueio crítico/alto para esse escopo.
Aplicativo web, dependências, TypeScript web e build não mudaram nem foram
retestados neste incremento. Não houve merge ou nova publicação do Site.
