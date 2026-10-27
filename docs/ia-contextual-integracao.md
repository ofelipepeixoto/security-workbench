# Revisão contextual preparada — 26/10/2026

Implementação server-side complementar ao scanner e ao orientador determinístico de #46. O código está presente no QA, mas permanece desligado, sem política financeira ativa. O limite vigente é custo incremental R$0; portanto não houve chamada OpenAI real, criação de chave ou consentimento de dados para o provedor. A existência deste código não comprova qualidade do modelo ou homologação.

## Caminho implementado

`GET /api/workbench/contextual-review?runId=UUID` informa o estado autorizado. Não adquire código, reserva custo ou chama o modelo. O controller da análise só envia um POST automático quando o servidor responde `generation_allowed:true` e `not_started`. A geração não exige aprovação humana de cada texto; o servidor exige política previamente autorizada. Perda de resposta não dispara retry automático. Atualizar o estado é leitura.

O POST aceita apenas `runId` e, para exclusão explícita do texto, `operation:delete`. Não aceita identidade, repositório, SHA, código, prompt, modelo ou orçamento do cliente. O handler aplica sessão, autorização por proprietário, CSRF e origem. As fronteiras de aquisição, envio e entrega revalidam sessão viva, instalação, repositório e decisões persistidas. Troca A→B, logout e revogação tardia negam entrega, inclusive depois de persistido o resultado. Nenhum cache é compartilhado entre proprietários.

Arquivos: `contextual-review.mjs` (política/validação/provider), `contextual-review-store.mjs` (D1), `contextual-review-workbench.mjs` (integração), rota `api/workbench/contextual-review`, componente `contextual-review.tsx` e testes `contextual-*`. A migration `0008_contextual_review.sql` apenas prepara tabelas e controles; não insere política.

## Dados permitidos no primeiro recorte

Somente análises concluídas pela App com repository ID e commit verificados podem ser elegíveis. A política inicial aceita um arquivo regular `.github/workflows/*.yml|yaml` no SHA já analisado, até 32 KiB lidos, até quatro trechos de doze linhas e 2 KiB cada, contexto total de até 8 KiB. Caminhos com candidato a segredo são excluídos integralmente. Sem trecho elegível, o resultado é insuficiência e não há chamada.

A aquisição confere o objeto commit, percorre árvores não recursivas, recusa symlink/submodule e recalcula o SHA Git do blob. O cliente é limitado cumulativamente a 16 chamadas GitHub e 2 MiB de respostas; o prazo compartilhado existente de 45 segundos não foi aumentado. Esses limites também podem causar abstinência em repositórios maiores. Não é uma leitura de todo o repositório.

Antes do envio, a projeção mantém apenas chaves e valores estruturais reconhecidos de YAML. Comandos, comentários, literais, nomes de arquivos, README, valores de segredo e identidade do proprietário não são transmitidos. O modelo recebe referências opacas, linhas e digests. O mapa de referências para caminho/linhas/commit/blob fica no servidor e é mostrado somente ao proprietário autorizado. A projeção limitada perde contexto de propósito e precisa declarar essa limitação.

O modelo não recebe ferramentas, URLs executáveis, histórico, busca, shell ou autoridade para modificar código. A resposta deve satisfazer JSON estrito e validação adicional de referências, decisões e linguagem. Hipótese e contraponto são obrigatórios; testes são propostos e não executados. Referências inventadas, arquivos ausentes, confirmação automática de vulnerabilidade, patch aplicado e mudança de decisão humana são recusados. Um validador estrutural não prova que toda recomendação semanticamente correta; essa qualidade exige avaliação real.

## Custo, idempotência e retenção

O runtime exige QA isolado, `WORKBENCH_CONTEXTUAL_ENABLED=true`, chave protegida, modelo/projeto/organização/dados aprovados e política D1 coincidente. Ausência de qualquer requisito mantém chamadas bloqueadas. O padrão funciona mesmo antes da nova migration, sem consultar suas tabelas. Nenhum segredo é obtido ou incluído em documentação ou logs.

A política fixa snapshot do modelo, preços com expiração, janela de até sete dias, owner/repository ID/SHA permitidos, teto global e por revisão, até cinco gerações por usuário/dia e no máximo vinte no total. O piloto recomendado é mais restrito: duas por usuário/dia, vinte totais e concorrência global um. A admissão SQL reserva atomicamente o custo conservador dos tetos de entrada/saída; exclusão, cancelamento e expiração não devolvem saldo ou quota. Timeout de oito segundos com resultado desconhecido conserva a reserva e trava nova chamada até reconciliação protegida. Não há retry de SDK ou fallback pago.

As taxas aprovadas devem representar o pior custo faturável, incluindo eventuais cache writes, processamento regional e condições aplicáveis, sem contar descontos. Alerta financeiro do provedor não substitui o ledger. Exemplo apenas para futura decisão: o snapshot documentado `gpt-5.4-mini-2026-03-17`, com 16.384 tokens de entrada e 1.024 de saída, representa US$0,016896 pelos preços padrão consultados de US$0,75/US$4,50 por milhão. Usando margem explícita para condições faturáveis, uma reserva de US$0,025 por revisão e teto de US$0,50 para vinte gerações é uma proposta, não autorização. Revalidar preços, conta, retenção e capacidade antes de aprovar. Conversão, tributos ou cobrança mínima não foram presumidos; com R$0 vigente, chamadas continuam zero.

O texto gerado tem TTL aprovado entre um minuto e 24 horas, limitado pelo fim da política. Depois do TTL, não é entregue. A leitura remove o texto expirado; `store.expire()` é o hook para manutenção/encerramento autorizado. Exclusão explícita apaga o texto no controle da aplicação e conserva o ledger financeiro mínimo. Não há promessa de purga física pontual do D1, backups ou retenção do provedor. Um procedimento de remoção medido e autorizado ainda é condição para ativar o piloto de IA. `store:false` não significa retenção zero no provedor.

## Verificação e lacunas

As fixtures rotuladas locais cobrem candidato válido, contexto ausente, regra não suportada, decisão preservada, citação inventada, prompt injection e vazamento A/B. Os testes comparam aceitação/abstinência de contratos com o orientador por regras. Transportes de modelo são sintéticos: isso não mede precisão, falsos positivos ou utilidade de uma resposta OpenAI real. Esses indicadores devem ser medidos depois da autorização do provedor, com registro do modelo e custo efetivos.

Antes da ativação: projeto/organização exclusivos confirmados, snapshot e preço aprovados, dados e retenção consentidos, destino protegido da chave, orçamento diferente de zero expressamente autorizado ou crédito cuja condição zero incremental seja comprovada, procedimento de purga e medição de CPU/latência/subrequests no Free. Nenhuma credencial de outro projeto é reutilizada. O primeiro passo manual, quando solicitado, é selecionar/criar o projeto isolado correto na Platform e confirmar apenas seu nome e ID, sem chave no chat; os passos seguintes serão apresentados um por vez na tela protegida.

Fontes oficiais consultadas em 26/10/2026: [Responses](https://developers.openai.com/api/reference/resources/responses/methods/create), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [dados e retenção](https://developers.openai.com/api/docs/guides/your-data), [controle de gasto por execução](https://developers.openai.com/cookbook/articles/per_run_spending_controller_responses_api), [modelo e snapshot](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [preços](https://developers.openai.com/api/docs/pricing).
