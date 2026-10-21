# Recuperação de jornadas — 21/10/2026

Implementação em construção na branch `feat/operations-recovery-20261021`, a partir
da árvore `4d9617a`. Esta matriz descreve o código local desta etapa. Não declara
publicação, merge, autenticação real homologada ou teste com usuários. O estado do
Site v12 é independente; consultar o [registro factual](publicacao-2026-10-21.md).

As quinze capturas desta rodada foram abertas individualmente: nove arquivos com
sufixo `(1)` e seis de `161952` a `162205`. São referências visuais de organização,
não prova de execução, persistência ou permissões da plataforma retratada. Não
foram copiados marca, código, textos comerciais, imagens ou dados pessoais para
a implementação. A [análise anterior](referencia-funcional-e-ux.md) permanece uma
comparação com a base PR #17, não um inventário atualizado de ausências.

## Matriz referência → entrega

“Implementado” significa código local. As verificações automatizadas abaixo são
separadas da homologação com navegador, provedor e D1 reais.

| Referência / tarefa | Rota | Estado anterior observado | Correção local | Dados e limites | Aceite observável |
| --- | --- | --- | --- | --- | --- |
| `155144(1)` — primeiro uso | `/onboarding` | Sem entrada direta própria | Três passos: escopo, versão e revisão; ação de cadastro e demonstração | Identidade mínima; sem telefone, empresa ou questionário obrigatório | Abrir/recarregar a rota, iniciar cadastro e retornar a projetos |
| `155356(1)` — visão geral | `/dashboard` e `/` | Tela trocada por estado React; sem endereço próprio ou agregados de decisões | Filtros por projeto, busca e período; próximos passos e contagens rotuladas | Projetos/histórico: até 100 registros; decisões: amostra de até 20 análises completas/500 detecções, com sinalização de truncamento | Aplicar filtro muda contagens; erro não vira zero; candidato repetido em commits conta como ocorrência histórica |
| `155428(1)` — organizações | `/account`, `/help` | Sem integração de organizações | Explicação explícita de ausência; nenhuma instalação simulada | Login não instala App ou autoriza organizações | Não oferecer controle operacional de organizações sem backend |
| `155452(1)` — repositórios | `/projects` | Busca em tela sem URL; risco de interpretar lista vazia como ausência de repositórios GitHub | Busca com URL, identidade, histórico e cadastro claro | Lista somente projetos cadastrados no Workbench; não descobre todos os repositórios da conta. `has_runs` diferencia ausência de execução de histórico fora da janela | Adicionar projeto confere nome/ID e exige autorização; projeto fora dos 100 runs não recebe “Ainda não analisado” indevidamente |
| `155517(1)` — achados | `/findings` | Sem listagem global | Busca por arquivo/evidência/repositório, filtros por projeto, decisão, categoria e período; links para revisão | Agregado do servidor com owner, decisões atuais, até 20 análises/500 detecções | Filtro limita os itens, vazio informa alcance e revisão abre a análise correta; confiança não é severidade |
| `155533(1)` — histórico | `/runs`, `/runs/[runId]` | Detalhe e seleção perdidos na recarga | Endereço do detalhe e filtros na URL; conclusão parcial, falha e execução distintos | API existente, run ID, commit, horário UTC, cobertura e motivo seguro | Abrir URL diretamente e recarregar a mesma análise; falha não produz resultado limpo; sem cancelamento fictício |
| `155544(1)` — bancos | `/help` | Referência ilustrativa, sem adaptador | Capacidade futura identificada como tal | Nenhum comando, banco ou conexão é executado | Não há ação de auditoria de banco aparentando funcionamento |
| `155608(1)` — perfil | `/profile` | Sem rota própria de perfil | Identificação mínima e somente leitura; acesso à conta e logout real | Identidade verificada no servidor; nenhuma edição ou avaliação sem persistência | Perfil não exige formulário de contato; logout usa o controle do servidor |
| `155624(1)` — configurações | `/account`, `/settings` | Conta e limites dentro de tela sem rota | Sessão, permissão, cadastro, App e monitoramento separados | GitHub exclusivo; somente namespace público autorizado | Cadastro não indica instalação ou monitoramento; configuração pronta não afirma homologação concluída |
| `161952` — Applications GitHub | `/account`, `/help` | Ausência de App de repositórios | Distinção entre OAuth de identidade e futura instalação de App | Conector da conversa não equivale a credencial hospedada | Não presumir App instalada pelo sucesso do login |
| `162022` — permissões e seleção | `/account` | Sem instalação/seleção operacional | Explicação de leitura mínima e fase separada | Permissões de escrita da referência não foram copiadas | Nenhum acesso privado, organização ou “todos os repositórios” concedido implicitamente |
| `162048` — integração | `/account` | Estado de configuração podia ser confundido com integração completa | Estado textual por dimensão; sem ressincronização simulada | `githubReady` indica configuração, não validação do percurso real | Falta de configuração aparece; App não integrada e monitoramento não habilitado continuam explícitos |
| `162106` — ações destrutivas | `/account`, `/help` | Sem fluxo de exclusão ou App | Diferencia sair, revogar autorização, desinstalar App e excluir dados | Apenas logout efetivamente implementado | Nenhum botão destrutivo promete efeito ausente; logout não apaga histórico |
| `162154` — escolha de conta | `/access` | OAuth local implementado, homologação externa separada | Jornada preserva seleção no GitHub e decisão de acesso no servidor | ID estável e owner canônico; sem associação por e-mail/username | Outra conta válida não lê projetos; callback real precisa ser testado na configuração legítima |
| `162205` — entrada única | `/access` | GitHub exclusivo já implementado na base desta etapa | Mantém única entrada GitHub e demonstração secundária | Sem cadastro aberto ou outro provedor | Configuração ausente não simula sucesso; consentimento negado e expiração têm recuperação |
| Comparar versões | `/compare?before=…&after=…` | Comparação apenas em modal vinculado ao estado local | Rota, seleção e contexto preservados pela URL | Duas análises completas diferentes do mesmo projeto; fingerprints | Backend recusa pares incompatíveis; ausência de nova detecção não comprova correção |
| Relatório e download | `/reports?run=…` | Download no detalhe sem prévia ou rota própria | Lista elegível, prévia Markdown e download; detalhe mantém exportação | Conteúdo atual gerado pelo servidor; sem HTML de evidência executado | URL identifica análise; arquivo baixado deve ser aberto/conferido no navegador |
| Importação estática REA | Ação em `/projects`; API separada | REA não executado na hospedagem | Projeto autorizado, SHA completo declarado, JSON de até 1 MiB e confirmação | Fonte `rea-import`; vínculo com commit não verificado, estatísticas/hashes declarados, cobertura parcial, bruto não persistido | Servidor valida artefato e contexto; UI não anuncia execução REA, aquisição GitHub verificada ou vulnerabilidade confirmada; demo não envia arquivo |

## Navegação, dados e recuperação

- Todas as páginas operacionais chamam o mesmo wrapper servidor de acesso. Links
  usam navegação de documento e `target="_top"`, preservando a solução da regressão
  de roteamento vinext já observada. `/settings` é alias de Conta e acesso.
- Filtros usam formulários GET com query na URL. Recarga e retorno preservam a
  seleção aplicada. A comparação grava os IDs na URL e consulta IDs explícitos fora da janela de 100 execuções; pares de
  métodos distintos não são oferecidos. Seu resultado é recalculado
  pelo operador após recarga, sem manter resposta privada no armazenamento local.
- Listagem de projetos significa cadastro no Workbench, não descoberta automática
  da conta GitHub. Estado vazio oferece cadastro e explica essa diferença.
- Somente a demonstração usa `sessionStorage`, com namespace próprio e fixtures
  fixas. Nenhum projeto, relatório, sessão ou achado real é salvo nesse mecanismo.
  O modo `?demo=1` acompanha links e filtros; uma URL de análise real desconhecida
  não é substituída por resultado fictício. Se o armazenamento estiver indisponível,
  novas análises fictícias são bloqueadas para não gerar URLs perdidas; revisões
  informam que serão descartadas ao navegar.
- Respostas 401/403 removem dados reais da tela e orientam novo acesso. Ao restaurar
  uma página pelo cache de navegação do navegador, a aplicação recarrega o documento
  para revalidar a sessão no servidor. Esses controles de apresentação complementam
  a autorização da API, sem substituí-la.
- Não há métrica de correção verificada ou severidade inventada. Decisões são
  ocorrências por análise; o conjunto consultado e seus limites ficam visíveis.
- Duração não é estimada a partir do horário de criação. Só deve ser apresentada
  quando o contrato fornecer início/fim efetivos.

## Acessibilidade e validação desta etapa

A implementação mantém a paleta clara/verde existente, reforça texto de apoio,
foco visível, rótulos, tabelas com cabeçalhos, estados textuais e redução de
movimento. No mobile a navegação tem botão com nome, estado expandido e relação
com o menu. Diálogos nativos preservam foco; fechamento fica bloqueado durante
operações que não oferecem cancelamento real. A prévia Markdown é texto escapado,
rolável e acessível por teclado.

Passaram **9 testes SSR** sobre os componentes reais: rotas/links da demonstração,
ID desconhecido, detalhe e prévia, filtros que alteram resultados, separação de
cadastro/integração, estado inicial do proprietário, entradas diretas no servidor e regressão de erro/carga que não pode virar vazio de sucesso e rotulagem REA declarada.
Também passaram TypeScript e lint direcionado após a reestruturação. SSR não
executa effects, download, armazenamento do navegador, OAuth ou D1.

Permanecem necessários na homologação da versão que incorporar esta etapa:
navegar/recarregar todas as rotas, menu mobile e teclado/foco; demonstrar revisão
persistida e download efetivo; validar isolamento, sessão expirada/logout e retorno;
e importar fixture REA segura com contexto explicitamente declarado. Não afirmar
conformidade WCAG, teste assistivo, teste com usuários ou publicação deste código
apenas com build, SSR ou capturas visuais.
