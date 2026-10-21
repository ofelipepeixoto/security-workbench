# Login GitHub do proprietário — preparação para homologação

Estado em 21/10/2026: código publicado no **Site v12**, incluindo a fronteira do PR #17 e as correções #18/#19. A publicação inicial passou às 19:53:34 UTC, com fonte `236082902476a9c943629b1005a23b01682c7252` e revisão de ambiente 1. O redeploy da mesma versão com a **revisão 2 passou às 20:07:20 UTC**, deployment `appgdep_6ad91b6813f08191bf3a8e0491c0a2a1`. **Login GitHub real ainda não homologado; flag desabilitada.** A associação ao proprietário existente está configurada; falta o Client Secret no ambiente. Consulte o [registro da publicação](publicacao-2026-10-21.md).

## Escolha e limites

Uma OAuth App dedicada identifica a conta, com PKCE S256, sem escopos adicionais. O servidor troca o código por token, consulta `/user` e aceita somente o ID numérico `GITHUB_OWNER_ID`. O token fica apenas na memória dessa requisição; não é salvo em D1, cookie, frontend, relatório ou log. Escopos concedidos não vazios são rejeitados. Não reutilizar uma OAuth App que já tenha recebido permissões de repositório.

O ID GitHub autorizado é mapeado explicitamente para o `WORKBENCH_OWNER_ID` **existente deste Site**, mantendo o namespace dos projetos. Não há associação por e-mail, primeiro usuário administrador ou vínculo automático. O ID da conta no painel Sites não substitui o ID nativo por Site. Não criar novo owner para fazer desaparecer um erro de configuração.

A área real publicada aceita **somente GitHub**, conforme a orientação final do proprietário. Não há fallback ChatGPT; identidade nativa e seus cabeçalhos não concedem acesso operacional. O arquivo de integração nativa anterior permanece apenas como código legado sem chamada no fluxo de acesso. A audiência pública da demonstração não autoriza os dados reais; todas as operações de `/api/workbench` continuam passando pela autorização do servidor do PR #17. Python/SQLite local, conector GitHub da conversa e Workers/D1 hospedado têm credenciais e bancos separados.

Login **não instala uma GitHub App**. Para seleção de repositórios privados, a etapa futura deve usar uma App com Contents: read, instalação e repository ID conferidos no servidor, credencial curta e revogação testada. Nesta entrega, não há App de repositórios, organizações, privados, webhook ou monitoramento.

## Controles implementados

- `GET /api/auth/github/start`: origem HTTPS canônica, state aleatório, cookie de vínculo do navegador, PKCE e limite de tentativas pendentes; responde 503 se não configurado.
- `GET /api/auth/github/callback`: state e vínculo válidos por 10 minutos, consumo atômico antes da troca, endpoints fixos GitHub, redirecionamentos do provedor bloqueados, respostas limitadas a 16 KiB/32 KiB e prazo de rede/leitura de 10 segundos. Callback não aceita redirecionamento arbitrário.
- Sessão opaca aleatória de 32 bytes, hash em D1, cookie `__Host-` com Secure, HttpOnly, SameSite=Lax e Path=/; expiração absoluta de 12 horas. Apenas login público da conta é guardado como nome de exibição. Alterar owner, client ID ou origem invalida a associação.
- `POST /api/auth/github/logout`: exige Origin exata e, para sessão ativa, CSRF vinculado à sessão. Revoga em D1 antes de limpar o cookie. Falha de banco responde 503; a interface não declara saída concluída. Depois recarrega `/access`. Uma sessão ChatGPT prévia não é consultada nem autoriza a área real.
- Mensagens fixas para consentimento negado, callback inválido, provedor indisponível e conta sem permissão. Dados arbitrários da query não são refletidos. Sessão expirada não concede acesso; o painel pede acesso do proprietário novamente.

D1 conserva hashes, IDs, timestamps e o verificador PKCE temporário, nunca tokens GitHub. Expiração é lógica; a limpeza física de registros expirados ocorre no próximo início de login, sem scheduler novo. Fluxos simultâneos têm teto global de 20 por 10 minutos: protege crescimento, mas pode bloquear temporariamente login por abuso anônimo. Essa é uma limitação de disponibilidade conhecida para a homologação manual individual; não houve teste de exaustão em produção nem foi adicionada infraestrutura ou limitação por IP. Não prometer disponibilidade operacional com esse controle. Sem fallback ativo, indisponibilidade do GitHub impede novo acesso operacional.

Revogar a autorização na conta GitHub impede novas trocas, mas não encerra imediatamente a sessão local já emitida: ela pode durar até 12h. Desabilitar login no servidor suspende o acesso enquanto a flag estiver desligada; reativar a mesma configuração pode tornar válidas novamente as sessões ainda não expiradas. Para sair desse navegador, usar logout e conferir sua conclusão. Para revogação durável, invalidar explicitamente os registros de sessão no D1 correto antes de reativar; não basta alternar a flag ou alterar e depois restaurar a associação. Não há endpoint remoto de revogação automática nem promessa de propagação instantânea. Backup D1 deve tratar registros de autenticação como sensíveis.

## Preparação realizada

- A publicação autorizada incorporou a base de autorização e as correções de dependências. A [CI do PR #22 passou](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39666451867).
- Foi cadastrada a [OAuth App dedicada 3952863](https://github.com/settings/applications/3952863), com homepage `https://security-workbench.camaleaoweb3.com.br` e callback `https://security-workbench.camaleaoweb3.com.br/api/auth/github/callback`. O ID GitHub do proprietário foi verificado como `171351708`.
- A revisão 1 configurou origem, Client ID, GitHub ID e flag `false`. A revisão 2 acrescentou `WORKBENCH_OWNER_ID` como segredo, preservando o namespace do projeto REA legado, repository ID `1417322346`, autorizado em 17/10/2026. O valor interno do proprietário não é reproduzido neste guia.
- O overview do D1 confirmou instaladas as tabelas `workbench_oauth_flows` e `workbench_github_sessions`, da migração aditiva `0001_strong_swarm.sql`. Não foram consultadas suas linhas; a existência das tabelas não comprova um fluxo autenticado.
- A verificação HTTP às 20:09 UTC retornou 401 em `GET /api/workbench` e 503 em `GET /api/auth/github/start`, com `Cache-Control: no-store`. Esses resultados confirmam a recusa de acesso e o login indisponível observados nessa configuração, sem comprovar autenticação real.

| Nome | Estado observado na revisão 2 |
| --- | --- |
| `WORKBENCH_ORIGIN` | Configurado com a origem HTTPS canônica |
| `GITHUB_LOGIN_CLIENT_ID` | Configurado para a OAuth App dedicada |
| `GITHUB_LOGIN_CLIENT_SECRET` | **Ausente; próximo passo manual** |
| `GITHUB_OWNER_ID` | Configurado e verificado |
| `WORKBENCH_OWNER_ID` | Configurado como segredo; namespace existente preservado |
| `GITHUB_LOGIN_ENABLED` | `false`; ativação ainda pendente |

## Próximo passo manual — Client Secret e homologação

1. Abrir a [OAuth App já cadastrada](https://github.com/settings/applications/3952863). Conferir o callback HTTPS acima; não criar outra App para repetir a preparação.
2. Usar o botão **Generate a new client secret**, observado nessa página. Manter o valor somente no fluxo protegido entre o GitHub e a configuração do servidor. Nunca enviá-lo no chat, Git, capturas ou logs.
3. No mecanismo protegido de variáveis do ambiente deste Site, salvar somente `GITHUB_LOGIN_CLIENT_SECRET` **como segredo no servidor**. Preservar as demais variáveis, especialmente `WORKBENCH_OWNER_ID`, e manter `GITHUB_LOGIN_ENABLED=false`. Este guia não presume nomes de menus, telas ou botões do Sites que não foram observados.
4. Conferir que o segredo está configurado sem exibir seu valor. No fluxo Sites observado, o **redeploy é obrigatório** para aplicar a nova revisão de ambiente: publicar a versão salva com essa revisão, usando o mesmo artefato aprovado, e registrar revisão, deployment e resultado. Salvar a variável sozinho não aplica a nova configuração. A publicação do código e a instalação das tabelas já ocorreram; não recriar o banco nem o namespace do proprietário.
5. No chat, avisar apenas **“segredo configurado”**, sem enviar seu valor. Manter a flag `false` até retomar a homologação já autorizada.

Na etapa seguinte, habilitar a flag pelo mecanismo disponível e, em navegador sem sessão ChatGPT, abrir `/access` para seguir o login GitHub. A hospedagem ainda precisa demonstrar o encaminhamento correto dos cookies `__Host-`, múltiplos Set-Cookie e rotas OAuth durante o fluxo real. Se a plataforma interceptar rotas/cookies, exigir ChatGPT antes do fluxo ou o login não retornar corretamente, desligar a flag e registrar o bloqueio observado. Não oferecer outro provedor nem contornar controles. Continuar o roteiro abaixo somente com o acesso GitHub efetivamente validado.

O Client Secret, a ativação e o fluxo completo de login continuam pendentes. Configuração e testes simulados não devem ser descritos como homologação real. Para outro domínio de homologação, usar App/callback e configuração canônica próprios, sem HTTP de preview para login real.

## Roteiro de homologação real

- Em navegador sem sessão e sem login ChatGPT, entrar pela opção GitHub e conferir o mesmo histórico do proprietário. Não registrar tokens/cookies/URL de callback em evidências públicas. Registrar somente resultado, versão e horário.
- Negar consentimento; repetir callback; usar state ausente, conta distinta e sessão expirada; conferir ausência de acesso a projetos, análises, revisão, comparação e relatório. Testes locais usam identidades e tokens inertes.
- Fazer logout, recarregar e confirmar que a sessão antiga não retorna. Interromper D1 em ambiente de teste e verificar erro explícito de saída e negação de acesso, mesmo com cabeçalho ChatGPT de proprietário. Desabilitar login, sair e reabilitar para confirmar revogação local.
- Executar o issue #14: duas análises próprias de commits fixados, identidade, bytes/arquivos, limites e horário; revisão persistida após reload, comparação e download Markdown no navegador. Se nenhum candidato aparecer, usar fixture segura própria e relatar esse fato.
- Em sessão anônima separada, confirmar que nenhuma operação expõe dados reais. Não contar o preview fictício ou os mocks como homologação hospedada.
- GitHub App futura: antes de privados, testar seleção/instalação/removal/revogação, escopo, ID, commits, 403, expiração e isolamento; nenhuma função de repositório privado é liberada pelo login.

## Reversão

A versão 12 já está publicada, com revisão de ambiente 2. Para suspender a operação real, manter ou alterar `GITHUB_LOGIN_ENABLED=false` e aplicar a configuração no ambiente. Isso bloqueia o acesso temporariamente; não revoga de forma durável sessões emitidas antes da suspensão. Em caso de revogação, invalidar os registros de autenticação no D1 correto e conferir o resultado antes de reativar, preservando projetos, análises e revisões humanas. Se D1 estiver indisponível, manter a flag desligada até concluir essa verificação.

Para reverter código, usar um artefato revisado que preserve o acesso exclusivo por GitHub e a demonstração fictícia. Não retornar automaticamente à versão 10 nem reintroduzir ChatGPT como fallback. Manter as tabelas aditivas e o histórico; não apagar dados ou alterar o owner para recuperar acesso. Trocar apenas o Client Secret não revoga sessões locais já emitidas. Não registrar valores de segredos ou conteúdo de sessões durante a reversão.

## Fontes oficiais consultadas em 21/10/2026

- [OAuth Apps: autorização, PKCE e endpoints](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [Escopos de OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
- [GitHub Apps e OAuth Apps: permissões e seleção](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
- [Versões REST](https://docs.github.com/en/rest/about-the-rest-api/api-versions)

A documentação de identidade Sites disponível no ambiente foi lida: rotas nativas da plataforma não são removidas, mas a aplicação não oferece ChatGPT nem usa sua identidade para autorizar a área real. O owner canônico por Site é preservado apenas como chave dos dados existentes. Nenhuma credencial do conector foi instalada no Worker.
