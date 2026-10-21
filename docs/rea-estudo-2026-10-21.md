# REA e referência pública GitGuard — 21/10/2026

Este relatório distingue inspeção estática manual, documentação/código inspecionado e execução. Nenhuma análise do REA foi concluída. Nenhum repositório foi enviado ao GitGuard, nenhuma conta externa foi acessada e nenhum script do alvo foi executado.

## Proveniência REA

- Repositório: https://github.com/ofelipepeixoto/rea ; branch consultada `main`.
- Commit fixado e checkout detached: `3e7c6302233ecbcb9b92e43ee5a60337738961bd`.
- `package.json`: `rea-agents`, versão declarada `6.4.0`, MIT. `LICENSE` preserva copyright morluto (2026). Componentes adicionais possuem termos próprios em `THIRD_PARTY_NOTICES.md` e `licenses/`; MIT do núcleo não elimina esses avisos.
- Node exigido: `^22.19.0 || ^24.11.0 || >=26.0.0`. Ambiente observado: Node 24.19.0, compatível.
- CLI registrada: binários `rea` / `rea-agents` apontam para `scripts/rea.mjs`. MCP previsto por `rea mcp` / `--mcp`, mesmo núcleo de fluxos. Não há ferramenta REA conectada na sessão.
- npm `rea-agents@6.4.0` informa gitHead `a56f7bb668ab23fec8d33f7af353ac7ed2fe1895`, diferente do checkout acima. Igualdade de versão não prova igualdade de build; o pacote npm não foi usado como substituto silencioso.

## Capacidade confirmada em inspeção de código

`src/application/javascript/JavaScriptApplicationService.ts` declara análise estática de artefato JavaScript local. `src/composition/javascriptAnalysisWorkerProcess.ts` recebe texto, invoca parser e projeta fatos estáticos/semânticos. A documentação de workflows separa essas inferências de observação runtime e causalidade. Existem caminhos para módulos, imports, source maps, rotas e relações; não significa que recuperam backend ou comportamento completo de uma aplicação web.

`README.md` lista websites por navegador Chrome e observações de scripts/rede. Essa modalidade não foi usada, pois a tarefa proíbe executar JS do alvo. Capturas fornecidas pelo usuário continuam evidência visual, sem conceder acesso à conta externa.

O núcleo tem controles opcionais `max_heap_mb`, `analysis_timeout_ms` e capacidade de nós semânticos. Defaults no commit: heap V8 1024 MiB, 300000 ms por fonte, 100000 nós totais / 20000 por arquivo. Um processo filho com heap/timeout **não comprova isolamento de rede**; um adaptador Workbench ainda precisa impor bytes, permissões e sandbox externa, mantendo cobertura parcial.

## Comandos e bloqueio observado

1. Clone em diretório separado, checkout do SHA acima, leitura de AGENTS.md, README, LICENSE, manifest e implementação dos caminhos JavaScript/CLI. Status do checkout permaneceu limpo.
2. `node scripts/rea.mjs --version` respondeu runtime compilado ausente e orientou `npm ci && npm run build:cached`; não retornou uma análise.
3. Diretórios `dist/` e `node_modules/` ausentes nesse checkout. `rea` não estava no PATH. Não foi feita instalação global nem registro MCP.
4. Prova de isolamento `unshare --user --map-root-user --net --fork true` falhou ao mapear UID com Operation not permitted.
5. `bwrap --unshare-net --ro-bind / / --proc /proc --dev /dev true` falhou ao criar namespace com Operation not permitted.

Diante desses resultados, não foi instalado/compilado/executado o analisador sobre os recursos do GitGuard. O bloqueio é runtime ausente somado à impossibilidade demonstrada de impor a sandbox sem rede exigida nesta etapa. Não pedir privilégios maiores nem contornar a restrição. A investigação estática independente seguiu pelos meios abaixo.

## Recursos públicos obtidos sem execução

Somente GET HTTPS com TLS padrão, sem cookies, tokens ou corpo enviado. A navegação pública `/en` veio da resolução da página inicial. Links/script URLs foram extraídos do HTML; dois scripts first-party e o HTML público de login observado foram baixados como bytes, sem browser nem execução. Redirecionamentos só admitem HTTPS para `www.gitguard.com.br`; timeout por recurso 20s e limite 1 MiB por recurso, até 2 scripts. Não houve source-map guessing, descoberta de endpoints ocultos, scanner ou testes de falhas.

| Recurso | HTTP | Bytes | SHA-256 |
| --- | --- | --- | --- |
| html | 200 | 226469 | `ef9371ba1dc2c747ff79a7775d57716f924f315c755572214e8260146da18ee3` |
| javascript-not-executed | 200 | 172835 | `359deca4a1b7762a78f0fd35eafb5f746e88a2e793056c0e1e2b819d83f8c0fa` |
| javascript-not-executed | 200 | 124715 | `725b2684726ca47ba899b6c30abccc37c6dcd768780b829f4000fa75c52f33b9` |
| public-login-html-not-executed | 200 | 42430 | `cbd97c905042bea47279d8c94720f8fe50623827d25476dd8c6ae43248be9bad` |

URLs e horário da aquisição estão em [`rea-observacoes-publicas.json`](rea-observacoes-publicas.json) (19:05 UTC / 16:05 BRT em 21/10/2026 para o início da aquisição). Os HTML/JS brutos pertencem ao terceiro e permanecem somente no diretório temporário de estudo; não devem ser copiados para repositório público nem incorporados ao produto.

## Leitura funcional pública, sem confirmação operacional

A página pública apresenta análise de código, dependências, segredos e inventário, além de relatórios, filtros, revisão de falsos positivos e monitoramento. O HTML de login contém referência a GitHub. O material declara integração com GitHub App para privados e acesso de leitura. Nada disso confirma backend, permissões efetivas, instalação, varredura ou segurança. O Workbench deve manter estados próprios de identidade, integração, escopo e análise; não adotar supressão silenciosa de fixtures/devDependencies/avisos sem correção nem copiar planos, marca, textos ou código.

## Próximo uso viável do REA

Manter integração permanente como fase posterior. Preparar runtime exatamente rastreável, sandbox com rede bloqueada e entrada JS local explicitamente escolhida, com bytes/tempo/memória limitados fora do alvo. Executar fixture benigna e uma fixture com efeitos que nunca devem ocorrer, verificar digest/cobertura/omissões e adaptar apenas fatos/candidatos com origem. Não usar comandos browser/runtime, instalação automática de ferramentas nativas ou execução de código alvo. Um build do pacote e um relatório estático real serão necessários antes de dizer "REA integrado".
