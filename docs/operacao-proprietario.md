# Operação individual — GitHub exclusivo

Refs #14, [PR #20](https://github.com/ofelipepeixoto/security-workbench/pull/20)
e [PR #22 em rascunho](https://github.com/ofelipepeixoto/security-workbench/pull/22).
A versão 12 do Site foi publicada em 21/10/2026 após autorização do proprietário;
o [registro da publicação](publicacao-2026-10-21.md) reúne o artefato, os resultados
observados e os limites. A demonstração continua pública e fictícia. A operação real exige
sessão GitHub validada no servidor e correspondência ao owner configurado.
Não há fallback por ChatGPT, e-mail, username ou cadastro inicial. O OAuth real
ainda não foi homologado: `GITHUB_LOGIN_ENABLED` permanece `false`, o Client Secret
está pendente. A revisão 2 preservou como segredo a chave do owner legado, conforme
a reconciliação administrativa documentada no registro da publicação.

## Configuração e homologação pendentes

1. Ler o [guia de autenticação](autenticacao-github.md), incluindo variáveis,
   callback exato, migração D1, limites, retenção e reversão.
2. Preservar o `WORKBENCH_OWNER_ID` já reconciliado com os dados existentes deste
   Site e confirmar o histórico após o login. Esse ID não é o ID da conta do painel Sites, e-mail,
   username GitHub ou ID de outro Site. Ele é preservado como chave dos dados,
   sem tornar a identidade nativa um segundo método de entrada.
3. A OAuth App dedicada já foi criada e a identidade GitHub do proprietário foi
   verificada. Gerar/configurar o Client Secret somente por mecanismo protegido,
   preservando `GITHUB_OWNER_ID` e a vinculação ao `WORKBENCH_OWNER_ID` existente.
   Nunca eleger automaticamente o primeiro login como administrador nem copiar
   segredos para fonte/chat/log. Manter a flag desabilitada até conferir configuração
   e identidade.
4. No fluxo real, confirmar encaminhamento de cookies, callback sem sessão ChatGPT
   prévia e migração correta. A fonte Sites é separada do GitHub; novas publicações
   devem registrar a fonte e a versão efetivamente publicadas.
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
Os testes locais aplicáveis e a
[CI do PR #22](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39666451867)
passaram. Esses resultados não equivalem à homologação hospedada do login GitHub;
os resultados de produção estão delimitados no registro da publicação.

Para suspender a operação real, preferir nova revisão publicada com a flag
desabilitada, preservando a demonstração, o schema aditivo e o histórico. A flag
é um bloqueio temporário: não revoga de forma durável sessões já emitidas após sua
reativação. Quando for necessária revogação durável, usar o controle explícito de
revogação. Não remover o gate de proprietário nem reintroduzir outro provedor.
Retornar à versão 10 exige decisão explícita do proprietário, pois ela usa o
acesso ChatGPT anterior e não atende à orientação de GitHub exclusivo.
