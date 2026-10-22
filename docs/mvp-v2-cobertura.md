# MVP v2 — manifesto de cobertura e referência pública

Manifesto `mvp-v2-cobertura/1`, preparado em **22/10/2026 UTC**. Base inspecionada:
`63d694f705191bec6c7692fc68c554907d10a212`. Este é um contrato de cobertura da
implementação existente e de seus próximos aceites, não uma declaração de
lançamento multiusuário ou de segurança integral. As mudanças posteriores devem
registrar seu próprio commit e repetir a validação afetada.

Foram lidos o prompt v2 completo, README, implementação, testes, contrato REA e
[homologação anterior](homologacao-2026-10-21.md). Não houve nesta tarefa scan de
site/repositório real, nova aquisição de GitGuard, chamada REA ou consulta de
alertas. A fixture já executada pelo operador não foi reinstalada nem repetida.

## Conjunto mínimo da release

Manter os motores autorais determinísticos e a importação REA existentes. Eles
funcionam sem SDK de IA, assinatura de scanner ou novo banco. As extensões de
arquivos aceitas **não equivalem a análise semântica dessas linguagens**. O produto
deve anunciar duas regras textuais limitadas, inventário de manifestos raiz e
importação estrutural, indicando a cobertura indisponível em cada análise.

| Etapa | Existente nesta base | Local da execução e saída | Limite / próximo aceite |
| --- | --- | --- | --- |
| Aquisição autorizada | `web/lib/scanner.mjs` | Servidor Workers: API GitHub pública, nome/ID, SHA, árvore e blobs; hash Git dos bytes e digest SHA-256 do subconjunto | Somente públicos de `ofelipepeixoto`, sem token; login não concede privados. Catálogo/App/multiusuário precisam de contratos e testes próprios. |
| Classificação/exclusões | Filtro `eligible` e orçamento de aquisição | Servidor: ordenação de caminhos por bytes UTF-8; somente arquivos regulares elegíveis | Exclusões de tipo/pasta não são contadas integralmente hoje; `partial=false` significa ausência de omissão registrada, não cobertura do repositório inteiro. |
| Regras estáticas | Duas regras textuais, abaixo | Servidor: bytes lidos como texto; nenhum import, build, script ou instalação do alvo | Candidatos, sem validação de credencial ou exploração; não é SAST completo. |
| Dependências | Inventário direto de dois manifestos raiz | Servidor: nome, especificação de versão e origem | Não resolve transitivas, lockfile, intervalos instalados ou CVEs; correlação de advisories **indisponível**. |
| REA importado | `web/lib/rea-import.mjs`; equivalente local `workbench/rea.py` | Parser offline do Evidence recebido; projeção segura em D1 ou SQLite, conforme ambiente | Não executa REA, não autentica produtor nem vincula o artefato ao commit. Todas as importações são parciais. |
| Normalização/revisão/relatório | Serviço, fingerprints, decisões e Markdown | Servidor: decisões humanas persistidas, comparação por fingerprint e exportação | Versão de regra/severidade motivada não persistidas em cada finding; comparação não comprova correção. |
| Explicação por IA | Proposta, desligada | Nenhum modelo ou ferramenta de agente no scanner | Opcional depois dos gates de dados, autorização, avaliação e orçamento. |

O scanner web atual é aguardado dentro da requisição HTTP, com prazo de aquisição
de 45 segundos. Um registro `running` no D1 não constitui fila durável: recuperação,
cancelamento e execução longa em job independente permanecem requisitos da v2.
Não anunciar percentual de progresso sem medição nem converter erro em zero achados.

## Manifesto dos motores, versões, licenças e custo

As regras autorais ainda não têm versão própria registrada nos resultados. Para
esta revisão, sua identidade reproduzível é o commit acima; `0.1.0` é a versão do
pacote web, não uma certificação de cobertura. Alterar uma regra exige versioná-la,
avaliar a comparação histórica e guardar a versão de execução sem reescrever dados.

| Motor / estado | Linguagem ou entrada | Ferramenta / regra ou base | Licença e manutenção | Custo operacional desta fase |
| --- | --- | --- | --- | --- |
| Texto de possíveis segredos — existente | Textos elegíveis, incluindo Python, JS/JSX, TS/TSX e configurações | `inspectText` / `possible-secret`; regex autoral, commit fixado, sem base externa | MIT do Workbench; mantenedor do projeto revisa regex/fixtures. Não há SLA de detecção. | Sem licença/API adicional; CPU/bytes do Worker e requisições GitHub, dentro das cotas existentes. |
| Permissões Actions — existente | Caminhos sob `.github/workflows/` e linha `permissions: write-all` | `inspectText` / `broad-workflow-permissions`; regex autoral, commit fixado | MIT do Workbench; manutenção da regra e de seus testes no próprio projeto | Mesmo passe de texto, sem chamada paga. |
| Inventário — existente | `package.json` e `requirements.txt` **na raiz** | `dependencies`/`devDependencies` e linhas Python `nome==versão`; sem base de advisories | MIT do Workbench; revisar formatos aceitos e redação antes de ampliar | Sem serviço externo; não transmite inventário a fornecedor de CVEs. |
| Projeção REA — existente | Evidence JSON nativo do provider aceito | `security-workbench.rea-import/v1`; provider `rea-javascript-application` versão `1`; contrato inspecionado no REA `3e7c6302233ecbcb9b92e43ee5a60337738961bd`, pacote `6.4.0` | Adaptador MIT do Workbench. REA declara MIT; preservar seus avisos de terceiros. Versão do pacote não autentica o produtor externo. | Parser e persistência existentes; não exige instalar REA em todo computador nem serviço pago. |
| REA nativo — fixture própria somente | Artefato JS local explicitamente fixado; importação admite localização `.js/.mjs/.cjs/.jsx` | Checkout/lockfile fixados no [registro REA](rea-execucao-2026-10-21.md); Node 24.19.0 do operador; provider estático | REA `rea-agents@6.4.0`, MIT com termos de componentes próprios. Atualizar por revisão de compatibilidade, não pelo número da versão apenas. | Máquina existente; sete segundos decorridos na fixture não estimam CPU/memória ou preço de executor hospedado. |
| Correlação SCA/CVE — proposta, fora desta fatia | Ecossistema, pacote e versão resolvida | Fonte e versão da base/cache ainda não selecionadas | Avaliar licença, atualização, cobertura, quota e privacidade antes de adotar | Nenhuma contratação ou consulta real adicionada. |
| SAST amplo/segredos especializados — fora desta release | Análise semântica, histórico Git, padrões de provedores etc. | Nenhum motor adicional selecionado/instalado | Comparar compatibilidade, licença, manutenção e precisão quando o caso exigir | Sem custo novo autorizado; não confundir a skill com ferramenta instalada. |

A licença autoral está em [LICENSE](../LICENSE); proveniência/avisos do adaptador
estão em [web/PROVENANCE.md](../web/PROVENANCE.md). Não se afirma ausência de custo
de hospedagem: consumo e plano existentes precisam de medição; nenhum serviço novo
foi contratado. O núcleo Python 3.12 usa biblioteca padrão e SQLite separado do D1.

## Regras executáveis e falsos negativos conhecidos

| Regra / inventário | Positivo esperado e evidência existente | Negativo esperado e evidência existente | Limite que precisa aparecer ao usuário |
| --- | --- | --- | --- |
| `possible-secret` | Atribuição entre aspas com chave `api_key`, `access_token`, `secret`, `password` ou `private_key` e valor com pelo menos oito caracteres produz `candidate`; fixture de paridade e redação em `scanner.test.mjs` | Prefixos `${`, `<`, `your_`/`your-`, `changeme`, `example`, `placeholder`, `dummy`, `test_`/`test-` são tratados como placeholders; teste de fixture não salva o valor | Primeira correspondência de atribuição por linha; não valida credencial, entropia, segredo multilinha/sem aspas, histórico ou todos os formatos. Caminhos contendo `/test` ou `fixture` diminuem confiança para `low`, sem eliminar candidato. Demais casos usam `medium`. |
| `broad-workflow-permissions` | Linha `permissions: write-all` em workflow gera `candidate` de confiança `high`; fixture de paridade verifica texto/fingerprint | Fora do caminho de workflows, a regra não se aplica; escopos específicos de leitura não devem disparar. Falta fixture negativa dedicada de YAML equivalente/escopos para esse aceite | Não há parser YAML nem interpretação de gatilhos, permissões herdadas, jobs, aliases ou efetividade do token. Confiança alta na correspondência textual não equivale a impacto alto confirmado. |
| Inventário npm | `package.json` raiz: strings em `dependencies`/`devDependencies` preservadas; testes verificam grupos e redação de especificações com URL/credencial | `sub/package.json` não entra no inventário; testes verificam ausência. JSON inválido não vira evidência de pacote | Não inclui `optionalDependencies`, peers, workspaces aninhados, lockfiles, SBOM completo ou versão transitiva efetiva. Especificação insegura vira `[REDACTED]`. Erro de manifesto hoje não produz diagnóstico individual de cobertura. |
| Inventário Python | `requirements.txt` raiz com `nome==versão`; fixture de paridade | Linha não fixada `nome>=versão` é ignorada no teste; fontes/credenciais não viram versão | Não resolve markers, extras, includes, hashes, índices, ranges, poetry/uv ou transitivas. Ausência no inventário não significa ausência de dependência. |
| `rea-structural-TIPO` | Nó estrutural aceito com autoridade estática, artefato e source-range válidos produz `candidate`/`low`; fixtures JS e Python | Observação runtime/autoridade desconhecida/tipo fora do subconjunto é omitida com motivo; texto externo `confirmed` e código sentinela não confirmam nem executam nada | Endpoint, storage ou IPC presentes são superfície estrutural. Nenhuma vulnerabilidade é inferida apenas pela presença. Hashes internos e contagens de origem continuam declarados. |

O fingerprint textual combina tipo, caminho e detalhe da regra, sem o valor
sensível nem a linha; ocorrências da mesma chave no mesmo caminho podem compartilhar
identidade. No importador REA, ele inclui o ID declarado da observação. Comparar
contagens brutas, IDs ou linhas não prova deduplicação sem perda, equivalência entre
motores ou correção verificada. Essas diferenças precisam de aceite antes de
prometer comparabilidade entre versões de regra.

## Arquivos e orçamento da aquisição web

| Fronteira | Política desta base |
| --- | --- |
| Texto elegível | `.py`, `.js`, `.jsx`, `.ts`, `.tsx`, `.json`, `.yml`, `.yaml`, `.txt`, `.toml`, `.ini`, `.cfg`, e `Dockerfile`/`requirements.txt`; leitura textual, sem semântica universal |
| Não elegível | `.mjs` e `.cjs` no scanner GitHub atual; outras extensões; qualquer basename que comece com `.env`; pastas `.git`, `.data`, `.venv`, `venv`, `node_modules`, `dist`, `build`, `__pycache__` |
| Tipo/caminho | Somente blobs Git regulares `100644`/`100755`; sem links simbólicos, submódulos, traversal, caminho absoluto, controles ou barra invertida; não segue redirects da API |
| Entrada | Até 20 blobs adquiridos, 2 MiB totais e 256 KiB por arquivo; binário com NUL consome orçamento de aquisição e não vira texto analisado |
| Transporte | Prazo compartilhado de 45 s, abort tipado e cleanup sem espera ilimitada; até 4 MiB por resposta JSON; requisições ao host fixo GitHub, sem cookie/token |
| Resultado | Até 100 candidatos, 500 dependências e 50 mensagens de omissão retornadas; totais detectados preservados quando o cap do scanner é excedido |
| Cobertura | Árvore truncada, arquivo grande/binário/tipo não regular e limites geram omissão/parcialidade; exclusões não elegíveis não geram inventário completo de omissões nesta base |
| Falha | Identidade/commit/tree/blob/hash divergentes recusam resultado; quota e timeout não são resultados limpos nem autorizam retries infinitos |

Núcleo local: 5.000 arquivos, 25 MiB totais, 1 MiB por arquivo; aquisição GitHub
Python limita resposta a 8 MiB e timeout de transporte a 20 s por chamada. Não
transferir o prazo global de 45 s do web para a CLI por suposição. O modo snapshot
local declara o commit, enquanto a aquisição GitHub verifica os bytes lidos.

**Aceite P0 de transparência ainda exigido:** mostrar linguagens/formatos cobertos,
seleção limitada e exclusões mesmo quando nenhum candidato aparece; registrar
contagens/motivos dos omitidos de forma estável, inclusive manifesto inválido e
formato não suportado. Um resultado sem regra aplicável deve indicar essa lacuna,
sem inventar CVE zero, porcentagem de segurança ou cobertura total.

## REA: contrato aceito e execução separada

O [schema](schemas/rea-evidence-import.schema.json) descreve o envelope; os parsers
impõem checagens adicionais. Aceitam `analyze_javascript_application`, predicate
`rea.javascript-application-analysis`, provider `rea-javascript-application`/`1`,
authority `shipped-artifact`, confidence `derived`, formato `directory`/`asar`
declarado e `JavaScriptApplicationGraph`. Aceitar a declaração `asar` no JSON não
executa nem descompacta um ASAR no Workbench.

| Fronteira REA | Limite e semântica |
| --- | --- |
| Bytes/JSON | Até 1 MiB, UTF-8 estrito, sem chave duplicada, número não finito ou surrogate inválido; sem eval/reviver |
| Estrutura | Profundidade 32, 25.000 valores, strings 16.384 caracteres, chaves 100; 1–1.000 nós, até 2.000 observações e 1–32 raízes válidas |
| Estatísticas declaradas | Até 5.000 arquivos relevantes, 25 MiB de texto e 1.000.000 findings nativos; são validações numéricas, não bytes inspecionados pelo importador |
| Subconjunto importado | `endpoint`, `storage`, `worker`, `service-worker`, `context-bridge-api`, `ipc-handler`, `browser-window`; autoridades AST/inferência estática; estados observado/inferido |
| Localização | Caminho relativo POSIX `.js/.mjs/.cjs/.jsx`, até 240 caracteres, intervalo de fonte coerente; sem URL, absoluto, traversal ou componente `.env` |
| Projeção | Até 100 candidatos; evidência genérica mascarada. Não persiste `properties.value`, código, URL, raw_result, environment ou caminho absoluto |
| Proveniência | SHA-256 do Evidence recebido é observado; raiz/artefato/commit/produtor são declarados. `execution_verified`, `network_isolation_verified`, `artifact_bytes_verified` permanecem `false` |
| Omissões | Primeiro filtro por observação: tipo, autoridade, estado, artefato/localização, localização sem source-range, duplicação ou limite. Recebidas = importadas + omitidas; soma de motivos = omitidas nos novos registros |

A primeira fixture própria já analisada pelo operador teve **342 bytes, sete
segundos e zero falhas de parse**, com término confirmado. A importação existente
persistiu como parcial, quatro observações recebidas/omitidas e zero candidatos;
o legado não permite reconstruir motivos individuais. O grafo declarou aplicação
`complete` e semântica `unknown`. Isso não é REA sobre GitGuard, typecheck completo,
ensaio com entradas externas nem homologação de um executor público.

Permanece suportada a importação sem instalar o motor para todos os usuários.
Execução hospedada é outra entrega: processo separado, sem rede após aquisição,
entrada/runtime somente leitura, escrita efêmera, sem credenciais e sem executar
scripts/instalar dependências do alvo; impor CPU, memória, processos, tempo, bytes
e tamanho/profundidade internos à família do engine. Validar symlinks, traversal,
compactados e expansão antes de aceitar entradas. Typecheck completo e robustez
do parser/limites aninhados continuam gates. Não implementar isso como processo
nativo dentro do Worker HTTP nem liberar entradas arbitrárias pela prova da fixture.

## Resultado e revisão humana

Existem os estados `candidate`, `confirmed`, `false_positive`, `accepted_risk`.
Observação/hipótese são qualificações da evidência, não estados independentes
implementados nesta base. Somente decisão humana pode marcar `confirmed`; isso não
cria automaticamente uma prova de exploração ou validação de correção.

O resultado atual preserva tipo, fingerprint, arquivo/linha inicial, confiança,
evidência mínima, impacto possível e recomendação, além da origem/SHA/cobertura da
análise. **Faltam campos uniformes de ferramenta/versão de regra, intervalo completo,
severidade e justificativa, base/horário de advisory e validação de correção.** Não
preencher retroativamente com valores inventados. Este manifesto define essas
lacunas; o aceite da v2 deve vincular a configuração/versão efetivamente executada
ao job, preservar o legado e demonstrar dois usuários isolados nas rotas de revisão,
comparação e exportação. Nova execução sem detecção é `no_longer_detected`, não
“corrigido verificado”.

## Plugin e OpenAI opcional

| Classe | Papel real nesta entrega | Evidência / limite |
| --- | --- | --- |
| A — orientação | Skill Sênior Global de Cibersegurança aplicada ao desenvolvimento e à revisão deste contrato | Metodologia de confiança, evidência e limites; não é endpoint nem motor que o Site chama |
| B — controles | Regras, autenticação, autorização, hashes, parser estrito, redação e revisão humana no código | Controles determinísticos com testes; não diagnóstico de modelo |
| C — política de agente | Ausente do backend operacional nesta base | Roadmap/Markdown não instala agente nem ciclo de ferramentas |
| D — modelo/API | Ausente; proposta opcional desligada | Nenhum provedor, SDK ou chave adicionado; nenhuma chamada real nesta fase |

**Decisão OpenAI: orçamento de chamadas reais R$ 0 nesta fase.** O MVP precisa
funcionar sem IA paga. Nenhum SDK é necessário para o manifesto, as regras ou o
importador. Preparar futuramente uma interface desativada de explicação de evidência
mascarada, usando mocks claramente identificados; não alegar integração real.

Antes de habilitar, definir projeto/conta/modelo, teto por usuário/análise,
finalidade, categorias de dados, retenção e autorização para código privado; chave
somente no backend aprovado. Não transmitir repositório inteiro/segredo ou dar ao
modelo ferramentas de escrita/execução. README/código/resultados são dados não
confiáveis, inclusive instruções de prompt injection. A saída deve referenciar
evidências existentes, ser validada e lidar com recusa/resposta incompleta, sem
confirmar achados ou aplicar patches automaticamente.

Fontes oficiais OpenAI consultadas em 22/10: [saída estruturada](https://developers.openai.com/api/docs/guides/structured-outputs)
documenta esquema JSON e suas limitações; [controles de dados](https://developers.openai.com/api/docs/guides/your-data)
distinguem estado de aplicação e logs de monitoramento. `store:false` não comprova
retenção zero. Nenhum preço/modelo/plano foi presumido ou contratado; comparar
precisão, falsos positivos, referências, custo e latência contra o baseline antes
de pedir ativação.

## GitGuard: matriz pública, sem análise adicional do alvo

Reutiliza exclusivamente a [observação pública já registrada](gitguard-observacao-2026-10-21.md):
aquisição de 22/10 às 00:22–00:23 UTC, HTML principal/login e **2 de 23 scripts
first-party**, GET TLS sem credenciais, 1 MiB/20 s por recurso, URLs/digests no
registro. Não houve nova consulta aqui, execução de JS, conta externa, envio de
repositórios, REA sobre GitGuard ou recuperação de backend. Alegações do fornecedor
não provam ferramentas, versões, licença do backend, isolamento ou eficácia.

| Jornada | Anunciado / fonte pública registrada | Observado e limite | Necessidade / alternativa autoral | Prioridade | Aceite Workbench |
| --- | --- | --- | --- | --- | --- |
| Entrar | Login GitHub | HTML de login; callback/sessão externos não exercitados | Entrada GitHub e estados de sessão/integração separados | P0 | Login não marca App como instalada nem libera privados. |
| Conectar | Termos distinguem OAuth e GitHub App | Declaração pública; escopos instalados não observados | Conectar instalação selecionada, leitura mínima no servidor | P0 | Interseção usuário/instalação; suspensão/revogação bloqueiam aquisição. |
| Escolher repositório | Ajuda cita organizações/App | Catálogo autenticado não observado | Catálogo paginado, busca, dono, visibilidade e permissão | P0 | Todos os autorizados; seleção parcial e estados vazio/pendente/erro/incompleto distintos. |
| Analisar | Categorias e painel na apresentação | Exemplos comerciais; execução não verificada | Confirmar repositório/SHA/configuração/limites antes do job | P0 | Listar não analisa; origem/SHA/motor registrados, cancelamento e parcialidade claros. |
| Evidências | Achados por categoria | Exemplos públicos não são achados auditados | Evidência mínima mascarada, regra, localização, confiança e limite | P0 | Cada conclusão tem origem; estrutura não vira falha confirmada automaticamente. |
| Cobertura | Código, dependências, segredos e inventário | Categorias anunciadas; motores/eficácia não auditados | Manifesto executável de cobertura e omissões | P0 | Inventário sem base CVE diz correlação indisponível; zero achados não comprova segurança. |
| Priorizar | Ajuda descreve filtros/supressões de fixtures/dev/sem patch | Política documentada, não exercitada | Filtros explícitos por contexto e decisão humana | P1 | Não descartar/rebaixar automaticamente por devDependency, fixture ou falta de patch. |
| Revisar/comparar | Ajuda documenta ambas | Ações autenticadas não observadas | Decisão rastreável e comparação compatível | P0 | Recarga preserva revisão; não detecção posterior não confirma correção. |
| Exportar | Apresentação/ajuda de relatório e exportação selecionada | Arquivo externo real não recebido | Markdown autoral com cobertura, decisões e fontes | P0 | Arquivo efetivamente salvo/aberto/conferido; autorização por objeto na exportação. |
| Operar | Central de Confiança declara containers, rede, retenção e limites | Declarações do fornecedor, sem auditoria da infraestrutura | Importação local agora; executor próprio separado depois | P0 para limites; executor depois | Isolamento demonstrado na chamada, sem credenciais; destruição e limites testados. |

As fontes primárias do estudo são a [página](https://www.gitguard.com.br/en),
[login](https://www.gitguard.com.br/login), [termos](https://www.gitguard.com.br/en/terms),
[ajuda](https://www.gitguard.com.br/en/support) e [Central de Confiança](https://www.gitguard.com.br/en/confianca).
As alternativas são implementação autoral: não copiar marca, textos, assets,
chunks, interface proprietária ou políticas de supressão para alegar equivalência.
Um futuro processamento de artefato público exige manifesto fechado e revisão
específica dos gates externos; esta matriz não o autoriza.

## Verificação desta fatia e aceite restante

Foram repetidos somente testes locais dos motores/importadores e da revisão
local com fixtures sintéticas, sem rede ou execução de código do alvo:

| Comando / ambiente em 22/10 | Resultado observado | O que não prova |
| --- | --- | --- |
| Em `web`: `node --test tests/scanner.test.mjs tests/rea-import.test.mjs` — Node 24.19.0 | **26/26 aprovados**; identidade/hash, limites, redação, paridade, JSON/Markdown hostis e omissões | GitHub App, jornada real de dois usuários, download salvo ou execução nativa REA |
| Na raiz: `python3 -m unittest tests.test_flow tests.test_dependency_privacy tests.test_rea_import -v` — Python 3.12.14 | **16/16 aprovados**; fluxo local, importação, leitura segura, revisão, comparação e privacidade | Banco D1, migração/isolamento hospedados, Windows nativo ou typecheck completo do REA |

Não foram repetidos build, CI, smoke live, análise nativa, upload existente ou QA
publicada nesta fatia documental. A entrega conjunta precisa de seus checks e
evidências de código/commit/artefato. Os aceites indispensáveis são:

| Pendência | Responsável proposto | Próxima prova |
| --- | --- | --- |
| Versão/configuração e cobertura estável por análise; casos negativos faltantes | Engenharia | Resultado identifica o motor executado; exclusões/formatos/manifesto inválido testados e visíveis; preservar histórico. |
| Jornada catálogo → análise/job → revisão → comparação → arquivo aberto | Engenharia + operador | Dois usuários autorizados, fixtures de isolamento negativas e repositórios/commits fixados; sem simular segunda conta. |
| SCA indisponível versus inventário | Engenharia de produto | Relatório/UI não mostra ausência de CVE como resultado; futuro correlator requer versão resolvida, base/data e testes de intervalo. |
| REA externo/hospedado | Engenharia + revisão do proprietário | Typecheck, parser robusto, limites aninhados e isolamento da chamada aprovados antes de ampliar entradas; preservar instalação funcional. |
| OpenAI real | Proprietário + engenharia, somente se houver ganho mensurável | Autorizar orçamento/dados/modelo e validar casos conhecidos/injection antes de ativar; até lá R$ 0 e desligado. |

Código revisável, piloto controlado homologado e lançamento multiusuário autorizado
são três marcos diferentes. Este manifesto entrega cobertura e limites revisáveis;
não declara os dois últimos concluídos.
