# REA local: importação entregue e motor em preparação

## Resultado observado

Foi implementada a importação offline de um subconjunto do Evidence JSON estático do REA no núcleo Python/SQLite. Não foi concluída uma execução real do REA sobre artefato de terceiro. Fixtures de teste são autorais e explicitamente sintéticas; não são relatórios produzidos pelo REA. Nenhum código do alvo foi executado, nenhum serviço pago foi contratado e nenhuma sandbox foi declarada sem comprovação.

Verificação desta implementação: 25 testes Python passaram, incluindo 8 de importação, e 9 testes do parser web passaram. As projeções Python e Node foram comparadas sobre os mesmos bytes de três fixtures sintéticas (estrutural, benigna e observação runtime omitida) e produziram objetos idênticos. Há cobertura de escopo, preservação do estado candidate, revisão, relatório, comparação entre imports do mesmo analisador, rejeição de JSON malformado/duplicado e limites de entrada. São testes locais com fixtures; não homologam a execução REA nem a hospedagem. O parser web não acrescenta dependências.

O checkout separado do REA continua fixado em `3e7c6302233ecbcb9b92e43ee5a60337738961bd`, pacote declarado `rea-agents@6.4.0`, licença MIT com avisos de terceiros preservados. O `package-lock.json` tem SHA-256 `4d298e57d8424a14208f470446be51a0f61cdd932650059557acd5bc21009eb6` (conferir junto ao checkout antes de preparar outro runtime). A versão `1` do provider `rea-javascript-application` pertence ao contrato do analisador; não é a versão do pacote.

## Bloqueio real de isolamento

As falhas anteriores de namespaces de usuário/rede em `unshare` e `bwrap` foram preservadas como evidência histórica e não foram repetidas. Não houve tentativa de aumentar privilégios ou contornar essa restrição.

Nesta etapa, Node **24.19.0** com `--permission` apresentou permissões de filesystem, processos e workers negadas por padrão, mas **não bloqueou rede**. Uma fixture própria abriu exclusivamente TCP em loopback; um subprocesso `node --permission` conectou e recebeu a mensagem de controle. Isso demonstra que a flag não satisfaz o requisito sem rede. Não houve contato com alvo externo nesse teste.

Além disso, o controle em `src/javascript/analysis/JavaScriptAnalysisWorker.ts`, usado por `src/artifacts/javascript/JavaScriptSourceAnalysis.ts`, depende de processo filho, remove `NODE_OPTIONS` e inicia o worker somente com as flags de heap configuradas. As permissões do pai não são uma fronteira herdada pelo worker. Heap/timeout continuam limites úteis, mas não constituem sandbox de rede ou filesystem. Não chamar esse processo de container.

Docker, Podman, Firejail e nsjail não estavam disponíveis no diagnóstico do ambiente da engenharia. A mera presença de `systemd-run` não comprova um serviço de isolamento utilizável. Nesse ambiente, não foi instalado, compilado ou executado o REA. A preparação posterior no WSL do operador está registrada abaixo e é um ambiente separado. O código do alvo permanece sem executar.

## Uso local da importação

Use um Evidence obtido legitimamente por execução estática previamente isolada em ambiente apropriado, ou uma fixture sintética para testar somente o fluxo. A importação não inicia REA, rede, shell, browser, pacote do alvo ou instalador:

```bash
python3 -m workbench authorize --repo ofelipepeixoto/rea --repository-id 1417322346 --confirm-owned
python3 -m workbench import-rea --repo ofelipepeixoto/rea --revision SHA_COMPLETO_DE_40_HEXADECIMAIS --evidence /caminho/privado/rea-evidence.json
python3 -m workbench runs
python3 -m workbench report --run ID_DA_IMPORTACAO
```

O commit e o ID do repositório são declarações do operador vinculadas ao escopo local. O importador não consulta o GitHub, não confere os bytes do artefato, não valida assinaturas/digests internos do REA e não promove essa origem a `verified_revision`. O digest SHA-256 do arquivo JSON recebido é efetivamente calculado. A data da análise guardada no SQLite é a **data de importação**, não uma execução REA retrospectivamente comprovada. O banco local continua separado do D1 hospedado.

A leitura do arquivo JSON pela CLI foi testada em Linux e exige abertura com `O_NOFOLLOW`. Em plataformas sem essa primitiva, a leitura falha fechada; não há proteção portátil homologada contra reparse points do Windows. O parser de bytes em memória e o parser web não dependem dessa abertura de arquivo. O diagnóstico Windows abaixo não anuncia suporte de execução ou sandbox nessa plataforma.

Uma fixture segura, sem executar JS:

```bash
python3 -m scripts.rea_import_fixture > /caminho/privado/rea-synthetic.json
```

O arquivo declara explicitamente que é sintético. Seu objetivo é testar validação, revisão humana, relatório e comparação. IDs com formato REA não são certificados pelo importador. Não publicar JSON real, fontes do alvo ou conteúdo sensível no Git, demonstração ou logs.

## Contrato para o adaptador web

`workbench.rea.parse_rea_evidence(data: bytes)` recebe o **Evidence nativo**, não um array de vulnerabilidades. O CLI do REA documentado em código é `rea analyze-javascript-application DIRETORIO --json`; o resultado da aplicação fica em `normalized_result`. Fontes inspecionadas: `src/application/javascript/JavaScriptApplicationEvidence.ts`, `src/domain/evidence.ts`, `src/domain/javascript/javascriptApplicationAnalysis.ts` e os schemas de application graph/evidence.

O [schema de projeção](schemas/rea-evidence-import.schema.json) descreve o envelope aceito. Ele não substitui o schema completo do upstream nem todas as checagens do parser. O backend deve impor os mesmos limites antes da persistência:

| Fronteira | Limite ou regra |
| --- | --- |
| JSON recebido | 1 MiB, UTF-8 estrito; sem chaves duplicadas, NaN/Infinity ou surrogate inválido |
| Estrutura | profundidade 32, 25000 valores, strings de 16384 caracteres, chaves até 100 |
| Grafos | até 1000 nós, 2000 observações totais; no máximo 100 candidatos persistidos |
| Operação | `analyze_javascript_application`, predicate `rea.javascript-application-analysis`, provider `rea-javascript-application`/`1` |
| Identidade | digest raiz consistente com `subject.digest.sha256`; referências raiz presentes; digest/artifact_id consistentes por observação |
| Localização importada | source-range com caminho JS relativo POSIX de até 240 caracteres; sem traversal, URL, caminho absoluto, `.env` ou Markdown arbitrário |
| Natureza | somente autoridade AST/inferência estática, estado observado/inferido; observações runtime não viram candidatos |
| Persistência | somente projeção segura; nunca `properties.value`, trechos de código, URLs, local_path/input_path absolutos, raw_result ou environment |

Os tipos estruturais aceitos são endpoint, storage, worker/service-worker, context-bridge-api, ipc-handler e browser-window. Cada observação aceita vira `rea-structural-TIPO`, **candidate**, confiança **low**, evidência genérica com caminho/linha e digest declarado. Presença de um endpoint ou armazenamento não é falha. `statistics.findings` é uma contagem interna do REA, não quantidade de vulnerabilidades.

A saída usa o formato do scanner: `snapshot_digest`, `files_read`, `bytes_read`, `partial: true`, `findings`, `dependencies: []`, `omissions` e `provenance`. Cobertura e contagens herdadas são sempre **declaradas**. `provenance.schema` é `security-workbench.rea-import/v1`, com `report_sha256` observado, identificadores/digest do artefato declarados e flags de execução, rede e bytes do artefato verificadas como false. O SHA/versão do código inspecionado descrevem a origem do contrato; não atestam o binário que produziu um JSON externo.

Revisão e comparação reutilizam a semântica existente: candidatos não mudam de estado por afirmação do JSON; somente revisão humana altera a decisão. Comparar ferramentas ou coberturas diferentes não comprova correção de uma vulnerabilidade. A comparação local recusa misturar import REA com outra origem. Todos os imports permanecem parciais.

## Menor diagnóstico no Windows para retomar execução

No computador do operador, sem instalar nem atualizar software automaticamente:

```powershell
node --version
Get-Command node, docker, wsl -ErrorAction SilentlyContinue | Select-Object Name, Source
if (Get-Command docker -ErrorAction SilentlyContinue) { docker version } else { Write-Output "Docker não disponível; nenhuma instalação foi iniciada." }
```

Somente se já estiverem instalados, consultar `docker version` e `wsl --status`. Em Windows sem WSL instalado, a presença de `wsl.exe` não comprova instalação e os comandos podem abrir o instalador; não os tratar como diagnóstico sem efeitos em todas as versões. Não enviar credenciais, variáveis de ambiente, cookies ou fontes privadas. WSL sozinho não garante isolamento de rede.

O operador confirmou nesta conversa Windows/PowerShell, Node **24.19.0**, Docker ausente e, depois do prompt do Windows, instalação concluída do WSL **3.0.3**, e Ubuntu em WSL **2**, kernel `6.18.54.1-microsoft-standard-WSL2`, arquitetura x86_64 e Bubblewrap **0.11.1**. O operador confirmou Node Linux 24.19.0 com checksum oficial e uma sandbox benigna com cinco namespaces retornando zero. Uma unidade transitória própria mostrou `memory.max=536870912`, `memory.swap.max=0` e `pids.max=32`; são resultados relatados pelo operador, sem execução do REA. O [helper e guia do PR #30](https://github.com/ofelipepeixoto/security-workbench/pull/30) verificam rede e entrada somente leitura separadamente. O operador baixou o helper no commit `1b0c93114d7a215aa73844e5a7edd62620dd25eb`, conferiu seu SHA-256 `8dbafa2690bd4dd90e7aa6e60dfd4af5b0139a77b4462625e3676be39d1cc535` e forneceu JSON com `passed:true` e os 12 checks true. `memory_enforced` e `ready_for_rea` permanecem false: o motor ainda não foi preparado e o executor deverá aplicar os limites à própria família de processos. O Ubuntu usa uma VM leve gerenciada no Windows, sem inicialização dupla; isso prepara ferramentas Linux e não comprova sandbox. [Instalação oficial](https://learn.microsoft.com/pt-br/windows/wsl/install) e [arquitetura WSL 2](https://learn.microsoft.com/pt-br/windows/wsl/compare-versions).

Após instalar a distribuição, conferir `wsl --list --verbose`. Somente usando o nome exato retornado e uma distribuição existente, consultar `wsl --distribution NOME --exec uname -r` e `wsl --distribution NOME --exec sh -lc 'command -v node bwrap unshare timeout'`. Esses resultados orientarão o isolamento; não iniciar o REA nem presumir que o Node Windows esteja disponível no Linux.

### Preparação confirmada depois do pré-flight

O operador confirmou Git 2.53.0, checkout dedicado do próprio REA no commit `3e7c6302233ecbcb9b92e43ee5a60337738961bd`, lockfile conferido e npm separado 11.16.0. O tarball oficial desse npm teve SHA-256 `30fc15697c771002878665c29f49dddde9aa8667fa5719854b2f52d3cd19230b` conferido. A instalação `npm ci --ignore-scripts --include=dev --include=optional`, com ambiente mínimo, configuração e cache dedicados, terminou com **409 pacotes**. O lockfile permaneceu íntegro e `scripts/check-dependency-install.mjs` passou, com `DEPENDENCIAS_OK`. A instalação usou rede para obter as dependências; não foi uma análise offline. O aviso de manutenção de `prebuild-install@7.1.3` não impediu a instalação. Esses pacotes pertencem ao motor REA e não estão cobertos pela contagem de três entradas residuais do audit web.

A unidade de instalação solicitou 2 GiB, swap zero, 128 tarefas, quota de uma CPU e 600 segundos; isso não é medição de consumo nem verificação de limites da futura análise. A compilação offline da ferramenta foi preparada e revisada no [guia do PR #30](https://github.com/ofelipepeixoto/security-workbench/pull/30), a tentativa de compilação completa falhou conforme atualização abaixo; não houve execução do motor.

### Verificação adicional do pacote de isolamento

A fonte primária [GHSA-pxhw-h44j-8pfx / CVE-2026-87766](https://github.com/containers/bubblewrap/security/advisories/GHSA-pxhw-h44j-8pfx) informa correção upstream em Bubblewrap 0.12.0. A condição depende de criar destinos durante o setup sob conteúdo de filesystem controlado por atacante. Ela não foi identificada no comando de compilação com destinos fixos e sem arquivos de alvo. Não há exploração observada. A versão completa do pacote Ubuntu ainda não foi consultada; `bwrap --version` 0.11.1 não informa backports. O [USN-8779-2](https://ubuntu.com/security/notices/USN-8779-2) reverteu o patch anterior por regressão, portanto o aviso anterior isolado não comprova correção. Consultar pacote e correção aplicável antes de usar entradas não confiáveis, sem upgrade implícito ou remoção de controles.

O operador inicialmente confirmou instalado/candidato `0.11.1-1ubuntu0.1`. Depois atualizou os índices oficiais com sucesso: instalado permaneceu `0.11.1-1ubuntu0.1` e candidato passou a `0.11.1-1ubuntu0.3`. A simulação mostrou um upgrade, zero novos, zero remoções e 130 não atualizados; essa simulação não instalou ou atualizou pacotes. O candidato 0.3 é a reversão do USN-8779-2 e não fecha o gate. O caminho preparado no [PR #30](https://github.com/ofelipepeixoto/security-workbench/pull/30) usa Bubblewrap upstream 0.13.1 em prefix privado, com fonte/hash fixados e pré-flight explicitamente no executável separado; não substitui o binário do sistema, adiciona PPA ou desabilita AppArmor. O resultado posterior das ferramentas está registrado abaixo; build e teste desse binário ainda estão pendentes.

Posteriormente, o operador forneceu `FERRAMENTAS_BWRAP_OK`: GCC 15.2.0, Python 3.14.4, Meson 1.10.1, Ninja 1.13.2 e libcap 2.75. APT instalou 44 pacotes e atualizou cinco dependências necessárias, sem remoções ou upgrade global; 126 não atualizados. Foram obtidos 86,6 MB, e APT previu 277 MB adicionais sem medição posterior do disco. Python 3.14.4 é o runtime observado da preparação Meson, não homologação do núcleo Workbench/Python 3.12. O build privado Bubblewrap foi preparado/revisado no guia #30, mas ainda não executado pelo operador. A engenharia conferiu separadamente o tarball oficial de 129472 bytes pelo SHA-256 publicado, sem extrair, compilar ou executar seu fonte.

O operador posteriormente concluiu os sete passos C/link e instalação do Bubblewrap privado: `bubblewrap 0.13.1`, `BWRAP_COMPILADO_OK` e SHA-256 do executável `d7e217424a96140625d3e83df81e66a9e91de40ed9f882d07505da99fa005a76`. Isso comprova o build relatado da ferramenta, sem comprovar seu pré-flight ou execução REA. O guia #30 prepara o pré-flight desse mesmo binário com hash conferido e verificações cgroup dentro da própria unidade que o inicia; ainda sem resultado do operador.

Depois, o operador forneceu checksum do helper fixado `7e2dd12` aprovado, `LIMITES_PREFLIGHT_OK` e JSON `passed:true` com os 12 controles true no Bubblewrap privado 0.13.1. Os limites 512 MiB/swap zero/32 tarefas foram verificados dentro da própria unidade que iniciou esse pré-flight. Não houve recusa de namespace nesse percurso. O JSON continua com `memory_enforced:false` e `ready_for_rea:false` por contrato; isso não invalida a verificação externa da unidade, mas impede inferir prova do futuro engine. O guia seleciona o binário privado conferido para a compilação REA, cuja tentativa posterior está registrada abaixo.

O próximo aceite exige o runtime REA compilado e rastreável e aplicação/verificação dos limites externos de bytes/tempo/memória à própria família de processos do engine. O pré-flight aprovado não é uma auditoria completa ou garantia para usos arbitrários da sandbox. Executar primeiro a fixture própria inerte, sem importar ou executar seu JavaScript, e só depois uma fixture adversarial estática controlada. Preservar versão/digests/limites/horários e comparar a projeção com o Evidence nativo. Essa prova permanece pendente.

### Compilação completa falhou — retomada com fases separadas

O operador forneceu cinco sentinelas `dist` ausentes ou vazias, diff rastreado vazio e lockfile ainda com SHA-256 `4d298e57d8424a14208f470446be51a0f61cdd932650059557acd5bc21009eb6`. O journal contém dois eventos separados: `oom-kill` com parede 3 min 9,762 s/CPU 3 min 7,289 s/pico 2 GiB, e `timeout` com parede 10 min 0,755 s/CPU 7 min 50,349 s/pico 2 GiB. Não há medição por subprocesso para atribuir o consumo a uma fase específica. Não houve runtime compilado nem análise REA concluída.

O [PR #31](https://github.com/ofelipepeixoto/security-workbench/pull/31), baseado no #30, implementa emissão TypeScript com `--noCheck` e empacotamento original em unidades separadas, mantendo commit/lockfile e limites de 2 GiB/uma CPU, com prazo menor por fase e logs locais limitados. A checagem completa de tipos do motor fica explicitamente pendente; isso não altera o TypeScript do aplicativo web já testado. O helper publicado no commit `556976855559aefc8fb1c5556d6ccc87359375ef` foi conferido byte a byte e passou em quatro testes de recusa/preservação/falha simulada; a suíte dessa base teve 35 testes Node aprovados. Não houve execução de systemd, Bubblewrap, compilador ou REA nos testes. O resultado nativo no WSL continua pendente. Nenhuma ampliação de memória, rede, escopo ou uso da VPS foi feita para contornar a falha.
