# Identidade GitHub e escolha do repositório

Base pública: PR #43, head `71c878533270022aa68748f73b3f9f6a6f2727db`, árvore `eedf7a7fd563afc82324eb3e3cd86a68018fbcb9`. Head e estado de rascunho reconfirmados em 26/10/2026. Esta alteração de código não altera produção, infraestrutura ou permissões.

## Comportamento

- O cabeçalho apresenta a marca GitHub, o nome da sessão validada e um estado textual. O verde indica uma sessão do Workbench autenticada pelo GitHub e recentemente conferida no servidor; não certifica o estado global do navegador em github.com, a instalação da App ou a permissão de um repositório.
- Expiração, demonstração, revalidação pendente, falha e saída não apresentam verde. Troca de conta ou de sessão exige recarregamento, para não herdar objetos e CSRF da sessão anterior.
- O novo GET de sessão retorna somente estado, nome, prazos e um marcador opaco sem valor de autenticação. Não retorna ID do usuário, cookie, token, hash armazenado ou CSRF. Faz somente leitura da sessão existente; não consulta o GitHub nem concede acesso.
- A sessão é conferida ao abrir/retomar a tela e, enquanto válida e visível, em intervalos de até 60 segundos. O prazo de expiração é aplicado no cliente. Toda operação privada continua autorizada no servidor.
- “Nova análise” real abre o catálogo, inclusive para repositórios ainda não cadastrados como projetos. O fluxo público legado continua disponível ao escolher explicitamente um projeto público já cadastrado.
- “Todos” significa a interseção de acesso da conta e da GitHub App. Páginas e instalações são carregadas explicitamente, com indicação de cobertura incompleta, filtros locais às páginas carregadas e retomada após falhas. Repositórios ausentes da instalação não são inventados a partir de projetos nem liberados automaticamente.
- Listar e selecionar não resolvem o SHA nem iniciam análises. Fixar versão, autorizar o projeto e solicitar processamento continuam etapas distintas, com confirmação, quotas, limites e revalidações existentes.
- Uma solicitação criada abre seu acompanhamento pelo ID na URL; consultar ou recarregar esse endereço não solicita outro job.

## Segurança e teste

Sessão de login e conexão da App têm estados independentes. Revogar a App limpa dados que dependem do acesso sem afirmar que o login terminou. Uma resposta antiga não pode reaparecer depois de troca de conta, instalação, perda de sessão ou revogação conhecida; isso inclui downloads, avisos e navegação derivados da resposta.

Testes locais exercitam os módulos reais com relógio/transporte sintéticos, SQLite em memória, respostas adiadas e renderização React no servidor. Incluem A→B, nova sessão A→A, expiração, erro e timeout, logout não confirmado, catálogo com mais de 100 repositórios, múltiplas instalações, cursor, rate limit e revogação. SSR e transporte sintético não equivalem a OAuth ou integração hospedada.

Homologação de desktop, mobile e teclado no build hospedado, login A/B em perfis separados, seleção real da App e processamento real continuam pendentes. Esta alteração não instala outra App, seleciona repositórios no GitHub, inicia janela, ativa Queue/cron, amplia acesso multiusuário ou chama IA.

Reverter estes arquivos reverte o código e a apresentação; não há migration ou limpeza de dados a reverter. A marca local Octicons mantém atribuição e licença no arquivo `web/components/GITHUB-MARK-LICENSE.txt`.
