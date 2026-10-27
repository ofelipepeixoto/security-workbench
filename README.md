# Security Workbench

Plataforma experimental em construção para inspecionar ativos **autorizados**. O núcleo local analisa cópias ou lê arquivos de um commit específico pelo GitHub, sem executar código do alvo. Os resultados ficam em SQLite local.

## Estado atual — 27/10/2026 UTC

[English overview](README.en.md). O código evolui na cadeia de PRs em rascunho #43 → #44 → #45 → #46 → #47; a `main` não representa automaticamente o ambiente hospedado. Produção pública v15 e QA isolado têm aprovações e configurações próprias.

O QA recebeu o commit exato `8ac53f9ad5a0ded0ea50242797f902d0756c0c42` da PR #47, incluindo a correlação sanitizada de tentativas, sem migrations adicionais ou ativação. Os dois Workers foram conferidos ativos, com 100% de tráfego. B repetiu catálogo privado e seleção de metadados nesse candidato; A mantém evidência anterior individual. Falta disponibilizar A em perfil separado, preservando B. Negativos autenticados completos e mobile permanecem pendentes. O canário Q2 tem autorização condicional, mas **não foi iniciado**: a capacidade de coletar CPU antes da ativação é um gate distinto da medição real durante o canário; transporte autenticado e privacidade da captura nativa ainda precisam ser comprovados. A matriz atual distingue branch, CI, QA e homologação.

Login validado, conexão da App, metadados descobertos e autorização para analisar são capacidades separadas. O catálogo informa a interseção usuário × instalação, inclusive itens nunca cadastrados como projeto, sem prometer acesso global a privados/organizações. Seleção de metadados não resolve commit nem cria análise.

As detecções exigem avaliação humana; o orientador por regras e o prompt portátil não são IA generativa. A integração contextual está preparada, desligada, sem chamadas reais de modelo. Patches são propostas, não alterações aplicadas automaticamente. O piloto não está homologado e nenhum período de sete dias foi concluído.

Veja a [matriz atual](docs/reconciliacao-entregas-2026-10-26.md), [auditoria cumulativa Q1 e limites](docs/auditoria-cumulativa-q1-2026-10-26.md) e [arquitetura/ameaças](docs/adr-mvp-v2.md). Evidências operacionais, contas, dumps e backups ficam fora do repositório. As seções datadas abaixo conservam registros históricos e não substituem essa reconciliação.

## Site e demonstração online

Atualização de 21/10: **Site v15 publicado**, importação REA existente conferida e aquisição GitHub hospedada bloqueada pela cota pública do servidor. O REA local não precisa ser reinstalado ou repetido. Consulte a [homologação atual](docs/homologacao-2026-10-21.md) e as [pendências](docs/pendencias-2026-10-21.md); os registros de versões anteriores abaixo permanecem históricos.

[Abra a demonstração pública](https://security-workbench.camaleaoweb3.com.br/) sem login. Ela usa **apenas dados fictícios no navegador**: explore projetos, análise, revisão, relatório e comparação sem gravar no servidor ou analisar um repositório real.

O **Site v13**, publicado em 21/10/2026 às 21:09 UTC, exige exclusivamente GitHub na operação real. O segredo e a associação ao proprietário estão configurados no servidor, com login habilitado na revisão de ambiente 6. O proprietário confirmou entrada e histórico na v12; revisão persistida, comparação e download autenticados ainda precisam completar a homologação. A v13 exige novo login por atualizar a associação das sessões. Consulte o [estado e as pendências observadas](docs/pendencias-2026-10-21.md) e o [guia de acesso](docs/autenticacao-github.md).

**Histórico do fluxo v13:** somente repositórios **públicos** de `ofelipepeixoto` podiam ser cadastrados após confirmação de escopo. Entrar pelo GitHub não importa automaticamente seus repositórios: Projetos mostra os cadastros autorizados no Workbench. A aquisição fixa o commit, confere identidade e hashes e lê até 20 arquivos suportados; lacunas aparecem como cobertura parcial. A leitura pública da API GitHub está sujeita à cota compartilhada por IP. A v13 também permite importar Evidence REA limitado, com proveniência declarada e revisão humana; **não executa o motor REA**. Não há auditoria completa de CVEs nem execução de código do alvo.

O Site público é distinto desta interface Python local e do banco SQLite: a área hospedada usa D1 isolado. [Estado da publicação e verificações](docs/sistema-web-privado.md). A visibilidade do repositório e a audiência do Site são independentes. Não inserir segredos ou dados sensíveis na demonstração.

## Interface local

Requer Python 3.12; não há dependências externas. No diretório do projeto:

```bash
python3 -m workbench serve
```

Abra o endereço `http://127.0.0.1:8765/` **no mesmo computador** e use o usuário `operator` e a senha temporária exibida no terminal. Informe o ID numérico estável retornado pelo campo `id` de `GET /repos/owner/repo`, após conferir a identidade. Cadastre apenas um repositório que você controla ou tem autorização explícita para analisar. Copie o SHA completo de um commit (40 caracteres) da página do repositório para iniciar a análise. Depois abra a análise, revise candidatos e baixe o relatório Markdown. Não coloque essa interface atrás de proxy nem a exponha à internet: a conexão local usa HTTP e a senha não substitui HTTPS para acesso remoto.

Para repositórios privados, a API do GitHub requer um token de acesso com permissão de **leitura de conteúdo** naquele repositório. Configure `GITHUB_TOKEN` no ambiente do processo, conforme o gerenciador de segredos do seu computador; não inclua o token nos comandos exemplificados, no chat ou nos arquivos versionados. Para repositórios públicos, o acesso pode funcionar sem token, sujeito ao limite da API. A integração GitHub do ChatGPT não fornece automaticamente credenciais ao processo local.

Veja [aquisição GitHub e limites](docs/etapa-2.md).

## Fluxo por linha de comando

Requer Python 3.12. Não há dependências externas nesta etapa.

```bash
python3 -m workbench authorize --repo ofelipepeixoto/rea --repository-id 1417322346 --confirm-owned
python3 -m workbench scan --repo ofelipepeixoto/rea --snapshot /caminho/para/copia/rea --revision COMMIT_COMPLETO
python3 -m workbench scan-github --repo ofelipepeixoto/rea --revision SHA_COMPLETO_DE_40_CARACTERES
python3 -m workbench runs
python3 -m workbench report --run ID_DA_ANALISE
python3 -m workbench review --run ID_DA_ANALISE --finding IMPRESSAO_DIGITAL --decision false_positive
python3 -m workbench compare --before ID_ANTERIOR --after ID_NOVO
```

`--snapshot` aponta para arquivos obtidos por um meio já autorizado. Nesse modo, `--revision` continua uma declaração sem verificação externa. Em `scan-github`, a ferramenta confere a identidade do repositório, o commit e o hash Git dos arquivos efetivamente lidos. O operador atesta a autorização ao cadastrar o repositório; a ferramenta não verifica posse da conta. O banco local fica em `.data/workbench.sqlite3` e é ignorado pelo Git.

Detecções iniciais: possível credencial atribuída em código e configurações de GitHub Actions com permissões amplas. A lista de dependências é apenas um inventário: ainda não há consulta de CVEs. Todo achado começa como `candidate`; só a revisão humana pode confirmá-lo. Valores de possíveis segredos não são salvos nem exibidos.

Arquivos grandes ou binários, pastas de dependências e links simbólicos são ignorados. O relatório informa quando a cobertura é parcial. Leia [escopo e critérios da etapa 1](docs/etapa-1.md) antes de usar. Não use o modo local como serviço público.

## Verificação

```bash
python3 -m unittest discover -s tests -v
```

Os testes locais usam valores artificiais e respostas simuladas da API. Verificam autorização, ausência de execução do alvo, redação dos valores, revisão, comparação, identidade e hashes da aquisição, migração do banco e proteção básica da interface. São distintos do smoke de integração real descrito abaixo.


O escopo GitHub vincula nome e `repository_id` inteiro positivo. Mesmo nome com outro ID é recusado antes de ler commits/blobs. Cadastros locais sem ID continuam válidos para `scan`, mas bloqueiam `scan-github` até repetir `authorize` com ID revisado explicitamente. Um ID já vinculado não pode ser substituído por recadastro. As execuções guardam seu próprio ID; rever o escopo não promove o histórico antigo a verificado.

Há migrações **SQLite locais**, idempotentes, em `workbench/store.py`: colunas `source`, `verified_revision` e `repository_id` em `runs`, e `repository_id` em `scope`. Não existem migrations Supabase nesta etapa. Dados anteriores são preservados, mas execuções sem ID perdem o rótulo de verificação de identidade.

O comando `python3 -m workbench import-rea` importa um Evidence JSON nativo de até 1 MiB para um repositório previamente autorizado. A coluna aditiva `provenance` registra a origem; observações estruturais continuam candidatos de baixa confiança e cobertura parcial. O hash do JSON recebido é calculado, mas commit, artefatos e execução do produtor não são verificados. Veja [contrato, exemplos e bloqueio da execução isolada](docs/rea-execucao-2026-10-21.md). O leitor local requer Linux com `O_NOFOLLOW`; a execução nativa no Windows não foi homologada.

Veja a [evidência histórica de identidade](docs/validacao-identidade.md), as [correções de proteção da aquisição](docs/protecoes-aquisicao.md) e a [validação do transporte real](docs/validacao-transporte.md).

O job `github-live` usa a credencial temporária do GitHub Actions, limitada à leitura do próprio Workbench, para executar o cliente real pela CLI e pela interface HTTP em loopback. Não é preciso criar um token pessoal para esse teste. A autenticação do processo local no seu computador continua separada, conforme as instruções acima. O ambiente de teste é Linux com Python 3.12; Windows ainda não foi homologado.

O [smoke do PR #10](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39071494798) passou depois da abertura pública do repositório. Isso valida a aquisição no Actions, não a revisão e comparação reais na hospedagem. Consulte os [contratos e a ordem das próximas integrações](docs/proximas-integracoes.md) para REA, sites autorizados, repositórios privados, CVEs, Supabase, n8n, VPS e agentes/MCP.

## Comunidade e licença

O código autoral está sob [licença MIT](LICENSE); avisos de terceiros são preservados no diretório `web/`. Veja [a origem do adaptador e do starter](web/PROVENANCE.md), o [guia de contribuição](CONTRIBUTING.md) e a [política de segurança](SECURITY.md). Esta versão é experimental: reporte falhas do próprio Workbench por canal privado e não divulgue dados de alvos em issues.

## Evolução em revisão — 21/10/2026

A [matriz das jornadas implementadas](docs/matriz-jornadas-2026-10-21.md) e o [relatório de pendências](docs/pendencias-2026-10-21.md) distinguem código, publicação e homologação. A v13 incorpora as rotas operacionais e correções em PRs ainda sem merge na `main`. A validação consolidada passou em 93 testes Node, 25 Python, TypeScript, lint e build; a correção posterior de retentativa passou em 102 testes Node e ainda aguarda publicação. Login não instala a futura App de repositórios. O operador concluiu a primeira fixture estática do REA no WSL em sete segundos, com uma fonte/342 bytes, zero falhas e unidade encerrada; typecheck completo, entradas arbitrárias e importação hospedada continuam pendentes. Não repetir o preparo: o próximo passo usa o Evidence existente na plataforma.
