# Aquisição QA: orçamento, autorização e persistência
25/10/2026. Entrega revisável de código e testes; nenhuma implantação ou ativação
é autorizada por este documento. A dependência é a branch do PR #42. O mapa
operacional, os identificadores de recursos, os manifests efetivos e as
evidências detalhadas permanecem privados.

## Problema e comportamento esperado

Na base do PR #42, o caminho integrado de um arquivo precisava de 17 chamadas,
mas o wrapper QA bloqueava a 17ª antes do transporte. O erro determinístico era
convertido em indisponibilidade transitória, repetindo uma aquisição impossível.
O baseline foi fixado e reproduzido com módulos reais, SQLite em memória e
respostas exclusivamente sintéticas, sem rede.

| Cenário sintético | Tentadas/enviadas | Resultado |
| --- | --- | --- |
| Baseline: 1 arquivo, tentativa 1 | 17/16 | queued/acquisition_failed, sem resultado |
| Baseline: mesmo job, tentativa 2 | 17/16 | failed, sem resultado; 32 enviadas totais |
| Corrigido: 1 arquivo | 12/12 | concluído; 4 slots de folga |
| Corrigido: 2 arquivos | 13/13 | concluído; 3 slots de folga |
| Corrigido: 8 elegíveis, uma página | 16/16 | 5 adquiridos, 3 omitidos; parcialidade explícita |
| Corrigido: 2 arquivos, repositório na página 2 | 16/16 | concluído, paginação conferida |
| Paginação que não cabe ou cresce durante aquisição | até 17/16 | erro tipado, sem resultado/repetição inútil |

Requisição necessária, tentada e enviada são medidas diferentes. O sucesso de
dois arquivos não promete cobertura arbitrária ou leitura de 20 arquivos no QA.

## Correção e controles preservados

- Um contexto por tentativa/identidade, com conexão local relida e decriptada
  nas fases. Não há grants compartilhados entre usuários, jobs ou requests.
- Um ticket opaco privado, ligado ao cliente/epoch/instalação/repository ID/SHA,
  é consumido uma única vez na entrada do scanner. Reaproveita apenas a
  autorização adjacente já obtida pelo precheck do job, sem nova concessão.
- As autorizações remotas após aquisição e antes de persistir continuam
  frescas. Nome, visibilidade, permissões, IDs, commit/tree e vínculo local
  são conferidos. Leitura de histórico verifica acesso, sem resolver SHA atual.
- O mesmo wrapper contabiliza todas as fases e reserva slots para os gates
  finais. Se faltar orçamento de blobs, cobertura parcial é explícita e só
  pode persistir depois de todos os gates. Se não puder revalidar, falha.
- Admissão de requests é reservada antes de awaits, mantendo 16 sob concorrência.
  Cancelamento, lease e janela são conferidos antes de cada chamada, inclusive
  paginação. Uma request já enviada não é desfeita; nenhuma próxima é iniciada
  depois de a negativa ser observada.
- A mutação SQL do resultado confere proprietário, lease, prazo, janela,
  projeto ainda autorizado e a geração exata da conexão cifrada. Uma prova
  opaca liga essa geração à identidade, ao job e ao lease, sem gravar o token
  em diagnóstico. Troca de conexão, desconexão ou revogação local negam a escrita.
- Resultado e estado do job são atualizados juntos na transação. O prazo é
  conferido na mutação do resultado; o reconhecimento da Queue pode chegar
  depois. Cruzar o prazo entre as duas instruções não separa os estados.
- Orçamento/fechamento/cancelamento são erros tipados. 401/403 negam acesso;
  429 preserva Retry-After/backoff; 503 e timeout continuam com retries limitados.
  Erro não vira lista vazia bem-sucedida ou relatório limpo.

Permanecem 16 requests e 2 MiB de respostas por tentativa, 45 s de prazo aplicativo,
duas tentativas, 1 MiB de resultado, concorrência global 2/workspace 1, 50 jobs por
bucket conjunto de 24 h e 350 em sete períodos. Sem mudança de schema, dependências,
engine de regras, infraestrutura, credenciais ou público da produção.

Os exports readonly da política do piloto não são configuração mutável nem
override. As fixtures reutilizam identificadores/namespaces da política já
publicada; logins do provedor, tokens, instalações, repositórios e arquivos são
fabricados. Não há registros de usuários, fixture privada ou chamada real.

## Auditoria defensiva e limites

Revisão de código cobriu principal/cookies/OAuth/CSRF, autorização por objeto,
contexto/tickets, mudanças de acesso, aquisição hostil, paths/hash/redirecionamento,
D1/constraints/transações, outbox/leases/recovery/replay, revisão e exportação.
A prova é proporcional à superfície: inventário não é SCA; regras textuais não
são SAST completo; candidato não é vulnerabilidade confirmada. Não há CSV, modelo de IA ou agente com ferramentas ativo nessa operação. Isso não é pentest,
certificação ou alegação de ausência de todas as falhas.

A revisão independente examinou o código e os testes desta alteração, separada da
implementação. Pendências fora desta fatia são tratadas no relatório privado.
Aprovação de agente não substitui revisão humana nem homologação A/B.

## Reproduzir as verificações locais

Usar as dependências existentes do projeto. Nenhum comando instala software ou
executa scripts/builds de repositórios analisados.

```bash
# web/
node --test tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js . --ignore-pattern dist --ignore-pattern .next
WRANGLER_SEND_METRICS=false CI=1 node scripts/run-framework.mjs build

# raiz
python3 -m unittest discover -s tests -v
```

A verificação local desta árvore passou em 274 testes Node, incluindo 43
cenários integrados, e 27 testes Python, sem falhas ou skips. TypeScript, ESLint
e build também passaram; isso não mede CPU ou confirma integração hospedada.

O cenário integrado exercita auth, cliente, guard, jobs, scanner e consumidor
reais com transporte sintético. Inclui A/B intercalados e IDs cruzados,
revogação/suspensão/permissão/nome/visibilidade/SHA durante e após aquisição,
timeouts e cancelamento, 17ª chamada bloqueada, paginação, concorrência, replay,
recuperação, persistência, handler Queue e diagnóstico sanitizado. Os regressivos
incluem lote final atrasado além de 45 s ou da janela, relógio aplicativo parado,
passagem do prazo entre as instruções, revogação local imediatamente antes da
escrita e rejeição de provas forjadas ou pertencentes a outro usuário/job/lease.
A CI do head remoto consta da PR. A CI anterior da base
não valida este candidato. Não há skip ou remoção de assertivas para obter verde.

## Homologação pendente e reversão

Código publicado não é código implantado nem piloto homologado. A rodada real
deve demonstrar login/App/instalações selecionadas, uma análise por conta,
negativos A/B, Queue/reentrega/cancel/recovery, revisão recarregada, comparação,
Markdown salvo e aberto, revogação e interface desktop/mobile/teclado.

Separar tempo total aplicativo de CPU do runtime. A documentação de
[Queues](https://developers.cloudflare.com/queues/platform/limits/) descreve
CPU padrão de 30 s para consumer e tempo total de 15 min. A de
[Workers](https://developers.cloudflare.com/workers/platform/limits/) apresenta
10 ms de CPU por HTTP/Cron no Free. São tipos de invocação distintos: esses
valores não autorizam presumir 30 s em todo Worker Free, aumentar limites nem
contratar plano pago. O prazo aplicativo continua em 45 s. Compatibilidade Free,
CPU e tempo total medidos por tipo de evento e saldo compartilhado continuam
condições para a homologação hospedada.

Deploy, migrations, acessos e ativação seguem autorizações próprias. Janela não
começa com acesso/custo bloqueados; nunca resetar quota ou acelerar sete dias.
Rollback de código reverte esta alteração, sem restaurar banco/token/cota.
Cron, consumidores e novas análises devem permanecer desativados até a
ativação delimitada, com encerramento verificável e preservação de evidências.

