# Validação do transporte real — 17/10/2026

## Contrato de teste

O job `github-live` em `.github/workflows/checks.yml` executa `python -m scripts.smoke_github` após os testes locais, em PRs originados no próprio repositório. O token temporário do job recebe somente `contents: read`, não é salvo no checkout e é passado apenas ao passo de smoke. Não há token pessoal, nova credencial persistente, agendamento, publicação ou deploy.

Alvo fixado e autorizado: repositório privado `ofelipepeixoto/security-workbench`, ID `1419403320`, commit completo `c8489f1a9fa73aafa8ecbb010281488815128801` (versão enviada do PR #2). Um preflight exige que o repositório continue privado. O cliente da aplicação confere nome/ID, commit, árvore e hash Git de cada arquivo consumido. Não se usa replay do conector nem mock neste job.

1. CLI em subprocesso real: autorização, `scan-github`, persistência de identidade/revisão verificada e geração de relatório.
2. HTTP local real: servidor em loopback com senha temporária, recusa de acesso sem senha e de origem divergente, cadastro de escopo, nova aquisição pelo scanner padrão, histórico, página da análise e download de relatório.
3. Comparação: duas aquisições independentes do mesmo commit devem produzir mesmo digest/quantidade de arquivos e nenhuma alteração nas impressões digitais.

O código da plataforma é executado como ferramenta sob teste. Os bytes adquiridos do alvo são somente analisados como texto: não são importados, compilados ou executados. O SQLite é temporário; fonte, credencial, banco e relatório completo não são publicados como artefatos ou logs. A saída contém somente identidade, commit, digest, contagens e status. O job tem timeout de cinco minutos e o coletor mantém os limites de aquisição.

## Evidência

Os **17 testes locais** passaram em 17/10/2026. O smoke real está preparado; seu resultado será registrado no PR após a execução no GitHub Actions. Essa preparação, sozinha, não comprova acesso real à API.

## Limites

- O alvo é um único commit do próprio Workbench, nos formatos suportados. Não é uma auditoria completa de segurança, nem uma análise real integral do REA.
- O fluxo HTTP é testado programaticamente no runner Linux; não comprova usabilidade visual no navegador, funcionamento no Windows ou autenticação de um processo no computador do usuário.
- Revisão humana de achados não é substituída pelo smoke. Contagens de candidatos não são vulnerabilidades confirmadas. Inventário não consulta CVEs.
- A interface continua exclusiva de loopback/HTTP; não há operação remota homologada. Os PRs #3 e #4, de estudos Plandex/Supabase, são camadas distintas e não fazem parte deste alvo.
- Ordem desta entrega: #1 → #2 → #5 (proteções) → PR de smoke dependente de #5. Os PRs #3/#4 permanecem em suas branches; eventual integração conjunta exigirá atualizar e validar as dependências, sem reescrever histórico automaticamente.

Documentação oficial consultada em 17/10/2026: [GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token) e [permissões mínimas](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token).
