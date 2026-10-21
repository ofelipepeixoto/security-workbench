# Preparação limitada do runtime REA — 21/10/2026

Este procedimento retoma uma compilação que falhou. Não instala dependências,
baixa ferramentas, chama o motor de análise ou altera o Site. Não recebe caminhos
de alvo. Deve ser executado pelo proprietário no Ubuntu/WSL já preparado, sem sudo.
O Site v13 e o login GitHub já configurado são uma entrega hospedada separada;
esta preparação não exige configurar novamente OAuth, segredos ou a VPS.

## Evidência recebida do operador

O journal contém dois eventos separados da unidade `workbench-rea-compile`:

| Evento | Parede | CPU | Pico de memória | Resultado |
| --- | --- | --- | --- | --- |
| Execução encerrada pelo kernel | 3 min 9,762 s | 3 min 7,289 s | 2 GiB | `oom-kill` |
| Execução encerrada pelo prazo | 10 min 0,755 s | 7 min 50,349 s | 2 GiB | `timeout` |

Não há medição por subprocesso que permita atribuir os eventos ao TypeScript ou
ao bundler. Os cinco arquivos sentinela finais estavam ausentes ou vazios, o diff
rastreado estava vazio e o lockfile manteve SHA-256
`4d298e57d8424a14208f470446be51a0f61cdd932650059557acd5bc21009eb6`.
Não houve análise REA concluída nem vulnerabilidade descoberta nesse preparo.

## Mudança proposta

`scripts/rea-prepare-runtime.sh` divide o trabalho em emissão e empacotamento,
interrompendo no primeiro erro. Usa o mesmo TypeScript 7.0.2 fixado com
`-p tsconfig.build.json --noCheck --pretty false`, seguido do
`scripts/bundle-runtime.mjs` original. Mantém NodeNext, ES2023, diretórios,
metadados de release, import map e módulos de workers. Não substitui a ferramenta
por um pacote npm de outro commit.

A [documentação oficial do TypeScript](https://www.typescriptlang.org/docs/handbook/compiler-options.html)
define `noCheck` como emissão sem a checagem completa de tipos, preservando erros
críticos de parse/emissão. O suporte foi conferido no código nativo da versão
[7.0.2](https://github.com/microsoft/typescript-go/blob/typescript/v7.0.2/internal/tsoptions/declscompiler.go).
**Typecheck completo do motor permanece pendente**, mesmo se esse preparo terminar
com sucesso. Isso não altera a validação TypeScript do aplicativo web.

O script exige o checkout dedicado no commit
`3e7c6302233ecbcb9b92e43ee5a60337738961bd`, lockfile fixado, Node Linux 24.19.0
e o Bubblewrap privado 0.13.1 com digest do binário já fornecido pelo operador.
Não usa npm, scripts de instalação, rede ou fallback para o Bubblewrap do sistema.
Uma árvore rastreada alterada interrompe o preparo. Artefatos `dist` anteriores
são preservados fora do checkout antes da nova emissão; nenhuma limpeza recursiva
é feita pelo helper.

A espera do cliente tem prazo externo de 190 segundos, com TERM e mais dois segundos até KILL. Cada fase tem unidade própria: memória de 2 GiB, swap zero, 128 tarefas, quota de
uma CPU, prazo de 180 segundos e encerramento da família. Memória/swap/tarefas são
conferidos dentro da mesma unidade antes do Bubblewrap. Os namespaces isolam rede,
processos, IPC, UTS e usuário; `/usr` e o arquivo exato do Node são somente leitura,
diretórios necessários da ferramenta somente leitura, apenas o novo `dist` gravável e temporários privados. A raiz pessoal e `.git` não são montados. Nenhum arquivo do alvo
participa desse preparo. Os limites da futura análise precisam de prova própria.

Logs de cada fase ficam em arquivos locais privados. O limite de 16 MiB por
arquivo regular também se aplica às saídas de build; não é uma quota de disco
total nem um limite de pipe. Em falha, a apresentação limita-se aos últimos 4 KiB
no total, distribuídos entre os três logs da fase. O script não exporta os logs. Não enviá-los integralmente ao GitHub.

## Execução e resultado esperado

Após obter uma cópia confiável e conferir o checksum do helper fixado, executar:

~~~bash
bash scripts/rea-prepare-runtime.sh
~~~

As fases imprimem começo, fim, estado e segundos decorridos. CPU e pico de memória desta alternativa ainda não foram medidos; os valores da tabela anterior pertencem somente às tentativas que falharam. Sucesso exige sentinelas intermediárias
e finais não vazias, seus hashes, fonte rastreada e lockfile preservados. O marcador
final é `RUNTIME_PREPARADO_SEM_TYPECHECK`; `typecheck_complete=false` e
`ready_for_rea=false` permanecem explícitos. Não apresentar somente o início da
compilação como prova de sucesso. Uma falha preserva os arquivos e bloqueia o
próximo passo. Falha ou interrupção do cliente imprime terminação da unidade não
confirmada: o serviço pertence ao manager e pode continuar até seu próprio prazo;
não iniciar nova tentativa antes de conferir a unidade da fase. Não há cancelamento
do serviço inferido apenas pelo término do cliente; não habilitar rede ou relaxar controles para contorná-la.

## Pendências e reversão

| Item | Estado | Evidência | Bloqueio | Próxima ação | Responsável | Aceite |
| --- | --- | --- | --- | --- | --- | --- |
| Compilação completa | Falhou em duas execuções registradas | OOM e timeout acima; cinco sentinelas ausentes/vazias | Limites atingidos; fase exata desconhecida | Usar fases separadas com registro próprio | Engenharia + proprietário | Nenhuma falha tratada como runtime pronto |
| Emissão sem typecheck e bundle | Concluídos segundo retorno do operador | Helper fixado/hash conferido; emit status 0 em 4 s, bundle status 0 em 2 s e cinco hashes registrados abaixo | Nenhum bloqueio desse preparo; typecheck e análise são separados | Preservar runtime e seguir para a fixture própria | Proprietário com apoio da engenharia | Marcador final observado; fonte e lockfile verificados pelo helper antes e depois |
| Typecheck completo do REA | Pendente | Modo `--noCheck` declarado | Compilação completa não passou | Investigar custo e validar tipos separadamente | Engenharia | Checagem do commit fixado aprovada, sem esconder a exceção |
| Primeira análise REA | Não executada | Preparo concluído e pré-flight aprovado segundo o operador | Executor de análise e Evidence nativo ainda sem aceite | Primeiro fixture própria inerte, depois fixture estática controlada | Engenharia + proprietário | Evidence nativo, isolamento, limites, horários e projeção verificados |

Reversão: não usar o novo runtime; manter o diretório de tentativa e a cópia
preservada de `dist` para inspeção local. Nenhuma fonte, dependência, configuração
global, banco, serviço permanente ou versão publicada precisa ser revertida.
Não restaurar ou apagar diretórios automaticamente. A existência das cinco
sentinelas não comprova que o motor analisou dados, nem substitui a árvore `dist`
completa e as dependências congeladas necessárias ao runtime.

## Validação desta mudança

Passaram 35 testes Node da base #30 com este incremento, incluindo quatro testes
do novo helper: sintaxe Bash, argumentos recusados antes de comandos/escritas,
Node ausente sem criar arquivos e falha de emissão simulada com status 23. O último
exercita a preservação real de um `dist` próprio e bloqueia bundle e resultado final.
Passaram também `bash -n`, `git diff --check` e sintaxe dos seis blocos Bash dos
dois documentos. A revisão independente não identificou bloqueio crítico/alto.
Os testes não chamam systemd, Bubblewrap, compilador ou REA; não comprovam a execução
no WSL. Nenhuma dependência ou arquivo do aplicativo web mudou, portanto build web
e TypeScript web não foram repetidos para este incremento de shell/documentação.

## Resultado posterior do operador — runtime preparado

Em 21/10/2026, o operador forneceu checksum aprovado do helper no commit
`556976855559aefc8fb1c5556d6ccc87359375ef` (SHA-256
`82b8135d251053ff81912f305975ad4a7ab4cdd8c1de550bc830ff063c3130a3`),
emissão com status zero em 4 segundos e bundle com status zero em 2 segundos.
O marcador `RUNTIME_PREPARADO_SEM_TYPECHECK` foi observado. Os tempos são os
segundos decorridos informados pelo helper, não CPU ou pico de memória medidos.
A conclusão do helper implica os checks de fonte/lockfile e cgroups de cada fase
previstos naquela versão; não é prova dos limites da futura análise.

| Sentinela | SHA-256 fornecido pelo operador |
| --- | --- |
| `dist/generatedPackageMetadata.js` | `1469cc34329436e5b1b9c6a9d655f8120d59e6bdcb5b843e7bc0ccff9aff7eaa` |
| `dist/cli-runtime/cli.js` | `4d1a3f41a808135bf7580a431912bbf95703768ad129a33523402d3758ce7500` |
| `dist/cli-runtime/cliOutput.js` | `aac5314e8632c2f1b450d1e4f460b028ebc55b695d67c14fd0c3f2cdb486abab` |
| `dist/cli-runtime/cliResultOutput.js` | `52ac8c14f31e9e13697dd9308d782965eee607ded69838a8fd2f297ac0870038` |
| `dist/composition/javascriptAnalysisWorkerProcess.js` | `dce09f9721a5e82db8a39dd0f48bafc374b743108dc74ceedbc651851209c052` |

`typecheck_complete=false` e `ready_for_rea=false` permanecem esperados. O novo
[teste de fixture inerte](rea-fixture-inerte-2026-10-21.md) é um passo separado,
sem resultado nativo observado até este registro. Nenhuma análise, vulnerabilidade
ou prontidão para alvos arbitrários foi inferida a partir do build.
