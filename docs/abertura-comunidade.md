# Preparação para abertura à comunidade — 17/10/2026

## Decisão proposta

Recomendo publicar o código após uma revisão final, com licença explícita e uma branch principal útil. **Esta nota não altera a visibilidade do repositório nem autoriza merge.** O Site público em https://security-workbench.camaleaoweb3.com.br/ é independente da visibilidade do código.

## Estado observado

- `ofelipepeixoto/security-workbench` está **privado**. A `main` contém apenas um README inicial; as funcionalidades estão distribuídas em PRs encadeados, especialmente #1 → #2 → #5 → #6 → #7 → #8. A #8 está aberta em rascunho, baseada em `feat/web-public-scanner`.
- A fonte do Site está no diretório `web/`, além do núcleo local Python/SQLite. A versão 9 do Site está publicada; visitantes anônimos veem somente demonstração fictícia. A API recusou GET anônimo e com cabeçalhos de identidade forjados (HTTP 401). A área real continua autenticada via ChatGPT.
- A CI do commit `155ca0c3304321632c16827bf930014a1f2550cc` terminou com sucesso; os 17 testes Python e 23 Node também passaram localmente. A análise real do REA cobriu só 20 arquivos; zero candidatos nesse recorte não é auditoria completa.
- Inventário de 9 branches, 78 blobs na branch web e diffs de 18 commits alcançáveis nas linhas revisadas: nenhum `.env`, banco, chave privada, token pessoal ou valor de produção detectado nos padrões inspecionados. Ocorrências de `password` eram fixtures de testes e `GITHUB_TOKEN` era a expressão temporária `${{ github.token }}` do Actions. Não equivale a comprovação de ausência de segredos em todos os logs, comentários ou objetos Git não alcançáveis.
- Foram listados 19 runs do Actions e nenhum artefato de run foi retornado no momento da revisão. O conteúdo de todos os logs não foi auditado linha por linha.
- Não existe `LICENSE` na branch web; `web/build/sites-vite-plugin.LICENSE` preserva licença MIT de uma parte do starter, sem licenciar automaticamente o projeto inteiro. `web/PROVENANCE.md` distingue a base Sites e a aplicação.

## Antes de mudar a visibilidade

1. Revisar os logs históricos do Actions e qualquer PR/comentário/anexo que ficará público. Se aparecer segredo, revogá-lo e tratar o histórico antes da publicação; remover apenas o arquivo atual não apaga commits anteriores.
2. Revisar as PRs na ordem de dependência e integrar uma versão coerente na `main` com CI aprovada. Sem isso, o visitante abrirá um repositório cuja página inicial não contém a implementação.
3. Escolher conscientemente uma licença para o código autoral (MIT é uma opção simples de colaboração; Apache-2.0 é outra). Preservar avisos e condições do código de terceiros. Publicar sem licença permite leitura/fork dentro das regras do GitHub, mas não dá permissão ampla de reutilização.
4. Incluir `CONTRIBUTING.md` e `SECURITY.md`: como reproduzir testes, usar só alvos próprios/autorizados e fixtures, enviar PRs, relatar falhas de segurança por canal privado, e não anexar segredos ou resultados sensíveis em issues.
5. Confirmar a descrição pública e os limites do README: demonstração fictícia sem login; operação real autenticada; escopo apenas do proprietário; cobertura parcial; nenhuma promessa de CVE ou auditoria completa. A primeira release pode ser v0.1.0, sem alegar prontidão de produção.
6. Depois de tornar público, conferir visibilidade anônima da `main`, README, licença, instruções, Actions, issues e link do Site no perfil. Não fazer merge ou deploy como efeito colateral da mudança de visibilidade.

## Pauta de comunicação

- **Post 1 — problema:** por que observações estruturais não devem virar vulnerabilidades confirmadas; mostrar a jornada de revisão humana.
- **Post 2 — construção:** aquisição somente leitura, fixação de commit, identidade e hashes; demonstrar com fixture, sem expor dados de terceiros.
- **Post 3 — limites e convite:** divulgar a demo fictícia, cobertura parcial e backlog; pedir revisão de testes, UX, segurança do fluxo e documentação por issue/PR.

Nunca publicar credenciais, relatórios de terceiros, capturas privadas, bancos ou detalhes que facilitem exploração de alvos reais sem autorização.
