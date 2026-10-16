# Verificação do estudo Plandex — 16/10/2026

Ambiente: Python 3.12.14, Linux, biblioteca padrão. Implementação original sobre a PR #2, SHA `c8489f1a9fa73aafa8ecbb010281488815128801`. A atualização da base por ID estável foi preservada antes da publicação desta camada.

## Resultado local observado

`python3 -m unittest discover -s tests -v`: **27 testes aprovados**, sendo 15 novos em `tests/test_changes.py` e 12 da base atual. Testes usam arquivos e identidades fictícios, SQLite temporário, respostas GitHub simuladas e HTTP em loopback para a regressão existente. Nenhum arquivo de projeto externo foi executado.

| Verificação | Evidência |
| --- | --- |
| Proposta comparável | Diff de `VALUE = 1` para `VALUE = 2`, hashes distintos e arquivo alvo preservado. |
| Recuperação | Conexão SQLite fechada/reaberta; proposta e recibo recuperados sem perder a decisão. |
| Revisão vinculada | Hash esperado obrigatório; uma decisão por proposta; rejeição também persistida. |
| Atualidade | Nova análise obrigatória; mudança de arquivo não selecionado, SHA ou repo rejeita revisão. Análise anterior à mais recente é recusada. |
| Contexto obsoleto | Alteração de arquivo selecionado antes de gerar proposta impede sua gravação. |
| Limites/formato | Máximo de caminhos, tamanho por texto, linhas, tamanho do JSON, campos extras e chaves duplicadas recusados. |
| Caminhos | Arquivos fora da seleção, ausentes, duplicados, paths não canônicos e links simbólicos recusados. |
| Representação | Mudanças apenas de fim de linha/CRLF têm hashes e indicadores explícitos. |
| Histórico | Análise antiga sem manifesto requer nova leitura. Corrupção de digest/documento interrompe leitura. |
| Origem GitHub | Manifesto preserva ID 123, verificação e omissões da API simulada. Não é teste de transporte real. |
| CLI | Criar contexto/proposta, consultar diff, revisar e recuperar IDs pelo mesmo banco. |

`git diff --check updated-upstream`: aprovado no diff da entrega. A base remota consultada declara branches sem proteção. A API de rulesets devolveu 403 por indisponibilidade do recurso no plano do repositório privado; não houve mudança de visibilidade, contratação ou relaxamento de proteção. Revisão humana continua necessária.

## Roteiro para revisar o código

1. `docs/plandex-study.md`: contrato, cobertura e operação.
2. `core.py`, `github.py`, `store.py`: manifesto e migração aditiva no SQLite já existente.
3. `changes.py`: contexto, diff somente para leitura e transação de decisão.
4. `__main__.py` e `test_changes.py`: comandos e casos positivos/negativos.

## Limites remanescentes

Não foram homologados aquisição GitHub direta ao vivo, inferência, API paga, n8n, UI nova em navegador, Supabase, produção, carga ou recuperação após perda de energia. O teste de recuperação é reabertura normal do banco, não desastre de infraestrutura. Revisor é uma declaração local; não há identidade de serviço ou isolamento entre clientes. O recibo não autoriza execução.

CI remota deve ser conferida no commit desta PR. Este arquivo registra o resultado local; não declara CI aprovada antecipadamente. Nenhum merge, fork Plandex ou deploy faz parte da entrega.
