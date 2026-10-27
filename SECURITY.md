# Política de segurança

O Security Workbench é experimental. Ele analisa somente escopos autorizados e os resultados são candidatos para revisão humana; não há garantia de auditoria completa ou de prontidão para produção.

## Relatar uma falha no Workbench

Não publique detalhes de exploração, credenciais, dados de terceiros ou provas de conceito sensíveis em issues e PRs. Use [Report a vulnerability](https://github.com/ofelipepeixoto/security-workbench/security/advisories/new) para enviar um relato privado pelo GitHub Security Advisories. O relato privado foi habilitado em 17/10/2026. Se o formulário estiver indisponível, abra uma issue genérica solicitando um contato seguro, sem revelar detalhes técnicos.

Inclua, pelo canal privado: versão ou commit afetado, impacto, passos mínimos com dados fictícios e uma proposta de mitigação, se houver. O mantenedor irá confirmar o recebimento e coordenar correção e divulgação. Não há prazo formal de resposta neste estágio.

## Escopo dos relatos

São relevantes falhas no código, na autenticação, na aquisição GitHub, na proteção contra acesso fora do escopo, na redação de dados e na persistência de resultados. Para falhas em um site ou repositório de terceiros analisado pelo Workbench, siga a política de divulgação do respectivo proprietário; não as envie como issue pública aqui.

## Modelo de ameaças e verificação cumulativa

O [registro Q1](docs/auditoria-cumulativa-q1-2026-10-26.md) distingue achados reproduzidos, avisos de dependências e lacunas de evidência. Fronteiras críticas: navegador→sessão/origem, usuário→instalação/repositório, conexão→geração/lease, código não confiável→parser, revisão→identidade da ocorrência e contexto→reserva de custo/resultado autorizado. Testes de isolamento e contratos sintéticos não comprovam homologação hospedada.

Publicar correção na PR não corrige automaticamente produção/QA. Não usar detalhes operacionais, credenciais ou bancos como evidência pública. Smokes de aquisição real exigem autorização própria e disparo manual; a CI automática desta branch permanece local/sintética.
