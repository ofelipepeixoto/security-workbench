# Próximas integrações — contrato de segurança e entrega

Estado em 17/10/2026: o núcleo local usa Python/SQLite; a área hospedada usa Workers/D1 e recebe apenas repositórios públicos do namespace autorizado. A demonstração pública é fictícia. Os itens abaixo são **propostas**, não funcionalidades implantadas. A [validação pública do smoke](validacao-transporte.md) cobre a aquisição no Actions, não a hospedagem.

## Revisão em 21/10/2026 — código publicado, homologação pendente

O [relatório consolidado de pendências](pendencias-2026-10-21.md) registra os gates,
bloqueios, riscos e critérios de aceite após a publicação v13/revisão 6.

A [matriz das jornadas](matriz-jornadas-2026-10-21.md) separa capacidades implementadas de aceites ainda pendentes. O [login GitHub do proprietário](autenticacao-github.md) está habilitado com segredo no servidor e associação ao owner existente. O proprietário confirmou entrada e histórico na v12. A v13 publicou as rotas operacionais, o versionamento das sessões e a importação REA, mas ainda exige prova assistida de revisão persistida, comparação e download. OAuth não instala a futura App de repositórios nem importa automaticamente o catálogo GitHub.

**P0:** concluir triagem das dependências residuais e verificar revogação/sessão na hospedagem. **P1:** concluir issue #14 com duas análises, revisão persistida, comparação, Markdown e fronteiras anônimas. **P2:** a importação REA está implementada com limites e proveniência, mas a [execução real isolada](rea-execucao-2026-10-21.md) continua bloqueada por runtime/sandbox. Agregados e filtros agora expõem suas janelas; validação visual e assistiva ainda é necessária. **P3:** organizações, privados por App, auditoria de bancos, notificações e automações exigem contrato e autorização próprios. Nenhum n8n, Supabase, VPS, agente ou serviço pago foi integrado.

O inventário das 15 telas é referência de organização, sem cópia de marca/código ou dados pessoais. Busca de projetos, filtro do histórico e estados explícitos de conta/integração são a primeira adaptação autoral. A ordem abaixo permanece como gates de expansão, sem declarar os estudos como funcionalidades publicadas.

## Ordem de implementação

1. **Homologar a área real hospedada.** Com a sessão do proprietário autenticada, criar duas análises independentes de commits fixados de um repositório próprio. Registrar ID, commit, cobertura e horário; revisar um candidato efetivamente produzido, conferir sua persistência após recarregar, comparar as duas análises e baixar o Markdown no navegador. Se não houver candidato, registrar a ausência e usar uma fixture de teste em um repositório próprio; não inventar uma vulnerabilidade. Confirmar que visitante anônimo não acessa esses dados. Não publicar relatório ou valor de segredo em logs.
2. **REA local, isolado.** Fixar versão/commit do REA e examinar sua CLI, licença, entradas, saídas e comportamento antes da chamada. Aceitar apenas artefatos JS locais fornecidos pelo operador, com tamanho/tempo limitados; executar a ferramenta em processo isolado sem rede, sem instalar ou executar o código alvo. Traduzir observações do REA para candidatos com evidência, origem, confiança e cobertura. Testar uma fixture maliciosa e uma benigna e comparar um resultado real com o formato esperado. A integração hospedada exigirá ambiente de execução apropriado; não reutilizar indiscriminadamente o Worker de requisições.
3. **Sites autorizados.** Cadastro explícito de domínio e caminhos permitidos; resolver DNS e rejeitar endereços privados, loopback, link-local, metadados e portas fora da política. Revalidar DNS/IP em cada conexão e redirecionamento; bloquear mudança de esquema, host ou escopo. Usar HTTPS validado, limites de bytes/tempo/requisições, método GET/HEAD e não autenticar automaticamente. Relatar separadamente cabeçalhos, cookies e TLS efetivamente observados; falha de DNS/proxy é cobertura parcial, não resultado limpo. Começar com `camaleaoweb3.com.br`, autorizado pelo proprietário, em teste controlado. Não contornar restrições de rede.
4. **Repositórios privados na web.** Projetar uma GitHub App instalada no repositório escolhido, com `Contents: read` e identificação do installation/repository ID; autorização do proprietário por fluxo OAuth/App com state e proteção CSRF. Credencial de instalação de curta duração fica somente no servidor e no gerenciador de segredos, nunca no navegador, D1, logs ou chat. Vincular instalação e identidade do usuário, revogar acesso e testar revogação, expiração, 403, rate limit, troca de ID/commit, redirects e isolamento entre usuários. O conector GitHub desta conversa não autentica automaticamente a área hospedada.
5. **CVE por dependência.** Normalizar manifesto, ecossistema, pacote, versão e commit; consultar uma fonte de advisories com proveniência e horário, resolver intervalos de versão e distinguir versão desconhecida de ausência de CVE. Uma correspondência é candidato até revisão humana do contexto. Limitar consultas, cache e dados enviados. O dependency graph e os alertas Dependabot habilitados para **este repositório** ajudam a manter o Workbench; não auditam automaticamente os repositórios analisados pela plataforma.

## Preparação de operação

| Integração | Contrato mínimo antes de ativar | Critério de avanço |
| --- | --- | --- |
| Supabase | Só considerar se D1/SQLite deixarem de atender; comparar residência de dados, RLS, backup, retenção, custo e migração reversível. Projeto separado, sem reutilizar bancos de terceiros. | Necessidade mensurada e plano de migração testado; nenhuma migração automática. |
| n8n | Webhook autenticado com assinatura, nonce/expiração, idempotência e lista de escopos; job assíncrono sem credenciais ou conteúdo bruto no payload. | Testes de replay, duplicação, falha e revogação em ambiente de QA. |
| VPS | Serviço privado com HTTPS, autenticação, isolamento de rede/processo, backups criptografados, atualização e observabilidade sem dados sensíveis. Separar interface pública de operadores e workers de análise. | Estimativa de custo, ameaça, restore e rollback aprovados antes de provisionar. |
| Agentes/MCP | Ferramentas somente leitura por padrão; escopo/identidade explícitos por chamada, quotas, confirmação para ações externas, registros de auditoria redigidos. Nunca dar a um agente acesso geral a tokens ou executar conteúdo do alvo. | Contratos tipados, testes contra prompt injection e isolamento entre projetos. |

Interfaces propostas: `SourceAcquisition` devolve identidade estável, commit e cobertura; `Analyzer` recebe bytes imutáveis e devolve candidatos com proveniência; `Review` registra decisão humana; `Report` exporta versão, limitações e decisões. Um adaptador novo não muda a semântica de achado confirmado nem amplia escopo implicitamente. Cada incremento deve ter PR próprio, teste de fronteira de segurança e validação real antes de ser anunciado como disponível.

## Manutenção pública e marco experimental

`main` exige PR, job `test` e resolução de conversas; force push e exclusão seguem desabilitados. Relatos de falha do Workbench devem seguir [o canal privado](../SECURITY.md). O dependency graph e os alertas Dependabot foram ativados em 17/10/2026 para o próprio repositório; alertas precisam de triagem, e atualizações automáticas permanecem desativadas. PRs #3 e #4 são estudos separados em rascunho, fora da `main`.

O marco `v0.1.0` deve descrever uma **versão experimental pública** do código, com demonstração fictícia e operação real restrita ao proprietário. A release deve apontar para um commit de `main` validado, listar a aquisição GitHub efetivamente testada, a cobertura parcial e as integrações ainda pendentes. Publicar uma tag não altera a audiência do Site ou concede acesso à área real.
