# Dependências — continuação em 21/10/2026

Refs #13. Esta rodada parte do conteúdo do PR #22, árvore
`4e5dbd9211ec7dfc250cdb2819aa0f93292ca871`. As atualizações abaixo alteram os dois
manifestos do adaptador e seu lockfile; não descartam alertas no GitHub nem mudam
as permissões da aplicação. O estado publicado deve ser conferido no registro da
publicação resultante, separado desta validação de código.

## Inventário repetido e cobertura

O `pnpm 11.25.0 audit --json` foi repetido antes e depois dos patches. A consulta
inicial reproduziu **57 entradas / 51 GHSAs / 13 pacotes**: 27 altas, 22 moderadas,
8 baixas e nenhuma crítica. A consulta final, concluída às **20:39:29 UTC /
17:39:29 BRT**, apontou **3 entradas / 3 GHSAs / 2 pacotes**: uma alta, uma moderada,
uma baixa e nenhuma crítica. Código 1 do audit indica correspondências residuais;
não é resultado de build ou teste. O
[snapshot normalizado](dependencias-audit-continuacao-2026-10-21.json) conserva
versões, caminhos e hash SHA-256 do lockfile. Uma entrada pode representar mais
de uma versão instalada ou caminho e não equivale a uma exploração comprovada.

Esses números **não** substituem a contagem do Dependabot. O painel GitHub da
rodada anterior e a base npm são fontes diferentes; nenhuma subtração foi feita
entre seus totais. A consulta autenticada atual do painel depende da frente de
homologação/navegador, e não é declarada como realizada por este audit.

Além disso, a base npm retornada não incluiu os avisos de undici divulgados pelo
mantenedor em 15/10. Eles continuam relevantes e estão registrados abaixo;
reduzir o total do audit não significa ausência de risco.

## Atualizações por grupo

Todos os overrides novos são delimitados à versão afetada, exceto Vite, mantido
em uma versão única coerente com seus plugins. `package.json`,
`pnpm-workspace.yaml` e `pnpm-lock.yaml` estão alinhados. A política
`minimumReleaseAge: 10080`, `trustLockfile: false`, as aprovações de scripts e os
controles existentes foram preservados. Não houve `audit fix`, atualização
forçada de majors ou instalação de ferramenta do alvo.

| Grupo | Pacote e mudança | Caminho representativo | Alcance fundamentado |
| --- | --- | --- | --- |
| Parsers | fast-uri 3.1.7 → 3.1.8 | plugin-rsc → renderer RSC → webpack → schema-utils → ajv | Validação de esquemas do ecossistema de build; não é o fetch nativo do scanner |
| Parsers | fflate 0.7.4 → 0.7.5 | vinext → @vercel/og → satori → @shuding/opentype.js | Renderização/fontes de OG; inclusão e uso no Worker dependem das rotas e do bundle |
| Parsers | image-size 2.0.2 → 2.0.3 | vinext → image-size | O Vinext importa o parser em `metadata-route-build-data`, para arquivos de imagem de metadados; não prova processamento de imagens arbitrárias enviadas ao Workbench |
| Rede das ferramentas | undici 7.24.8 → 7.29.1 | Cloudflare plugin / Wrangler → miniflare → undici | Cliente HTTP de ferramentas locais; não confundir com fetch Workers ou com a versão incorporada ao próprio Node |
| Rede das ferramentas | ws 8.18.0 → 8.21.3 | Cloudflare plugin / miniflare → ws | WebSocket da infraestrutura de desenvolvimento; não expor servidor dev |
| Build | Vite 8.0.13 → 8.1.6 | direto, Cloudflare, React/RSC e Vinext | Compilação e servidor dev; plugins aceitam Vite 8; atualização minor exige build real |
| Build | esbuild 0.28.0 → 0.28.1 | ramo já em 0.28 usado por Vite/tsx | Override restrito a 0.28.0; os ramos 0.18 e 0.27 não foram promovidos à força |
| Build | @babel/core 7.29.0 → 7.29.6 | next → styled-jsx → Babel; plugin de Hooks | Compilação/lint; correção de leitura de sourcemap não equivale a execução de um alvo pelo scanner |
| Build/dados | browserslist 4.28.2 → 4.28.7 | Babel / webpack → browserslist | Resolução de ambientes de compilação |
| Build/dados | baseline-browser-mapping 2.10.30 → 2.11.0 | next e browserslist | Dados e seleção de Baseline; o ramo transitivo de browserslist também resolveu uma versão 2.11 corrigida |
| Lint | js-yaml 4.1.1 → 4.3.2 | ESLint → eslintrc → js-yaml | Leitura de configuração YAML das ferramentas |
| Lint/globs | brace-expansion 1.1.14 → 1.1.21 e 5.0.6 → 5.0.12 | ESLint/TypeScript → minimatch → brace-expansion | Cada major foi preservada; não confundir este pacote com o `braces` residual |

O lockfile foi regenerado com `pnpm install --lockfile-only --ignore-scripts`,
um grupo por vez. O diff maior de Vite inclui identidades de peers e binários
opcionais de Rolldown/Lightning CSS/esbuild; é saída do gerenciador, não código
autoral ou atualização de Wrangler para sua linha beta mais recente.

## Fontes primárias consultadas

Versões, engines, integridade e datas foram conferidas no registro npm, em
`https://registry.npmjs.org/<pacote>/<versão>` e no campo `time` de cada pacote.
As fontes dos mantenedores confirmam os avisos e/ou releases:

- [fast-uri 3.1.8](https://github.com/fastify/fast-uri/releases/tag/v3.1.8) e
  [GHSA-hrr3-gc8f-f4qj](https://github.com/fastify/fast-uri/security/advisories/GHSA-hrr3-gc8f-f4qj).
- [Registro image-size 2.0.3](https://registry.npmjs.org/image-size/2.0.3),
  publicado em 14/09, e
  [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq).
  O upstream informado agora é Codeberg. O repositório GitHub antigo está
  arquivado; a afirmação histórica de que 2.0.3 não existia não foi reutilizada.
  O acesso direto ao Codeberg pelo mecanismo de busca estava bloqueado por robots;
  a publicação e integridade no registro foram verificadas, sem alegar uma nova
  auditoria integral do upstream.
- [Registro fflate 0.7.5](https://registry.npmjs.org/fflate/0.7.5), publicado em
  20/07, e [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98).
  A ausência de uma página GitHub de release 0.7.5 não foi tratada como ausência
  do pacote publicado; sua versão/integridade foram conferidas no registro.
- [Aviso undici corrigido em 7.29.1](https://github.com/nodejs/undici/security/advisories/GHSA-3xpg-4rpp-hhhm),
  [release 7.30.1](https://github.com/nodejs/undici/releases/tag/v7.30.1) e
  [registro 7.30.1](https://registry.npmjs.org/undici/7.30.1).
- [Aviso ws](https://github.com/websockets/ws/security/advisories/GHSA-96hv-2xvq-fx4p)
  e [release 8.21.3](https://github.com/websockets/ws/releases/tag/8.21.3).
- [Aviso Vite com patch 8.1.6](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22).
- [Aviso esbuild / patch 0.28.1](https://github.com/evanw/esbuild/security/advisories/GHSA-g7r4-m6w7-qqqr).
- [Aviso Babel / patch 7.29.6](https://github.com/babel/babel/security/advisories/GHSA-4x5r-pxfx-6jf8).
- [Browserslist 4.28.7](https://github.com/browserslist/browserslist/releases/tag/4.28.7)
  e [Baseline 2.11.0](https://github.com/web-platform-dx/baseline-browser-mapping/releases/tag/v2.11.0).
- [js-yaml / patch 4.3.2](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh)
  e [avisos brace-expansion](https://github.com/juliangruber/brace-expansion/security/advisories).

## Exceções e acompanhamento

| Item | Risco e condição | Mitigação atual / próxima ação |
| --- | --- | --- |
| braces 3.0.3 / GHSA-vfj7-8cjw-p6xm — alta | Pilha esgotada por padrões profundamente aninhados; o registro consultado não informa versão corrigida publicada | Entradas de globs permanecem no código/configuração confiável do build; o scanner não importa/compila arquivos do alvo. Reavaliar os pais fast-glob/micromatch e versão corrigida; não descartar o alerta |
| esbuild 0.18.20 / GHSA-67mh-4wv8-2f99 — moderada | Servidor dev esbuild; ramo legado de drizzle-kit → esm-loader → core-utils | Não usar `esbuild.serve` nem expor ferramentas de desenvolvimento. Migrar/remover o loader por uma versão suportada do pai, com teste de geração de migração; não impor 0.28 ao ramo 0.18 |
| esbuild 0.27.3 / GHSA-g7r4-m6w7-qqqr — baixa | Leitura fora da pasta ao executar servidor dev no Windows; ramo fixado de Wrangler | Dev local em loopback; sem uso de `esbuild.serve` nesta entrega. Atualizar a combinação Cloudflare/Wrangler em PR próprio e testar o runtime; não substituir o binário/API à força |
| undici 7.29.1 — avisos adicionais de 15/10, fora da resposta npm | O mantenedor corrigiu mais condições de rede em 7.30.1, incluindo GHSA-xjj6-f33q-929c e GHSA-qrxm-fqhp-jwvm | Não declarar undici integralmente corrigido. A versão foi publicada em 15/10 às 14:18:31.283 UTC e completa os sete dias da política em **22/10/2026 às 14:18:31.283 UTC / 11:18:31 BRT**. Reavaliar fontes, fixar/testar 7.30.1 após esse marco, sem diminuir a política |

A busca de nomes/caminhos de módulos no bundle minificado de validação não
encontrou os nomes residuais. Isso **não comprova ausência de código ou de
alcançabilidade**; não foi usado para descartar alertas. A fonte, os limites de
entrada, o artefato e sua publicação continuam dimensões diferentes.

## Validação e reversão

Instalação congelada pelo instalador existente aprovada: 487 pacotes reutilizados,
28 baixados, sem alteração de política. Confirmados na instalação Vite 8.1.6,
undici 7.29.1, ws 8.21.3 e os parsers fixados. Smoke benigno real: PNG 1×1 por
image-size, normalização de URI e roundtrip zlib por fflate aprovados.

Para isolar esta camada das edições concorrentes de autenticação/UX, foi validada
uma cópia de trabalho da base do PR #22 com **somente os três manifestos/lockfile
atualizados**: **56/56 testes Node, TypeScript e build Sites aprovados**. Não houve
deploy desse diretório. A aplicação combinada com as novas jornadas exige sua
própria validação final; o resultado desta camada não a substitui.

Os três incrementos foram preservados separadamente para revisão/PRs. Antes da
publicação, reverter somente o grupo de manifests/lockfile em questão restaura
a camada anterior. Depois, publicar um artefato revisado, preservando esquema,
identidade e dados. Não remover controles nem reintroduzir dependência vulnerável
sem registrar o motivo e o risco residual.
