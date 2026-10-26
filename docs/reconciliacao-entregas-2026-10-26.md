# Reconciliação das entregas — 26/10/2026

Este candidato cumulativo local parte da árvore publicada de #46. Nenhuma nova publicação, implantação, migration remota, consentimento, ativação ou chamada de IA faz parte da preparação. O relatório privado acompanha commit, digests e estado operacional. Não confundir fonte revisável, QA implantado, piloto homologado e produção.

| Pedido original de 26/10 | Implementação principal | PR/head remoto | Implantado | Teste real e lacuna |
| --- | --- | --- | --- | --- |
| Nome/ícone GitHub e verde apenas com sessão validada | `github-session-status.tsx`, `github-session-monitor.mjs`, `/api/auth/github/session` | #44 `414faab6b044791756de1e658ad333627e782b0c` | Não no QA conhecido; ainda #43 | CI #44 passou; sessão/UI do novo build ainda não homologadas |
| Repositório nunca cadastrado em Nova análise | `github-catalog-controller.tsx`, `github-app-client.mjs`, catálogo em `workbench-service.mjs` | #44 mais correções deste candidato | Não implantado | Contratos locais com 101 itens e múltiplas instalações; cobertura depende do consentimento App/usuário/organização |
| Markdown com candidatos e prompt portátil | `scanner.mjs`, `correction-prompt.mjs` | #45 `e071215feb21ed35207e250a7a949b5d8d592d93` | Não no QA conhecido | Exportação real do serviço local salva/reaberta; download e abertura no navegador hospedado pendentes |
| Orientador automático complementar | `review-advisor.mjs`, `automatic-guidance.tsx` | #46 `1044098259bc1881e74a541ef54cb1f98ed0677f` | Não no QA conhecido | Regras locais e CI #46 aprovadas; não é modelo contextual |
| IA contextual automática no produto | `contextual-review*.mjs`, rota e painel próprios, migration 0008 | Novo candidato local, sem PR novo | Desligada; não implantada | HTTP/SQLite e transporte sintético; projeto/modelo/dados/custo/purga/provedor reais pendentes |
| Homologação hospedada isolada | `qa-control.mjs`, `qa-guard.mjs`, migration 0009, métricas opt-in | Novo candidato local | QA conhecido permanece #43 `71c878533270022aa68748f73b3f9f6a6f2727db` | Plano/recursos conferidos somente leitura; canário/janela/QA do candidato não executados |

A cadeia remota #43 → #44 → #45 → #46 foi reconfirmada aberta em rascunho e sem merge. As CIs anteriores não substituem a CI de um novo head. Produção v15 permanece fora do destino. A inspeção do navegador atual identificou o QA antigo em demonstração e a necessidade de entrada na área privada; não é prova de falha de OAuth nem de isolamento A/B. As duas contas precisam ser exercitadas no candidato implantado.

## Catálogo e consentimento

Login de identidade com scope vazio não concede acesso global. O token de usuário da GitHub App opera na interseção de acessos do usuário e da instalação. A descoberta de metadados foi separada de Contents, sem dar capacidade de análise a quem só pode listar. Privados/internos só são devolvidos depois de autorização válida. Forks e arquivados permanecem visíveis, com seu estado.

`All repositories` na App atual ampliaria também o alcance já concedido de Contents para repositórios atuais e futuros daquela instalação. Não é um seletor global para todas as organizações ou colaborações da pessoa. Cada titular/organização pode precisar instalar/autorizar a App, conceder SSO ou negar consentimento. Nenhuma dessas mudanças foi feita. Enquanto não consentidas, a interface informa cobertura parcial, sem nomes/total inventados. Trocar apenas o endpoint para `/user/repos` não muda os limites do token. Não foi adicionado PAT nem OAuth `repo` amplo.

A busca é explicitamente sobre páginas carregadas da instalação selecionada. Até 100 itens por página e teto de dez páginas por instalação neste cliente; o limite e a incompletude são mostrados, não uma falsa conclusão de catálogo completo. Repositórios são deduplicados por ID estável. São navegáveis múltiplas instalações e páginas, com retomada de erro; nenhuma seleção/listagem resolve SHA ou cria jobs. Só a ação de preparar análise revalida e fixa commit; no QA a política de fixtures continua sendo uma restrição adicional.

## Critérios de entrega ainda abertos

P0: nenhum defeito conhecido remanescente no recorte revisado; isto não é prova de segurança total. P1 antes de ativar: medir CPU/subrequests/filas/D1 no Free, consentimentos e fixture B atuais, jornada hospedada A/B, mecanismo de encerramento do cron, projeto/modelo/dados/orçamento/purga para IA. P2: ampliar a política contextual para outras linguagens somente após avaliação rotulada; atual recorte deliberadamente limitado a estrutura de workflow. Nenhum desses itens pode receber estado aprovado apenas por mock, SSR, CI ou passagem de tempo simulada.

Para o roteiro de homologação, custos, canário, limites e rollback, ver `qa-candidato-2026-10-26.md`. Para a integração contextual, contexto permitido e bloqueios de ativação, ver `ia-contextual-integracao.md`.
