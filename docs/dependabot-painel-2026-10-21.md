# Dependabot — painel autenticado em 21/10/2026

Refs [#13](https://github.com/ofelipepeixoto/security-workbench/issues/13).
As duas páginas do painel autenticado foram lidas nesta conversa: **38 alertas
abertos, 34 fechados; 16 altos, 15 moderados, 7 baixos e nenhum crítico**.
São **11 pacotes e 12 grupos de pacote/manifesto**. O painel indicava
“Dependency files checked Oct 17”; a `main` observada continuava em `cf906…`.
A projeção local de metadados dessa leitura foi preparada em 21/10 às 21:49 BRT.
Esse horário não significa que o GitHub tenha reprocessado os manifestos nessa
data. A projeção bruta, sessão e dados de autenticação não integram esta entrega.

Esta leitura atualiza a limitação de acesso ao painel registrada na
[triagem de continuação](triagem-continuacao-2026-10-21.md). O inventário npm
daquela triagem e a contagem autenticada abaixo são consultas diferentes.
Um alerta é uma correspondência de dependência e aviso; não comprova exploração.

## Grupos observados

`L` = `web/pnpm-lock.yaml`; `P` = `web/package.json`. A/M/B = alta/moderada/baixa.
“Sem rótulo” significa que o painel não mostrou a classificação de escopo;
**não significa runtime**. “Desenvolvimento” reproduz o rótulo do GitHub e não
prova ausência do pacote no artefato publicado. Os caminhos e usos são os
representativos conferidos no manifesto/lockfile durante a triagem; não são
todos os caminhos possíveis, nem evidência de uma chamada vulnerável.

| Pacote | Manifesto | IDs no painel | A/M/B | Relação e escopo do painel | Caminho e uso observado; encaminhamento |
| --- | --- | --- | --- | --- | --- |
| `@babel/core` | L | [15](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/15) | 0/0/1 | Transitiva; sem rótulo | Next → styled-jsx → Babel; também ferramentas de Hooks. Compilação/lint; #25 fixa 7.29.6. |
| `baseline-browser-mapping` | L | [43](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/43) | 0/1/0 | Transitiva; sem rótulo | Next/Browserslist → Baseline; seleção de ambientes de build. #25 fixa o ramo 2.10.30 em 2.11.0. |
| `brace-expansion` | L | [26](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/26), [27](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/27), [60](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/60), [61](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/61) | 2/2/0 | Transitiva; desenvolvimento | Ferramentas ESLint/TypeScript → minimatch → brace-expansion; globs. #25 preserva as majors, fixa 1.1.21 e 5.0.12. Os IDs não foram atribuídos individualmente a uma major apenas pelo título. |
| `browserslist` | L | [40](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/40), [41](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/41) | 2/0/0 | Transitiva; sem rótulo | Babel/webpack → browserslist; alvos da compilação. #25 fixa 4.28.7. |
| `esbuild` | L | [11](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/11), [13](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/13) | 0/1/1 | Transitiva; desenvolvimento | Drizzle Kit → esm-loader/core-utils → 0.18.20; Wrangler → 0.27.3; Vite/tsx → ramo 0.28. #25 corrige somente 0.28.0 → 0.28.1; os dois ramos antigos continuam em acompanhamento. |
| `js-yaml` | L | [25](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/25), [28](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/28), [39](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/39), [44](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/44) | 3/1/0 | Transitiva; desenvolvimento | ESLint → eslintrc → js-yaml; leitura de configuração. #25 fixa 4.3.2. |
| `sharp` | L | [66](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/66) | 1/0/0 | Transitiva; sem rótulo | Next e Miniflare → sharp; imagens/infraestrutura local, com alcance no Worker dependente das rotas e do bundle. Patch 0.35.5 já registrado em #18, composto em #22. |
| `source-map-js` | L | [65](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/65) | 1/0/0 | Transitiva; sem rótulo | Next e Vite/PostCSS → source-map-js; mapas de código. Patch 1.2.2 já registrado em #18, composto em #22; uso efetivo no servidor exige rastreio do artefato. |
| `undici` | L | [18](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/18), [19](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/19), [20](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/20), [21](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/21), [23](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/23), [24](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/24), [34](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/34), [35](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/35), [36](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/36), [37](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/37), [38](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/38), [48](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/48), [49](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/49), [50](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/50), [51](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/51), [54](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/54), [55](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/55) | 4/8/5 | Transitiva; desenvolvimento | Cloudflare plugin/Wrangler → Miniflare → undici; cliente HTTP das ferramentas. #24 fixa 7.29.1; há avisos posteriores adicionais, abaixo. Não equivale ao fetch nativo Workers nem à versão embutida no Node. |
| `vite` | P | [1](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/1), [2](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/2) | 1/1/0 | Direta; desenvolvimento | Dependência direta de compilação/servidor dev. #25 fixa 8.1.6. |
| `vite` | L | [16](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/16), [17](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/17) | 1/1/0 | Direta; desenvolvimento | A mesma família aparece no lockfile e no manifesto; plugins Cloudflare/React/RSC/Vinext também usam Vite. É outro grupo de manifesto, não outro pacote. #25 fixa 8.1.6. |
| `ws` | L | [14](https://github.com/ofelipepeixoto/security-workbench/security/dependabot/14) | 1/0/0 | Transitiva; desenvolvimento | Cloudflare plugin/Miniflare → ws; WebSocket das ferramentas. #24 fixa 8.21.3. |
| **Total** | **12 grupos** | **38 IDs distintos** | **16/15/7** | **11 pacotes** | Nenhum descarte ou alteração de alerta nesta consulta. |

Os títulos dos alertas **#2 e #17** citam `launch-editor` e divulgação de hash
NTLMv2 por caminhos UNC no Windows, mas o campo de pacote detectado mostra
**`vite`**. Este relatório conserva esse campo: não cria um décimo segundo pacote
nem presume uma instalação independente de `launch-editor`. A origem do
componente e a aplicabilidade exigem o detalhe do aviso e o caminho real.
As ocorrências nos dois manifestos continuam como quatro alertas do painel.

As severidades acima também são as do painel consultado. O
[aviso oficial de Vite sobre caminhos alternativos no Windows](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff)
descreve condições de servidor de desenvolvimento exposto, arquivos sensíveis
em diretórios permitidos e recursos NTFS, e usa classificação moderada;
o painel observado marcou #1/#16 como altos. As fontes não foram normalizadas
silenciosamente. A condição do aviso não foi reproduzida contra um alvo.

## Patches revisáveis e limites da conclusão

Os PRs abaixo são propostas de código separadas da `main` e do artefato hospedado.
As versões e validações vêm da triagem de 21/10; esta nova leitura do painel não
é uma repetição de todos aqueles testes nem uma nova atualização de dependências.

| PR | Alterações registradas | Relação com esta leitura |
| --- | --- | --- |
| [#23 — parsers](https://github.com/ofelipepeixoto/security-workbench/pull/23) | fast-uri 3.1.7 → 3.1.8; fflate 0.7.4 → 0.7.5; image-size 2.0.2 → 2.0.3 | Correções adicionais do inventário npm; esses três pacotes não aparecem entre os 38 IDs atuais do painel. |
| [#24 — rede das ferramentas](https://github.com/ofelipepeixoto/security-workbench/pull/24) | undici 7.24.8 → 7.29.1; ws 8.18.0 → 8.21.3 | Corresponde aos grupos undici/ws, sem afirmar que todos os avisos posteriores de undici estejam corrigidos. |
| [#25 — build/lint](https://github.com/ofelipepeixoto/security-workbench/pull/25) | Vite 8.0.13 → 8.1.6; esbuild 0.28.0 → 0.28.1; Babel 7.29.0 → 7.29.6; browserslist 4.28.2 → 4.28.7; Baseline 2.10.30 → 2.11.0; js-yaml 4.1.1 → 4.3.2; brace-expansion 1.1.14 → 1.1.21 e 5.0.6 → 5.0.12 | Trata os respectivos grupos preservando majors e pais incompatíveis; esbuild 0.18/0.27 permanecem residuais. |

O registro completo de fontes primárias, caminhos, testes e reversão está na
[triagem de continuação](triagem-continuacao-2026-10-21.md). A validação isolada
daquela camada teve 56 testes Node, TypeScript e build aprovados; a validação da
aplicação combinada e a proveniência de cada publicação são verificações próprias.
Os patches anteriores de sharp/source-map-js estão na
[triagem inicial de 21/10](triagem-dependencias-2026-10-21.md)
e nos PRs [#18](https://github.com/ofelipepeixoto/security-workbench/pull/18)/[#22](https://github.com/ofelipepeixoto/security-workbench/pull/22).
Não se declara aqui que a `main`, o Site atual ou os 38 alertas já incorporaram
essas correções. Publicar uma branch no Sites não atualiza por si só o painel da
branch padrão; merge e revisão de produção continuam etapas humanas.

## Resíduos e critério de encerramento

O audit npm posterior aos patches, concluído em **21/10 às 20:39:29 UTC /
17:39:29 BRT**, retornou **3 entradas / 3 GHSAs / 2 pacotes**: `braces` 3.0.3
(alta, GHSA-vfj7-8cjw-p6xm), esbuild 0.18.20 (moderada, GHSA-67mh-4wv8-2f99)
e esbuild 0.27.3 (baixa, GHSA-g7r4-m6w7-qqqr). Isso não equivale a três alertas
Dependabot nem autoriza subtrair 35 do painel. `braces` é diferente de
`brace-expansion` e não aparece entre os 11 pacotes desta leitura.

Undici 7.29.1 também mantém os avisos adicionais divulgados em 15/10 e ausentes
da resposta npm daquela rodada. A
[release oficial 7.30.1](https://github.com/nodejs/undici/releases/tag/v7.30.1)
e o [registro npm](https://registry.npmjs.org/undici/7.30.1), já consultados na
triagem, registram os patches posteriores. A publicação de 15/10 às
14:18:31.283 UTC completa a política de sete dias em **22/10/2026 às
14:18:31.283 UTC / 11:18:31 BRT**. É um marco para reavaliar e testar a versão,
não evidência de instalação automática ou encerramento dos alertas. A política
`minimumReleaseAge: 10080` permanece preservada.

Para encerrar a triagem: revisar os PRs e suas bases, manter os checks aplicáveis
aprovados, incorporar o conjunto escolhido por revisão humana e aguardar a nova
análise do GitHub sobre a `main`. Depois, reconciliar cada ID e versão detectada,
registrando correção ou risco residual fundamentado. Para dependências presentes
no runtime hospedado, conferir também a versão efetivamente publicada, o lockfile
de origem e a cobertura do artefato. Nenhum descarte em massa, enfraquecimento de
proteções ou teste de exploração foi feito nesta etapa.
