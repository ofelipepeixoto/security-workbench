# Reconciliação das entregas — atualização Q1 de 26/10/2026

Esta matriz substitui o estado de preparação anterior. Cadeia #43 → #44 → #45 → #46 → #47 aberta em rascunho, sem merge. QA recebeu cumulativamente Q0 `afcdf120b69a54c28ba1083b761d0ca451495477`; correções Q1 desta branch não foram implantadas. Produção v15 preservada. `main` foi reconfirmada em `cf906efd01c832632f96eafac6555d55f4e39ff9`; não equivale à versão do Site.

| Pedido original | Implementação / PR de origem | QA Q0 | Evidência atual e lacuna |
|---|---|---|---|
| Login, ícone e verde só com sessão validada | github-session-status/monitor, #44 | Implantado | Login A e saída/reentrada exercitados; B isolado depende do titular |
| Catálogo de repositórios nunca cadastrados | github-app-client/auth, workbench-service, catalog controller, #44/#47 | Implantado | Fixture privada A apareceu com zero projetos; instalação selected e cobertura parcial conferidas. Volume/múltiplas instalações são sintéticos |
| Escolher sem preparar commit/análise | catalog/controller, correção Q1 | Defeito conhecido no Q0 | Q0 desabilita seleção quando QA fechado. Q1 separa seleção local de metadados e análise; regressões passam, deploy futuro pendente |
| A/B, revogação, respostas atrasadas | principal/owner, FKs, request scope, auth | Q0 implantado; corrida status corrigida só Q1 | Isolamento e interleavings sintéticos; jornada B real incompleta. Não associar registros globais ao primeiro login |
| Markdown, evidências e prompt portátil | scanner/correction-prompt, #45 | Implantado | Resultados sintéticos e contratos testados; resultado hospedado autorizado ausente |
| Orientador automático por regras | review-advisor/automatic-guidance, #46 | Implantado | Teste determinístico e abstinência; não é modelo generativo |
| Revisão por ocorrência | scanner/core/store/service, correção Q1 | Colisão herdada no Q0 | Q1 identifica repetições e bloqueia revisão legada ambígua sem alterar ledger; implantação futura pendente |
| IA contextual rastreável | contextual-review/store/workbench, #47 | Código presente, desligado | Autorização, orçamento, citações, injeção e A/B sintéticos; nenhum provedor real testado |
| QA isolado e recuperação | qa-guard/control, migrations 0008/0009 | Aplicadas em Q0 | Backup cifrado concluído; sem restauração operacional. Não repetir ensaio já aprovado |
| Desktop/mobile/teclado | access/catalog/session | Inspeção parcial | Desktop/teclado no recorte; dimensão mobile solicitada não se aplicou, logo não aprovado |
| Homologação, filas e sete dias | jobs/consumer/QA gates | Desligados | Q2/Q3 futuros; nenhuma janela, reserva ou análise criada para validar telas |

## Catálogo e consentimento

Login de identidade com scope vazio não concede acesso global. O token de usuário da GitHub App opera na interseção de acessos do usuário e da instalação. A descoberta de metadados foi separada de Contents, sem dar capacidade de análise a quem só pode listar. Privados/internos só são devolvidos depois de autorização válida. Forks e arquivados permanecem visíveis, com seu estado.

`All repositories` na App atual ampliaria também o alcance já concedido de Contents para repositórios atuais e futuros daquela instalação. Não é um seletor global para todas as organizações ou colaborações da pessoa. Cada titular/organização pode precisar instalar/autorizar a App, conceder SSO ou negar consentimento. Nenhuma dessas mudanças foi feita. Enquanto não consentidas, a interface informa cobertura parcial, sem nomes/total inventados. Trocar apenas o endpoint para `/user/repos` não muda os limites do token. Não foi adicionado PAT nem OAuth `repo` amplo.

A busca é explicitamente sobre páginas carregadas da instalação selecionada. Até 100 itens por página e teto de dez páginas por instalação neste cliente; o limite e a incompletude são mostrados, não uma falsa conclusão de catálogo completo. Repositórios são deduplicados por ID estável. São navegáveis múltiplas instalações e páginas, com retomada de erro; nenhuma seleção/listagem resolve SHA ou cria jobs. Só a ação de preparar análise revalida e fixa commit; no QA a política de fixtures continua sendo uma restrição adicional.

## Critérios ainda abertos

A [auditoria Q1](auditoria-cumulativa-q1-2026-10-26.md) registra achados, estado de dependências e propostas Q2/Q3/Q4. Defeitos P1 do Q0 e pendências hospedadas impedem chamar o candidato de pronto ou o piloto de homologado. Uma CI nova só valida seu próprio SHA; não altera o QA. Não há autorização de nova implantação, IA real ou início de janela nesta entrega.
