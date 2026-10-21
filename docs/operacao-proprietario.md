# Operação individual na área pública

Refs #14. A demonstração continua pública e fictícia. A operação real exige
identidade ChatGPT **e** correspondência exata com `WORKBENCH_OWNER_ID`, configurado
somente no servidor. Um usuário autenticado diferente recebe 403 antes de consultar
D1 ou GitHub; ausência de configuração retorna 503. Sem identidade retorna 401.
Os filtros por proprietário nas consultas continuam necessários.

## Preparação e publicação (pendentes de revisão humana)

1. Conferir a identidade do proprietário numa sessão legítima deste mesmo Site.
   Sites fornece um ID estável por Site; ele **não é** o ID da conta do painel Sites,
   um e-mail, o login GitHub ou o ID de outro Site. Não inferir esses equivalentes.
2. Configurar `WORKBENCH_OWNER_ID` com esse ID no gerenciador de variáveis de runtime
   do Site, sem colocar o valor em fonte, chat, logs ou manifesto. Se usar histórico
   D1 para reconciliar a identidade, confirmar a origem e a conta antes de vincular;
   não eleger automaticamente o primeiro cadastro como proprietário.
3. Publicar apenas após revisão, com a variável preparada na mesma entrega.
   A fonte Sites é separada do GitHub: portar a mudança revisada, verificar testes,
   TypeScript/build e registrar o commit e a versão realmente publicados.
4. Validar proprietário, outro usuário autenticado e anônimo; testar GET e ações
   de revisão/relatório. Confirmar persistência do histórico existente.

O link "Entrar como proprietário" abre a autenticação oficial em navegação de topo.
Ele não concede autorização por si só. Usuários sem autorização veem a demonstração.
Não existem cadastro público, migração de dados ou credenciais novas neste PR.

## Validação e reversão

`node --test web/tests/*.test.mjs` cobre recusa de outro usuário em todas as ações,
configuração ausente, tentativa de fornecer proprietário no corpo e acesso legítimo.
Executar também Python, TypeScript e build. Estes testes não substituem a homologação
hospedada após publicação. Antes de publicar, a reversão é fechar o PR. Após publicar,
priorizar corrigir a variável ou suspender somente a operação real, mantendo a demo;
não remover o bloqueio de autorização para recuperar disponibilidade.
