# Validação do transporte real — 17/10/2026

## Contrato de teste

O job `github-live` em `.github/workflows/checks.yml` executa `python -m scripts.smoke_github` após os testes locais, em PRs originados no próprio repositório. O token temporário do job recebe somente `contents: read`, não é salvo no checkout e é passado apenas ao passo de smoke. Não há token pessoal, nova credencial persistente, agendamento, publicação ou deploy.

Alvo fixado e autorizado: repositório privado `ofelipepeixoto/security-workbench`, ID `1419403320`, commit completo `c8489f1a9fa73aafa8ecbb010281488815128801` (versão enviada do PR #2). Um preflight exige que o repositório continue privado. O cliente da aplicação confere nome/ID, commit, árvore e hash Git de cada arquivo consumido. Não se usa replay do conector nem mock neste job.

1. CLI em subprocesso real: autorização, `scan-github`, persistência de identidade/revisão verificada e geração de relatório.
2. HTTP local real: servidor em loopback com senha temporária, recusa de acesso sem senha e de origem divergente, cadastro de escopo, nova aquisição pelo scanner padrão, histórico, página da análise e download de relatório.
3. Comparação: duas aquisições independentes do mesmo commit devem produzir mesmo digest/quantidade de arquivos e nenhuma alteração nas impressões digitais.

O código da plataforma é executado como ferramenta sob teste. Os bytes adquiridos do alvo são somente analisados como texto: não são importados, compilados ou executados. O SQLite é temporário; fonte, credencial, banco e relatório completo não são publicados como artefatos ou logs. A saída contém somente identidade, commit, digest, contagens e status. O job tem timeout de cinco minutos e o coletor mantém os limites de aquisição.

## Evidência

Os **17 testes locais** passaram em 17/10/2026. No [GitHub Actions run 39061685058](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39061685058), os jobs `test` e `github-live` concluíram com **success** para o código de teste `c60127355963d0090892d7ff74642fb4d8970148`. O passo real terminou às 19:16:01 UTC (16:16:01 em São Paulo), em 17/10/2026.

| Evidência do job real | Resultado |
| --- | --- |
| Transporte | HTTPS direto do cliente da aplicação à API GitHub |
| Identidade | `ofelipepeixoto/security-workbench`, ID `1419403320`, privado confirmado |
| Commit alvo | `c8489f1a9fa73aafa8ecbb010281488815128801` |
| Fluxos | CLI em subprocesso + servidor HTTP loopback, ambos com scanner real |
| Aquisições | 2 independentes |
| Conteúdo analisado por execução | 10 arquivos, 57.815 bytes |
| Digest dos arquivos lidos | `2ff872b507b0ea872ae3b584c1f5ce1bd1dbef9eec6c1e57edf316ce10671e15` |
| Candidatos por execução | 3, sem confirmação humana de vulnerabilidade |
| Dependências | 0 manifestos reconhecidos neste commit do Workbench |
| Comparação do mesmo commit | Aprovada: mesmo digest e nenhum candidato novo/deixou de ser detectado |
| Cobertura | Formatos suportados; nenhum limite/omissão parcial acionado nessa execução |

O `partial=false` do resumo significa que não houve omissão adicional nos formatos suportados; não indica auditoria integral ou segurança do repositório. O run usa credencial temporária do próprio Actions, não token pessoal ou credencial do conector. A limitação de transporte registrada em 16/10 foi resolvida **neste runner**; isso não modifica a restrição de rede do workspace ou configura autenticação no computador do usuário.

## Limites

- O alvo é um único commit do próprio Workbench, nos formatos suportados. Não é uma auditoria completa de segurança, nem uma análise real integral do REA.
- O fluxo HTTP é testado programaticamente no runner Linux; não comprova usabilidade visual no navegador, funcionamento no Windows ou autenticação de um processo no computador do usuário.
- Revisão humana de achados não é substituída pelo smoke. Contagens de candidatos não são vulnerabilidades confirmadas. Inventário não consulta CVEs.
- A interface continua exclusiva de loopback/HTTP; não há operação remota homologada. Os PRs #3 e #4, de estudos Plandex/Supabase, são camadas distintas e não fazem parte deste alvo.
- Ordem desta entrega: #1 → #2 → #5 (proteções) → PR de smoke dependente de #5. Os PRs #3/#4 permanecem em suas branches; eventual integração conjunta exigirá atualizar e validar as dependências, sem reescrever histórico automaticamente.

Documentação oficial consultada em 17/10/2026: [GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token) e [permissões mínimas](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token).

## Preparação para visibilidade pública

Esta evidência foi produzida quando o Workbench ainda era privado. O smoke continua restrito aos PRs do próprio repositório, ao nome e ID estáveis e ao commit fixo; a verificação da visibilidade agora exige apenas um valor booleano real da API, permitindo futuras execuções após uma eventual abertura do código. O job usa o token temporário de leitura do Actions em ambos os casos. A execução em repositório público ainda dependerá de validação após a mudança de visibilidade.
