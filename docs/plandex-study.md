# Estudo Plandex: contexto fixado e revisão recuperável

## Decisão e base

Implementação original no Security Workbench após a decisão **B — STUDY** da auditoria de 16/10/2026. Referência conceitual: [Plandex no SHA auditado](https://github.com/plandex-ai/plandex/tree/e2d772072efadbe41d2946d97d79be55532dbab5). Nenhum código, prompt, runtime, proxy OAuth ou dependência do Plandex foi incorporado. A licença do repositório inteiro não foi alterada.

Esta camada depende da PR #2 (`feat/github-readonly-local-ui`, base `c8489f1a9fa73aafa8ecbb010281488815128801`), que depende da PR #1. Revisar/integrar na ordem **#1 → #2 → estudo Plandex**. A main ainda não contém essas entregas. O estudo preserva a vinculação por `repository_id` da atualização da PR #2.

O problema tratado é rastrear qual base e quais arquivos sustentam uma proposta de alteração. O resultado é um manifesto limitado, uma comparação para leitura e uma decisão recuperável no SQLite existente. Usar o programa local por CLI nesta etapa; os novos comandos não foram adicionados à interface web.

## Contrato e fronteiras

1. Uma nova análise local ou GitHub registra caminho, tamanho e SHA-256 de cada arquivo efetivamente lido. Os relatórios antigos continuam funcionando, mas análises sem manifesto exigem nova leitura para criar contexto.
2. O contexto seleciona até dez arquivos existentes, até 64 KiB cada e 256 KiB no total. Registra tarefa, versão da política, SHA declarado/verificado, origem, digest, omissões e quantidade não selecionada. Exige a análise mais recente do repositório.
3. A proposta contém substituições completas de texto UTF-8 para arquivos selecionados. Antes de calcular o diff, confere os bytes de **todos os arquivos selecionados** contra o manifesto. Rejeita hash divergente, path duplicado, arquivo ausente, conteúdo nulo/binário, excesso de tamanho/linhas e operação sem mudança.
4. O diff é **somente para leitura**, acompanhado de hashes exatos e indicadores de fim de linha/CRLF/CR. Não é um patch executável. Não suporta criação, remoção, rename ou aplicação automática.
5. Para revisar, é obrigatório fazer uma nova análise. Ela deve ser a mais recente do mesmo repositório e manter SHA, origem, verificação, digest, manifesto e cobertura da base. Mudança em arquivo suportado não selecionado também invalida a comparação. Uma análise com nova revisão SHA invalida a proposta, mesmo se o texto selecionado for igual.
6. A revisão exige o hash exibido da proposta. Uma transação SQLite registra uma única decisão: `accepted_for_study` ou `rejected`. Uma segunda decisão exige nova proposta. `authorization_to_execute` é sempre `false`.
7. Contexto, proposta e recibo sobrevivem ao fechamento do processo. `study-list`, `context-show` e `proposal-show` recuperam o estado. Isso é recuperação dos registros de revisão, **não rollback de workspace nem execução retomável**.

O SHA de uma cópia local continua **declarado**, não autenticado pelo GitHub. Só o caminho existente de aquisição GitHub marca verificação após conferir identidade, commit, árvore e blobs; seus testes usam respostas simuladas. O leitor local não executa nem importa arquivos do alvo.

Cobertura permanece limitada aos tipos suportados pelo scanner. `.md`, arquivos excluídos, binários e outros tipos fora dessa cobertura não passam a ser verificados por este estudo. Um contexto sempre declara `selected-supported-files`; não equivale a todo o repositório. Caminhos nesta fatia aceitam somente caracteres ASCII de letras, números, `_`, `.`, `/` e `-`.

## Uso local reproduzível

Execute no repositório da ferramenta. A cópia a analisar deve ser autorizada, descartável e distinta do banco do Workbench. O programa requer Python 3.12; usa somente biblioteca padrão. Nenhuma instalação de provider é necessária.

```bash
python3 -m workbench authorize --repo fixture/study --confirm-owned
python3 -m workbench scan --repo fixture/study --snapshot /caminho/copia --revision aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

O SHA repetido acima é apenas um rótulo fictício para teste local. Use o identificador de análise impresso em `--run`:

```bash
python3 -m workbench context-create --run ID_ANALISE --path app.py --task 'Revisar uma alteração fictícia'
python3 -m workbench context-show --context ID_CONTEXTO
```

Copie o SHA-256 de `app.py` apresentado no manifesto para um JSON de entrada, mantido fora do Git:

```json
{"changes":[{"path":"app.py","before_sha256":"SHA256_DO_MANIFESTO","after":"VALUE = 2\n"}]}
```

```bash
python3 -m workbench proposal-create --context ID_CONTEXTO --snapshot /caminho/copia --spec /caminho/proposta.json
python3 -m workbench proposal-show --proposal ID_PROPOSTA
```

Inspecione as diferenças. Repita `scan` na **mesma base original** e com o mesmo SHA; esse comando não deve usar uma cópia onde a proposta já foi aplicada. Utilize o novo ID de análise e o hash da proposta na decisão:

```bash
python3 -m workbench proposal-review --proposal ID_PROPOSTA --current-run NOVA_ANALISE --expected-hash HASH_PROPOSTA --reviewer 'Operador local' --decision accepted_for_study
python3 -m workbench study-list
python3 -m workbench proposal-show --proposal ID_PROPOSTA
```

Caso haja divergência, gerar contexto e proposta novos a partir da nova análise. Não substituir o digest do banco nem reutilizar revisão antiga. Também é possível registrar `rejected` para uma proposta cuja base ainda possa ser conferida. Proposta obsoleta permanece sem decisão; não há execução pendente.

## Segurança, privacidade e limitações

- Este é um laboratório local para um operador de confiança. Cadastro de escopo e nome de revisor são declarações locais; não autenticam identidade humana nem substituem autorização de serviço. Não há separação de funções entre pessoas.
- O SQLite conserva hashes/metadata e **diffs com código**. O JSON de entrada contém texto completo proposto. Podem incluir dados privados e segredos; mantenha-os fora do Git e de logs compartilhados. Não há certificação de redação integral. Os comandos de criação imprimem apenas IDs/hashes; o conteúdo é exibido explicitamente por `proposal-show`.
- Hashes detectam divergências acidentais, não alteração maliciosa por quem controla o próprio banco. Não são assinaturas digitais. A revisão é válida para a análise registrada naquele instante; não observa mudanças posteriores no disco ou na branch remota.
- Nenhuma proposta concede execução, acesso remoto, merge, push, shell, deploy ou gasto. Não há timeout de provider a homologar porque nenhum provider é chamado. Não há novos serviços, GPU, banco remoto ou custos recorrentes.
- Evidence Kit, Integration Hub, Observatory, MCP e n8n continuam como possíveis consumidores futuros, sem conexão nesta etapa. Não duplicamos seu ledger financeiro, autenticação ou executor.

## Verificação e reversão

```bash
python3 -m unittest discover -s tests -v
git diff --check
```

Testes cobrem fluxo CLI, estado após reabrir SQLite, revisão única, nova análise obrigatória, mudança de base/revisão/repositório, limites, formato, paths, links simbólicos e integridade do manifesto. A regressão mantém os testes prévios de aquisição simulada e HTTP local. Evidências em [verificacao-plandex.md](verificacao-plandex.md).

Antes de usar um banco existente, copie-o com o processo parado e preserve essa cópia fora do Git. Migração acrescenta uma coluna e duas tabelas; não remove análises antigas. Para reverter a ferramenta, volte à base da PR #2. A versão anterior ignora os campos adicionais; para remover os registros de estudo, restaure a cópia prévia somente se puder descartar alterações locais posteriores. Não há arquivos do alvo para reverter, pois o estudo não escreve neles.

Próxima decisão técnica: revisão humana desta camada e das bases. Integração com autenticação de serviço, Evidence Kit/Hub e interface exige contrato próprio e nova validação; não é desbloqueada por `accepted_for_study`.
