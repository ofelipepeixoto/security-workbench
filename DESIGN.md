# Security Workbench — direção de interface

## Objetivo e estado

Ajudar o proprietário a passar de um projeto autorizado a uma análise com
evidências, revisão humana e relatório, mantendo clara a diferença entre exemplo,
operação real, candidato e confirmação. **GitHub é o único meio de autenticação**;
não oferecer login ChatGPT, e-mail/senha ou outro provedor. A interface deve
responder: **qual conta GitHub estou usando, o que posso analisar e qual é a
próxima ação útil?**

Este documento orienta a evolução em construção. Não declara que todas as telas,
estados ou critérios já estejam implementados ou homologados. A base inspecionada
é o PR #17, commit `117f5f2cd5e96ec59dd357b368b1d823d57263a3`.
Ver [referência e matriz de UX](docs/referencia-funcional-e-ux.md) e
[autenticação GitHub](docs/autenticacao-github.md) para escopo e evidências.

## Identidade preservada

Preservar a base clara, neutros discretos, verde funcional e navegação azul escura
do produto existente. A direção clara/marfim não autoriza recolorir a aplicação
inteira: o CSS atual usa fundo `#f5f7fa`, não um marfim já implementado. Se neutros
mais quentes forem escolhidos depois, validar contraste e consistência antes de
substituir tokens. Não importar a paleta roxa, a marca ou textos do GitGuard.

| Token atual | Valor no CSS base | Uso |
| --- | --- | --- |
| `--bg` | `#f5f7fa` | Fundo claro do workspace |
| `--ink` | `#203047` | Texto principal |
| `--muted` | `#6c7c8e` | Texto de apoio; contraste depende de fundo/tamanho |
| `--line` | `#e3e9ef` | Divisores e bordas suaves |
| `--green` | `#0a7e6e` | Ação principal e destaque funcional |
| `--nav` | `#112136` | Navegação persistente |
| Superfície | Branco | Painéis, campos e cabeçalho |
| Foco atual | `#10a78d` | Contorno visível, a verificar nos contextos reais |

Tipografia atual: Inter quando disponível, seguida por fontes de sistema. Não
adicionar fonte remota ou biblioteca apenas para alterar aparência. Manter texto
comum legível; não reduzir os rótulos essenciais para acomodar mais cartões.

## Princípios de composição

- Uma ação principal por contexto: entrar com GitHub, adicionar projeto, iniciar
  análise ou salvar revisão. A demonstração é exploração secundária sem login,
  não uma alternativa de autenticação.
- Preservar listas, tabelas e detalhes existentes. Não acrescentar métricas
  decorativas, rankings, planos pagos ou badges de segurança.
- Exibir complexidade progressivamente: commit específico, cobertura e detalhes
  de integração ficam disponíveis sem sobrecarregar a primeira tarefa.
- Usar espaço, alinhamento e divisores antes de multiplicar cartões. Estados
  críticos devem ser legíveis no conteúdo, não apenas por cor.
- Manter a demonstração identificada em todas as áreas e impedir que uma revisão
  fictícia pareça persistida no servidor.

## Arquitetura de informação

Navegação principal proposta: **Visão geral · Projetos · Análises · Conta e acesso**.

| Área | Informação principal | Ação |
| --- | --- | --- |
| Visão geral | Projetos autorizados, análises, cobertura e próximos passos reais | Iniciar análise ou adicionar primeiro projeto |
| Projetos | Identidade estável, escopo, última análise ou ainda não analisado | Analisar versão autorizada |
| Análises | Estado, commit, origem, horário e cobertura | Revisar, comparar ou exportar quando elegível |
| Conta e acesso | Conta GitHub, sessão, restrição operacional e estado da integração | Entrar com GitHub/sair e consultar orientação de revogação |

Organizações, bancos, notificações e monitoramento são expansão planejada;
não devem ganhar controles que aparentem funcionamento antes do backend.

## Estados de acesso independentes

| Dimensão | Estados a distinguir | Regra de apresentação |
| --- | --- | --- |
| Conta GitHub | Anônima, autenticada, expirada, erro do GitHub | Informar identidade verificada e próximo passo; jamais exibir token; não oferecer outro provedor |
| Permissão operacional | Proprietário autorizado, conta sem permissão, configuração pendente | Autenticação não concede acesso; o servidor decide |
| GitHub App | Não configurada, instalada/verificada, revogada ou verificação falhou | Só usar “instalada” após confirmação real; login não instala App |
| Acesso a repositórios | Fora do escopo, seleção autorizada, acesso revogado | Não inferir acesso privado/organizacional por username ou login |
| Cadastro no Workbench | Não cadastrado, identidade conferida, escopo confirmado | Cadastro não prova análise nem monitoramento |
| Análise | Ainda não analisado, em andamento, concluída, parcial, falha/interrupção | Exibir cobertura e motivo seguro; falha não é resultado limpo |
| Monitoramento | Não implementado/configurado, habilitado, pausado, falha | Só mostrar controle ativo com runtime e autorização reais |

Enquanto a App de repositórios não existir, a interface deve comunicar essa
ausência e preservar a aquisição pública limitada. Um botão de “conectar” não
pode simular instalação ou alterar escopo implicitamente.

## Acesso e primeiro uso

- Disponibilizar a demonstração pública sem confundi-la com sessão autenticada.
- Apresentar uma única ação de autenticação: **“Entrar com GitHub”**. Quando o
  fluxo não estiver configurado, informar a pendência real e manter a demonstração
  pública; não exibir fallback ChatGPT, senha/e-mail ou outros provedores.
- A seleção da conta ocorre no GitHub. O retorno deve conferir o ID estável e a
  permissão do proprietário; outra conta válida não obtém operação privada.
- Após login, apresentar dados mínimos da conta e orientação para o primeiro
  projeto. Telefone, empresa e questionários não são pré-requisitos sem finalidade
  demonstrada.
- Tratar cancelamento do consentimento, callback inválido, sessão expirada e
  conta sem permissão com mensagem específica e recuperação segura.
- A saída deve invalidar a sessão correspondente. Ocultar o painel ou trocar um
  estado de React não equivale a logout.
- Explicar separadamente logout, revogação OAuth, suspensão/desinstalação da App
  e exclusão de dados. Não adicionar ações destrutivas sem implementação,
  autorização e procedimento de retenção/recuperação próprios.

As seis capturas adicionais reforçam a entrada simples e a separação entre
Applications/OAuth Apps, instalação, permissões e dados locais. A interface autoral
não deve copiar permissões de escrita de PRs/checks/status ou seleção de todos os
repositórios da referência: a leitura estática atual exige escopo mínimo. Não
replicar elementos comerciais ou tipos de login que apareçam nas referências.

## Semântica de segurança e microcopy

- Projeto sem execução: **“Ainda não analisado”**.
- Resultado parcial: **“Cobertura parcial”**, com arquivos/bytes e omissões.
- Nenhum candidato: **“Nenhum candidato nos arquivos lidos”**, seguido da limitação.
- Suspeita detectada: **“Candidato — exige revisão humana”**.
- Falha: **“Análise não concluída”**, com orientação de retomada sem repetir ações
  de forma cega.
- Comparação: não detectar novamente não comprova correção.
- “Confirmado” exige revisão humana; “correção verificada” exige evidência própria.
- Contagem histórica de detecções não é contagem de pendências. Confiança da regra
  não é severidade do impacto. Não inventar CVSS ou nota de segurança.

## Componentes e procedência

Preservar os componentes React e CSS autorais existentes: navegação, painéis,
tabela, modal, aviso, campos e revisão. Reutilizar a iconografia Lucide já presente
e manter seus avisos de licença aplicáveis. Nenhum código, asset ou kit proprietário
da referência foi incorporado por este documento. Não há necessidade demonstrada
de adicionar outro design system para esta fatia.

## Acessibilidade e responsividade

Alvo de projeto: WCAG 2.2 AA, sujeito a verificação; não há declaração de
conformidade. Preservar o link de salto e a semântica existente, verificando:

- Rótulos persistentes para campos, estado atual da navegação e nomes acessíveis
  para ícones/ações; placeholder não substitui label.
- Teclado, foco visível e não encoberto, retorno de foco ao fechar modal e ordem
  de leitura coerente.
- Mensagens de erro e status anunciáveis, sem revelar segredos; não depender só
  de verde, âmbar ou vermelho.
- Reflow em mobile, zoom e quebra segura de nomes, IDs e commits. Tabelas podem
  rolar no próprio contêiner sem tornar a página inteira inutilizável.
- Links de OAuth em navegação de topo e comportamento de retorno previsível.
- Preferência de redução de movimento e controles funcionais sem efeitos.

O CSS base contém breakpoints e `prefers-reduced-motion`. Isso não substitui teste
manual, inspeção assistiva ou medição de contraste na interface final.

## Critério de aceite e registro de evidência

Uma entrega deve distinguir o que foi especificado, implementado, testado com
mocks, validado localmente, integrado realmente e publicado. Para esta fase,
registrar os testes de autenticação/autorização e a inspeção desktop/mobile da
interface construída, além de tipos/build. Capturas devem usar dados fictícios
ou metadados expressamente seguros, sem dados pessoais dos anexos ou relatórios
privados. Não afirmar ganho de conversão, acessibilidade ou eficácia de segurança
apenas por opinião visual.
