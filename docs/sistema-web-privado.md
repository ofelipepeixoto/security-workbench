# Site público e área de trabalho protegida — 17/10/2026

## Resultado e operação

A versão inicial foi privada. Após autorização para tornar o Site público, visitantes anônimos podem navegar na demonstração fictícia sem login. A operação real continua vinculada à identidade ChatGPT do proprietário: link do repositório → conferir identidade/confirmar escopo → analisar versão atual → revisar candidatos → relatório/histórico/comparação. SHA específico fica em opção avançada.

O site foi criado com acesso `custom`, somente o proprietário. A versão 8 foi publicada em ambiente privado. Em 17/10/2026, a versão 9 foi publicada e a audiência passou para `public` por pedido explícito do proprietário. A versão 10 atualizou `next` para 16.3.8 e manteve a audiência. Os PRs #1, #2, #5, #6, #7 e #8 foram integrados à `main`; a publicação do Site é independente.

- Projeto Sites: `appgprj_6ad3cd3180a481918c0f7b58dfd6f3e7`.
- Versão publicada: 10, ID `appgprj_6ad3cd3180a481918c0f7b58dfd6f3e7~appgver_b64ad3abd454819180ab97e87c44dd62`.
- Fonte Sites exata: `8dcf2207c8b2474c72c61cd34ebd9adfa4b7a38c`.
- Endereço personalizado ativo, com SSL ativo: `https://security-workbench.camaleaoweb3.com.br`. O endereço `https://security-workbench.radarjacarepagua.chatgpt.site` também permanece publicado.
- Versão 1 original permanece salva no histórico; as versões intermediárias registram diagnóstico e correção do runtime hospedado. A versão 8 remove um cache de compilação gerado da fonte e passa a ignorá-lo; a rota e as regras de análise são as mesmas da versão 7 homologada. O histórico persistiu após essa publicação.

## Verificação da publicação pública

Em 17/10/2026, o Sites confirmou domínio `active`, provider `active` e SSL `active`; `get_site` confirmou versão 9 e audiência `public`. Uma requisição HTTPS anônima à página retornou HTTP 200 e exibiu “Demonstração”, “Dados fictícios” e “Exemplo público”. A mesma sessão anônima recebeu HTTP 401 em `GET /api/workbench`, sem projetos, achados ou relatórios. Os 23 testes Node locais e o build do Sites passaram antes da publicação. A demonstração não equivale a análise real pública. Para operar sem identidade ChatGPT, seria necessária outra autenticação com isolamento e política de autorização, ainda não implementada.

## Arquitetura e dados

O Python/SQLite original permanece preservado. O runtime web é um adaptador JavaScript/Workers, com fixture de conformidade. `web/PROVENANCE.md` identifica código da aplicação, configuração do starter oficial Sites e arquivos gerados. Não representa portabilidade integral do Python.

Sites fornece identidade ChatGPT para a operação protegida. A audiência pública libera a página e a demonstração fictícia, mas cada operação da API continua exigindo identidade no servidor; todas as consultas de dados incluem o ID do usuário. POST exige origem exata e corpo JSON até 8 KiB. Sem token no navegador, proxy arbitrário ou credencial do conector copiada.

D1 guarda projetos, análises e revisões isolados neste site. Migração aditiva schema-only gerada via Drizzle e aplicada apenas ao ambiente local de QA. O atendimento de requisições não cria tabelas. Análises têm identificador idempotente e bloqueio SQL por projeto; falhas/interrupções são estados explícitos, sem reexecução automática ou resultado vazio inventado.

O Supabase conectado lista dois projetos ativos de outros sistemas. Nenhum deles foi migrado, alterado ou conectado à área web. Não foi contratado novo serviço pago.

## Escopo do piloto

Somente repositórios públicos do namespace próprio `ofelipepeixoto`, com declaração explícita de autorização. Limites e validação do adaptador estão em `docs/adaptador-web.md`. A área web não acessa repositórios GitHub privados nesta versão; a autenticação existente do processo Python é separada. Sem sites externos, CVEs, execução do REA, automações n8n ou chamadas de IA paga.

O modo demonstração é fictício e fica somente em memória do navegador, claramente identificado. Ele não chama a aquisição nem grava no servidor.

## Verificação efetivamente observada

- 23 testes Node locais aprovados (14 scanner + nove serviço/API), incluindo isolamento de dois usuários, autorização, corpo/origem, idempotência, concorrência, falhas, revisão, comparação, redação, hashes, redirecionamento manual e limite público do GitHub.
- TypeScript e build de Sites aprovados na fonte publicada.
- Migração D1 local: oito comandos SQL concluídos com sucesso, sem dados reais.
- Navegador desktop: exemplo fictício de nova análise, mudança para falso positivo e comparação entre duas análises do exemplo. Não comprova autenticação ou persistência hospedadas.
- CI real do scanner no [run 39063959367](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39063959367): REA ID `1417322346`, commit `3e7c6302233ecbcb9b92e43ee5a60337738961bd`, 20 arquivos / 72.882 bytes, zero candidatos/dependências nesse subconjunto; cobertura parcial pelo limite de arquivos. Digest `a2b6013d0338a03d9017f979a814ef781d6066d98080849a0f28d50943e9370b`.

## Homologação hospedada e limite observado

A conta proprietária abriu o painel privado. A rota `GET /api/workbench` respondeu HTTP 200 e o banco D1 hospedado apresenta as três tabelas esperadas. Inicialmente, a prévia de identidade do REA foi bloqueada pela cota **não autenticada** da API pública do GitHub: HTTP 403, `x-ratelimit-limit: 60`, `x-ratelimit-remaining: 0`, renovação informada em `2026-10-17T20:18:44Z`. O site não recebeu token GitHub; a conexão do chat não é automaticamente repassada ao Worker.

Após a renovação da cota, o proprietário cadastrou `ofelipepeixoto/rea` pelo navegador, confirmou o ID `1417322346` e concluiu a análise `47834673-c1a0-4df7-80fa-76b9b73b7b45`. O D1 hospedado confirma um projeto e uma análise `complete`, sem falha. Foram lidos 20 arquivos / 72.882 bytes no commit `3e7c6302233ecbcb9b92e43ee5a60337738961bd`; zero candidatos e zero dependências **nesse recorte**. O digest `a2b6013d0338a03d9017f979a814ef781d6066d98080849a0f28d50943e9370b` coincide com o smoke independente no CI. A interface indicou cobertura parcial pelo limite de 20 arquivos. Depois de recarregar a página, projeto e análise permaneceram no histórico. O clique em baixar relatório gerou resposta HTTP 200 da API, mas a automação do navegador não confirmou a criação do arquivo baixado. Não houve candidato real para testar revisão nem uma segunda análise para testar comparação hospedada; esses fluxos têm testes de contrato locais.

O erro de redirecionamento incompatível com Workers foi corrigido: `redirect: manual`, rejeição de toda resposta diferente de 200 e teste próprio. Quando a cota pública acaba, a interface exibe o limite sem registrar análise vazia. Para operação regular, avaliar um acesso GitHub de leitura configurado como segredo no Sites fora do chat ou uma integração elegível; a cota por IP sem token é compartilhada e pode esgotar antes da análise. Não transmitir credenciais pelo chat nem contornar controles de rede. Uma falha de rede do cliente HTTP do workspace ao endpoint interno de preview não foi contornada; a UI foi verificada pelo navegador e os contratos da API por testes locais.

## Atualização de segurança da versão 10

O [PR #12](https://github.com/ofelipepeixoto/security-workbench/pull/12) atualizou `next` para 16.3.8 na `main`; o CI passou. Na fonte separada do Sites, a mesma atualização do pacote e lockfile passou por 23 testes Node, TypeScript e build. O Sites publicou a versão 10 com status `succeeded`; `get_site` confirmou versão 10, audiência `public` e o domínio personalizado. O navegador reabriu a demonstração no domínio após a publicação. Isso confirma o deploy e a página, sem repetir toda a homologação da API autenticada ou auditar integralmente as dependências hospedadas. Os alertas restantes do próprio Workbench estão no [issue #13](https://github.com/ofelipepeixoto/security-workbench/issues/13).

Nesta sessão da versão 10, o navegador mostrou a demonstração anônima. Não havia sessão de proprietário nessa superfície para repetir análises reais, revisão e download. O [issue #14](https://github.com/ofelipepeixoto/security-workbench/issues/14) registra os critérios de homologação hospedada pendentes.

CI histórica do [PR #8, run 39066019922](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39066019922): três jobs concluídos com sucesso, incluindo 17 testes Python, 23 testes Node, smoke privado CLI/HTTP e smoke público parcial do REA.

Ordem desta linha: #1 → #2 → #5 → #6 → #7 (adaptador) → #8 (interface/persistência). PRs #3/#4 permanecem preservados em suas branches de estudos. Reversão: publicar uma versão anterior do site sem apagar bancos ou reescrever branches automaticamente.
