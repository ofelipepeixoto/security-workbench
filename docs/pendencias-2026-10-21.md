# Pendências, evidências e próximos aceites — 21/10/2026

Este registro atualiza o estado anterior do mesmo dia. Implementação, teste local,
PR, publicação e homologação são etapas distintas. A demonstração continua pública
e fictícia; a operação real permanece restrita ao proprietário no servidor. Não
houve merge, ampliação de escopo ou contratação de infraestrutura/IA paga.

O candidato consolidado passou em **93 testes Node, 25 testes Python, TypeScript,
lint global e build**. A verificação posterior reunindo os seis testes do helper
do PR #30 passou em **99 testes Node**, com lint global aprovado; não foi uma nova
compilação ou publicação do Site. Os erros anteriores de Hooks/lint foram corrigidos. Esses
resultados não equivalem a OAuth, revisão persistida, download ou QA visual reais.
O inventário local contém **19 entradas de rotas, incluindo APIs**; a rastreabilidade
da interface está na [matriz de jornadas](matriz-jornadas-2026-10-21.md).

A versão **13 foi publicada**, com deploy `succeeded` em **21/10/2026 às
21:09:00.640880 UTC / 18:09 BRT**, fonte Sites
`5074b95d7ce5fd6e84cb12ccc7881e6e3155e748`, deployment
`appgdep_6ad929a7d4d88191b064307beba6f0bd` e ambiente **revisão 6**. O smoke no
domínio personalizado observou oito páginas com HTTP 200 e `no-store`; isso é
verificação HTTP, sem QA visual. A homologação autenticada completa continua
pendente. O [registro anterior](publicacao-2026-10-21.md) documenta a v12 e deve ser
lido com essa atualização factual.

## Entrega, GitHub e publicação

| Item | Estado | Evidência | Bloqueio | Próxima ação | Responsável | Aceite |
| --- | --- | --- | --- | --- | --- | --- |
| Repositório, proteção e release | Reconfirmados; sem merge | `main` em `cf906ef`, protegida; `v0.1.0` permanece pré-release experimental | Código em revisão/Sites ainda separado da main/release | Manter bases e checks rastreáveis em cada PR | Engenharia; proprietário decide integração | Main/release só mudam por revisão e processo autorizado; nenhuma inferência de merge pelo deploy |
| Parsers — [PR #23](https://github.com/ofelipepeixoto/security-workbench/pull/23) | Rascunho remoto | Patches/lockfile separados, [triagem](triagem-continuacao-2026-10-21.md) e [CI 39675022954 aprovada](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39675022954) | Revisão humana pendente | Conferir diff, fontes e smoke benigno | Engenharia/revisor | Versões/caminhos fundamentados; CI aplicável aprovada; sem descarte de alertas |
| Rede das ferramentas — [PR #24](https://github.com/ofelipepeixoto/security-workbench/pull/24) | Rascunho remoto | Lockfile validado e [CI 39675028042 aprovada](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39675028042) | Undici ainda possui avisos oficiais adicionais | Revisar este incremento e manter a exceção 7.30.1 abaixo | Engenharia/revisor | Não anunciar undici totalmente corrigido; políticas de instalação preservadas |
| Toolchain — [PR #25](https://github.com/ofelipepeixoto/security-workbench/pull/25) | Rascunho remoto | Vite 8.1.6 e demais patches; [CI 39675042408 aprovada](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39675042408) | Revisão e exceções dos pais legados | Conferir compatibilidade e build do conjunto final | Engenharia/revisor | Pares, lockfile, testes e artefato coerentes; sem major transitiva forçada |
| Sessão e revogação — [PR #26](https://github.com/ofelipepeixoto/security-workbench/pull/26) | Rascunho remoto; testes locais aprovados | Isolamento, CSRF, geração e [CI 39675312581 aprovada](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39675312581) | Homologação hospedada de saída, expiração e revogação | Revisar contrato/configuração e testar no servidor legítimo | Engenharia + proprietário | Sessão revogada não volta ao reativar operação; dados e owner canônico preservados |
| Importação REA do núcleo — [PR #27](https://github.com/ofelipepeixoto/security-workbench/pull/27) | Rascunho remoto; CI aprovada | Importador/testes em [REA](rea-execucao-2026-10-21.md); [run 39676461219](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39676461219) | Revisão humana; engine real continua bloqueado | Conferir contrato e limites do PR | Engenharia/revisor | Importação segura revisável; nenhum anúncio de execução REA concluída |
| Backend D1, agregado e importação REA — [PR #28](https://github.com/ofelipepeixoto/security-workbench/pull/28) | Rascunho remoto; CI aprovada | API/contexto/CSRF/projeção; [run 39676610952](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39676610952) | Revisão e homologação real | Conferir contratos, limites e isolamento na hospedagem | Engenharia/revisor | Projeção segura sem JSON bruto; dados filtrados por owner; CI e aceite hospedado delimitados |
| Interface, qualidade e relatório — [PR #29](https://github.com/ofelipepeixoto/security-workbench/pull/29) | Rascunho remoto; CI corrigida e aprovada | 93 Node/25 Python, TypeScript, lint e build; [run 39677336330 aprovado](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39677336330) | Revisão humana e QA visual | Conferir checks do head vigente e concluir aceite assistido | Engenharia/revisor | Rotas/filtros/recuperação coerentes; CI final aprovada; limitações de QA explícitas |
| Pré-flight local — [PR #30](https://github.com/ofelipepeixoto/security-workbench/pull/30) | Aprovado pelo operador também no executável privado | Helper `7e2dd12`/hash conferido, `LIMITES_PREFLIGHT_OK`, `passed:true` e 12 checks true no Bubblewrap 0.13.1; 31 testes Node locais, oito do helper | Compilação completa falhou; engine não executado | Retomar emissão e bundle separados, mantendo o binário privado e verificando limites na unidade | Engenharia + proprietário | Mesmo caminho em disponibilidade/execução, sem fallback; rede/escrita bloqueadas na fixture; nenhum alvo executado ou prontidão do engine inferida |
| Retomada limitada do runtime — [PR #31](https://github.com/ofelipepeixoto/security-workbench/pull/31) | Implementada em rascunho; execução no WSL pendente | Commit `556976855559aefc8fb1c5556d6ccc87359375ef`; 35 testes Node, incluindo quatro do preparo; fonte publicada conferida byte a byte | Emit e bundle ainda sem resultado nativo; typecheck completo pendente | Executar helper fixado, conferir fases e cinco hashes; depois preparar prova do engine | Proprietário + engenharia | Dist anterior preservado; mesmos pins/isolamento/limites; falha bloqueia bundle/sucesso; nenhum anúncio de análise concluída |
| Site v13 | Publicada; smoke HTTP concluído | Deployment/fonte/revisão 6 acima; oito páginas HTTP 200 com `no-store` | QA visual e homologação autenticada completas pendentes | Conferir jornadas na versão efetiva e complementar o registro | Engenharia + proprietário | Percurso real e limites observados registrados separadamente do deploy e do smoke |
| Ordem de integração e próxima release | Pendente de revisão humana | #23 parsers → #24 rede → #25 toolchain → #26 sessão → #27 REA local → #28 backend D1 → #29 interface/qualidade | Bases empilhadas e sobreposição com #17–#22 | Revisar dependências entre PRs, evitar reaplicar mudanças e conferir CI de cada head | Proprietário + engenharia | Decisão explícita sobre merge/release; tag aponta para commit validado; Site e GitHub identificados separadamente |

## Homologação autenticada e issue #14

O proprietário forneceu prova na v12 de **sessão GitHub identificada, um projeto
REA cadastrado e uma análise concluída com zero candidatos**. Isso é avanço real;
não manter como estado atual a antiga afirmação de que o Client Secret estava
necessariamente ausente e o login indisponível. Não foram reproduzidos segredos,
identificadores internos, capturas ou relatórios reais neste documento.

Esse resultado não executou o engine REA: o projeto analisado se chama REA, mas a
análise hospedada usa o scanner estático limitado do Workbench. Zero candidatos
não prova segurança e não oferece um candidato para homologar revisão humana.

| Item | Estado | Evidência | Bloqueio | Próxima ação | Responsável | Aceite |
| --- | --- | --- | --- | --- | --- | --- |
| Login do proprietário e dados esperados | Parcialmente demonstrados na v12; repetir na v13 | Prova fornecida pelo proprietário de conta identificada, projeto e análise | Nova versão e ferramenta de navegador indisponível para completar o percurso | Entrar legitimamente na versão efetiva e conferir o mesmo histórico | Proprietário, com apoio da engenharia | Conta autorizada retorna aos dados canônicos; nenhuma eleição de primeiro cadastro ou associação por e-mail |
| Lista de projetos e histórico | Recuperação implementada; QA hospedada pendente | Código separa carga/erro/vazio e explica cadastro; teste SSR de regressão | Relato anterior de lista vazia não teve causa de servidor confirmada | Conferir resposta válida e cadastro esperado; erro 401/5xx permanece visível com retomada | Engenharia + proprietário | Só mostrar ausência após resposta válida; lista significa projetos cadastrados, não descoberta automática de todos os repositórios GitHub |
| Duas análises para aceite | Pendente | Fixture própria fixada abaixo; análise REA anterior teve zero candidatos | Falta executar e conferir duas novas aquisições hospedadas | Analisar duas vezes o commit autorizado, preservando IDs distintos, cobertura, horários e limites | Proprietário/operador | Duas análises independentes do mesmo repositório/commit, com identidade e origem registradas; nenhuma execução do alvo |
| Revisão persistida | Não homologada | UI/API e testes locais existem; não há prova de candidato real revisado nesta hospedagem | Depende da fixture segura coberta pela aquisição | Revisar exclusivamente o candidato artificial como falso positivo e recarregar a URL | Proprietário/operador | A decisão reaparece no servidor após recarga e na análise correta; fixture não é chamada de vulnerabilidade |
| Comparação | Não homologada no navegador | Comparação exige mesmo projeto/método; IDs explícitos e limites tratados | Duas análises elegíveis e acesso de navegador | Comparar as duas execuções fixadas e conferir o contexto | Proprietário/operador | IDs, commit, método, contagens e cobertura coerentes; não detecção não significa correção |
| Markdown | Download efetivo ainda não homologado | Prévia e geração/exportação implementadas; testes locais/SSR | Falta download e inspeção do arquivo no navegador | Baixar Markdown da análise revisada e abrir o arquivo | Proprietário/operador | Arquivo corresponde à análise/decisão, contém cobertura/limites e não contém valores sensíveis |
| Anônimo | Recusa HTTP também observada na v13; cobertura incompleta | GET `/api/workbench` retornou 401 com `no-store` na v13; POST anônimos às duas APIs retornaram 403 na borda, sem dados | POST 403 da borda não comprova qual resposta a autenticação da aplicação emitiria | Conferir IDs diretos, análises e relatórios sem sessão, separando borda e aplicação | Engenharia | Nenhum conteúdo real é revelado; respostas sem cache; IDs diretos também protegidos |
| Método da API REA | Recusa de método observada na v13 | GET da API REA retornou 405 | Não demonstra autenticação da operação POST | Manter testes por método e a distinção de borda/aplicação | Engenharia | GET não importa artefatos; POST autorizado é homologado separadamente |
| Outra conta válida e consentimento negado | Testes locais; percurso hospedado pendente | Autorização por ID estável e owner no servidor | Sessão legítima de outra conta e percurso externo ainda não testados | Testar recusa e cancelamento sem ampliar allowlist | Proprietário + engenharia | Outra conta não recebe sessão operacional nem lê/aciona dados; cancelamento tem recuperação clara |
| Callback, PKCE e escopo | Parte observada antes da v13 | Callback inválido respondeu 303; início observado com PKCE e escopo vazio | Isso não comprova todo o retorno externo nem replay em produção | Repetir casos seguros de callback inválido/reutilizado e expiração na versão efetiva | Engenharia | Nenhum callback inválido/reutilizado cria sessão; escopo continua mínimo; sem registrar state, código ou tokens |
| Logout, expiração e retorno | Não homologados na hospedagem atual | Implementação/testes de revogação e geração; proteção de retorno pelo cache implementada | Falta observação real após logout e término da sessão | Encerrar sessão, recarregar/voltar e testar API; conferir expiração | Proprietário + engenharia | Sessão encerrada/expirada não lê dados; retorno não restaura conteúdo operacional |
| QA visual, mobile e acessibilidade | Bloqueada pelas ferramentas nesta rodada | Extensão do navegador travou; preview oficial CUA primeiro recusou conexão e depois rejeitou a URL por política explícita | Não foi possível realizar inspeção visual oficial do candidato | Retomar quando a integração funcionar ou registrar validação manual do proprietário | Engenharia + proprietário | Rotas/recarga/sidebar/menu mobile, teclado, foco, zoom, diálogos e estados verificados; nenhuma alegação de conformidade por SSR/build |

**Fixture para o próximo aceite:** repositório próprio
`ofelipepeixoto/security-workbench`, repository ID **1419403320**, commit fixado
**`b6652136a1047ff11b11c348608a0db354e2e0c1`**. Executar duas análises independentes,
conferir a cobertura e usar somente o candidato artificial para a decisão
**falso positivo**, recarga, comparação e Markdown. Se o arquivo da fixture não
estiver na cobertura ou não houver candidato, registrar a ausência e a limitação;
não inventar vulnerabilidade ou atribuir validade a uma credencial fictícia.

Os bloqueios de navegador são falhas/restrições observadas das ferramentas; não
foram atribuídos a fingerprint, bot ou defeito confirmado do Site. Não houve
contorno da rejeição nem substituição por navegador fora do fluxo autorizado.

## Dependências, issue #13 e riscos residuais

A [triagem por pacote, manifesto e caminho](triagem-continuacao-2026-10-21.md)
e o [snapshot](dependencias-audit-continuacao-2026-10-21.json) registram a mudança
npm de **57 para 3 entradas**: uma alta, uma moderada e uma baixa. Não são três
alertas Dependabot, não incluem todos os avisos oficiais de undici e não comprovam
exploração ou ausência de alcançabilidade no runtime. A contagem GitHub de
**38 abertos** continua histórica e **não foi recontada nesta retomada**.

| Item | Estado | Evidência | Bloqueio | Próxima ação | Responsável | Aceite |
| --- | --- | --- | --- | --- | --- | --- |
| Painel Dependabot | Reconsulta pendente | Último painel: 38 abertos; inventário npm é outra fonte | Endpoint ausente no conector e navegador indisponível | Consultar painel autenticado quando a integração permitir; reconciliar com main/head publicado | Engenharia/proprietário | Contagem datada, alertas agrupados por pacote/manifesto/caminho/uso; sem descarte em massa |
| braces 3.0.3 — alta | Residual, sem patch informado no registro consultado | GHSA-vfj7-8cjw-p6xm; caminhos/condições na triagem | Não há versão corrigida publicada confirmada | Reavaliar fast-glob/micromatch e patch do mantenedor; manter globs em configuração confiável | Engenharia de dependências | Solução suportada ou exceção fundamentada com limites; não ocultar o alerta |
| esbuild 0.18.20 — moderada | Residual no ramo Drizzle | GHSA-67mh-4wv8-2f99; drizzle-kit → loader → esbuild | Troca de major forçada pode quebrar o pai | Atualizar/remover o loader por combinação suportada e testar geração de migração | Engenharia de dependências | Migração/schema conferidos sem aplicar em produção por conveniência; ferramentas dev não expostas |
| esbuild 0.27.3 — baixa | Residual no ramo Wrangler | GHSA-g7r4-m6w7-qqqr; condição do servidor dev no Windows | Atualização depende da combinação Cloudflare/Wrangler | Preparar PR próprio do pai e testar build/runtime | Engenharia de dependências | Ferramentas em loopback; combinação suportada; nenhum binário/API substituído à força |
| undici 7.29.1 — avisos adicionais | Residual fora da resposta npm audit | Mantenedor publicou correções adicionais em 7.30.1; fontes na triagem | Política de idade mínima de sete dias preservada | Reavaliar/fixar/testar 7.30.1 a partir de **22/10/2026 às 11:18:31 BRT** | Engenharia de dependências | Fonte oficial e elegibilidade confirmadas, lockfile/CI/build atualizados; política não reduzida |
| Incorporação efetiva das dependências | Fonte v13 publicada; correspondência a registrar na manutenção | Fonte Sites acima e manifests/lockfile dos PRs #23–#25 validados | Registro final deve vincular cada grupo à versão efetiva | Conferir/publicar a correspondência de manifests/lockfile e fonte v13 | Engenharia | Versão/deployment correspondem às dependências corrigidas; GitHub main continua identificado separadamente |
| Disponibilidade OAuth e suspensão | Controles implementados; prova operacional pendente | Limite de fluxos, revogação e geração de sessão no candidato | Limitar fluxos não prova resistência a exaustão; flag isolada não é revogação durável | Conferir comportamento e usar revogação/geração quando a suspensão precisar invalidar sessões | Engenharia + proprietário | Reativar operação não restaura sessões explicitamente revogadas; sem apagar histórico ou reintroduzir outro provedor |

## REA: importação disponível em código, engine ainda sem execução homologada

| Item | Estado | Evidência | Bloqueio | Próxima ação | Responsável | Aceite |
| --- | --- | --- | --- | --- | --- | --- |
| Importação local Python/SQLite | Implementada e testada; PR #27 aberto | 25 testes Python, incluindo importação; fixtures sintéticas; [contrato REA](rea-execucao-2026-10-21.md) | Revisão/CI e plataforma do operador | Revisar origem, limites, projeção, relatório e comparação | Engenharia/revisor | JSON bruto não persiste; observações começam como candidate; commit/cobertura/hashes declarados não viram aquisição verificada |
| Importação web/D1 | Implementada no backend #28 e fonte v13; QA real pendente | Parser validado com fixtures; formulário exige projeto, SHA, JSON ≤1 MiB e confirmação | QA hospedada e artefato seguro do operador | Importar fixture sintética sem segredos para exercitar persistência/revisão/exportação | Proprietário + engenharia | Fonte `rea-import`, cobertura parcial e vínculo declarado explícitos; até 100 candidatos; conta não autorizada recusada |
| Execução real do engine REA | Não executada; compilação completa falhou | Commit `3e7c6302233ecbcb9b92e43ee5a60337738961bd`, 409 pacotes/lock íntegro; dois eventos distintos de OOM/timeout a 2 GiB e cinco sentinelas ausentes/vazias | Runtime e aplicação/verificação dos limites na execução do engine pendentes | Gerar JavaScript sem typecheck e empacotar em fases limitadas; depois executar primeiro a fixture própria | Engenharia + proprietário | Sem rede, entrada JS somente leitura, limites externos de bytes/tempo/memória efetivos; nenhum código do alvo executado |
| Typecheck completo do motor REA | Pendente; a retomada usa `--noCheck` | [Registro da falha](rea-execucao-2026-10-21.md); compilador 7.0.2 fixado suporta emissão sem checagem completa | Compilação completa não passou; emitir JS não comprova tipos corretos | Validar emissão e bundle separadamente, depois investigar typecheck completo | Engenharia | Exceção explícita até checagem do commit fixado aprovada; não confundir com TypeScript web |
| Node 24 e permissões | Diagnóstico concluído; insuficiente para o gate | Node 24.19.0 com permissões conectou a fixture TCP em loopback; worker REA usa processo filho | Flag não bloqueia rede e não estabelece sandbox herdada do worker | Usar uma fronteira efetiva de processo/rede/filesystem, sem contornar bloqueios atuais | Engenharia | Fixture sentinela não conecta nem escreve; heap/timeout não são anunciados como sandbox |
| Ambiente Windows do operador | Preparação, pré-flight e dependências confirmados pelo operador | Ubuntu WSL 2, kernel 6.18.54.1, x86_64, Node Linux 24.19.0; helper com 12 checks true; npm 11.16.0/lock conferidos e `DEPENDENCIAS_OK` | Compilação completa atingiu limites; execução REA pendente | Retomar fases separadas offline, sem arquivos do alvo | Proprietário, com apoio da engenharia | Distribuição e isolamento identificados; WSL sozinho não prova execução REA; não declarar Windows homologado |
| Pacote Bubblewrap e CVE-2026-87766 | Versão privada corrigida compilada e aprovada no pré-flight; pacote do sistema separado | Última consulta do Ubuntu: `0.11.1-1ubuntu0.1`, candidato `0.11.1-1ubuntu0.3`; [reversão em 0.3](https://ubuntu.com/security/notices/USN-8779-2); binário privado 0.13.1/hash conferido e 12 controles aprovados | Pacote do sistema não foi substituído; engine ainda sem prova própria | Manter seleção explícita do binário privado em cada operação do Workbench | Engenharia + proprietário | Fonte/hash e executável identificados; controles reais sem fallback, PPA, upgrade global ou desativação de AppArmor; nenhuma exploração anunciada |
| Ferramentas de compilação Bubblewrap | Concluídas; `FERRAMENTAS_BWRAP_OK` fornecido pelo operador | GCC 15.2.0, Python 3.14.4, Meson 1.10.1, Ninja 1.13.2, libcap 2.75; APT 44 novos/5 atualizados/0 remoções/126 não atualizados | Nenhum bloqueio dessa preparação; motor REA é outra etapa | Preservar instalação e seguir para build REA | Proprietário, com apoio da engenharia | Python Meson não é homologação do núcleo Python 3.12; instalação de compilador não vira execução de análise |
| Bubblewrap privado 0.13.1 | Compilado e pré-flight aprovado segundo retorno do operador | Versão 0.13.1, `BWRAP_COMPILADO_OK`, digest `d7e217424a96140625d3e83df81e66a9e91de40ed9f882d07505da99fa005a76`; helper fixado com `passed:true`/12 checks e `LIMITES_PREFLIGHT_OK` | Prova cobre fixture própria, sem execução do engine | Usar o mesmo executável na compilação e futura análise, verificando sua identidade | Proprietário, com apoio da engenharia | Sem recusa de namespace no percurso observado; não anunciar auditoria completa ou usos arbitrários da sandbox |
| Limites de recursos no WSL | Confirmados também na unidade que executou o pré-flight privado | Wrapper verificou `memory.max=536870912`, `memory.swap.max=0`, `pids.max=32` antes de iniciar Node/helper/Bubblewrap | Ainda não aplicados/verificados numa execução REA | Repetir verificação na própria unidade do engine e preservar herança aos filhos | Engenharia + proprietário | Limites de memória/swap/tarefas e prazo global efetivos; nenhum teste de sobrecarga ou OOM necessário |
| Prova mínima do engine | Pendente | Dependências preparadas e pré-flight privado aprovado; só fixtures sintéticas foram usadas na importação | Runtime compilado e execução real do engine ainda pendentes | Executar primeiro fixture própria inerte; depois fixture adversarial estática controlada; registrar versão/digests/limites/horário e conferir projeção | Engenharia | Evidence REA real coerente com o contrato; ausência de rede/escrita/execução do alvo verificada; observação estrutural não vira vulnerabilidade confirmada |

## Expansões posteriores aos gates

| Item | Estado | Evidência | Bloqueio | Próxima ação | Responsável | Aceite |
| --- | --- | --- | --- | --- | --- | --- |
| Sites explicitamente autorizados | Planejado, sem adaptador operacional novo | [Contrato do roadmap](proximas-integracoes.md) | SSRF, DNS/IP e redirecionamentos precisam de implementação e teste | Começar pelo domínio autorizado `camaleaoweb3.com.br`, com política de host/caminhos/portas e escopo explícito | Engenharia + proprietário | HTTPS válido; revalidação em cada conexão/redirect; bloqueio de privados/metadados; bytes/tempo/requisições limitados; falha vira cobertura parcial |
| Privados e organizações por GitHub App | Planejado; login OAuth não instala App | Leitura pública atual; estados separados na UI | App, instalação, seleção e credenciais curtas ainda ausentes | Projetar leitura mínima por repository/installation ID e revogação | Engenharia + proprietário | Credencial curta somente no servidor; expiração, revogação, 403, rate limit e isolamento testados; sem escopo ampliado implicitamente |
| Advisories/CVEs dos alvos | Planejado; inventário atual não consulta CVEs | Scanner/relatórios distinguem inventário | Falta fonte, correspondência de versão e contrato de consultas | Implementar proveniência, intervalos, cache e limites em fatia própria | Engenharia | Inventário, correspondência e confirmação humana separados; versão desconhecida não vira ausência de CVE |
| Correção verificada e duração | Pendente; métricas de decisões já implementadas com amostra explícita | Dashboard/achados e matriz de jornadas | Não há evidência própria de correção nem horários completos para duração | Definir candidato → mudança → nova evidência → decisão; acrescentar duração só com timestamps adequados | Produto/engenharia | Não detecção não confirma correção; nenhum contador ou tempo estimado apresentado como fato |
| Monitoramento, webhooks e notificações | Planejado, sem ativação | UI informa análise manual | Runtime assíncrono e contrato de eventos ausentes | Definir assinatura, idempotência, quotas, pausa e revogação | Engenharia + proprietário | Replay/duplicação/falha testados; nenhuma execução recorrente implícita |
| Bancos, Supabase, n8n, VPS e agentes/MCP | Preparação opcional; VPS Hostinger existente informada pelo proprietário | SQLite/D1 atendem ao estágio atual; VPS não foi inspecionada | Capacidade, serviços existentes, ganho, custo e isolamento ainda não avaliados | Avaliar somente após os gates, com projeto e autorização próprios | Proprietário + engenharia | Necessidade mensurada, restauração/reversão testadas; nenhuma infraestrutura ou IA paga ativada automaticamente |

O diagnóstico anterior do Windows pode ter disparado o instalador; a mudança foi
reconhecida. O proprietário concluiu o WSL e a preparação acima. Os controles
observados no WSL2 são avanço de infraestrutura local, sem prova de execução do
engine REA. O helper do PR #30 foi baixado no commit `1b0c93114d7a215aa73844e5a7edd62620dd25eb`, teve SHA-256 `8dbafa2690bd4dd90e7aa6e60dfd4af5b0139a77b4462625e3676be39d1cc535` conferido e retornou `passed:true`, com os 12 checks true, segundo a saída fornecida pelo operador. `memory_enforced` e `ready_for_rea` permaneceram false, pois o helper não configura o futuro executor. Não houve execução do motor.

Posteriormente, o checkout REA fixado e o npm separado foram conferidos. O operador relatou instalação de 409 pacotes sem scripts de instalação, lockfile íntegro e `DEPENDENCIAS_OK`. O aviso de manutenção de `prebuild-install@7.1.3` foi preservado. A compilação completa falhou com dois eventos distintos de OOM/timeout e sem as cinco sentinelas finais; os [detalhes de preparação e do gate Bubblewrap](rea-execucao-2026-10-21.md) distinguem instalação com rede, build da ferramenta e futura análise offline.

A reversão deve preservar owner canônico, dados, schema aditivo e GitHub exclusivo.
Preferir uma revisão revisada que suspenda a operação real quando necessário.
Retornar à v10 exige decisão explícita do proprietário por reintroduzir o fluxo
ChatGPT anterior. O próximo marco concreto continua sendo concluir a homologação
com a fixture própria; a publicação de código não encerra os issues #13 e #14.

### CI e correspondência com a publicação

O primeiro [run do #29, 39676799305](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39676799305), passou em Python, aquisição GitHub real e no job web completo (93 testes, TypeScript e build), mas falhou no job independente `web-scanner`: ele não instala npm e passou a incluir um teste SSR que importa React. A correção mantém a suíte completa em `web-build` e seleciona explicitamente os seis arquivos sem dependências no job do scanner; os **84 testes desse comando passaram localmente**. O [run posterior 39677336330](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39677336330) terminou com success em todos os jobs. O run inicial continua registrado como falha; conferir os checks do head vigente após este registro documental.

Foram comparados os **87 arquivos públicos web** com a fonte Sites salva/publicada, sem diferenças de conteúdo. SHA-256 de `package.json`: `b4735a52775a731759c27edf013b61c5dbda56a32439910aa4225a3bdb84fd30`; do lockfile: `8449ddd502e9380316fcda678d4d1dc52c7fd31e29384f3c3dd21c8adf6d5032`. O ajuste posterior do workflow e os documentos não alteram o artefato web publicado. O CI valida aquisição no Actions; não substitui a sessão do proprietário no Site.
