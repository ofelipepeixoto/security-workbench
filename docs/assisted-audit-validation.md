# Evidência da fatia assistida — 28/10/2026

## Decisão e base

[INFERENCE] EXTEND EXISTING REPO: reutilizar aquisição, resultados autorizados,
fingerprints, revisão, exportação e limites existentes, sem outro serviço.
Base PR #47 e5bdc8a41939fef00c2ec878b406f56dcbbc649a. Este incremento é
revisável sobre #47, sem resolver ou integrar a pilha inteira.

[CODE VERIFIED] O guia [assisted-audit.md](assisted-audit.md) contém mapa de
adaptação, contrato, exemplos, atribuição e limites. O plano é entregue no resultado
autorizado e no Markdown. As notas são validadas somente offline e não são
persistidas no produto. Não se fez merge, migration, deploy ou ativação.

## Testes efetivamente executados

Ambiente: Linux, Node v24.22.1, Python3.12.14, dependências locais já existentes.
Nenhum instalador upstream ou código de alvo foi executado. Nenhuma chamada de
modelo, probe externo, job hospedado ou serviço n8n foi usado.

| Comando/recorte | Resultado | Alcance |
|---|---|---|
| node --test tests/*.test.mjs (em web) | 466 aprovados | implementação local e transportes sintéticos |
| python -m unittest discover -s tests -v | 34 aprovados | núcleo local e fixtures |
| node node_modules/typescript/bin/tsc --noEmit --incremental false | aprovado | tipos |
| npm run lint (comando equivalente do package.json) | aprovado, sem avisos | fontes; dist/.next excluídos pelo script existente |
| node scripts/run-framework.mjs build | aprovado | pacote web local |
| suíte assisted-audit final | 12 aprovados | contratos, revisão atual persistida e isolamento local |
| CLI válido/malformado/excessivo/symlink | 4 checks aprovados | processo Node com --permission, leitura limitada, sem escrita/filhos |

Os checks CLI usaram ambiente vazio, timeout5s e heap128MiB. Testes de unidade da
fatia usaram timeout60s e heap128MiB. Namespace de rede via unshare não estava
disponível neste executor; não se alegou sandbox OS completo ou proteção para
executar alvos. As implementações revisadas recebem somente fixtures inertes e
não possuem transporte de rede. Código upstream foi examinado, não executado.

[TEST VERIFIED] Casos: entrada válida; JSON inválido/duplicado/chave extra/tamanho;
projeto, run, repositoryID, SHA e digest divergentes; localização inexistente;
prompt injection tratado como dado; evidência bruta omitida; segredo reconhecível
recusado; contexto insuficiente; false_positive/accepted_risk preservados;
needs_validation sem severidade; tentativa de injetar decisão/verificador;
replay/duplicatas e alteração material; provedor/verificador não executados.

O handler real com SQLite migrado e transporte GitHub sintético entrega plano
após revalidar acesso. Outra conta recebe404 sem dados; negação de acesso da App
não devolve plano. accepted_risk persistido é lido novamente e preservado nas
notas. Nenhum job ou revisão automática é criado. Isso não é isolamento A/B
hospedado nem prova de disponibilidade ou eficácia de verificador independente.

Comparação de baseline:454 Node eram a evidência histórica da base; os12 novos
explicam466 nesta execução. Não é benchmark de auditoria nem ganho de precisão.

## Origem examinada

[CODE VERIFIED] Snapshot upstream c1c8a8c1471069fb0e188eeaff69b8e8db6564a8:
README, LICENSE, SKILL, RECONNAISSANCE, HUNTING, VALIDATION-AND-REPORTING,
report-schema e partes relevantes dos dois validadores e seus testes. Inspeção
seletiva estática: não se alega revisão integral de todas as classes de ataque.
Árvore do snapshot retornou completa e sem NOTICE adicional. LICENSE preservada
com blob Git6dbc9ecb3a5b9080e95b962869e8c7ab16cfdc20, idêntico ao upstream.

[DOC CLAIM] A metodologia completa exige fases e verificações distintas.
[NOT VERIFIED] Este incremento não as executa e não autentica declarações de
produtores; esquema válido e hash do documento não comprovam uma vulnerabilidade.
Builders Club permaneceu inacessível. Não foram copiados conteúdo restrito,
inventários privados, relatórios de alvos, capturas ou evidências operacionais.

## Riscos e próxima etapa

Cobertura parcial, só duas classes existentes e metadados de candidatos. Não há
leitura adicional de fonte nesta camada. CLI não autentica o JSON de análise;
aceita apenas seu vínculo consistente. Textos das notas continuam dados não
confiáveis. Não os executar, promover a instruções de sistema ou publicar.
Revisão humana e verificador independente real continuam etapas distintas.

Uma integração futura de notas por HTTP exige mandato próprio, autorização por
recurso, persistência/retencão e testes. Não adicionar implicitamente um importador
genérico ou uma auditoria geral por modelo. A aprovação de QA do commit e5bdc8a…
não acompanha o novo head desta branch. Reversão do código não requer banco ou
migration; produção continua separada. CI e disponibilidade hospedada devem ser
reportadas separadamente pelo SHA efetivo.
