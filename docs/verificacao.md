# Verificação da primeira entrega

## Exercício local observado

- Python 3.12.14; `python3 -m unittest discover -s tests -v`: **4 testes aprovados**.
- Os testes verificaram bloqueio de escopo não cadastrado, leitura sem execução de código alvo, redigir valor fictício, inventário, revisão, comparação, rejeição de symlink e arquivo acima de 1 MiB.
- A amostra lida do repositório próprio `ofelipepeixoto/rea` foi obtida no commit `3e7c6302233ecbcb9b92e43ee5a60337738961bd`: `package.json` completo e as primeiras 120 linhas de `src/cli.ts`.
- Análise local dessa amostra: execução `7e62d55c3f94404a`, digest da cópia `bc4d4f82140f713a9dc434025b14aaa6cb6f1c37ea5a3ef549b195b70da76e73`, 2 arquivos, 29.046 bytes, 57 itens de dependências inventariados, zero candidatos nos dois arquivos. Cobertura **PARCIAL** declarada.

## Limites

O rótulo de commit foi observado pelo conector GitHub, mas a aplicação ainda não confronta a cópia local com o GitHub ou verifica integridade por arquivo remoto. A amostra não representa o repositório completo. Zero candidatos nessa amostra não significa ausência de vulnerabilidades. A execução não consultou CVEs, não testou sites e não usou REA.

O banco local e a cópia de demonstração não foram versionados. CI remoto e revisão do PR devem ser registrados separadamente após o envio; não são resultados desta verificação local.
