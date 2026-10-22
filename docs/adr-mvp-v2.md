# ADR — persistência e execução do MVP v2

Data: 22/10/2026 UTC. Decisão para código revisável; não autoriza ativação,
migração de produção, contratação ou publicação. Base inspecionada antes dos
incrementos: `63d694f705191bec6c7692fc68c554907d10a212`.

## Decisão

**Manter D1 como única fonte de verdade da área hospedada. Supabase não é
necessário neste estágio.** Evoluir catálogo, isolamento e contratos de jobs no
backend existente. O modo multiusuário nasce desativado; produção continua
owner-only até revisão e aceite explícito. SQLite local permanece separado.

A inspeção de `web/README.md`, `web/db/schema.ts`, migrações e serviço confirmou
Workers/D1, sessão GitHub e registros filtrados por proprietário. As relações
atuais por ID simples não comprovam isolamento multiusuário. Não foram
consultados plano/fatura, projetos Supabase ou credenciais. O resultado local
REA e a importação existente não precisam ser repetidos para esta decisão.

## Alternativas

| Opção | Adequação | Complexidade e operação | Isolamento | Custo incremental e reversão |
| --- | --- | --- | --- | --- |
| Manter D1 | Metadados, catálogo, jobs e resultados normalizados do MVP | Reutiliza binding, migrações e operação existentes; exige índices, cotas e limites de resultado | Autorização no servidor e relações compostas; não pressupõe RLS | Nenhum novo serviço ativado; consumo continua sujeito ao plano existente. Flag desliga a expansão sem apagar dados |
| Supabase em função delimitada, futuramente | Exemplo: storage privado, caso retenção de artefatos se torne requisito comprovado | Acrescenta fornecedor, políticas, retenção, backup de objetos e monitoramento | Bucket privado, autorização real e policies; prefixo de usuário não basta | Plano, storage, egress e operação a medir/aprovar. Desativar adaptador e reconciliar objetos sem duplicar metadados autoritativos |
| Migrar persistência para Postgres/Supabase | Reavaliar se capacidade, consultas ou operação do D1 se tornarem limite material medido | Conversão SQLite/Postgres, migração de identidade/dados e ensaio de corte/retorno | RLS, grants, identidade validada e testes A/B; não surge automaticamente pela migração | Custo de serviço e migração não quantificado. Sem escrita dupla; corte controlado com reconciliação e reversão ensaiada |

Não foi demonstrado benefício que compense a segunda ou terceira opção agora.
Nenhuma integração Supabase, storage, fila, nova autenticação ou projeto foi
criado por este ADR. Opções futuras são **não implementadas**.

## Persistência e autorização

Um workspace pessoal por ID numérico estável GitHub. A sessão validada no servidor
resolve o principal; dados legados do administrador conservam seu vínculo
canônico. Nunca eleger o primeiro login, associar por e-mail ou confiar em owner,
tenant, repository/installation ID recebidos como autorização do navegador.

Preparar `UNIQUE` e FKs compostas que liguem proprietário/projeto/análise/revisão,
além de consultas e alterações sempre autorizadas por objeto. Revalidar o acesso
GitHub no catálogo, no enqueue, na aquisição e no acesso ao resultado segundo a
política de revogação/retenção. Testar referências cruzadas A/B e concorrência.

O [D1 aplica FKs](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
por padrão. [`batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/)
executa a lista como transação e desfaz a sequência em caso de falha; usar
constraints e operações condicionais para invariantes. Não presumir uma sessão
SQL interativa `BEGIN`/`COMMIT` ou atomicidade de leituras e escritas independentes.

Persistir projeção limitada, sem JSON REA bruto, checkout, tokens ou código
sensível em logs. O [limite por linha/string/blob D1](https://developers.cloudflare.com/d1/platform/limits/)
é 2.000.000 bytes: limitar também o resultado serializado antes da escrita.
O banco é uma fronteira compartilhada: medir latência, leituras/escritas, volume,
concorrência e retenção antes de alegar capacidade para público aberto.

## Jobs e motores

Persistir um job não executa trabalho. Preparar contrato durável com estados,
claim/lease atômico, tentativas limitadas, cancelamento, recuperação, cotas e
idempotência por usuário/repositório/commit/configuração/versão do motor.
Uma reanálise deliberada precisa de intenção distinta da retentativa do mesmo job.
Payloads de transporte contêm identificadores mínimos, nunca credenciais.

Para operação futura, preferir consumidor separado por
[Cloudflare Queues](https://developers.cloudflare.com/queues/reference/delivery-guarantees/),
ou Workflows se etapas duráveis justificarem essa complexidade. Queues pode
entregar mais de uma vez: o consumidor deve ser idempotente. Publicação e consumo
precisam ser reconciliáveis com o estado D1, inclusive falha entre persistir e
despachar. Não foi verificado/provisionado binding ou consumidor nesta decisão;
até existir transporte validado, exibir indisponibilidade de execução, não um
job supostamente processado em background. Um consumidor de teste explícito não
constitui homologação do transporte hospedado.

[`waitUntil()`](https://developers.cloudflare.com/workers/runtime-apis/context/)
tem apenas 30 s após resposta/desconexão; não substitui fila durável.
[Workflows](https://developers.cloudflare.com/workflows/) oferece persistência
por etapas, mas continua sujeito aos limites do runtime. Não bloquear a
requisição HTTP durante análise longa nem criar loops automáticos de retry.

| Motor | Onde e como |
| --- | --- |
| Scanner determinístico atual | JavaScript compatível com Workers; leitura autorizada e fixada em commit, limites explícitos. Inventário não é correlação de CVEs. O consumidor durável ainda exige integração/validação própria |
| Importação REA | Parser JS no backend e Python no núcleo local; JSON limitado e projeção segura. Não inicia o REA, não executa entrada e não autentica as declarações do produtor |
| REA nativo | Runtime local já preparado e primeira fixture própria concluída. Preservar essa instalação. Typecheck completo e entradas não confiáveis continuam pendentes; PC do operador não será executor público |
| REA hospedado futuro | Não implementado. Exige serviço isolado aprovado, sem rede após aquisição, credenciais ou execução do alvo; filesystem efêmero e limites por família de processos, saída e retenção verificados |

**Não executar REA nativo em Workers.** A documentação atual de
[compatibilidade Node](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
lista `child_process` e `worker_threads` como stubs não funcionais; importação de
módulo não comprova execução de processos. Supabase Edge também não resolve este
executor: seus [limites atuais](https://supabase.com/docs/guides/functions/limits)
incluem 256 MB e 2 s de CPU por requisição, além de duração e incompatibilidades.

## Supabase: condições de eventual adoção

O [changelog](https://supabase.com/changelog) foi consultado. A mudança de
[exposição de novas tabelas](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
tem rollout anunciado para projetos existentes em 30/10/2026. Exposição por
grants e autorização por RLS são camadas diferentes; não presumir o estado de
qualquer projeto existente. Uma adoção precisaria de migrations versionadas,
schemas isolados, grants mínimos e [policies RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
por operação, identidade verificável e testes A/B. Chaves privilegiadas não vão
ao browser e não serão usadas para contornar policies.

[Storage privado](https://supabase.com/docs/guides/storage/buckets/fundamentals)
exige autorização inclusive para download; URLs assinadas têm escopo e validade
limitados. [Policies de Storage](https://supabase.com/docs/guides/storage/security/access-control)
não são substituídas por pastas/prefixos. [Supabase Queues](https://supabase.com/docs/guides/queues)
persiste mensagens e depende de consumidores; a janela de visibilidade não prova
execução exatamente uma vez do efeito de negócio nem fornece sandbox para REA.
Não adicionar Supabase Auth como segundo login por conveniência.

## Custos, backup e retorno

O custo atual contratado não foi verificado nesta sessão; não é declarado zero
ou gratuito. Esta decisão não ativa serviço/cobrança nova. Consumo adicional
D1/Workers depende de volume e plano. Antes de provisionar filas, storage,
executor ou Supabase: medir uso previsto, retenção, backup, egress, observabilidade
e limites por usuário/globais; aprovar orçamento. Nenhum preço foi estimado sem
plano, região e volume confirmados.

[Time Travel D1](https://developers.cloudflare.com/d1/reference/time-travel/)
tem retenção de 7 dias no Free ou 30 no Paid; o plano e a restauração deste
projeto não foram verificados. Antes de migração de produção, ensaiar exportação
e recuperação isolada e preservar a validade das revogações/sessões. Não
restaurar um banco global antigo como rollback casual de um usuário.
No [Supabase](https://supabase.com/docs/guides/platform/backups), backups e PITR
dependem do plano; backup do banco não inclui os bytes de objetos Storage.

Reversão do incremento: desativar multiusuário e dispatchers, preservar dados e
owner administrativo, impedir sessões de terceiros de virarem owner e manter
gerações de revogação. Migrações ficam versionadas e compatíveis durante o corte;
não remover tabelas/colunas ou aplicar SQL de produção por este documento.

## Aceite para ativar piloto

Código e testes sintéticos podem avançar sem credenciais. Piloto exige revisão de
migração com dados A/B, recusa de IDs cruzados em todas as operações, idempotência
e recuperação do consumidor real, autorização GitHub App/revogação, limites e
restauração ensaiados, exportação aberta/conferida e aceite explícito para ativar.
Mocks ou existência de coluna owner não equivalem a esses aceites. Lançamento
multiusuário é marco posterior; nenhuma produção foi alterada neste ADR.
