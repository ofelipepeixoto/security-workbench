# Operação individual — GitHub exclusivo em revisão

Refs #14 e [PR #20](https://github.com/ofelipepeixoto/security-workbench/pull/20).
A demonstração continua pública e fictícia. Nesta branch, a operação real exige
sessão GitHub validada no servidor e correspondência ao owner configurado.
Não há fallback por ChatGPT, e-mail, username ou cadastro inicial. O Site v10
continua inalterado; esta autenticação ainda não está homologada na hospedagem.

## Preparação e publicação

1. Ler o [guia de autenticação](autenticacao-github.md), incluindo variáveis,
   callback exato, migração D1, limites, retenção e reversão.
2. Reconciliar `WORKBENCH_OWNER_ID` com os dados existentes e com a identidade
   legítima deste Site. Esse ID não é o ID da conta do painel Sites, e-mail,
   username GitHub ou ID de outro Site. Ele é preservado como chave dos dados,
   sem tornar a identidade nativa um segundo método de entrada.
3. Configurar uma OAuth App dedicada e verificar o ID numérico `GITHUB_OWNER_ID`.
   Nunca eleger automaticamente o primeiro login como administrador nem copiar
   segredos para fonte/chat/log. Manter a flag desabilitada até revisão.
4. Após autorização específica de deploy, confirmar encaminhamento de cookies
   e callback sem sessão ChatGPT prévia, migração correta e dependências #18/#19.
   A fonte Sites é separada do GitHub: registrar o commit e versão publicados.
5. Homologar GitHub proprietário, outra conta, anônimo, expiração e logout;
   concluir revisão persistida, comparação e download reais do issue #14.

Conta GitHub não autorizada é recusada no callback e não recebe sessão operacional.
Sem sessão aceita, a API responde 401. O gate adicional do serviço preserva
503 quando owner não está configurado e 403 para identidade diferente antes de
ler projetos. A resolução de sessão pode consultar somente as tabelas de autenticação.
Consultas de projetos/análises continuam filtradas pelo owner canônico.

## Validação e reversão

Os testes Node incluem OAuth com respostas simuladas, SQLite em memória,
seleção exclusiva de identidade, isolamento, revogação e dados existentes.
Python, TypeScript e build também devem passar. Não equivalem à homologação hospedada.
Antes de publicar, basta não incorporar o PR. Após futuro deploy autorizado,
desabilitar a flag/suspender a operação e restaurar artefato aprovado; não remover
o gate de proprietário nem reintroduzir outro provedor automaticamente.
