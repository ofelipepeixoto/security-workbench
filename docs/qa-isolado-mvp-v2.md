# Proposta de QA isolado — Security Workbench MVP v2

Preparado em 21/10/2026, horário de Brasília. **Proposta revisável: nenhum recurso,
App, segredo, domínio, deploy, migração remota ou piloto foi criado/ativado por
este documento.** Produção continua v15 e owner-only. Os heads/CI de #37–#40 e
o ajuste de listagem devem ser reconciliados pelo adendo do relatório MVP v2.

## Decisão e ambiente concreto proposto

Usar o mesmo runtime de destino (Workers + D1 + Queues), em recursos exclusivos de
QA. Não reutilizar banco, fila, chave, OAuth callback ou cookies da produção. D1
continua fonte única; Supabase, n8n, OpenAI e REA nativo não são necessários a
este ensaio. O REA instalado no WSL permanece preservado; PC não será executor.

| Recurso proposto | Quantidade/escopo | Separação e gate antes de criar |
| --- | --- | --- |
| Conta/projeto Cloudflare de QA | Uma conta já pertencente ao proprietário, com plano e permissões verificados; não criar outra conta | Registrar account ID real e mapa produção/QA, sem expor identificadores sensíveis em relatório público; não presumir que o conector Sites concede acesso a essa conta |
| Worker web/API | Um, nome candidato `security-workbench-qa` | Origem HTTPS exclusiva; build do head revisado. Nunca salvar/deployar versão no projeto Sites da v15 para fazer QA |
| Consumidor Queue + scheduler | Um Worker separado, nome candidato `security-workbench-analysis-qa` | Mesmo D1/segredos QA do web, produtor/consumidor exclusivamente QA; `fetch` do consumidor permanece 404; cron de recuperação somente na janela de ensaio |
| D1 operacional QA | Um, nome candidato `security-workbench-qa` | Banco novo com fixtures sintéticas, sem cópia de produção; bindings diferentes dos da v15 |
| D1 de restauração QA | Um, descartável, nome candidato `security-workbench-qa-restore` | Restaurar export sintético e conferir antes da App real. Não sobrescrever a produção nem substituir o banco ativo sem reconciliação |
| Queue QA | Uma, nome candidato `security-workbench-analysis-qa` | Somente `{jobId}` no payload; `max_batch_size=1`, `max_concurrency=2`, `max_retries=2`, conforme exemplo do repositório |
| Origem web/callback | Uma HTTPS, candidata `qa-security-workbench.camaleaoweb3.com.br` ou `workers.dev` exclusivo | Nome não reservado nem DNS criado. Validar compatibilidade do build/hostname e escolher antes de cadastrar callbacks; não usar domínio principal da v15 |
| Acesso externo | Apenas participantes A/B e operador, bloqueio de demais identidades no servidor; proteção de borda existente se disponível | Confirmar barreira privada compatível com OAuth e com o plano. Não contratar Access ou criar mecanismo paralelo sem necessidade; a allowlist da aplicação continua obrigatória |
| OAuth de login + GitHub App de repositórios | Clientes exclusivos de QA, separados do login/App da produção | Cadastro e callbacks exatos somente após aprovação; a integração GitHub deste chat não será transferida para o Site |
| Segredos QA | Client Secrets de login/App e chave AES-GCM versão 1, somente no secret manager/runtime aprovado | Nenhuma chave em Git, navegador, URLs, comentários, logs, screenshots ou chat. Gerar/inserir pelo operador autorizado, sem solicitar valores na conversa |

Os nomes são propostas, não IDs existentes. Antes de ativar qualquer flag,
comparar o conjunto de bindings com os IDs confirmados de produção e interromper
se houver qualquer coincidência de banco/fila/segredo/origem não intencional.
O exemplo `web/workers/wrangler.analysis.example.jsonc` é um modelo, não prova de
recursos configurados. Não acrescentar serviço público de REA nem porta na VPS.

## Participantes, dados e permissões

| Papel | Conta proposta | Autorização que falta | Escopo mínimo |
| --- | --- | --- | --- |
| A — administrador do piloto | `ofelipepeixoto` | Participação autorizada; faltam os repositórios benignos escolhidos | ID numérico confirmado no GitHub; workspace administrativo QA distinto do legado de produção |
| B — segundo workspace | `radartech-news` | Participação autorizada como segunda identidade; falta login real QA | ID numérico distinto confirmado, allowlist QA; não administrador. Duas identidades operadas pela mesma pessoa testam isolamento, não representam validação independente por outro operador |
| Organização opcional | Organização de teste controlada e aprovada | Identificar organização/admin e autorizar instalação selecionada | Necessária para afirmar organização/SSO homologados; sem essa prova, item fica pendente |
| Operador/revisor | Proprietário ou pessoa por ele indicada | Nomear responsável por decisões e guarda das evidências | Sem permissões para alterar a produção pelo roteiro QA |

Criar, apenas se autorizado, fixtures benignas A-only, B-only e compartilhada,
públicas/privadas conforme o caso. Confirmar acesso por usuário e seleção da App;
o compartilhamento de uma instalação não concede a B os repositórios exclusivos
de A. Não usar repositórios de clientes ou código privado de terceiros.

GitHub App: `Repository Metadata: read` e `Repository Contents: read`; nenhuma
escrita, administração, Actions, secrets ou permissão de organização adicional.
Usar user access token da App e a interseção usuário/instalação; consentimento do
login é separado. Não solicitar chave privada/JWT de instalação sem necessidade.
Permissões administrativas para cadastrar App e selecionar repositórios pertencem
ao operador, não ao motor do Workbench. SSO/aprovação pendente devem ser observados,
nunca simulados como sucesso.

## Custo estimado e condição de parada

Estimativa consultada nas fontes oficiais em 21/10/2026 BRT. **Plano/fatura,
disponibilidade e cotas livres da conta do proprietário não foram consultados.**
O total é uma projeção de piloto, não promessa de capacidade ou custo contratado.

Premissas propostas para uma janela de 7 dias: 2 contas, até 50 jobs/dia, fixtures
pequenas (começar em 1–3 arquivos), até 5.000 requests web/scheduler/dia, menos de
1 milhão de linhas D1 lidas/dia, 20 mil escritas/dia e 20 MB armazenados nos dois
bancos; até 2 mil operações Queue/dia incluindo margem para duplicatas e retries.
São tetos operacionais propostos a medir, não consumo já observado. 50 entregas
normais usam aproximadamente 150 operações Queue; cron pode reenviar jobs ainda
elegíveis, portanto contar operações reais, não só jobs únicos.

| Opção | Referência atual e projeção | Decisão |
| --- | --- | --- |
| Free, sem contratação | Workers: 100 mil requests/dia, CPU 10 ms/invocação; D1: 5M linhas lidas/100 mil escritas por dia e 5 GB totais, máximo 500 MB/banco; Queues: 10 mil operações/dia e retenção fixa 24 h | Estimativa incremental US$0 **somente se** conta, compatibilidade e cotas disponíveis confirmadas. CPU/limites podem impedir o scanner/SSR. Primeiro medir fixture pequena; não anunciar suporte ao limite máximo de 2 MiB ou ao catálogo de 100 projetos sem prova |
| Paid já contratado | Workers Standard inclui 10M requests e 30M CPU-ms/mês; D1 e Queues possuem franquias mensais próprias | Dentro da franquia remanescente, projeção de consumo incremental US$0 para o volume acima; confirmar uso compartilhado da conta. Não trocar plano ou contratar por este roteiro |
| Nova assinatura, só se Free não atender | Preço mínimo Workers Paid anunciado US$5/mês por conta, além de excedentes aplicáveis | **Não autorizada e não executada.** Apresentar orçamento específico se limites medidos exigirem; custo de câmbio/tributos não estimado |

Fontes: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/),
[Queues no Free](https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/).

Parar em erro de cota, CPU, armazenamento ou orçamento; não aumentar timeout,
trocar identidade/IP/token para contornar quota nem fazer upgrade automático.
As franquias são compartilhadas com outros recursos da conta. Limites Free de
subrequests/queries e CPU são gates de compatibilidade; tempo de rede não é CPU.
Alarmes não constituem teto financeiro no Paid. Manter janela curta, allowlist,
concorrência e ledger durável de quota; se não houver bloqueio efetivo de volume,
não prometer um teto de gastos automático. Chamada paga de IA: orçamento R$0,
desligada. Nenhum preço de Sites adicional foi presumido.

## Migração, preflight e restauração — sequência posterior à aprovação

1. Fixar head remoto da correção de listagem, árvore/lockfile, CI e migrations
   `0000`–`0005`; revisão humana confirma o escopo. Verificar CLI instalada e
   `--help` antes de executar os comandos de D1; este documento não os executa.
2. No ambiente local isolado, repetir somente os testes afetados por mudanças.
   O ensaio `scripts/audit-d1-migrations.mjs` existente usa Miniflare efêmero e
   confirma legado sintético, FKs e rollback. Ele não prova backup remoto.
3. Confirmar account/database/queue IDs QA contra o mapa aprovado, flags `false`,
   produtor/consumidor/cron parados e ausência de conexões reais. Rejeitar qualquer
   comando ou binding que aponte ao Site/D1 de produção.
4. Criar base QA no schema anterior e inserir apenas dados sintéticos: owner
   administrativo, projetos/análises/revisões A/B e casos inconsistentes em banco
   descartável separado. Não copiar sessões, envelopes, tokens ou Evidence reais.
5. Preflight SQL: checar versão das migrations, `foreign_key_check`, integridade,
   colisão de namespace `github:`, owner de relações e duplicatas de repository ID.
   As migrations devem abortar a inconsistência, sem adotar dados pelo primeiro
   login ou corrigir silenciosamente IDs. Registrar contagens/digests sintéticos.
6. Antes da migração, exportar schema+dados sintéticos QA para SQL privado e obter
   digest/tamanho/horário e bookmark Time Travel quando disponível; export pode
   bloquear consultas, por isso usar janela sem writes. Não publicar dump.
7. Restaurar esse SQL no **D1 de restauração QA separado**, sem credenciais reais;
   conferir tabelas, linhas, índices/triggers, FKs e os mesmos digests. Só então
   considerar o backup restaurável. Retenção Time Travel depende do plano: Free
   7 dias/Paid 30; confirmar elegibilidade do banco real, não presumir.
8. Aplicar em QA as migrations versionadas pela ferramenta aprovada, uma migração
   por transação; conferir após cada uma. Em cópia descartável inconsistente,
   comprovar que a falha reverte dados/schema da migração e não deixa tabela
   temporária, perda de histórico ou owner reassociado.
9. Conferir resultado completo e guardar registro sanitizado. Não usar restore
   destrutivo de produção como rollback. Para retornar QA após erro, parar cron,
   dispatch e consumidor; manter flags desligadas, restaurar cópia sintética
   aprovada ou reconstruir QA. Não reconstruir enquanto consumidor antigo puder
   escrever; preservar fence/leases e encerrar a geração antiga primeiro.
10. Depois de credenciais reais de QA existirem, **não restaurar envelopes/sessões
    antigos**: limpar estados OAuth/sessões/conexões restaurados, incrementar a
    geração de sessão/chave conforme política e exigir novo login/conexão. A
    revogação no GitHub não é desfeita pelo restore. Validar esse caso antes de
    declarar recuperação operacional.

Referências: [import/export D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/),
[D1 CLI](https://developers.cloudflare.com/d1/wrangler-commands/),
[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
Não confundir rollback transacional de uma migração com reversão completa do
schema após várias migrações já concluídas.

## Matriz da homologação hospedada ainda pendente

Todos os casos abaixo estão **não executados na hospedagem** nesta proposta.
Guardar IDs/digests/horários/códigos e resultado esperado/observado; não guardar
tokens, respostas GitHub brutas ou código privado em relatórios públicos.

| Caso | Operação controlada | Aceite / condição de bloqueio |
| --- | --- | --- |
| A/B e anônimo | Entrar em perfis de navegador distintos, expirar/revogar sessão e tentar IDs de B como A em projeto, job, run, revisão, comparação, report e exclusão | Só dados do próprio workspace; anônimo/expirado recusado; nenhuma diferença revela nome/conteúdo privado de B; cache/browser voltar não recupera dados de outra conta |
| Instalações/interseção | Instalação selecionada, A-only/B-only/compartilhado e permissão removida | Catálogo corresponde ao acesso real da pessoa e da App; installation ID adulterado não concede acesso |
| Paginação e 90–100 projetos | Conferir contas autorizadas com volume existente; se insuficiente, usar fixtures sintéticas no transporte QA identificado como simulado | Contar chamadas, páginas, latência e cobertura; sem chamadas a commit para mera listagem; não criar dezenas de repositórios reais sem autorização própria; caso de escala real permanece pendente se só houver mock |
| Organização/SSO | Usar organização de QA e aprovação/SSO somente quando disponíveis | Permissão/SSO confirmado ou estado bloqueado visível; ausência dessa organização não vira homologação |
| Revogação | Em casos separados: retirar repo da instalação, retirar usuário, suspender/desinstalar App, expirar/revogar token e desconectar | Nova requisição revalida e bloqueia catálogo/resultado privado, enqueue e aquisição; cache da requisição anterior não autoriza a seguinte; sem fallback para token mais amplo |
| Erros/latência/quota | Injetar atraso/429/403/timeout no transporte QA dedicado, sem provocar carga para esgotar o GitHub real | Erro seguro, próxima tentativa quando existente e ausência de resultados privados; não virar lista vazia bem-sucedida; distinguir prova injetada de erro real do provedor |
| Idempotência e reentrega | Repetir mesma mensagem/job e simular perda de resposta após persistir | Uma análise/decisão por intenção; reanálise intencional com ID novo funciona; nenhuma decisão aplicada à outra run |
| Cancelamento e lease | Cancelar queued/running; pausar consumidor antigo e tentar excluir projeto/novo claim | Job cancelado não confirma resultado; lease ativo/cancelled conserva reserva; exclusão 409 até expirar; resultado do consumidor antigo não vence fence |
| Outbox/recuperação | Falhar envio entre commit D1 e Queue, interromper consumidor e aguardar cron/lease | Job recuperado sem duplicação; tentativas/cota/backoff respeitados; dois consumidores não ultrapassam limites globais/por owner |
| Revisão e persistência | Duas execuções do mesmo SHA benigno com candidato sintético, revisar e recarregar em nova sessão | Decisão permanece no objeto correto e autor/referência correspondem; ausência posterior de detecção não é correção verificada |
| Comparação | Comparar somente runs compatíveis e tentar par A/B ou identidades/repos distintos | Comparação autorizada e rastreável; par cruzado recusado sem vazamento |
| Exportação realmente aberta | Baixar Markdown pelo navegador autenticado, localizar arquivo, abrir e conferir seu conteúdo | Mesmo projeto/SHA/cobertura/decisão da run; hash/tamanho registrados; anotação de arquivo aberto. Solicitar download ou conferir prévia não basta |
| UX e encerramento | Teclado, foco, Escape, zoom/reflow, mobile, sessão expirada, retry e duplo clique | Não perder contexto nem iniciar scan por listar; erros claros, sem progresso inventado; saída não deixa dados reais na demo |

Queue entrega pelo menos uma vez; [retries/ack](https://developers.cloudflare.com/queues/configuration/batching-retries/)
e [limites do consumidor](https://developers.cloudflare.com/queues/platform/limits/)
não substituem idempotência/fence do efeito em D1. O consumidor preparado é de
análise estática JS; nenhum alvo é executado nem dependência instalada. Mantêm-se
os limites da aplicação, sem ampliá-los para satisfazer o ensaio.

## Evidências locais versus aceite hospedado

Já registrados na entrega anterior: 195 testes Node, 27 Python, tipos/lint/build,
auditoria D1 Miniflare e CIs de #37–#40. São contratos locais/CI, com identidades e
transportes sintéticos onde indicado. A revisão atual de listagem deve registrar
seus próprios casos/resultados no adendo, sem atribuí-los ao ambiente hospedado.
A fixture REA local de 342 bytes/7 s é evidência anterior, não deve ser repetida.

Ainda faltam: App e recursos QA realmente conectados, duas sessões de contas
autorizadas, comportamento de organizações/SSO quando aplicável, transporte Queue
real, restore remoto ensaiado, jornada revisão/comparação e arquivo exportado
aberto. Nenhuma CI verde elimina esses aceites. Só após registrar sucesso em cada
caso é possível declarar piloto controlado homologado; lançamento multiusuário
em produção permanece fora desta autorização.

## Autorizações específicas para a próxima etapa

Não pedir permissão outra vez para leitura, testes locais, correção e PR já
autorizados. Antes de executar QA hospedado, solicitar somente os itens ainda
ausentes, vinculados ao head/ambiente revisados:

1. **Ambiente QA e orçamento:** aprovar a conta/origem e criar somente os dois
   Workers, dois D1 e uma Queue exclusivos listados; deploy apenas em QA, sem
   alterar Sites v15. Preferir recursos/plano existentes ou Free, sem assinatura
   nova; se Free não atender, retornar com a medição e orçamento antes de gasto.
2. **Identidades e integração:** confirmar A=`ofelipepeixoto`, B=`radartech-news`
   (ou substitutas expressamente indicadas), repositórios benignos e organização
   opcional; autorizar cadastro dos clientes QA, instalação selecionada e inserção
   protegida dos segredos pelo operador. Nunca pedir os valores no chat.
3. **Execução limitada:** autorizar migrations/backup/restore somente dos D1 QA
   sintéticos, janela de 7 dias com até 50 jobs/dia, allowlist de A/B, flags apenas
   em QA e cron somente durante o ensaio; autorizar os testes de revogação e as
   ações de encerramento. Aprovar retenção de evidências sanitizadas e prazo para
   remover dados/recursos QA após a revisão, sem exclusão automática presumida.

Se a integração Cloudflare de administração não estiver disponível, o operador
executa o menor passo de cadastro/configuração pelo painel. A falta de acesso
não autoriza usar credenciais do chat, outro projeto Sites ou produção como
atalho. Ao terminar cada fase, parar no gate seguinte sem ampliar o mandato.


## Adendo de execução — preflight e controles de 22/10/2026 BRT

Este adendo prevalece sobre a proposta anterior: custo adicional **zero**,
nenhuma assinatura/upgrade, nenhuma chamada paga, somente conta Cloudflare
existente controlada pelo proprietário. Plano Paid com franquia remanescente
não garante esse teto; não provisionar nesse caso sem solução demonstrada de
bloqueio de cobrança. Não criar outra conta.

**Preflight real somente leitura:** conector Cloudflare direto autenticado,
conta existente identificada e apresentada privadamente ao proprietário para
confirmação; associação aceita de Super Administrador. Inventário completo
retornou zero Workers, zero D1 e zero Queues atuais. Isso não prova consumo
histórico zero. Nome/e-mail/Account ID não são publicados neste documento.
`default_usage_model=standard` não identifica Free versus Paid. A API de
assinaturas recusou leitura (403): este endpoint não é coberto por OAuth e
exige Billing Read. Portanto plano, consumo compartilhado e saldo das franquias
continuam **bloqueados**, não presumidos. Conferir pelo painel antes de criar
qualquer recurso. Não conceder chave global ao Composio: o formulário encontrado
exigia Global API Key; o conector direto tornou esse caminho desnecessário.
A v15 do Sites foi reconfirmada, sem alteração. A conta Cloudflare identificada
é um destino distinto do ambiente gerenciado pelo Sites, não uma transferência
ou uma conta nova. Propriedade principal permanece ofelipepeixoto.

**Código preparado, sem ativação:** migration `0006_qa_window.sql` cria tabelas
vazias. A ativação exige INSERT explícito depois das aprovações. A janela é
imutável: sete períodos consecutivos de 24 horas a partir da ativação efetiva,
50 jobs novos por período somando A+B, máximo 350 em toda a janela. Não são dias
calendários BRT nem dias de franquia Cloudflare (UTC). Ledger compartilhado e
trigger D1 fazem a reserva atômica com job/run; idempotência não consome duas
vezes, concorrentes disputam o último slot, rollback não deixa reserva órfã.
Cancelar/excluir não devolve quota; reativar/limpar ledger pela aplicação é
proibido. Encerramento antecipado é irreversível. A allowlist fixa contém só os
IDs de ofelipepeixoto e radartech-news; fixtures exigem seleção prévia de
usuário + instalação + repository ID + nome completo em ambas as contas próprias.
Nada seleciona/análise automaticamente o catálogo inteiro. REA, scan legado e
exclusão permanente ficam bloqueados no QA.

Por job: no máximo duas tentativas, 45 s cada, duas aquisições globais e uma por
workspace (fence/lease existentes preservados); no máximo 16 requests GitHub e
2 MiB agregados de respostas por tentativa, incluindo autorização/refresh,
portanto 32 requests e 4 MiB por job. Scanner mantém até 20 arquivos, 2 MiB de
entrada, 256 KiB/arquivo, 100 achados, 500 dependências e resultado de até 1 MiB.
O transporte QA recusa destinos pagos/externos e redirects; não grava corpos ou
credenciais. Revalida usuário/App/repositório antes e depois da aquisição.
Limite de aquisição é conservador e pode exigir fixture menor; não ampliar sem
revisão. Compatibilidade real de CPU/subrequests Free permanece não medida.

Queue: reserva atômica antes de enviar, três envios totais/job, espaçados em pelo
menos 60 s, inclusive falhas ambíguas. Duas retentativas de transporte por envio,
batch 1 e concorrência 2. Logo não confundir 50 jobs com 50 operações: um envelope
pequeno normalmente custa escrita + leitura + exclusão; três envios e nove
entregas dão teto conservador de 21 operações/job (7.350 na janela inteira de
350 jobs). Esse teto vale só para o dispatcher/consumidor preparados, sem envios
manuais adicionais nem outros produtores. Franquia livre e consumo dos demais
recursos ainda precisam ser conferidos. A outbox pode permanecer pendente quando
os três envios se esgotarem; registrar como falha operacional, sem reset automático.

**Ferramentas locais:** `node scripts/qa-control.mjs check <manifesto-privado>`
valida conta confirmada, Free, evidência de consumo recente, margem compartilhada,
compatibilidade medida, origem/IDs distintos de produção e fixtures. Não consulta
API e não prova a veracidade de um manifesto preenchido: o operador deve anexar
as evidências reais ao registro protegido. `activate-sql` gera somente um INSERT
revisável, com início fresco; nenhum comando executa API, deploy ou migration.
Manifestos/exports/evidências locais ficam em `.qa-local/`, ignorado pelo Git.

**Encerramento preparado desde o início:** expiry impede novos jobs, claims,
dispatch e resultado tardio; o scheduler retorna sem enviar após o fim. Triggers
D1 também bloqueiam claim/resultado se um consumidor omitir acidentalmente o
flag QA. O exemplo de configuração começa sem cron, jobs/App/multiusuário off,
QA guard on, observability off. Antes de ativar, nomear operador e agendar a
remoção do cron no plano de controle até o término. A trava runtime **não remove
o trigger Cloudflare**: uma invocação vazia ainda pode acontecer enquanto ele
não for removido. Se essa remoção não puder ser garantida, não ativar cron;
bloquear apenas o teste de scheduler real. Não colocar token administrativo
permanente no Worker para ele se autoalterar.

`node scripts/qa-control.mjs close-sql` prepara fechamento durável e cancelamento
sem DELETE, mantendo leases até expirar e todos os históricos/revisões/ledgers.
No término: remover cron exclusivamente do consumidor QA, desligar dispatcher e
jobs, pausar/desanexar consumidor QA, verificar ausência de novos envios/claims,
guardar métricas/evidências sanitizadas. A execução desses comandos requer os
IDs QA aprovados. Não purgar Queue, remover D1/Workers ou apagar evidências sem
aprovação de exclusão própria. Restore permanece somente no segundo D1, sem
bindings do produto, sem recuperar sessões/envelopes antigos ou reiniciar quota.

**Registro de aceite atual:** controles locais e migrations em SQLite/Miniflare
são testes sintéticos; todas as linhas da matriz hospedada continuam bloqueadas
por conta/plano/cotas/seleção de fixtures/recursos/App ainda não confirmados.
Código revisável não equivale a piloto homologado nem a lançamento público.
Os próximos pedidos, em ordem, são: confirmar conta existente e conferir plano/
consumo pelo painel; depois aprovar os cinco recursos exatos e deploy/migrations
só em QA; separadamente aprovar clientes/callbacks/segredos protegidos GitHub e
instalações de fixtures selecionadas. Não repetir consentimento A/B já fornecido.
