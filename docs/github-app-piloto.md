# GitHub App: catálogo autorizado e piloto controlado

Registro preparado em 21/10/2026, horário de Brasília. **Código para revisão não
equivale a App cadastrada, instalação autorizada, credencial configurada ou piloto
homologado.** Este roteiro não autoriza executar essas mudanças em produção.

O login GitHub existente identifica a pessoa. A conexão da GitHub App é um segundo
consentimento para descobrir e ler repositórios. O conector GitHub desta conversa
não é uma credencial do Site e não é copiado para o servidor. Não é necessário
repetir comandos, compilação ou análise REA no computador do operador.

## Escolha e fronteira de autorização

O piloto usa **user access token da GitHub App**, vinculado ao ID numérico GitHub
da sessão já validada pelo servidor. A permissão efetiva é a interseção entre o
que a pessoa pode acessar e o que foi concedido à App. Um token de instalação
com acesso amplo à organização não substitui essa checagem por pessoa.

O catálogo consulta `GET /user/installations` e
`GET /user/installations/{installation_id}/repositories`. O ID de instalação
selecionado pelo navegador é apenas entrada: o servidor confirma se aquela
instalação está acessível ao usuário. A seleção de repositório usa ID estável;
nome, proprietário, branch e visibilidade são metadados sujeitos a mudança.
Consultar o catálogo não inicia análise.

Permissões previstas no cadastro da App:

| Permissão | Nível | Finalidade |
| --- | --- | --- |
| Repository Metadata | Read-only | Identificar repositórios e instalações permitidas |
| Repository Contents | Read-only | Ler commit, árvore e blobs autorizados |
| Escrita, administração e permissões de conta/organização adicionais | Nenhuma nesta fatia | Não necessárias para o catálogo e o scanner limitado |

Esta fatia usa o fluxo de autorização de usuário da App. Não precisa gerar chave
privada, JWT de App nem token de instalação para conceder acesso ao catálogo.
Se um executor futuro exigir esses mecanismos, ele precisa de revisão própria.

## Configuração de servidor preparada

Os nomes abaixo pertencem à nova conexão, separados do OAuth de login atual.
Não preencher valores reais em Git, frontend, screenshots, relatórios ou chat.

| Configuração | Uso | Condição de piloto |
| --- | --- | --- |
| `GITHUB_APP_ENABLED` | Ativa a conexão da App | Ausente ou diferente de `true` mantém desativada |
| `GITHUB_APP_ID` | ID numérico da App | Confirmar no cadastro, distinto do Client ID |
| `GITHUB_APP_SLUG` | Nome técnico para instalar/gerenciar | Usar somente a App aprovada para o piloto |
| `GITHUB_APP_CLIENT_ID` | Identifica o cliente no fluxo GitHub | Valor de configuração do servidor |
| `GITHUB_APP_CLIENT_SECRET` | Troca o código de autorização por token | Secret manager/runtime aprovado |
| `GITHUB_APP_TOKEN_KEY` | Chave AES-GCM de 32 bytes, codificada em base64url | Gerada e inserida por mecanismo protegido, somente no servidor |
| `GITHUB_APP_KEY_VERSION` | Versão da chave e invalidação da conexão | Rotação controlada; reconectar com a nova versão |
| `WORKBENCH_ORIGIN` | Origem HTTPS canônica e callback exato | Preservar domínio/configuração do ambiente aprovado |

A flag de multiusuário e a lista de participantes são controles separados da
flag da App. Configurar a App não abre o Workbench para qualquer conta. O modo
multiusuário permanece desligado por padrão; o proprietário administrativo e
seus dados legados permanecem preservados. Identidade, proprietário e permissão
nunca são aceitos de um campo enviado pelo navegador.

## Contrato da conexão

1. Uma sessão GitHub válida solicita conexão por `POST` na rota de início, com
   origem canônica e CSRF da própria sessão.
2. O servidor cria state de uso único, PKCE S256 e vínculo ao navegador, ao
   proprietário e ao ID GitHub já autenticado. A resposta contém somente a URL
   de autorização; não contém token da App.
3. O callback é `/api/auth/github-app/callback`, registrado exatamente na App.
   O servidor consome o state antes da troca do código e confirma, por `/user`,
   que a autorização retornou para a mesma identidade GitHub. Outra conta não
   substitui a pessoa logada nem recebe os dados antigos.
4. Somente token de usuário com expiração é aceito. O limite desta fatia é de
   oito horas. Refresh token não é persistido nem usado: após expirar, a pessoa
   precisa reconectar. A sessão de login e a conexão têm ciclos separados.
5. O token fica em envelope AES-GCM no D1, com autenticação associada ao dono,
   ao ID GitHub e à configuração/versão da chave. Não há token em texto puro,
   token em URL, log de resposta GitHub ou credencial enviada ao navegador.
6. Antes de devolver `connected:true`, `getConnection` faz `GET /user` e confirma
   o ID GitHub. O retorno inclui `validated_at`; envelope existente/decriptável
   sozinho não é integração conectada. A interface recebe somente estado e
   metadados permitidos. O cliente de aquisição é criado no servidor e não sai
   em JSON de resposta ou relatório.

O estado `expired` vem do prazo registrado no D1. `401` do provedor ou ID
diferente produzem `revoked` e apagam o envelope local. Ausência de conexão,
versão de chave/configuração incompatível ou falha de autenticação do envelope
produzem `not_connected`. Quota, proibição, timeout e falha de armazenamento
continuam erros explícitos; não viram lista vazia ou conexão confirmada.

PKCE/state protegem o fluxo de conexão; não substituem autorização do objeto
nas rotas de projeto, análise, revisão, comparação e exportação. Esses aceites
pertencem também à matriz de isolamento do MVP.

## Lista, paginação e estados honestos

Cada chamada lê uma página limitada. Próximas páginas precisam permanecer no
endpoint e na origem GitHub previstos; o servidor não faz fetch de URL arbitrária
proveniente do navegador, de `Link` ou do corpo de resposta. A interface deve
conservar o indicador de continuação e nunca chamar uma página parcial de
inventário completo. Não juntar cache de pessoas ou instalações distintas.

| Limite do cliente preparado | Valor e comportamento |
| --- | --- |
| Página | 100 itens; parâmetro de página entre 1 e 10.000 |
| Catálogo | Páginas sob demanda, com `next_page` e `complete`; não percorre tudo automaticamente |
| Busca de autorização da instalação | Por padrão até 10 páginas/1.000 instalações; se a busca ainda tiver continuação, negar com `incomplete` |
| Busca de autorização do repositório | Por padrão até 10 páginas/1.000 repositórios da instalação; se ainda tiver continuação, negar com `incomplete` |
| Janela global | 45 segundos por instância do cliente |
| Requisição | Até 10 segundos, compartilhando o prazo global restante |
| Resposta JSON do catálogo/objetos Git | Até 4 MiB; overflow interrompe com erro |
| Troca do código e identidade no callback | Prazo conjunto de 10 segundos; até 32 KiB por resposta |

O teto de busca de autorização não exclui silenciosamente os itens restantes
nem prova falta de acesso. Um repositório fora dessa janela precisa de evolução
revisada da busca antes de ser analisado; a lista pode continuar paginando sem
declarar autorização que não conseguiu confirmar.

Busca e filtros sobre itens já carregados precisam informar essa abrangência.
Atualizar a lista é leitura: não autoriza, enfileira ou repete análises.

| Estado observado | Mensagem/ação esperada | O que não concluir |
| --- | --- | --- |
| Conexão desativada ou configuração ausente | Explicar que o piloto ainda não está habilitado | Não exibir integração conectada |
| Sessão válida sem conexão da App | Oferecer Conectar repositórios quando a configuração estiver pronta | OAuth de login não concede acesso privado |
| Conexão expirada ou revogada | Solicitar reconexão; interromper aquisições autorizadas por ela | Lista antiga não comprova acesso atual |
| Nenhuma instalação acessível | Orientar instalação/permissões da App aprovada | Não afirmar que a pessoa não tem repositórios |
| Instalação suspensa | Explicar suspensão e indicar gerenciamento no GitHub | Não iniciar leitura dos repositórios suspensos |
| Instalação parcial ou mais páginas | Mostrar seleção e continuação/incompletude | Não chamar resultado de todos os repositórios da conta |
| Lista autorizada vazia | Informar ausência de itens naquela seleção/página | Não transformar erro em lista vazia |
| Organização exige aprovação ou SSO | Orientar administrador ou sessão SAML ativa, conforme o GitHub | Não afirmar aprovação pendente sem evidência do provedor |
| Permissão insuficiente/404 privado | Acesso não confirmado; orientar revisão de permissão | Não revelar existência de conteúdo privado por diferença de mensagem |
| Erro de rede, quota ou persistência | Mostrar causa segura e próxima ação apropriada | Não exibir sucesso, contadores zero ou resultado limpo |

O catálogo deve mostrar nome/proprietário, visibilidade, branch padrão,
linguagem disponível, arquivamento, permissão e momento da consulta. A lista
GitHub é diferente dos projetos já autorizados e persistidos no Workbench.

## Revalidação, retenção e interrupção

A política do piloto é **recusar acesso quando a autorização necessária não
puder ser confirmada**. Revalidar instalação/repositório e identidade ao
enfileirar e adquirir; revalidar acesso antes de entregar conteúdo privado em
detalhes, revisão, comparação e exportação. A validação na abertura da lista
não serve como autorização permanente.

Rename e transferência exigem conciliar o ID estável e o proprietário/nome
atuais, sem transformar a URL antiga em identidade nova. Visibilidade privada,
desinstalação, suspensão, perda de acesso, desconexão ou revogação não autorizam
fallback para uma credencial mais ampla ou para a cota anônima.

O D1 conserva apenas metadados e projeções previstos no contrato; a conexão
guarda o envelope de token. Desconectar não é alegação de exclusão do histórico
ou de purga automática dos backups. Até haver política de exclusão aprovada,
conteúdo privado retido deve ficar bloqueado enquanto a revalidação falhar.
Prazo de retenção, exclusão verificável e efeitos de restauração são aceites
operacionais ainda separados da implementação da conexão.

Desconectar exige `POST`, origem e CSRF. O fluxo expurga a conexão e os states
locais da pessoa, tenta revogar o token no GitHub e diferencia a confirmação do
provedor. `provider_revoked:false` não é sucesso de revogação no GitHub: a pessoa
deve revisar a autorização em GitHub → Settings → Applications → Authorized
GitHub Apps. Suspender ou desinstalar a App é uma operação distinta, administrada
em Installed GitHub Apps. A falha do provedor não deve conservar o token local
como se a pessoa ainda quisesse usá-lo.

Webhooks de revogação não ficam presumidos por existir esse guia. Se uma rota
for adicionada, precisa validar assinatura e replay, nunca executar payloads.
Sem webhook, a recusa da API e a revalidação por operação são a defesa prevista;
não alegar revogação instantânea já comprovada em produção.

## Quota e próxima tentativa

O cliente distingue quota de falta de permissão e falha de banco, usando campos
seguros. Quando disponíveis, `Retry-After`, `X-RateLimit-Remaining` e
`X-RateLimit-Reset` orientam a data mínima da próxima tentativa. Sem data válida,
informar que não foi possível determiná-la. A política é sem loop automático:
interromper e aguardar; não trocar usuário/token/IP para contornar o limite.

Limitar concorrência e impor prazo/tamanho também na leitura das respostas.
Backoff com jitter deve respeitar a espera mínima do GitHub; nenhum delay local
reduz a quota. Cache/ETag futuro precisa incluir a identidade e a instalação e
não pode dispensar revalidação de autorização.

## Roteiro manual posterior, quando o piloto for autorizado

1. **Revisão:** aprovar os PRs, controles de isolamento, política de retenção,
   plano de migração/backup e ambiente de teste. Não ativar produção por este guia.
2. **Cadastro:** o proprietário cria a GitHub App da organização/conta aprovada,
   define as duas permissões de leitura e o callback do ambiente de piloto.
   Preserva o aplicativo de login existente. Não gerar permissão de escrita.
3. **Configuração protegida:** operador autorizado insere Client Secret e chave
   AES-GCM no mecanismo de segredos do ambiente, sem enviar valores no chat.
   Mantém flags desligadas até a migração sintética e os checks do commit exato.
4. **Instalação limitada:** com autorização específica, instalar somente nos
   repositórios benignos das contas de teste. Uma organização pode exigir decisão
   de seu administrador; não instalar em conta de terceiro por conveniência.
5. **Piloto:** habilitar apenas participantes previamente permitidos no servidor;
   entrar, conectar, percorrer páginas e conferir seleção. A pessoa A não pode
   obter itens privados da B nem usar seu ID de instalação/repositório.
6. **Jornada:** selecionar repo/commit, confirmar limites, acompanhar job, revisar,
   comparar duas análises e abrir o Markdown exportado. Registrar somente IDs,
   commit, cobertura, horário e resultados sanitizados.
7. **Revogação:** desconectar, remover seleção, suspender/desinstalar e revogar
   autorização em casos separados. Confirmar recusa de novas leituras, jobs e
   resultados privados, inclusive com IDs/URLs antigos.
8. **Encerramento:** manter piloto fechado se qualquer aceite falhar. Abertura
   multiusuário e publicação de produção precisam do aceite explícito próprio.

Não há comando novo para executar no WSL nesta etapa. Cadastrar/configurar App,
migrar banco real e instalar em contas permanecem intervenções externas que
precisam da autorização específica e do canal de segredos apropriado.

## Aceite e reversão

Testes com transportes falsos podem provar contratos de páginas, ID, limites,
CSRF, PKCE, criptografia, quota e erros. Não provam GitHub App real conectada,
SSO de organização, consentimento externo ou segunda conta homologada. A entrega
deve registrar separadamente testes locais/CI e resultados operacionais reais.

Reversão do piloto: desativar a conexão e o modo multiusuário; revogar/expurgar
as conexões aprovadas e retornar ao código anterior revisado. Preservar o owner
administrativo, dados e geração de sessão. Não reduzir controles de autenticação,
reatribuir dados legados ou restaurar tokens antigos para recuperar acesso.
Migração aditiva não implica apagar tabelas/dados no rollback de aplicação.

## Fontes oficiais consultadas

Consulta em 21/10/2026 BRT. A implementação deve continuar verificando o contrato
e os headers retornados; as fontes não comprovam nossa homologação.

- [Token de usuário da GitHub App: interseção, PKCE, SAML e expiração](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).
- [Instalações e repositórios acessíveis ao token de usuário](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-user-access-token).
- [Paginação da REST API](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api).
- [Boas práticas de quota e requisições condicionais](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api).
- [Expiração e renovação de tokens de usuário](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens).
- [Revisar instalações e seleção de repositórios](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps).
- [Revisar e revogar autorização da App](https://docs.github.com/en/apps/using-github-apps/reviewing-and-revoking-authorization-of-github-apps).
