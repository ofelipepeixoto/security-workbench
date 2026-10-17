# Adaptador para a área privada no navegador

A primeira versão foi planejada com acesso por link privado em 17/10/2026; depois o proprietário autorizou demonstração pública com operação protegida. O núcleo Python integrado originalmente pelo PR #6 continua preservado. O runtime de Sites usa JavaScript/Workers, por isso esta camada adapta as regras existentes em um módulo independente, com fixture de conformidade Python.

## Contrato

- `web/lib/scanner.mjs`: somente `GET` HTTPS em `api.github.com`, sem tokens, cookies, redirects ou execução de código alvo. Aceita apenas repositórios **públicos** do namespace próprio `ofelipepeixoto`.
- Confere nome e ID estável previamente autorizado, resolve a branch atual para um SHA completo ou recebe um SHA fixo, confere commit/árvore e o hash Git de cada blob adquirido.
- O piloto web tem limites menores: 20 blobs, 2 MiB totais e 256 KiB por arquivo; respostas JSON até 4 MiB e prazo de 45 segundos. Binários/vazios consomem orçamento. Limites/truncamentos são explícitos na cobertura parcial. Até 100 candidatos e 500 dependências no resultado.
- Mesmas duas regras iniciais e textos do Python: possível credencial atribuída e permissões amplas de Actions. Inventário não consulta CVEs. Origens de dependências potencialmente sensíveis são redigidas integralmente antes da persistência. Markdown escapa campos externos.

## Verificação

`node --test web/tests/scanner.test.mjs`: **12 testes aprovados localmente**. Uma fixture gerada com o Python da versão do PR #6 confirma igualdade de textos, fingerprints, dependências e digest de um conjunto simples. Essa fixture não comprova paridade integral entre linguagens ou formatos.

`web/tests/live-smoke.mjs` é separado dos mocks e só executa no Actions deste repositório. Alvo autorizado fixo: `ofelipepeixoto/rea`, ID `1417322346`, commit `3e7c6302233ecbcb9b92e43ee5a60337738961bd`. Emite apenas identidade, hashes e contagens. O [resultado remoto](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39063959367) foi registrado com cobertura parcial: 20 arquivos / 72.882 bytes e zero candidatos nesse recorte; não há credencial pessoal ou conteúdo alvo no log.

## Dependência e operação

Esta camada foi integrada depois do PR #6 e mantém o módulo Python/SQLite. A interface, autenticação Sites e armazenamento isolado são uma camada dependente, sem migração dos dois projetos Supabase de outros sistemas. O conector GitHub do ChatGPT não é automaticamente disponibilizado ao site; a primeira versão web não acessa repositórios privados.

O código dos PRs #6, #7 e #8 está integrado na `main`. O Site publicado e a sua autenticação continuam operações separadas do repositório GitHub.
