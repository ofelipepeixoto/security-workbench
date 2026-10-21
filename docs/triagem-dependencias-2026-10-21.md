# Triagem das dependências do Workbench — 21/10/2026

Refs #13. Base: `main` `cf906efd01c832632f96eafac6555d55f4e39ff9`.
Nenhum alerta foi descartado; correspondência de versão não prova exploração.

**Atualização de publicação:** os PRs #18/#19 foram combinados e publicados no
Site **v12**, com React/DOM/RSC 19.2.8, sharp 0.35.5 e source-map-js 1.2.2.
O texto do primeiro PR e o snapshot npm abaixo preservam o momento anterior ao
patch RSC; não representam a fonte hospedada final. Veja o
[registro de publicação](publicacao-2026-10-21.md) e o
[relatório de pendências](pendencias-2026-10-21.md). Não foi feito merge em `main`.

Uma consulta adicional do lockfile final, correspondente à fonte Sites v12,
concluiu em 21/10 às 20:14 UTC: **57 entradas, 51 GHSAs e 13 pacotes** (27 altas,
22 moderadas, 8 baixas, zero críticas). O
[snapshot pós-publicação](dependencias-audit-pos-publicacao-2026-10-21.json) conserva
caminhos, versões e limites de projeção. O renderer RSC já não aparece nesse
inventário. A contagem GitHub não foi reprocessada/comprovada após a publicação.

## Duas fontes, contagens diferentes

O painel autenticado do GitHub mostrou **38 alertas abertos: 16 altos, 15 moderados,
7 baixos, zero críticos**, em duas páginas. O próprio painel indicava processamento
dos manifestos em 17/10. A consulta atual confirma o que o painel mostra, não que
seu inventário tenha sido recalculado hoje. O conector não oferece o endpoint
Dependabot; a tentativa GET foi recusada como endpoint não suportado.

Depois dos patches abaixo, `pnpm audit --json` consultou a base do registro npm e
retornou **58 entradas, 52 GHSAs distintos, em 14 pacotes**, com 28 altas, 22
moderadas, 8 baixas e zero críticas. Não são 58 alertas GitHub e não se deve subtrair
esse número dos 38. Uma mesma GHSA pode afetar duas versões instaladas. O comando
terminou com código 1 porque ainda existem correspondências; não significa build
ou teste reprovado. [Snapshot normalizado](dependencias-audit-2026-10-21.json) inclui
intervalos, versões instaladas e até três caminhos por ocorrência, com total
explícito. Regenerar com pnpm 11.25.0, sem `audit fix` automático.

## Grupos do painel GitHub antes da mudança

Todos são npm. `L` = `web/pnpm-lock.yaml`; `P` = `web/package.json`.
Os caminhos foram reconciliados com `pnpm why --json` e o lockfile, não apenas
com o rótulo Development do GitHub. Estar em devDependencies não prova ausência
no bundle servidor.

| Pacote / versão base | Alertas | Manifesto | Caminho representativo e alcance |
| --- | --- | --- | --- |
| source-map-js 1.2.1 | #65 | L | next e Vite/PostCSS → source-map-js; compilação/maps, possível uso servidor a verificar |
| sharp 0.35.4 | #66 | L | next → sharp; miniflare → sharp; imagens/infra local, alcance no Worker depende do bundle |
| vite 8.0.13 | #1, #2, #16, #17 | P, L | direto e plugins React/RSC/Cloudflare; dev/build, não expor servidor dev |
| ws 8.18.0 | #14 | L | Cloudflare plugin / miniflare → ws; ferramentas de desenvolvimento |
| browserslist 4.28.2 | #40, #41 | L | Babel e webpack → browserslist; compilação e dados de browsers |
| js-yaml 4.1.1 | #25, #28, #39, #44 | L | eslint → eslintrc → js-yaml; lint/configuração |
| brace-expansion 1.1.14 / 5.0.6 | #26, #27, #60, #61 | L | ESLint/TypeScript → minimatch → brace-expansion; globs de ferramentas |
| undici 7.24.8 | #18–#21, #23, #24, #34–#38, #48–#51, #54, #55 | L | wrangler/miniflare → undici; cliente HTTP das ferramentas, distinto do fetch nativo do scanner |
| baseline-browser-mapping 2.10.30 | #43 | L | next, browserslist; compilação/mapeamento |
| esbuild 0.18.20 e demais versões | #11, #13 | L | drizzle-kit → esm-loader → core-utils → esbuild; Vite/Wrangler usam outras versões; não forçar major global |
| @babel/core 7.29.0 | #15 | L | next → styled-jsx → Babel e eslint-plugin-react-hooks; build, possível inclusão no servidor a verificar |

## Primeiro PR: patches delimitados e CI

- `source-map-js` **1.2.1 → 1.2.2**, override transitivo; correção da
  [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
  confirmada na [release do mantenedor](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2).
- `sharp` **0.35.4 → 0.35.5**, override global e de miniflare coerentes no
  package.json, workspace e lockfile. O [aviso do mantenedor](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)
  e a [release](https://github.com/lovell/sharp/releases/tag/v0.35.5) fundamentam a
  atualização. A instalação Linux confirmou `sharp 0.35.5` e `rsvg 2.63.2`.
  Condições específicas de SVG/glibc não foram exploradas no Workbench.
- Lockfile regenerado por `pnpm install --lockfile-only --ignore-scripts` e
  instalação congelada pelo instalador existente. O diff maior é dos binários
  opcionais sharp/libvips de cada plataforma, não de atualizações em massa.
- CI passa a instalar lockfile congelado, executar testes Node, TypeScript e
  build em Node 24. Actions fixadas por commit, sem novos segredos ou permissões.
  A execução explícita por Bash preserva os scripts versionados com modo 100644.

Validação local deste PR: **23 testes Node, 17 Python, TypeScript e build Sites
aprovados**. Nenhuma versão nova foi publicada no Site. A fonte Sites foi aberta
sem edições e permanece em `8dcf2207c8b2474c72c61cd34ebd9adfa4b7a38c` (versão 10).
Não considerar o runtime hospedado corrigido até portar o PR revisado, publicar e
conferir a versão efetiva. Reversão antes de publicar: fechar o PR; não migrar D1.

## Risco residual e próxima manutenção

O audit atual acrescenta correspondências para `react-server-dom-webpack 19.2.6`,
`image-size 2.0.2`, `fflate 0.7.4`, `fast-uri 3.1.7` e `braces 3.0.3`, além de
novos avisos para grupos já conhecidos. O snapshot contém os intervalos e patches
**informados pela base consultada**; somente os patches efetivamente implementados
devem ser descritos como confirmados/testados. `braces` veio sem versão corrigida:
não esconder a exceção, reavaliar o pacote pai e limitar entradas não confiáveis.

Priorizar o renderer RSC em PR próprio: ele faz parte do servidor via plugin-rsc,
mesmo listado em devDependencies. O [aviso oficial React](https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g)
indica correção 19.2.8. Depois, dividir ferramentas de rede (undici/ws), toolchain
(Vite), parsers/globs e imagens. Cada grupo exige conferir fonte oficial, pares,
lockfile, testes e build; não substituir esbuild 0.18 por major nova indiscriminadamente
sob drizzle-kit. Não foi demonstrada exploração de nenhuma correspondência.

Os gates da área hospedada e manutenção continuam abertos. REA executável, sites
externos, GitHub App, CVEs dos alvos, Supabase, n8n e VPS não foram ativados.
