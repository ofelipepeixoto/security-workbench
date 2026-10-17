# Sistema web privado — versão preparada em 17/10/2026

## Resultado e operação

O usuário escolheu acesso por link privado. A área web reutiliza as regras e contratos do núcleo existente e simplifica a jornada: login ChatGPT → link do repositório → conferir identidade/confirmar escopo → analisar versão atual → revisar candidatos → relatório/histórico/comparação. SHA específico fica em opção avançada.

O site foi criado com acesso `custom`, somente o proprietário, e a **versão 1 foi salva, sem deploy**, respeitando a instrução anterior de não implantar automaticamente. Não houve merge dos PRs ou alteração de audiência.

- Projeto Sites: `appgprj_6ad3cd3180a481918c0f7b58dfd6f3e7`.
- Versão salva: `appgprj_6ad3cd3180a481918c0f7b58dfd6f3e7~appgver_94210f55b5e88191adb604c1a94592fd`.
- Fonte Sites exata: `61fba45a01212bc2bb20970e54c2d938702c21ee`.
- Pacote salvo: SHA-256 `a36b4ef0d229f348bbac0ae67b94404038771c06a0076d5a019be758eb42151e`.
- Endereço reservado informado pelo Sites: `https://security-workbench.radarjacarepagua.chatgpt.site`. **Ainda não publicado.**

## Arquitetura e dados

O Python/SQLite original permanece preservado. O runtime web é um adaptador JavaScript/Workers, com fixture de conformidade. `web/PROVENANCE.md` identifica código da aplicação, configuração do starter oficial Sites e arquivos gerados. Não representa portabilidade integral do Python.

Sites fornece autenticação ChatGPT e política privada. Cada operação API valida identidade no servidor; todas as consultas de dados incluem o ID do usuário. POST exige origem exata e corpo JSON até 8 KiB. Sem token no navegador, proxy arbitrário ou credencial do conector copiada.

D1 guarda projetos, análises e revisões isolados neste site. Migração aditiva schema-only gerada via Drizzle e aplicada apenas ao ambiente local de QA. O atendimento de requisições não cria tabelas. Análises têm identificador idempotente e bloqueio SQL por projeto; falhas/interrupções são estados explícitos, sem reexecução automática ou resultado vazio inventado.

O Supabase conectado lista dois projetos ativos de outros sistemas. Nenhum deles foi migrado, alterado ou conectado à área web. Não foi contratado novo serviço pago.

## Escopo do piloto

Somente repositórios públicos do namespace próprio `ofelipepeixoto`, com declaração explícita de autorização. Limites e validação do adaptador estão em `docs/adaptador-web.md`. A área web não acessa repositórios GitHub privados nesta versão; a autenticação existente do processo Python é separada. Sem sites externos, CVEs, execução do REA, automações n8n ou chamadas de IA paga.

O modo demonstração é fictício e fica somente em memória do navegador, claramente identificado. Ele não chama a aquisição nem grava no servidor.

## Verificação efetivamente observada

- 20 testes Node locais aprovados (12 scanner + oito serviço/API), incluindo isolamento de dois usuários, autorização, corpo/origem, idempotência, concorrência, falhas, revisão, comparação, redação e hashes.
- TypeScript e build de Sites aprovados no pacote salvo acima.
- Migração D1 local: oito comandos SQL concluídos com sucesso, sem dados reais.
- Navegador desktop: exemplo fictício de nova análise, mudança para falso positivo e comparação entre duas análises do exemplo. Não comprova autenticação ou persistência hospedadas.
- CI real do scanner no [run 39063959367](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39063959367): REA ID `1417322346`, commit `3e7c6302233ecbcb9b92e43ee5a60337738961bd`, 20 arquivos / 72.882 bytes, zero candidatos/dependências nesse subconjunto; cobertura parcial pelo limite de arquivos. Digest `a2b6013d0338a03d9017f979a814ef781d6066d98080849a0f28d50943e9370b`.

## Pendências para ativar o link

Publicar a versão salva somente após a autorização de implantação privada. Depois homologar login real do proprietário, persistência hospedada e uma análise pelo site. Nenhum desses testes hospedados foi apresentado como concluído. Uma falha de rede do cliente HTTP do workspace ao endpoint interno de preview não foi contornada; a UI foi verificada pelo navegador do preview e os contratos da API por testes locais.

Ordem desta linha: #1 → #2 → #5 → #6 → #7 (adaptador) → PR da interface/persistência. PRs #3/#4 permanecem preservados em suas branches de estudos. Reversão antes da publicação: manter a versão apenas salva; após publicação, reverter a versão do site sem apagar bancos ou reescrever branches automaticamente.
