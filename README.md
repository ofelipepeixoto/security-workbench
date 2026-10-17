# Security Workbench

Plataforma privada em construção para inspecionar ativos **autorizados**. O núcleo local analisa cópias ou lê arquivos de um commit específico pelo GitHub, sem executar código do alvo. Os resultados ficam em SQLite local.

## Site e demonstração online

[Abra a demonstração pública](https://security-workbench.camaleaoweb3.com.br/) sem login. Ela usa **apenas dados fictícios no navegador**: explore projetos, análise, revisão, relatório e comparação sem gravar no servidor ou analisar um repositório real.

Para a operação real, o proprietário acessa a área autenticada com ChatGPT. O Site exige identidade no servidor antes de ler ou modificar projetos, análises e relatórios. Nesta versão hospedada, somente repositórios **públicos** de `ofelipepeixoto` podem ser cadastrados após confirmação de escopo. A aquisição fixa o commit, confere identidade e hashes e lê até 20 arquivos suportados; lacunas aparecem como cobertura parcial. Não há auditoria completa de CVEs nem execução de código do alvo. A leitura pública da API GitHub está sujeita à cota compartilhada por IP.

O Site público é distinto desta interface Python local e do banco SQLite: a área hospedada usa D1 isolado. [Estado da publicação e verificações](docs/sistema-web-privado.md) · [PR #8 em rascunho](https://github.com/ofelipepeixoto/security-workbench/pull/8). O repositório continua **privado**; o link do código requer permissão no GitHub. Não inserir segredos ou dados sensíveis na demonstração.

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

Veja a [evidência histórica de identidade](docs/validacao-identidade.md), as [correções de proteção da aquisição](docs/protecoes-aquisicao.md) e a [validação do transporte real](docs/validacao-transporte.md).

O job `github-live` usa a credencial temporária do GitHub Actions, limitada à leitura do próprio Workbench, para executar o cliente real pela CLI e pela interface HTTP em loopback. Não é preciso criar um token pessoal para esse teste. A autenticação do processo local no seu computador continua separada, conforme as instruções acima. O ambiente de teste é Linux com Python 3.12; Windows ainda não foi homologado.
