# Identidade estável e aquisição real — 16/10/2026

## Correção e regressões

Escopo e execuções persistem `repository_id`. A aquisição exige nome normalizado e ID exatamente iguais ao escopo antes de ler commit, árvore ou blobs. ID ausente, booleano, zero ou negativo é recusado. Um repositório recriado sob o mesmo nome (123→456) é bloqueado. CLI e UI recebem o ID na autorização explícita; não há captura automática de identidade no primeiro scan.

A migração SQLite adiciona colunas sem apagar runs, achados, dependências ou decisões. Runs antigos sem ID, inclusive os anteriormente marcados como verificados, ficam não verificados. Revisar o escopo não reclassifica execuções históricas. As migrações são locais em `store.py`, não migrations Supabase.

Python 3.12.14: 12 testes aprovados (`python3 -m unittest discover -s tests -v`), incluindo regressões, CLI/UI, migração repetida e falhas de identidade. Todas as respostas de aquisição usadas nos testes automatizados são simuladas.

## Aquisição real independente dos mocks

Leituras GET via conector GitHub já autorizado de Carlos confirmaram repositório público `ofelipepeixoto/rea`, ID `1417322346`, commit `3e7c6302233ecbcb9b92e43ee5a60337738961bd` e árvore `69d65d207787cf931fb53522fb40be7ba0fe81c7`. Foram lidas as árvores raiz e `src` e obtidos por SHA os blobs completos de `package.json` e `src/cli.ts`. Os bytes UTF-8 retornados foram conferidos por tamanho e SHA Git (`sha1("blob " + tamanho + NUL + bytes)`) contra as entradas das árvores. A árvore `src` corresponde à entrada da árvore raiz. A cópia estática foi gravada somente em `.data/real-snapshot` do Workbench. Nenhum código REA foi executado e o checkout REA do ambiente não foi alterado.

| Arquivo | Bytes | SHA Git | SHA-256 |
|---|---:|---|---|
| `package.json` | 22691 | `70ab60d1e3a9a56ef537c73beb92f7be3777a814` | `4dab2dc0f78506940e89277c6696e96d0fe461d20c09ebe7ed91a9ed4a303820` |
| `src/cli.ts` | 7039 | `d1bdf291241f60830fc1679d3b18336747264404` | `019b7f0ccb60e924decbc5792e0f59e888e47c5e6662e0336a858e270df791f5` |

Análise local da cópia: execução `c575feee5c0a4bea`, **2 arquivos / 29730 bytes**, 57 dependências inventariadas, 0 candidatos. Digest dos arquivos lidos: `2ec03f0029488a1c8abe1434d8a16d9cc0cba6401c6e8f9052e50e3f3ab80f0e`. Cobertura **PARCIAL**, limitada a esses dois arquivos. Zero candidatos não comprova segurança.

O relatório Markdown foi gerado e conferido: identidade observada acima é evidência externa; a execução do modo `scan` conserva origem local e revisão declarada, sem elevar artificialmente o indicador `verified_revision`. Artefatos locais ignorados pelo Git: `.data/real-acquisition.json`, `.data/real-summary.json`, `.data/real-report.md` e `.data/real.sqlite3`. Apenas este resumo de hashes/resultado é versionado, sem cópia alvo ou banco.

## Bloqueio remanescente

O `gh` local retornou `Forbidden` para o Workbench. O cliente HTTP real da aplicação (`_request_json`) retornou `URLError` ao consultar o repositório público REA. Não houve alteração de acesso, permissões ou credenciais. O conector autorizado permitiu a aquisição estática real descrita acima, mas **`scan-github` direto ponta a ponta continua não validado**. Não houve replay de respostas do conector apresentado como transporte ao vivo. Validação de hashes dos dois blobs não equivale à cobertura integral do repositório nem à verificação criptográfica da assinatura do commit.

Esta evidência complementa `docs/verificacao.md` (amostra histórica da etapa 1, com apenas 120 linhas de `src/cli.ts`); os números são diferentes porque agora os dois blobs são completos. Sem scanners de serviços, dados de clientes, novas credenciais, APIs pagas, merge ou deploy.
