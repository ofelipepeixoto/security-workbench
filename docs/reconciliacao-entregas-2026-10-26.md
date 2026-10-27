# Reconciliação das entregas — atualização Q1/Q2 de 27/10/2026 UTC

Esta matriz substitui o estado de preparação anterior. Cadeia #43 → #44 → #45 → #46 → #47 aberta em rascunho, sem merge. O QA recebeu o deploy corretivo Q1 `f2e11f71112278fd7e00130ba615ca4cdd4b416b`; a correlação sanitizada de tentativas desta branch é posterior e não está implantada. Produção v15 e main permanecem preservadas e separadas. O piloto não está homologado.

| Pedido original | Implementação / PR de origem | QA f2e11… | Evidência atual e lacuna |
|---|---|---|---|
| Login, ícone e verde só com sessão validada | github-session-status/monitor, #44 | Implantado | A e B validados em momentos distintos; saída/reentrada A exercitada. Dois perfis separados ainda não comprovados |
| Catálogo de repositórios nunca cadastrados | github-app-client/auth, workbench-service, catalog controller, #44/#47 | Implantado | A e B viram sua fixture privada com zero projetos; cobertura selected/parcial informada. Volume/múltiplas instalações são sintéticos |
| Escolher sem preparar commit/análise | catalog/controller, correção Q1 | Corrigido e exercitado | Escolher/limpar disponíveis com QA fechado nas duas contas; sem criar jobs/janela/reservas. POST autenticado negativo direto ainda pendente |
| A/B, revogação, respostas atrasadas | principal/owner, FKs, request scope, auth | Correções Q1 implantadas | Nenhuma fixture A na listagem B observada; isso não prova negativos completos por IDs. Isolamento entre perfis, consentimentos/permissões completos e revogação real pendentes |
| Markdown, evidências e prompt portátil | scanner/correction-prompt, #45 | Implantado | Resultados sintéticos e contratos testados; resultado hospedado autorizado ausente |
| Orientador automático por regras | review-advisor/automatic-guidance, #46 | Implantado | Teste determinístico e abstinência; não é modelo generativo |
| Revisão por ocorrência | scanner/core/store/service, correção Q1 | Código corrigido | Q1 identifica repetições e bloqueia revisão legada ambígua sem alterar ledger; testes locais, resultado próprio hospedado ainda ausente |
| IA contextual rastreável | contextual-review/store/workbench, #47 | Código presente, desligado | Autorização, orçamento, citações, injeção e A/B sintéticos; nenhum provedor real testado |
| QA isolado e recuperação | qa-guard/control, migrations 0008/0009 | Aplicadas em Q0 | Backup cifrado concluído; sem restauração operacional. Não repetir ensaio já aprovado |
| Desktop/mobile/teclado | access/catalog/session | Inspeção parcial | Desktop e teclado no catálogo/seleção; viewport móvel efetivo não disponível, logo mobile não aprovado |
| Homologação, filas e sete dias | jobs/consumer/QA gates | Desligados | Q2 autorizado condicionalmente, mas bloqueado. Nenhum job/canário/janela/reserva aberto; Q3/janela formal e Q4 sem ativação |
| Diagnóstico por tentativa | analysis-jobs, qa-metrics, consumer, #47 | Ainda sem novo campo | Branch acrescenta claim admitido, entrega nativa e fonte separadas; duplicatas não viram tentativas fictícias. CPU permanece não medida |

## Catálogo e consentimento

Login de identidade com scope vazio não concede acesso global. O token de usuário da GitHub App opera na interseção de acessos do usuário e da instalação. A descoberta de metadados foi separada de Contents, sem dar capacidade de análise a quem só pode listar. Privados/internos só são devolvidos depois de autorização válida. Forks e arquivados permanecem visíveis, com seu estado.

`All repositories` na App atual ampliaria também o alcance já concedido de Contents para repositórios atuais e futuros daquela instalação. Não é um seletor global para todas as organizações ou colaborações da pessoa. Cada titular/organização pode precisar instalar/autorizar a App, conceder SSO ou negar consentimento. Nenhuma dessas mudanças foi feita. Enquanto não consentidas, a interface informa cobertura parcial, sem nomes/total inventados. Trocar apenas o endpoint para `/user/repos` não muda os limites do token. Não foi adicionado PAT nem OAuth `repo` amplo.

A busca é explicitamente sobre páginas carregadas da instalação selecionada. Até 100 itens por página e teto de dez páginas por instalação neste cliente; o limite e a incompletude são mostrados, não uma falsa conclusão de catálogo completo. Repositórios são deduplicados por ID estável. São navegáveis múltiplas instalações e páginas, com retomada de erro; nenhuma seleção/listagem resolve SHA ou cria jobs. Só a ação de preparar análise revalida e fixa commit; no QA a política de fixtures continua sendo uma restrição adicional.

## Critérios ainda abertos

A [auditoria Q1](auditoria-cumulativa-q1-2026-10-26.md) preserva achados e evidências históricas. O deploy corretivo supera sua pendência antiga de implantação. O [gate Q2 atual](qa-candidato-2026-10-26.md#gate-atual-q2) distingue teto persistido de quatro tentativas, reentrega de transporte, CPU medida, captura nativa, consumo e encerramento. Falta de prova bloqueia somente a ativação dependente; regressões e evolução local continuam. Uma CI nova valida seu próprio SHA e não altera o QA. Publicação incremental na PR existente não autoriza outro deploy, IA real ou sete dias.

## Próximos pacotes separados

Q3: somente após resultados legítimos e compatibilidade Q2 medida, homologar leitura, Markdown baixado e aberto, orientador, revisão persistida, comparação, idempotência/reentrega, cancelamento, timeout, revogação e recuperação. Mudança de decisão/revogação/novos jobs requer escopo específico; não adicioná-los ao canário. Janela de sete dias e50jobs/dia total depende de início/fim D1 reais, capacidade/margem compartilhada e desligamento externo de cron/dispatcher previamente aprovado. Não homologar observação futura por simulação ou apenas dois resultados.

Q4: manter modelo contextual off até projeto/modelo/preço atuais, dados mínimos por fixture/commit, retenção/purga e teto financeiro expressamente aprovados. Usar a integração existente sem tools, reserva idempotente e resultado desconhecido sem retry cobrado cego; nenhuma geração confirma vulnerabilidade, muda decisão humana ou aplica patch. Mocks validam contratos e isolamento, não qualidade de modelo real. R$0 atual significa zero chamadas reais. [Detalhes de contexto e orçamento](ia-contextual-integracao.md).
