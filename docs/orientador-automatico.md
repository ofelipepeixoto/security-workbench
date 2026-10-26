# Orientador automático — static-guidance/1.0

O orientador complementa o analisador existente. Gera suas orientações automaticamente ao consultar uma análise autorizada e ao exportar seu Markdown, sem aprovação ou revisão humana prévia para produzir o texto. Não é um serviço de modelo e não aplica correções.

## Contrato executável

- Módulo: `web/lib/review-advisor.mjs`; entrada: resultado normalizado de uma análise já autorizada. A integração em `fullRun` acontece depois das verificações existentes de usuário/projeto e da leitura das decisões atuais.
- Schema: `security-workbench.review-advisor/v1`; política: `static-guidance/1.0`; método: `deterministic-rules`; geração: `automatic`.
- Políticas: `SWB-ADVISE-SECRET/1` para `SWB-TEXT-001/1`, e `SWB-ADVISE-WORKFLOW/1` para `SWB-WORKFLOW-001/1`. Mudanças de significado exigem nova versão e casos de regressão.
- Saída: referências dos candidatos, regra e versão, prioridade de triagem justificada, hipótese de falso positivo, ações sugeridas, verificação proposta e incertezas. Prioridade de triagem não equivale a severidade ou exploração comprovada.
- Metadados incompletos produzem `insufficient_context`; REA e regras não cobertas produzem `unsupported`. Análise incompleta ou malformada não se transforma em resultado vazio bem-sucedido.
- Máximo de 100 entradas; limite independente de 192 KiB para a projeção JSON e para o bloco de orientação no Markdown. Candidatos omitidos são contados. Esse limite não é o tamanho máximo do relatório completo.

Nenhum valor de segredo, texto de evidência, caminho ou código do alvo entra nos textos do orientador. As variáveis de saída são referências SHA/fingerprint validadas e enumerações; as instruções são constantes versionadas. O Markdown recomputa a projeção e ignora orientação eventualmente inserida em um resultado persistido.

O estado `candidate`, `confirmed`, `false_positive` ou `accepted_risk` é preservado. A orientação não confirma um candidato, registra uma decisão ou executa seus testes propostos. Ela usa as decisões atuais já armazenadas, sem exigir uma nova decisão para aparecer. Não há SQL, aquisição GitHub, provider ou escrita adicional para gerar a orientação, e ela não entra em `result_json`.

## Interface e relatório

O detalhe da análise apresenta um painel automático, regra/versão/origem, vínculo do commit, cobertura, contagens e limites por candidato. Os candidatos também recebem orientação vinculada à sua evidência. O Markdown contém o mesmo método e mantém o prompt portátil para a IA escolhida pelo usuário.

Casos legados ou fictícios sem metadados verificados mostram essa limitação. Não se simula uma aquisição para preencher lacunas. Toda verificação sugerida permanece marcada como não executada pelo orientador.

## Revisor contextual com modelo: etapa separada

A habilidade Sênior de Cibersegurança do ChatGPT orienta o método da engenharia; não é uma API do site. Esta versão é uma política executável do produto, sem provedor de modelo, leitura de chave ou chamada externa. Nenhum conteúdo do usuário é enviado a uma IA.

Uma futura revisão contextual também poderá gerar recomendações automaticamente, sem revisão humana prévia do texto. Para implementá-la/ativá-la, ainda faltam destino e projeto isolados confirmados, modelo permitido, avaliação de qualidade, escopo dos dados enviados, política de retenção, orçamento numérico e credencial no destino protegido. O limite vigente de custo adicional zero mantém essa etapa desligada.

O desenho mínimo exige reserva de custo antes da chamada, limite por operação e global, uma chamada limitada por revisão, idempotência e parada após resposta perdida. Alertas financeiros não são bloqueios: a documentação da OpenAI distingue alertas de limites rígidos de gasto. Não se presume configuração da conta a partir de uma URL ou de uma assinatura do ChatGPT.

Para dados, o desenho deve minimizar os trechos autorizados e separar instruções de conteúdo não confiável. Desabilitar armazenamento de resposta não equivale a afirmar retenção zero; monitoramento de abuso, cache e elegibilidade de controles da organização precisam ser conferidos. Nenhuma configuração de conta ou chave faz parte desta alteração.

Referências oficiais consultadas em 26/10/2026:

- [Controles de dados da OpenAI](https://developers.openai.com/api/docs/guides/your-data).
- [Limites e controles de gasto](https://developers.openai.com/api/docs/guides/rate-limits).

## Validação e limites operacionais

Testes locais usam módulos reais, respostas/contas sintéticas, SQLite em memória e renderização React no servidor. Cobrem isolamento A/B, decisões persistidas, entrada hostil, ausência de provider/efeitos, limites de entrada/saída e Markdown salvo/reaberto.

O pior caso local de 100 candidatos suportados permanece abaixo de 192 KiB por bloco. CPU e tamanho adicionais de resposta existem; isso não comprova compatibilidade medida com o plano Free. DOM, mobile/teclado, login/App reais e a jornada hospedada permanecem pendentes. Não houve deploy, migration, ativação de janela, consumer, cron ou modelo.
