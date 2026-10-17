# Preparação para abertura à comunidade — 17/10/2026

## Estado confirmado nesta sessão

- `ofelipepeixoto/security-workbench` permanece **privado**. Os PRs [#1](https://github.com/ofelipepeixoto/security-workbench/pull/1), [#2](https://github.com/ofelipepeixoto/security-workbench/pull/2), [#5](https://github.com/ofelipepeixoto/security-workbench/pull/5), [#6](https://github.com/ofelipepeixoto/security-workbench/pull/6), [#7](https://github.com/ofelipepeixoto/security-workbench/pull/7) e [#8](https://github.com/ofelipepeixoto/security-workbench/pull/8) foram integrados à `main` na ordem de dependência. Os estudos #3/#4 permanecem separados.
- A `main` contém o núcleo Python/SQLite e o adaptador Sites/Workers/D1 em `web/`. O [Site](https://security-workbench.camaleaoweb3.com.br/) continua público como demonstração fictícia; a operação real exige identidade ChatGPT no servidor. Tornar o repositório público não altera essas regras do Site.
- `LICENSE` estabelece MIT para o código autoral. `CONTRIBUTING.md` e `SECURITY.md` orientam contribuições e relatos privados. O aviso `web/build/sites-vite-plugin.LICENSE` e o histórico de origem em `web/PROVENANCE.md` foram preservados.
- A CI do head final do PR #8, `8cf05bf0869a3f7f5e441b69dec76a584964cfbc`, passou no [run 39069698157](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39069698157). A CI da `main` após os merges deve ser conferida separadamente.
- Foram examinados os **44 logs de jobs** dos 20 runs históricos disponíveis antes dos merges. Uma busca automatizada por formatos comuns de tokens, chaves privadas, URLs com usuário/senha, variáveis de segredo e credenciais não detectou valor exposto. Logs mostram `token: ***` mascarado pelo GitHub e o uso temporário do `github.token`. Essa revisão por padrões não comprova ausência de qualquer dado sensível.
- A revisão anterior examinou nomes dos 78 blobs no head da branch web e diffs de 18 commits alcançáveis, sem encontrar credenciais reais nos padrões usados. Nenhum artefato de Actions foi listado nos runs anteriores. Objetos Git inacessíveis, todos os anexos possíveis e segredos que não seguem formatos usuais não foram exaustivamente auditados.
- A análise real do REA na hospedagem cobriu 20 arquivos e 72.882 bytes, com **cobertura parcial**. Zero candidatos nesse recorte não equivale a auditoria completa. Revisão de candidato real e comparação de duas análises hospedadas ainda carecem de homologação.

## Verificações finais antes e depois de tornar público

1. Confirmar a CI da `main` final e revisar a apresentação do README, licença, política de segurança, issues e link da demonstração.
2. Conferir a configuração de divulgação privada de vulnerabilidades no GitHub. Caso indisponível, estabelecer um canal privado claro para relatos.
3. Ao mudar a visibilidade, verificar como visitante anônimo o código na `main`, o histórico de Actions, a licença e o link do Site. Tratar imediatamente qualquer dado sensível descoberto, incluindo revogação de credenciais.
4. Identificar a versão como **experimental** e considerar um marco `v0.1.0` somente depois dessa conferência. Não apresentar candidatos como vulnerabilidades confirmadas nem afirmar auditoria integral.

A publicação do código é uma operação separada de merge e da audiência do Site; **esta nota não altera a visibilidade**.

## Pautas de comunicação

- **Problema:** por que observações estruturais não devem virar vulnerabilidades confirmadas; mostrar revisão humana com fixture.
- **Construção:** aquisição somente leitura, fixação de commit, identidade e hashes; demonstrar com dados próprios.
- **Limites e convite:** divulgar a demo fictícia, cobertura parcial e backlog; convidar revisão de testes, UX e documentação.

Nunca publicar credenciais, bancos, relatórios de terceiros ou resultados sensíveis de alvos reais.
