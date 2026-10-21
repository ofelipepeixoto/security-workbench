# REA local: importação entregue e execução isolada bloqueada

## Resultado observado

Foi implementada a importação offline de um subconjunto do Evidence JSON estático do REA no núcleo Python/SQLite. Não foi concluída uma execução real do REA sobre artefato de terceiro. Fixtures de teste são autorais e explicitamente sintéticas; não são relatórios produzidos pelo REA. Nenhum código do alvo foi executado, nenhum serviço pago foi contratado e nenhuma sandbox foi declarada sem comprovação.

Verificação desta implementação: 25 testes Python passaram, incluindo 8 de importação, e 9 testes do parser web passaram. As projeções Python e Node foram comparadas sobre os mesmos bytes de três fixtures sintéticas (estrutural, benigna e observação runtime omitida) e produziram objetos idênticos. Há cobertura de escopo, preservação do estado candidate, revisão, relatório, comparação entre imports do mesmo analisador, rejeição de JSON malformado/duplicado e limites de entrada. São testes locais com fixtures; não homologam a execução REA nem a hospedagem. O parser web não acrescenta dependências.

O checkout separado do REA continua fixado em `3e7c6302233ecbcb9b92e43ee5a60337738961bd`, pacote declarado `rea-agents@6.4.0`, licença MIT com avisos de terceiros preservados. O `package-lock.json` tem SHA-256 `4d298e57d8424a14208f470446be51a0f61cdd932650059557acd5bc21009eb6` (conferir junto ao checkout antes de preparar outro runtime). A versão `1` do provider `rea-javascript-application` pertence ao contrato do analisador; não é a versão do pacote.

## Bloqueio real de isolamento

As falhas anteriores de namespaces de usuário/rede em `unshare` e `bwrap` foram preservadas como evidência histórica e não foram repetidas. Não houve tentativa de aumentar privilégios ou contornar essa restrição.

Nesta etapa, Node **24.19.0** com `--permission` apresentou permissões de filesystem, processos e workers negadas por padrão, mas **não bloqueou rede**. Uma fixture própria abriu exclusivamente TCP em loopback; um subprocesso `node --permission` conectou e recebeu a mensagem de controle. Isso demonstra que a flag não satisfaz o requisito sem rede. Não houve contato com alvo externo nesse teste.

Além disso, o controle em `src/javascript/analysis/JavaScriptAnalysisWorker.ts`, usado por `src/artifacts/javascript/JavaScriptSourceAnalysis.ts`, depende de processo filho, remove `NODE_OPTIONS` e inicia o worker somente com as flags de heap configuradas. As permissões do pai não são uma fronteira herdada pelo worker. Heap/timeout continuam limites úteis, mas não constituem sandbox de rede ou filesystem. Não chamar esse processo de container.

Docker, Podman, Firejail e nsjail não estavam disponíveis no diagnóstico. A mera presença de `systemd-run` não comprova um serviço de isolamento utilizável. Não foi instalado ou compilado o REA depois de demonstrada a falta de isolamento suficiente, pois isso não resolveria o gate de execução. O código do alvo permanece sem executar.

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

Somente se já estiverem instalados, consultar `docker version` e `wsl --status`. Não enviar credenciais, variáveis de ambiente, cookies ou fontes privadas no diagnóstico. WSL sozinho não garante isolamento de rede.

O próximo aceite de execução exige um mecanismo realmente disponível com rede desabilitada e entrada JS somente leitura, runtime REA fixado e rastreável, limites externos de bytes/tempo/memória e prova de que fixture com efeitos sentinela não escreve nem se conecta. Só então executar uma fixture benigna e uma adversarial com o REA real, preservar versão/digests/limites/horários, comparar a projeção com o resultado nativo e registrar custos observados. Essa prova permanece pendente.
