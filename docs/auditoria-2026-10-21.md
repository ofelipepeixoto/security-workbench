# Auditoria e entrega de 21/10/2026

## Referências confirmadas nesta etapa

`main` permanece em `cf906efd01c832632f96eafac6555d55f4e39ff9`, protegida. A release `v0.1.0` continua pré-lançamento experimental, publicada em 17/10/2026. O último run de main consultado é [39073015416](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39073015416), success, do mesmo commit: consultar novamente não significa executar novamente.

Site consultado pelo conector: versão 10, audiência public, fonte `8dcf2207c8b2474c72c61cd34ebd9adfa4b7a38c`, Next 16.3.8. A fonte publicada é distinta de main e desta branch. Nenhuma publicação, alteração de audiência, variável ou migração de produção foi realizada. O conector não expôs nomes de variáveis de produção (lista vazia); não há Client ID/Secret disponível para homologação GitHub nesta etapa.

Issues [#13](https://github.com/ofelipepeixoto/security-workbench/issues/13) e [#14](https://github.com/ofelipepeixoto/security-workbench/issues/14) continuam abertos. PRs de estudo #3/#4 e PRs #16–#19 continuam em rascunho; não foram incorporados a main ou ao Site. Os runs já existentes consultados para #16/#17/#18/#19 estavam verdes, respectivamente 39653579030, 39652251898, 39653367207 e 39653722928. Esses checks anteriores não homologam o novo login.

A implementação de autenticação parte explicitamente do PR #17, `117f5f2cd5e96ec59dd357b368b1d823d57263a3`, para manter o gate de proprietário em cada operação. A adaptação de UX acompanha a autenticação; o inventário e os relatórios formam uma segunda mudança documental empilhada. Não existe AGENTS.md no checkout Workbench. README, SECURITY, documentos de operação, aquisição, identidade, transporte, sistema web, adaptador, planejamento e implementação foram inspecionados. Status/branches/remotes foram conferidos antes de criar worktree separado; o checkout e os commits existentes foram preservados.

## Cobertura e estado das capacidades

| Capacidade | Estado observado | Evidência / limite |
| --- | --- | --- |
| Núcleo Python 3.12/SQLite | Validado localmente | 17 testes; não compartilha D1/credenciais |
| Demo pública fictícia | Validada no preview local; Site v10 preservado | Dados em memória do navegador; sem aquisição real |
| Aquisição pública GitHub/commit fixado | Implementada, testes locais e CI anterior | ID estável, SHA, digest/bytes, escopo namespace, limites e omissões; quota pública continua risco |
| Restrição ao proprietário | Validada localmente na base #17 | 401 anônimo, 403 outro ID, 503 config ausente antes de DB; ainda não publicada |
| Login GitHub | Validado localmente com provedor simulado | Backend real implementado; App, config, migração e compatibilidade hospedada pendentes |
| Preservação de histórico entre provedores | Validada localmente | SQLite com migrações reais, owner canônico existente; sem associação por e-mail |
| Review, relatório e comparação | Validados no serviço local | Testes de persistência, isolamento, mascaramento e cobertura parcial; issue #14 segue pendente na hospedagem |
| Revisão no navegador | Validada apenas no exemplo fictício do preview | Atualização mostrada como somente nesta tela; não representa revisão real persistida |
| Markdown no navegador | Não confirmado nesta rodada | Clique no exemplo ocorreu; evento de download não concluiu no prazo da ferramenta. API/geração cobertas localmente, sem alegar download hospedado |
| Busca e filtros | Validados no preview desktop | Busca vazia, filtro parcial, acesso à revisão e Conta e acesso |
| GitHub App / privados / organizações | Planejados | Login identifica conta; não concede instalação, seleção ou acesso a privados |
| CVE por dependência dos alvos | Ausente | Inventário de manifestos não faz correspondência de advisory ou confirmação |
| REA integrado | Ausente | Estudo de versão/licença/CLI; execução bloqueada por runtime e sandbox sem rede |
| Sites autorizados / bancos / monitoramento / n8n | Planejados | Nenhum comando de screenshot executado, serviço provisionado ou automação ativada |

A [matriz detalhada](referencia-funcional-e-ux.md) inclui origem, lacuna, prioridade, implementação, teste e evidência, além do inventário das nove imagens iniciais e das seis novas telas de conexão. As telas vazias de achados/histórico não demonstram detecção. Nenhum nome completo, telefone ou dado de perfil dos anexos foi copiado para código ou documentação.

## Segurança inspecionada

Aquisição estática: adaptador público limitado ao namespace configurado, identidade e commit revalidados, hashes dos bytes, rejeição de URLs arbitrárias e redirecionamentos fora de contrato, limites de arquivos/bytes/tempo e cobertura parcial explícita. O código alvo, hooks e instaladores não são executados. Testes cobrem troca de ID, privado/fora de escopo, timeout, redirecionamento, bytes divergentes e falha de aquisição. Essas provas não equivalem a uma auditoria universal de SSRF nem à futura análise de sites com DNS variável. O núcleo local já trata caminhos, links e limites conforme seus testes; não houve teste intrusivo em plataforma externa.

Sessão/autorização: revisão independente levou a regressões específicas para falha de D1 no logout, revogação após falha de armazenamento, cancelamento de stream indefinido e query herdada `auth=__proto__`. Correções incorporadas antes da entrega. A nova autenticação não oferece execução de ferramentas, IA paga ou autoridade baseada em instruções encontradas em código/documentação alvo. A decisão humana sobre candidatos permanece obrigatória.

Retenção: sessão lógica de 12h e fluxo 10min com limpeza oportunista; sem política nova para apagar projetos/relatórios. Não foram copiados bancos, sessões, .env, fontes sensíveis ou relatórios reais. O [guia de autenticação](autenticacao-github.md) descreve riscos residuais: teto global de fluxos pode negar disponibilidade, revogação remota GitHub não encerra imediatamente sessão local, e compatibilidade do provedor externo no Sites depende de prova real. A orientação final exige GitHub exclusivo: a aplicação não consulta identidade ChatGPT nem usa cabeçalhos nativos para conceder operação. O owner canônico antigo permanece apenas para preservar os dados.

## Validação realizada

- Node: **56/56** testes passam; 21 do módulo OAuth e 8 de seleção exclusiva de identidade e 3 de integração OAuth + serviço usando SQLite em memória e respostas HTTP simuladas, além de 24 testes existentes. Migrações SQL atuais são aplicadas nos testes, sem criar esquema em handlers.
- Python: **17/17** passam.
- TypeScript: `tsc --noEmit --incremental false`, passa.
- Build Sites/vinext: passa, inclui `/access`, start/callback/logout e `/api/workbench` como rotas dinâmicas.
- ESLint dos arquivos novos de autenticação e testes: passa. Isso não declara lint global de código legado.
- Preview gerenciado desktop: página de acesso, botão GitHub desabilitado por falta de config, consentimento negado, query não reconhecida, foco visível/link para pular conteúdo, demo, busca de projetos/estado vazio, filtro parcial, revisão fictícia e estados de conta/integração conferidos. GET anônimo da API mostrou erro sem dados; start sem configuração mostrou erro seguro.
- Mobile: regras responsivas inspecionadas; navegador desta sessão não expõe troca de viewport. **Validação visual mobile e auditoria completa de acessibilidade pendentes.**

O preview foi temporário, sem URL pública de deploy. A [captura do preview](preview-github-exclusivo-2026-10-21.jpg) mostra apenas a interface autoral e a configuração pendente, com GitHub como única opção de acesso. Não comprova OAuth real. CI das novas branches deve ser conferida pelos runs ligados aos PRs.

## Dependências e gates restantes

A consulta anterior desta conversa registrou painel Dependabot com 38 abertos (16 altos, 15 moderados, 7 baixos, nenhum crítico), processado em 17/10. A nova consulta ao issue #13 confirma o trabalho aberto, **não reconta advisories nem prova correção publicada**. Os PRs #18/#19 contêm correções separadas para sharp/source-map-js e React/RSC; esta base #17 ainda contém as versões anteriores. Não foram descartados alertas. A auditoria de lockfile já registrada na manutenção teve métrica diferente (57 entradas/51 GHSAs, 13 pacotes); não comparar diretamente com a contagem do painel nem dizer que o risco foi zerado.

Antes de produção: revisar/integrar a manutenção e o gate owner, executar CI na combinação final, conferir artefato publicado e só então homologar OAuth. Criar/configurar a App dedicada e preservar o ID canônico existente é o menor passo externo necessário; Client Secret deve permanecer no gerenciador seguro, nunca no chat. O roteiro preciso e reversão estão no [guia](autenticacao-github.md).

Próxima fatia recomendada: concluir o gate P1 do issue #14 e do login hospedado antes de ampliar análise. Aceite: login proprietário real e outra conta negada, logout sem retorno da sessão, histórico existente preservado, duas análises próprias fixadas, revisão persistida após reload, comparação, Markdown baixado e visitante anônimo sem acesso. Em seguida, REA local com runtime fixado e sandbox sem rede comprovada, fixtures benigna/maliciosa e relatório estático real. Sem isso, “REA integrado” permanece incorreto.
