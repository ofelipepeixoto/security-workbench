# Execução do QA isolado — 22/10/2026 UTC

Estado: infraestrutura de QA publicada e ensaio D1 real aprovado; piloto ainda
não homologado. Produção Sites permanece na v15, com a política de acesso
existente. Proprietário: `ofelipepeixoto`; `radartech-news` é só a segunda
identidade de teste. Nenhum merge, deploy de produção ou Supabase foi realizado.

## Conta, custo e recursos efetivamente criados

Conta existente apresentada privadamente e confirmada pelo proprietário. O
inventário anterior à criação retornou zero Workers, D1 e Queues enquanto a v15
do Sites estava ativa. Sites é um ambiente gerenciado distinto; seus IDs
internos de infraestrutura não são expostos nem foram inventados. A associação
Cloudflare tem Super Administrator. A consulta de assinaturas exige Billing
Read, indisponível no OAuth; a evidência complementar do painel e a confirmação
do proprietário identificaram Workers Free, sem método de pagamento,
0/100.000 requests e 0 CPU ms antes do provisionamento. Isso não equivale a uma
consulta completa do histórico de faturamento. Não houve contratação, upgrade,
ativação de produto pago ou chamada paga de IA.

Referências de capacidade Free: [Workers](https://developers.cloudflare.com/workers/platform/limits/),
[D1](https://developers.cloudflare.com/d1/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/).
Workers: 100 mil requests/dia e 10 ms CPU por invocação; D1: 5 milhões de linhas
lidas e 100 mil escritas/dia, 5 GB totais; Queues: 10 mil operações/dia e retenção
de 24 h. Franquias são compartilhadas por conta e devem ser rechecadas antes de
ativar a janela. Atingir o limite Free deve bloquear a etapa, nunca provocar
upgrade. O limite de 50 jobs não substitui os contadores de infraestrutura.

| Recurso criado | Estado confirmado |
| --- | --- |
| Worker `security-workbench-qa` | Publicado, HTTPS `workers.dev` habilitado, previews desativados |
| Worker `security-workbench-analysis-qa` | Publicado, `workers.dev` e previews desativados, sem cron |
| D1 `security-workbench-qa` | Operacional de QA; migrations 0000–0006 aplicadas |
| D1 `security-workbench-qa-restore` | Somente ensaio de restauração; nenhum binding da aplicação |
| Queue `security-workbench-analysis-qa` | Dois bindings produtores, zero consumidores; nenhum envio realizado |

Origem: <https://security-workbench-qa.radarjacarepagua.workers.dev>.
IDs técnicos e evidências privadas ficam no registro protegido do operador;
nenhum dump, bundle, credencial, e-mail da conta ou log bruto foi anexado ao PR.
A primeira criação da Queue recebeu HTTP 500/code 10013. O inventário seguinte
confirmou ausência; uma segunda tentativa finita criou o único recurso esperado.
Não houve criação duplicada nem polling de criação sem reconciliação.

Código dos dois Workers: `e361bc8b2a10cba5e2755320f4fa28bbdaadcaa0`.
Deploy web: `a5ff8c08c19b4ae3b73a7961e3b55531`;
consumer: `82a3331cf9024be689a5444ef2cd8181`.
O patch de bindings posterior não alterou esse código. Startup web 11 ms e
consumer 1 ms são tempos de inicialização, **não CPU por request**. A prova
completa de consumo de uma análise real no Free continua pendente.

## Migrations, backup e restauração: integração D1 real

Preflight verificou banco vazio, `PRAGMA quick_check=ok` e nenhuma violação de
FK. Uma transação de prova no D1 de restore criou uma tabela e violou um CHECK;
a transação inteira foi revertida, inclusive a tabela. Cada migration foi então
executada em um batch atômico com a entrada do ledger e digest SHA-256, seguido
de checagem de integridade, FKs e prefixo exato do ledger. Nenhuma inconsistência
foi ignorada. O ledger operacional `workbench_qa_migrations` tem sete entradas.

Foram inseridos apenas dois projetos, duas execuções concluídas e uma revisão
**sintéticos**; nenhuma análise ou job foi executado para produzi-los. A cópia
inclui essas cinco linhas e sete linhas do ledger: 12 registros e 39 objetos de
schema. Backup SQL lógico: 13.820 bytes, SHA-256
`35e2281dafb8d9045e576c7cbe01e290edc44c8a9b64c1eee51a2447a86fb0dd`.
Restaurado no segundo D1 inicialmente vazio; schema e registros relidos
coincidiram exatamente com a origem, integridade ok e zero violações de FK.
Isso prova restauração lógica de dados sintéticos, não Time Travel do provedor
nem recuperação de uma base real de produto. Sessões, conexões App, jobs e
ativações da janela continuam em zero nos dois bancos. Nenhuma evidência foi
apagada ou Queue purgada.

## Smoke público do REA: diagnóstico preservando os critérios

| Head / CI | Evidência e conclusão |
| --- | --- |
| `3c715f93b14901bd783b6db995c04198842ee80d` / [39715990883](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39715990883) | Falhou só o smoke público. Os 97 testes do job passaram; o log antigo omitiu HTTP/cota/estágio. Causa original **inconclusiva**. |
| `d82775ea1fadc76f143f741db769e37d147cff75` / [39718036878](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39718036878) | Quatro jobs aprovados, incluindo a aquisição real com o diagnóstico acrescentado. |
| `f04544dc893aa05f6a5233c8c608934baf89e5ec` / [39718517124](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39718517124) | Quatro jobs aprovados, incluindo empacotamento QA e smoke real. |
| `e361bc8b2a10cba5e2755320f4fa28bbdaadcaa0` / [39719974739](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39719974739) | test, web-build e github-live aprovados; web-scanner falhou no smoke público. Agora há **rate limit externo comprovado**. |

Na execução 39719974739, job 119630988999, o diagnóstico registrou 18 requests:
metadata respondeu 200 com limit=60/remaining=16; a última leitura de blob
respondeu 403, remaining=0, sem falha de transporte, reset em
2026-10-22T04:52:41Z. Classificação `external_rate_limit`, check `acquisition`.
Não atribuir retroativamente essa causa à primeira falha. Scanner, workflow e
assertivas originais eram idênticos entre a base #41 e o primeiro head #42;
a alteração e361 modifica apenas CSS. Não há evidência de regressão do scanner
nesses diffs; a falha nova ocorreu antes das assertivas, na resposta GitHub.

O replay aprovado preservou repository ID `1417322346`, commit REA
`3e7c6302233ecbcb9b92e43ee5a60337738961bd`, digest
`a2b6013d0338a03d9017f979a814ef781d6066d98080849a0f28d50943e9370b`,
20 arquivos, 72.882 bytes, cobertura parcial e duas omissões.
Não reinstalamos REA nem alteramos o alvo, SHA, assertivas, prazo de 45 s,
ausência de credenciais, ausência de retentativas ou exit code 1 na falha.
Não adicionamos skip, token ou aumento de timeout para obter CI verde.

O diagnóstico usa allowlist de estágio, status HTTP e metadados numéricos de
cota/tempo. Não registra URL, corpo, headers brutos, mensagem/stack/cause de
exceção ou conteúdo de repositórios. Três testes verificam redação, resposta
original não consumida e no máximo 32 registros sem requests adicionais.
Os logs brutos não foram copiados para a publicação.

## Matriz: aprovado, falhou ou bloqueado

| Verificação | Tipo | Resultado |
| --- | --- | --- |
| Controles de janela/quota A+B, IDs manipulados, revogação, paginação e isolamento | Local, transportes/identidades sintéticos | Aprovado nas suítes existentes; não prova duas contas reais |
| Suíte Node final após extensão do gate | Local | 231/231 aprovados; lint/TypeScript/build anteriores aprovados, build da correção CSS aprovado |
| Gate offline de isolamento Sites gerenciado | Local | 1 caso adicional aprovado; aceita IDs de produção indisponíveis só com fronteira Sites e inventário inicial vazio explicitamente atestados; continua recusando reuso, Paid, conta não confirmada e compatibilidade não provada |
| Migrations, rollback, backup/restore | D1 hospedado real | Aprovado conforme evidência acima |
| Página HTTPS, favicon, API sem sessão | Hospedado real | 200 HTML, 200 SVG, 401 JSON; nenhum dado real exposto |
| Desktop e teclado básico | Chrome, hospedado real, demonstração | Aprovado no recorte: layout e Tab/Enter no atalho levam foco a MAIN#main |
| Mobile 390×844 | Chrome, hospedado real, demonstração | Falhou inicialmente: documento 699 px; corrigido contendo o rótulo acessível na região da tabela. Após deploy, viewport 390 px/documento 375 px, sem overflow global. Não oculta o rótulo nem a tabela |
| Login A/B, isolamento por IDs reais, App/instalações, catálogo paginado, revogação | Hospedado real | Bloqueado por client secrets, chave exigida pelo cadastro GitHub para instalar e fixtures não selecionadas |
| Aquisição privada autorizada, Queue com entregas/reentregas, cancelamento/recuperação | Hospedado real | Bloqueado pelas mesmas dependências; binding de produtor não prova entrega |
| Scheduler real e encerramento no plano de controle | Hospedado real | Bloqueado até preparar teste/remoção de cron e confirmar responsável; zero cron atual |
| Revisão persistida, comparação, Markdown baixado e aberto; fluxos completos desktop/mobile/teclado | Hospedado real | Bloqueado até haver sessões e análise real; demonstração não é aceite desses fluxos |

## Autorização atual e configuração GitHub

O proprietário confirmou a conta, cinco recursos, deploy e migrations QA no
Free, e depois autorizou login A/B, permissões GitHub e processamento real
somente no QA. Não pedir novamente essas mesmas aprovações. Autorizar a ação
não significa que os pré-requisitos técnicos estejam concluídos.

Após reautenticação feita pelo proprietário, foram registrados sob
`ofelipepeixoto`:

- GitHub App [SWB QA ofelipepeixoto](https://github.com/apps/swb-qa-ofelipepeixoto),
  ID `5420817`, `Contents: read` e `Metadata: read`, webhooks/device flow/wildcards
  desativados, tokens de usuário com expiração. Instalável entre contas para o
  ensaio A/B, mas nenhuma instalação ou repositório foi concedido. O servidor
  continua limitado aos dois IDs de teste e fixtures selecionadas.
- OAuth [Security Workbench QA Login](https://github.com/settings/applications/3953677),
  sem escopo de repositórios, callback `/api/auth/github/callback`.

Callbacks completos na origem QA: `/api/auth/github-app/callback` para App e
`/api/auth/github/callback` para login. Nada usa a origem/callback de produção.
IDs públicos de configuração estão somente nos Workers QA. Uma chave aleatória
de 32 bytes foi gerada e enviada diretamente ao armazenamento de segredos dos
dois Workers como `GITHUB_APP_TOKEN_KEY`, versão 1, sem retornar o material ao
chat ou a arquivo. Não há client secrets cadastrados ainda.

**Handoff protegido restante:** no OAuth de login, gerar client secret e
inseri-lo diretamente como Secret `GITHUB_LOGIN_CLIENT_SECRET` no Worker web QA.
Na App, gerar client secret e inseri-lo como Secret `GITHUB_APP_CLIENT_SECRET`
nos dois Workers QA. Não colar esses valores no chat, Git, dumps ou screenshots.
GitHub exige ao menos uma chave privada para instalar a App: o proprietário
deve gerar/guardar a chave em destino protegido sob seu controle. O Workbench
usa user access token/interseção de acesso; não precisa receber essa chave nem
ganhar JWT de instalação. Nenhuma chave privada foi gerada ou baixada nesta etapa.

Falta escolher explicitamente fixtures próprias, com nomes/IDs de repositórios
e instalações. Não usar REA ou todos os repositórios como seleção implícita.
Registrar A-only, B-only e compartilhado conforme o escopo realmente disponível;
organização/SSO continua opcional e não homologado. Não criar novos repositórios
sem autorização específica para seus nomes e visibilidade.

## Ativação e encerramento

Estado final: QA guard ligado; login, multiusuário, App e jobs desligados; zero
cron e zero consumidores da Queue. A janela tem zero linhas: sete dias **ainda
não começaram**. Não marcar compatibilidade Free como aprovada antes de medir
um job real controlado. Ativar depois do preflight fresco e configuração pronta,
registrando início/fim, versão, fixtures e operador. Máximo 50 jobs por período
de 24 h somando A+B, 350 totais; duas tentativas/job, 16 requests/2 MiB por
tentativa, concorrência global 2 e por workspace 1; até três envios/job e
retentativas Queue limitadas. Projeção conservadora 21 operações/job, 7.350 em
toda a janela para esse caminho de dispatcher, sem outros produtores.

O comando offline não consulta a Cloudflare nem transforma uma atestação em
evidência. Para produção Sites sem IDs internos, guardar o inventário inicial
vazio e a confirmação da fronteira como evidência do manifesto protegido;
nunca preencher IDs fictícios. Empacotamento começa desativado e não deve ser
reenviado sobre a configuração já credenciada sem preservar bindings/segredos
e revisar os flags. O dump sintético não restaura tokens ou reinicia quota.

No fim da janela: fechamento durável sem DELETE, retirar qualquer cron QA,
desligar dispatcher/jobs, desanexar/pausar consumidor QA e conferir ausência de
novos claims/envios. Não manter cron recorrente sem mecanismo/responsável de
remoção. Expiry runtime bloqueia processamento, mas não remove o cron do
provedor. Guardar evidências; limpeza permanente e purge exigem autorização
própria. Nenhum processamento recorrente está ativo agora.

## Adendo — fixtures autorizadas e dois logins reais, 22/10/2026 BRT

O proprietário autorizou nominalmente duas fixtures privadas, somente com dados
sintéticos. Foram criadas sem workflows, dependências executáveis, credenciais
reais ou código do produto/terceiros:

| Fixture | Identificador | Commit de dados sintéticos |
| --- | --- | --- |
| `ofelipepeixoto/security-workbench-qa-fixture` | `1429246928` | `5cd1c984ab235042da96a736d8a1f80e790cf4bc` |
| `radartech-news/security-workbench-qa-fixture` | `1429249854` | `e2d0537fd0525b30c54267cc98d470d6c59c5f28` |

A primeira contém README e um arquivo JS inerte; a segunda, um arquivo JS
inerte. Os marcadores inválidos foram criados para testar candidatos/falso
positivo; não são tokens de provedor e nenhum arquivo foi executado. O
Workbench continua em `ofelipepeixoto/security-workbench`, sem transferência.

**Incidente de criação corrigido:** a seleção de privacidade da segunda fixture
não se confirmou antes do envio do formulário. Ela foi criada pública e vazia.
Ao detectar o estado pela API e pelo painel, a execução foi interrompida nesse
repositório e a visibilidade alterada para privada antes de adicionar qualquer
arquivo ou commit. O painel confirmou o estado privado; não houve publicação
de segredo, código real ou arquivo sintético nesse intervalo. Esse desvio foi
informado ao proprietário e não deve ser apresentado como criação privada
desde o primeiro instante.

O cadastro dos client secrets foi confirmado por nome/tipo nos Workers QA, sem
ler valores. A presença em ambos não é comparação dos valores criptografados.
Login e multiusuário foram habilitados exclusivamente no Worker web QA, com
allowlist dos dois IDs previamente aprovados. Os dois fluxos OAuth de login
reais concluíram: primeiro `ofelipepeixoto`, depois `radartech-news`, cada um
abrindo o próprio dashboard com zero projetos/execuções. O principal persistido
para B foi `github:322086368`; não recebeu o papel de proprietário. Os dados
anteriores de `qa-synthetic:a/b` não apareceram. Isso é evidência real do login
e do recorte inicial de isolamento; não substitui o teste A/B por IDs de projetos,
execuções e revisões reais, ainda pendente.

A App foi habilitada no Worker web QA para completar a conexão autorizada.
Na conta B, instalação `173995260` concluída com `Only select repositories`,
uma única fixture privada e leitura de código/metadata. O OAuth da App também
concluiu e a conexão ficou persistida sob B no D1; o catálogo real retornou
exatamente uma instalação e a fixture B, em uma página. Não confundir isso com
prova de paginação de 90–100 projetos. Nenhuma outra conta/repositório foi
selecionado. O fluxo B não exigiu entregar chave privada ao Workbench nem JWT
de instalação; o aviso inicial de cadastro não deve manter esse handoff como
pré-requisito presumido. Nenhuma chave privada foi obtida pelas ferramentas.

**Bloqueio atual:** a instalação da conta A não teve confirmação final. A
navegação da integração de navegador excedeu seu prazo ao retomar o seletor
GitHub; não há status HTTP que permita atribuir a causa à plataforma GitHub.
Não alegar instalação A aprovada nem repetir submissões sem reconciliar o
estado. Retomar em A e selecionar somente sua fixture; a autorização já existe.
O conector GitHub não oferece criação de repositórios e não passou a acessar
a fixture privada B; os passos B usaram o painel, sem ampliar esse conector.

Estado confirmado depois dos testes: web QA com login/multiusuário/App ligados
e jobs desligados; consumer com App/multiusuário/jobs desligados. Ambos sem
cron; Queue com zero consumidores; zero jobs e zero ativações da janela no D1.
Os sete dias de análises ainda não começaram. Não reenviar o empacotamento
inicial sobre esses bindings/segredos. Produção permanece fora dessas mudanças.

Pendências: instalação/conexão A, preflight fresco e compatibilidade/consumo da
análise Free, isolamento por IDs, revogação/recuperação App, paginação real,
Queue/scheduler/reentrega/cancelamento/recuperação, revisão/comparação/exportação
e jornadas completas. A tela de acesso ainda contém texto de proprietário único,
apesar de a allowlist QA aceitar A/B; ajustar a cópia condicionada ao piloto antes
do aceite de UX, sem alterar a autorização do servidor ou a v15.

A [CI 39721269070](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39721269070)
do head `76f5e7031e94abbbe14f1874bd3dbb483b75074a` concluiu com quatro jobs
aprovados. Este adendo registra operações e evidências; não modifica o código
dos Workers (`e361bc8b2a10cba5e2755320f4fa28bbdaadcaa0`). Piloto completo ainda
não homologado e nenhum lançamento público novo.
