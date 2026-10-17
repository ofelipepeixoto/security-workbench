# Sistema web privado — publicação e homologação em 17/10/2026

## Resultado e operação

O usuário escolheu acesso por link privado. A área web reutiliza as regras e contratos do núcleo existente e simplifica a jornada: login ChatGPT → link do repositório → conferir identidade/confirmar escopo → analisar versão atual → revisar candidatos → relatório/histórico/comparação. SHA específico fica em opção avançada.

O site foi criado com acesso `custom`, somente o proprietário. A versão 1 foi salva sem deploy; após autorização explícita do proprietário, a versão 7 foi publicada em ambiente privado. Não houve merge dos PRs ou alteração de audiência.

- Projeto Sites: `appgprj_6ad3cd3180a481918c0f7b58dfd6f3e7`.
- Versão publicada: 7, ID `appgprj_6ad3cd3180a481918c0f7b58dfd6f3e7~appgver_47f0475d0cd08191bc2ce8f7b1c41cba`.
- Fonte Sites exata: `ae0096ce9be2713af866c51f1aca4d49c7db154b`.
- Endereço ativo, restrito ao proprietário: `https://security-workbench.radarjacarepagua.chatgpt.site`.
- Versão 1 original permanece salva no histórico; as versões intermediárias são tentativas de diagnóstico e correção do runtime hospedado.

## Arquitetura e dados

O Python/SQLite original permanece preservado. O runtime web é um adaptador JavaScript/Workers, com fixture de conformidade. `web/PROVENANCE.md` identifica código da aplicação, configuração do starter oficial Sites e arquivos gerados. Não representa portabilidade integral do Python.

Sites fornece autenticação ChatGPT e política privada. Cada operação API valida identidade no servidor; todas as consultas de dados incluem o ID do usuário. POST exige origem exata e corpo JSON até 8 KiB. Sem token no navegador, proxy arbitrário ou credencial do conector copiada.

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

A conta proprietária abriu o painel privado. A rota `GET /api/workbench` respondeu HTTP 200 e o banco D1 hospedado apresenta as três tabelas esperadas. A prévia de identidade do repositório REA pela interface foi bloqueada pela cota **não autenticada** da API pública do GitHub: HTTP 403, `x-ratelimit-limit: 60`, `x-ratelimit-remaining: 0`, renovação informada em `2026-10-17T20:18:44Z`. O site não recebeu token GitHub; a conexão do chat não é automaticamente repassada ao Worker. Portanto, cadastro, análise, revisão, relatório e persistência de uma análise **ainda não foram homologados ponta a ponta no site**. O erro de redirecionamento incompatível com Workers foi corrigido: `redirect: manual`, rejeição de toda resposta diferente de 200 e teste próprio. Quando a cota acaba, a interface exibe o limite sem registrar análise vazia.

Próximas verificações: repetir uma leitura após a renovação da cota com o proprietário autenticado, registrar a análise e testar persistência e relatório. Para operação regular, avaliar um acesso GitHub de leitura configurado como segredo no Sites fora do chat ou uma integração elegível; não transmitir credenciais pelo chat nem contornar controles de rede. Uma falha de rede do cliente HTTP do workspace ao endpoint interno de preview não foi contornada; a UI foi verificada pelo navegador e os contratos da API por testes locais.

Ordem desta linha: #1 → #2 → #5 → #6 → #7 (adaptador) → #8 (interface/persistência). PRs #3/#4 permanecem preservados em suas branches de estudos. Reversão: publicar uma versão anterior do site sem apagar bancos ou reescrever branches automaticamente.
