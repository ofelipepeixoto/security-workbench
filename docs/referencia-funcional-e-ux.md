# Referência funcional e evolução de UX

Data da inspeção: 21/10/2026. Produto: Security Workbench.

## Escopo, origem e limites

Esta inspeção comparou quinze capturas fornecidas pelo proprietário com o código
do Workbench. Base de referência: PR #17, commit
`117f5f2cd5e96ec59dd357b368b1d823d57263a3`. Foram lidos a interface
`web/app/workbench.tsx`, a página de entrada, os estilos e o serviço web. O
inventário abaixo é uma análise visual e de código; não é teste da plataforma
externa, pesquisa com usuários ou prova de execução dos recursos retratados.

As imagens foram abertas individualmente. Dados pessoais visíveis não são
transcritos neste documento, usados como fixture ou incorporados ao repositório.
Não foi operada a conta externa nem enviado código ao GitGuard para comparar
produtos. As capturas permanecem fora da fonte do Workbench.

O GitGuard serve como referência de organização e jornadas. A adaptação é autoral:
preserva marca, textos, stack e regras do Workbench; não copia código, identidade,
planos comerciais, cotas ou badges da referência. A presença de um recurso numa
tela não estabelece sua disponibilidade ou qualidade técnica.

O login GitHub estava **ausente na base examinada**. A decisão final desta etapa
é **autenticação exclusivamente pelo GitHub**, sem opção ChatGPT, e-mail/senha ou
outros provedores. A restrição ao proprietário e a continuidade dos dados precisam
ser preservadas por vinculação segura no servidor, sem transformar o acesso
anterior em alternativa de login. A implementação, testes efetivos e pendências
de configuração devem ser verificados no [guia de autenticação GitHub](autenticacao-github.md)
e no PR da entrega, sem promover esta especificação a recurso homologado.

## Inventário das nove telas

Os arquivos compartilham o prefixo `Captura de tela 2026-10-21 `. As observações
se restringem ao conteúdo visível. P0 trata de segurança/integridade, P1 do acesso
e fluxo principal, P2 de melhorias operacionais e P3 de expansão futura.

| Arquivo / tela | Elementos observados | Necessidade atendida | Adaptação proposta ao Workbench | Prioridade | Critério de aceite |
| --- | --- | --- | --- | --- | --- |
| `155144.png` — primeiro acesso | Campos de perfil, telefone obrigatório, empresa opcional, categoria de usuário, aceite e continuar | Orientar a entrada e reconhecer a conta | Após autenticação, apresentar identidade mínima e próximos passos. Não coletar telefone ou outros campos sem finalidade e persistência justificadas | P1 | Identidade baseada no ID estável do provedor; somente proprietário opera; nenhuma vinculação automática por e-mail; campos adicionais não bloqueiam análise sem necessidade |
| `155356.png` — dashboard | Seletor de repositório, indicadores, períodos de atividade e ações de análise/exportação | Entender situação e decidir a próxima ação | Preservar a visão geral; mostrar projetos, análises e cobertura. Contadores de revisão e correção dependem de dados do servidor | P2 | Filtro muda os dados correspondentes; falha não vira resultado limpo; nenhum indicador de correção verificada sem evidência |
| `155428.png` — organizações | Estado vazio, orientação para instalar integração, selecionar repositórios e retornar | Explicar instalação e delimitar acesso | Explicar esses conceitos na área de acesso. Organizações permanecem no roadmap, sem tela operacional fictícia | P3 | Login, instalação e autorização são distintos; nenhum acesso organizacional é concedido implicitamente |
| `155452.png` — repositórios | Busca, filtros, lista, branch, motores, ação de análise e monitoramento separado | Localizar projeto e iniciar análise da versão escolhida | Lista atual com identidade, ID, última análise, commit e cobertura; estado explícito para projeto sem execução. Exibir apenas motores realmente implementados | P1/P2 | Projeto sem execução mostra “Ainda não analisado”; somente escopo autorizado pode iniciar leitura; commit efetivo fica visível; nenhum selo de segurança por ausência de análise |
| `155517.png` — achados | Busca e filtros por repositório, scanner, status e severidade; indicadores e lista vazia | Encontrar itens e organizar revisão | Priorizar filtros suportados por projeto, categoria e decisão humana. Severidade só deve ser exibida com critério fundamentado, distinta de confiança | P2 | Zero itens não afirma segurança; evidência permanece redigida; confirmação requer decisão humana; filtros não ocultam contexto de cobertura |
| `155533.png` — histórico | Estados de execução, busca, filtros e lista vazia | Acompanhar análises e recuperar contexto | Preservar histórico atual; distinguir execução, conclusão parcial, falha e interrupção. Cancelamento só quando houver suporte real | P2 | Falha é identificável por texto; duração só usa horários disponíveis; comparação aceita execuções compatíveis; exportação exige verificar o arquivo |
| `155544.png` — auditoria de banco | Apresentação de Postgres/Supabase, passos de uso e exemplo de saída identificado como ilustrativo | Explicar possível expansão | Registrar como fase futura. Não executar os comandos da imagem, acessar banco ou reproduzir o exemplo como achado real | P3 | Recurso identificado como planejamento; nenhum banco é alterado; configuração e autorização próprias antes de implementação |
| `155608.png` — perfil | Dados editáveis, avaliação do produto e menu com configurações e saída | Reconhecer conta e controlar sessão | Área “Conta e acesso” com provedor, identificação mínima, restrição operacional e logout; evitar formulário de contato e avaliação sem necessidade | P1 | Saída invalida sessão; expiração retoma acesso público; dados extras não são copiados dos anexos; nenhuma edição de conta aparente sem persistência |
| `155624.png` — configurações | Seção GitHub, indicação de conexão, informação de instalação, gestão de acesso e ressincronização | Entender o estado e o alcance da integração | Exibir separadamente identidade, App, seleção autorizada, projetos cadastrados, análises e monitoramento | P1 | Login não marca App como instalada; contagem cadastrada não vira contagem autorizada pela App; revogação e falta de configuração aparecem de forma explícita |

As telas de achados e histórico estão vazias; não demonstram detecção ou tratamento
de vulnerabilidades. Na referência visual, os indicadores de conexão/instalação e
os números da lista de repositórios não bastam para reconciliar a origem do acesso.
Esse limite reforça a necessidade de estados separados no Workbench.

## Inventário das seis telas adicionais

Os arquivos desta rodada usam o formato `image(20261021-HHMMSS).png`. Foram todos
abertos e inspecionados. Identificadores pessoais e detalhes das contas nas imagens
não são reproduzidos. Estes registros não autorizam configurar, suspender,
desinstalar ou excluir nada da plataforma externa.

| Arquivo / tela | Elementos observados | Necessidade atendida | Adaptação proposta ao Workbench | Prioridade | Critério de aceite |
| --- | --- | --- | --- | --- | --- |
| `image(20261021-192013).png` — Applications no GitHub | Abas de Apps instaladas, GitHub Apps autorizadas e OAuth Apps autorizadas; lista com ação de configurar | Localizar cada tipo de autorização | Explicar em “Conta e acesso” qual mecanismo identifica a conta e qual dá acesso a repositórios | P1 | OAuth de login e instalação da App não aparecem como um único estado; documentação aponta a área correta de revogação |
| `image(20261021-192028).png` — instalação e permissões da App | Leitura de código/metadados, permissões de escrita para checks/status/PR, seleção de todos ou alguns repositórios, suspensão e desinstalação | Controlar permissões e alcance da instalação | Usar apenas os princípios de seleção explícita e leitura mínima numa fase App própria; não copiar permissões de escrita nem selecionar todos por conveniência | P1/P3 | O login atual não solicita escrita ou acesso privado; a futura instalação verifica seleção no servidor e trata suspensão/revogação |
| `image(20261021-192059).png` — integração do workspace | Card com conta conectada, informação de instalação, gerenciar acesso e ressincronizar | Entender conexão e corrigir divergências | Separar conta GitHub autenticada, App instalada/verificada, seleção autorizada e projetos cadastrados | P1 | Nenhuma contagem ou selo é inferido de outro; falha de verificação não permanece como conectado confirmado |
| `image(20261021-192120).png` — ações destrutivas | Área destacada com desinstalar App e excluir conta/histórico como ações distintas | Revogar acesso e controlar retenção | Explicar a diferença entre sair, revogar login, desinstalar App e excluir dados; não implementar exclusão ou desinstalação simuladas nesta fase | P1/P3 | Logout só encerra a sessão; ações irreversíveis não são executadas automaticamente e exigem escopo/retomada próprios |
| `image(20261021-192159).png` — autorização no GitHub | Seleção entre contas disponíveis e possibilidade de usar outra conta antes de autorizar | Escolher a identidade certa | Delegar escolha ao GitHub e conferir o ID estável no retorno; apresentar conta sem permissão com recuperação clara | P1 | Nenhuma conta é escolhida por username/e-mail presumidos; outra conta válida continua sem acesso operacional |
| `image(20261021-192218).png` — página de entrada | Entrada compacta com uma ação GitHub e links de apoio | Entrar sem escolher provedores desnecessários | Página autoral com único “Entrar com GitHub”, descrição do acesso individual e demonstração secundária | P1 | Nenhum botão ChatGPT, senha/e-mail ou outro provedor; se OAuth não estiver configurado, explicar a pendência sem simular sucesso |

O estado mostrado em cada imagem é observação visual, não prova de escopos
realmente concedidos ou revogados. A escrita de checks/status/PR exibida na
referência não é necessária à leitura estática atual do Workbench. “Todos os
repositórios” na referência não é autorização para ampliar o namespace ou ler
repositórios privados no produto.

## Matriz de requisitos e lacunas da base

“Implementada” nesta tabela significa código inspecionado. Não implica repetição
de testes nesta inspeção, execução hospedada ou publicação da nova branch. O
histórico de homologação é mantido em [sistema-web-privado.md](sistema-web-privado.md);
o resultado efetivo da evolução deve ser registrado na entrega de autenticação.

| Requisito | Origem | Estado observado na base PR #17 | Lacuna | Prioridade | Implementação proposta | Teste / critério | Evidência e limite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Login exclusivamente GitHub | Pedido final; tela adicional de entrada | Ausente na base | Não há callback, sessão ou conta GitHub na UI | P1 | Fluxo OAuth no servidor, uma única opção GitHub e estados de erro | Consentimento negado, callback inválido, expiração, reutilização e logout; nenhum login alternativo | Base anterior usa `getChatGPTUser`; o resultado final deve ser verificado no guia desta etapa |
| Preservar autorização e dados do proprietário | Pedido; segurança | Restrição individual implementada no PR #17; transição GitHub ausente | Configurar a vinculação segura da identidade GitHub aos dados existentes, sem fallback de outro provedor | P0 | Verificar ID GitHub estável e autorização em todas as operações; não inferir equivalência com ID de outra plataforma | Outro usuário e configuração ausente não chegam ao banco; dados não são vinculados por e-mail/username | `page.tsx`, rota API e `handleWorkbenchRequest` da base; transição ainda precisa ser validada |
| Negar operação a conta GitHub válida sem permissão | Pedido; segurança | Ausente para GitHub | Login pode ser confundido com autorização | P0 | Vincular conta verificada ao proprietário permitido; negar demais contas | Conta não autorizada não lê projetos nem aciona scan/review/report | Especificação de fronteira; controles finais pertencem ao servidor |
| Separar login e App de repositórios | Telas de organizações/configurações; pedido | App de repositórios ausente | Indicadores podem sugerir acesso concedido pelo login | P1 | Estados independentes e orientação de configuração; App como fase própria | Login não habilita repositório privado ou organização | Base usa aquisição GitHub pública, sem credencial App |
| Confirmar escopo e identidade do projeto | Produto existente; tela de repositórios | Implementada | Melhorar visibilidade de estado e última análise | P1 | Manter conferência de nome/ID e autorização explícita antes do scan | Repo fora do namespace e troca de ID recusados | `scanner.mjs`, autorização no serviço e modal de projeto; sem nova execução real nesta inspeção |
| Fixar commit e cobertura | Produto existente; histórico | Implementada | Projeto precisa distinguir última análise e ainda não analisado | P1 | Preservar commit específico/atual fixado, omissões e badge textual | Cobertura parcial nunca se torna resultado completo | Scanner e detalhe já expõem commit, arquivos, bytes e omissões |
| Evidência redigida e revisão humana | Produto existente; tela de achados | Implementada | Filtros e histórico de decisões podem evoluir | P0/P2 | Preservar status inicial candidate e decisão humana | Valor sensível ausente de relatório; decisão se mantém após recarga | Regras e serviço revisados por código; hospedagem exige validação própria |
| Pendências e confirmados no dashboard | Pedido; dashboard | Parcial | Listagem fornece total de detecções, não somatório por decisão | P2 | Só acrescentar agregados reais de revisão com contrato de API | Rever candidato altera a métrica correspondente, sem dupla contagem | `candidates` soma contagens históricas; não deve ser renomeado para “pendentes” |
| Correções verificadas | Pedido; dashboard | Ausente | Não há fluxo próprio de validação de correção | P2 | Definir relação candidato → mudança → nova evidência → decisão humana | Não detectado novamente não basta para confirmar correção | Comparação existente já contém esse aviso; não inventar contador |
| Projetos sem análise | Pedido; lista da referência | Parcial | Lista mostra autorização, mas não última execução | P2 | Associar histórico por projeto e informar “Ainda não analisado” | Falha isolada não produz estado de segurança aprovado | `Project` e lista atual não contêm resumo operacional de última análise |
| Histórico por estado/projeto/período | Pedido; tela de histórico | Parcial | Busca por repositório existe; filtros adicionais ausentes | P2 | Adicionar apenas estados de execução e horários disponíveis | Filtro mantém diferença entre falha, execução e parcial | `RunsTable` e `runs`; não alegar cancelamento suportado |
| Comparação e relatório | Produto existente; pedido | Implementada; validação hospedada incompleta no histórico | Confirmar duas novas execuções, revisão persistida e arquivo baixado | P1/P2 | Preservar compatibilidade por projeto e semântica de comparação | Dois scans fixados; recarga da revisão; arquivo Markdown inspecionado | UI/serviço existem; documentação histórica distingue teste local e hospedagem |
| Conta GitHub e logout | Pedido; telas perfil/configurações e entrada adicional | Parcial | Cabeçalho identifica acesso; não há área completa de sessão GitHub | P1 | Conta e acesso com dados mínimos e saída efetiva; GitHub como único provedor | Expiração/logout removem sessão; retorno não expõe dados privados e não oferece outro login | Especificação desta fase, a reconciliar com código final |
| Revogar acesso versus excluir dados | Tela adicional de ações destrutivas | Ausente como fluxo unificado | Logout pode ser confundido com revogação ou exclusão | P1/P3 | Explicação clara agora; futuras ações separadas com autorização e retenção próprias | Logout não apaga histórico nem desinstala App; não criar botão destrutivo sem suporte real | Referência visual, sem operação externa executada |
| Organizações e privados | Pedido; organizações | Planejada | Dependem de instalação, seleção, revogação e autorização próprias | P3 | Contrato GitHub App de leitura mínima e seleção explícita | Revogação/expiração/instalação diferente recusadas no servidor | [proximas-integracoes.md](proximas-integracoes.md); não abrir escopo na fase atual |
| Auditoria de banco | Tela ilustrativa; pedido | Planejada | Sem adaptador, autorização ou operação correspondentes | P3 | Levantar necessidade e contrato isolado antes de construir | Nenhuma conexão real nesta etapa | Apenas referência visual; não executar exemplos de comandos |
| Monitoramento e webhooks | Tela de repositórios; pedido | Ausente | Falta runtime assíncrono e contrato de eventos | P3 | Planejar assinatura, deduplicação, limites, pausa e revogação | Sem efeito automático antes de ativação explícita | Não equivale a escanear manualmente; n8n/MCP não são instalados por usar plugins |
| Acessibilidade e mobile | Pedido; prática de UX | Parcial por inspeção de código | Não houve teste assistivo ou de tarefas nesta análise das telas | P1/P2 | Semântica, rótulos, foco, estados e reflow; preservar redução de movimento | Teclado, viewport mobile, zoom e mensagens de erro testados na implementação | CSS possui breakpoints e `prefers-reduced-motion`; isso não comprova conformidade |

## Jornada prioritária da fase executável

1. Abrir a demonstração pública; reconhecer que os dados são fictícios e que a
   operação real é individual.
2. Selecionar **“Entrar com GitHub”**, a única opção de autenticação. Se GitHub não
   estiver configurado, mostrar indisponibilidade e orientação de configuração,
   mantendo somente a demonstração pública como exploração sem autenticação.
3. Validar o retorno no servidor. Uma identidade GitHub válida não amplia escopo,
   não instala App e não recebe acesso operacional por si só.
4. O proprietário autorizado acessa seus projetos existentes. Não é obrigatório
   preencher telefone, empresa ou outros dados que não mudem essa tarefa.
5. Conferir projeto público próprio e sua identidade, confirmar escopo e analisar
   commit fixado dentro dos limites existentes.
6. Revisar candidatos, comparar análises compatíveis e exportar relatório com
   evidência redigida, cobertura e limites.
7. Consultar “Conta e acesso” para ver a identidade GitHub, estado da sessão, escopo
   permitido e como sair/revogar. A integração de repositórios é explicada
   separadamente; sair não desinstala App nem exclui os dados.

Navegação proposta: **Visão geral · Projetos · Análises · Conta e acesso**. Mantém
a organização atual. Uma área global de achados só deve ser acrescentada quando
o contrato de listagem permitir filtros e revisão sem buscas excessivas ou
indicadores inventados.

## Backlog rastreável

| Fase | Entrega | Condição de avanço |
| --- | --- | --- |
| P0/P1 atual | Autenticação exclusivamente GitHub, autorização individual, vinculação segura de dados e sessão integradas à experiência existente | Código revisável e testes; nenhum login ChatGPT/e-mail/senha/outro provedor; homologação real exige aplicativo/configuração legítimos; sem merge ou publicação automática |
| P2 — projetos/histórico | Última análise, ainda não analisado, filtros por estado/projeto/período e detalhes consistentes | Dados existentes suficientes; estados vazios, falhas e parcial testados |
| P2 — revisão/métricas | Agregados reais por decisão, busca de candidatos e histórico de decisões | Contrato no servidor, persistência e contagem sem duplicação verificados |
| P2 — correção | Fluxo explícito de validação de mudança e nova evidência | Critério separado de “não detectado novamente”, revisão humana e proveniência |
| P3 — acesso ampliado | GitHub App e repositórios privados/organizações | Autorização específica, leitura mínima, instalação/seleção/revogação verificadas |
| P3 — automação | Webhooks ou execução recorrente | Runtime comprovado, assinatura, deduplicação, limites e pausa; ativação específica |
| P3 — bancos | Estudo de auditoria Postgres/Supabase | Necessidade demonstrada, ambiente separado e autorização; nenhum comando do anexo é executado |

## Evidência exigida para encerrar a fase

- Registrar comandos e resultado dos testes Node/Python, tipos e build aplicáveis;
  mocks não equivalem ao OAuth real ou à aquisição hospedada.
- Testar login negado, callback inválido, conta sem permissão, expiração, logout,
  tentativa de acesso cruzado e manutenção do escopo existente.
- Testar navegação por teclado, foco, rótulos, estados de carregamento/erro e
  viewport mobile na interface construída. Não afirmar conformidade só por CSS.
- Distinguir no relatório final: especificado, implementado, testado localmente,
  verificado com integração real, publicado e pendente de configuração externa.
- Não publicar imagens originais, dados pessoais, segredos, relatórios reais ou
  detalhes exploráveis de falhas ainda não corrigidas como evidência pública.

Este documento não concede autorização para operar a referência externa, fazer
merge, publicar em produção ou ampliar a audiência operacional do Workbench.
