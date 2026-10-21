# Login GitHub do proprietário — preparação para homologação

Estado em 21/10/2026: código publicado no Site v12 após autorização, incluindo a fronteira do PR #17 e as correções #18/#19; PRs GitHub continuam sem merge. **Login GitHub real ainda não homologado e desabilitado.** OAuth App cadastrada; Client Secret e associação ao owner existente pendentes. Consulte o [registro da publicação](publicacao-2026-10-21.md).

## Escolha e limites

Uma OAuth App dedicada identifica a conta, com PKCE S256, sem escopos adicionais. O servidor troca o código por token, consulta `/user` e aceita somente o ID numérico `GITHUB_OWNER_ID`. O token fica apenas na memória dessa requisição; não é salvo em D1, cookie, frontend, relatório ou log. Escopos concedidos não vazios são rejeitados. Não reutilizar uma OAuth App que já tenha recebido permissões de repositório.

O ID GitHub autorizado é mapeado explicitamente para o `WORKBENCH_OWNER_ID` **existente deste Site**, mantendo o namespace dos projetos. Não há associação por e-mail, primeiro usuário administrador ou vínculo automático. O ID da conta no painel Sites não substitui o ID nativo por Site. Não criar novo owner para fazer desaparecer um erro de configuração.

A área real desta branch aceita **somente GitHub**, conforme a orientação final do proprietário. Não há fallback ChatGPT; identidade nativa e seus cabeçalhos não concedem acesso operacional. O arquivo de integração nativa anterior permanece apenas como código legado sem chamada no fluxo de acesso. A audiência pública da demonstração não autoriza os dados reais; todas as operações de `/api/workbench` continuam passando pela autorização do servidor do PR #17. Python/SQLite local, conector GitHub da conversa e Workers/D1 hospedado têm credenciais e bancos separados.

Login **não instala uma GitHub App**. Para seleção de repositórios privados, a etapa futura deve usar uma App com Contents: read, instalação e repository ID conferidos no servidor, credencial curta e revogação testada. Nesta entrega, não há App de repositórios, organizações, privados, webhook ou monitoramento.

## Controles implementados

- `GET /api/auth/github/start`: origem HTTPS canônica, state aleatório, cookie de vínculo do navegador, PKCE e limite de tentativas pendentes; responde 503 se não configurado.
- `GET /api/auth/github/callback`: state e vínculo válidos por 10 minutos, consumo atômico antes da troca, endpoints fixos GitHub, redirecionamentos do provedor bloqueados, respostas limitadas a 16 KiB/32 KiB e prazo de rede/leitura de 10 segundos. Callback não aceita redirecionamento arbitrário.
- Sessão opaca aleatória de 32 bytes, hash em D1, cookie `__Host-` com Secure, HttpOnly, SameSite=Lax e Path=/; expiração absoluta de 12 horas. Apenas login público da conta é guardado como nome de exibição. Alterar owner, client ID ou origem invalida a associação.
- `POST /api/auth/github/logout`: exige Origin exata e, para sessão ativa, CSRF vinculado à sessão. Revoga em D1 antes de limpar o cookie. Falha de banco responde 503; a interface não declara saída concluída. Depois recarrega `/access`. Uma sessão ChatGPT prévia não é consultada nem autoriza a área real.
- Mensagens fixas para consentimento negado, callback inválido, provedor indisponível e conta sem permissão. Dados arbitrários da query não são refletidos. Sessão expirada não concede acesso; o painel pede acesso do proprietário novamente.

D1 conserva hashes, IDs, timestamps e o verificador PKCE temporário, nunca tokens GitHub. Expiração é lógica; a limpeza física de registros expirados ocorre no próximo início de login, sem scheduler novo. Fluxos simultâneos têm teto global de 20 por 10 minutos: protege crescimento, mas pode bloquear temporariamente login por abuso anônimo. **Antes de habilitar**, avaliar limitação na borda no ambiente de homologação; não foi criada infraestrutura nesta entrega. Sem fallback ativo, indisponibilidade do GitHub impede novo acesso operacional; não ativar antes de revisar essa limitação.

Revogar a autorização na conta GitHub impede novas trocas, mas não encerra imediatamente a sessão local já emitida: ela pode durar até 12h. Para bloqueio imediato, desabilitar login no servidor ou alterar a associação do proprietário; para sair desse navegador, usar logout. Não há endpoint remoto de revogação automática nem promessa de propagação instantânea. Backup D1 deve tratar registros de autenticação como sensíveis.

## Configuração restante — pelo proprietário, fora do chat

Na preparação do PR #20, o conector retornou zero variáveis. Na publicação autorizada, a revisão 1 configurou origem, Client ID, GitHub ID e flag false. Client Secret e WORKBENCH_OWNER_ID permanecem ausentes; nenhum valor secreto foi incluído em código ou logs. O roteiro abaixo continua como critérios para ativação, sem afirmar que todos foram concluídos.

1. Revisar os PRs e combinar a base #17 com as correções #18/#19 antes de preparar um deploy autorizado. Ainda não fazer merge/publicação sem autorização específica.
2. Em GitHub → Settings → Developer settings → OAuth Apps, cadastrar **uma App dedicada ao login**. Homepage: `https://security-workbench.camaleaoweb3.com.br`. Authorization callback URL: `https://security-workbench.camaleaoweb3.com.br/api/auth/github/callback`. Não pedir escopo `repo`, organizações ou escrita. Para homologação em outro domínio HTTPS, usar outra App/callback e outra configuração canônica; não usar HTTP do preview para login real.
3. No gerenciador protegido de variáveis do ambiente destinado à homologação, configurar os nomes abaixo. Nunca colar Client Secret, tokens, códigos de callback ou cookies no chat, Git ou capturas. Confirmar o ID GitHub por fonte autenticada legítima e conferir `WORKBENCH_OWNER_ID` contra a identidade nativa já autorizada e seus dados existentes. Não exportar o banco para obtê-lo.

| Nome | Valor esperado |
| --- | --- |
| `WORKBENCH_ORIGIN` | Origem HTTPS exata, sem barra final, caminho ou query |
| `GITHUB_LOGIN_CLIENT_ID` | Client ID da App dedicada |
| `GITHUB_LOGIN_CLIENT_SECRET` | Client Secret apenas no servidor |
| `GITHUB_OWNER_ID` | ID numérico estável da conta proprietária verificada |
| `WORKBENCH_OWNER_ID` | ID canônico existente do proprietário neste Site |
| `GITHUB_LOGIN_ENABLED` | `false` durante preparação; `true` somente ao iniciar homologação autorizada |

4. Confirmar que a hospedagem encaminha cookies `__Host-`, múltiplos Set-Cookie e as três rotas OAuth sem exigir sessão ChatGPT prévia. Sites oferece identidade ChatGPT nativa; a compatibilidade do provedor externo **precisa de prova hospedada**. Se a plataforma interceptar rotas/cookies ou exigir ChatGPT antes do fluxo, manter GitHub desabilitado e documentar o bloqueio. Não oferecer outro provedor nem contornar controles. Uma alternativa de hospedagem compatível dependerá de projeto e autorização próprios.
5. Após autorização de deploy, o pipeline deve aplicar a migração aditiva `0001_strong_swarm.sql` no D1 **correto** usando o fluxo oficial de deploy do projeto. São duas tabelas de autenticação; a tabela de projetos não é reescrita. Backup/restore devem ser privados e aprovados. O teste SQLite em memória não equivale à migração de produção. Não apontar o Worker ao SQLite local nem executar SQL contra bancos de terceiros.
6. Habilitar a flag somente quando configuração, associação, migração, dependências e tratamento de abuso estiverem revisados. O cadastro OAuth e a publicação do código com flag false foram executados; a ativação e a homologação real permanecem pendentes conforme o registro de publicação.

## Roteiro de homologação real

- Em navegador sem sessão e sem login ChatGPT, entrar pela opção GitHub e conferir o mesmo histórico do proprietário. Não registrar tokens/cookies/URL de callback em evidências públicas. Registrar somente resultado, versão e horário.
- Negar consentimento; repetir callback; usar state ausente, conta distinta e sessão expirada; conferir ausência de acesso a projetos, análises, revisão, comparação e relatório. Testes locais usam identidades e tokens inertes.
- Fazer logout, recarregar e confirmar que a sessão antiga não retorna. Interromper D1 em ambiente de teste e verificar erro explícito de saída e negação de acesso, mesmo com cabeçalho ChatGPT de proprietário. Desabilitar login, sair e reabilitar para confirmar revogação local.
- Executar o issue #14: duas análises próprias de commits fixados, identidade, bytes/arquivos, limites e horário; revisão persistida após reload, comparação e download Markdown no navegador. Se nenhum candidato aparecer, usar fixture segura própria e relatar esse fato.
- Em sessão anônima separada, confirmar que nenhuma operação expõe dados reais. Não contar o preview fictício ou os mocks como homologação hospedada.
- GitHub App futura: antes de privados, testar seleção/instalação/removal/revogação, escopo, ID, commits, 403, expiração e isolamento; nenhuma função de repositório privado é liberada pelo login.

## Reversão

Antes de produção, basta encerrar os PRs/preview; Site e dados existentes não foram alterados. Depois de um futuro deploy aprovado, desabilitar `GITHUB_LOGIN_ENABLED`, manter a operação real indisponível até retornar a um artefato aprovado com autorização do proprietário. Não reintroduzir ChatGPT como fallback automático; a mudança de provedor exige decisão explícita. Manter as tabelas aditivas evita apagar sessões/dados sem aprovação; após avaliação de retenção, eventual remoção exige procedimento próprio. Não reverter o gate de owner para recuperar acesso. Trocar Client Secret requer gerenciador seguro; alterar só o segredo não revoga sessões locais já emitidas.

## Fontes oficiais consultadas em 21/10/2026

- [OAuth Apps: autorização, PKCE e endpoints](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [Escopos de OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
- [GitHub Apps e OAuth Apps: permissões e seleção](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
- [Versões REST](https://docs.github.com/en/rest/about-the-rest-api/api-versions)

A documentação de identidade Sites disponível no ambiente foi lida: rotas nativas da plataforma não são removidas, mas a aplicação não oferece ChatGPT nem usa sua identidade para autorizar a área real. O owner canônico por Site é preservado apenas como chave dos dados existentes. Nenhuma credencial do conector foi instalada no Worker.
