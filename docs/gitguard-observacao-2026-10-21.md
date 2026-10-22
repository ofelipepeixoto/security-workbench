# GitGuard: observação pública e limites — 21/10/2026

Este documento registra uma consulta posterior ao
[estudo inicial](rea-estudo-2026-10-21.md). Distingue conteúdo efetivamente obtido,
declarações do fornecedor e inferências para o Workbench. **Não houve execução
do REA sobre GitGuard**, autenticação na conta externa, envio de repositório,
scan, descoberta de endpoints ocultos ou execução dos JavaScripts obtidos.
Nenhum HTML/JS bruto foi acrescentado ao projeto ou salvo nesta rodada.

## Origem e obtenção limitada

Horário da aquisição: **22/10/2026 às 00:22:20 UTC / 21/10 às 21:22:20 BRT**.
O HTML de login foi consultado às 00:23:21 UTC / 21:23:21 BRT.

- Somente GET HTTPS, com validação TLS padrão, sem cookies, token, credenciais
  ou corpo de requisição.
- Host permitido: apenas `www.gitguard.com.br`; redirecionamentos limitados ao
  mesmo host HTTPS. Acesso a esse host não autorizou outros subdomínios ou APIs.
- Teto de **1 MiB e 20 segundos por recurso**. Dois scripts first-party
  amostrados: os primeiros `src` únicos terminados em `.js` no HTML retornado.
- Links e nomes de arquivos vieram do HTML ou de resultados públicos do próprio
  domínio. Nenhum source map ou caminho privado foi adivinhado.
- Os bytes foram lidos e tiveram digest calculado em memória; não foram
  importados, avaliados como JavaScript ou gravados em arquivos nesta consulta.

Todos os quatro recursos abaixo responderam HTTP 200:

| Recurso | Bytes | SHA-256 |
| --- | ---: | --- |
| `https://www.gitguard.com.br/` | 231827 | `b963ca430266e5d7ee457f7aa1135c1d54f594ca86064e61a9492e5ccd0e2c64` |
| `/_next/static/chunks/1dd3208c-a9f562128d548c18.js` | 172835 | `359deca4a1b7762a78f0fd35eafb5f746e88a2e793056c0e1e2b819d83f8c0fa` |
| `/_next/static/chunks/1528-e91192ff1df10525.js` | 124715 | `725b2684726ca47ba899b6c30abccc37c6dcd768780b829f4000fa75c52f33b9` |
| `https://www.gitguard.com.br/login` | 43505 | `a84b1f2c676a87ef54f408888c41f31a3b70c963f20344ae4b5b55882ab3359c` |

Os caminhos relativos da tabela pertencem à origem HTTPS acima. O HTML principal
referenciou **23 scripts first-party**, dos quais **dois** foram obtidos. Essa
contagem não representa cobertura por bytes, funções, rotas ou comportamento.
A seleção também não certifica que os dois chunks contenham o código específico
das jornadas da aplicação.

Os dois digests JS são iguais aos do estudo inicial. O HTML tem bytes/digest
diferentes; isso, isoladamente, não identifica novo deploy ou sua causa, pois
conteúdo por rota/idioma e respostas dinâmicas podem variar. A leitura web da
página inicial resolveu `/en`; a aquisição direta acima recebeu a própria `/`.
Não tratar as duas representações como uma comparação controlada de versões.

## O que foi observado e o que é declaração

| Fonte primária | Conteúdo observado na página | Limite da conclusão |
| --- | --- | --- |
| [Página pública](https://www.gitguard.com.br/en) | Apresentação das categorias código, dependências, segredos e inventário, com demonstração visual de painel e exportação | Os exemplos públicos não comprovam achados reais, cobertura ou execução dos motores |
| [Login público](https://www.gitguard.com.br/login) | Opção “Continuar com GitHub” e links de termos/privacidade | Não houve clique, autenticação, aceite ou verificação de sessão/callback |
| [Termos](https://www.gitguard.com.br/en/terms) | Descrição de OAuth para identidade e autorização de repositórios pela GitHub App | Não comprova escopos efetivamente instalados ou acesso a privados |
| [Ajuda](https://www.gitguard.com.br/en/support) | Instruções de filtros, revisão, comparação, exportação selecionada, organizações e notificações | São fluxos documentados pelo fornecedor; não foram exercitados na área autenticada |
| [Central de Confiança](https://www.gitguard.com.br/en/confianca) | Declarações sobre containers separados, rede bloqueada, limites, retenção e permissões | Não é auditoria desses controles nem evidência de isolamento ou remoção efetivamente executados |

As páginas foram consultadas como referência funcional e técnica pública. Não
foram aceitos termos, instalada a App ou examinada infraestrutura privada. Não
copiar marca, identidade, textos, código ou dados pessoais dos exemplos.

## Adaptações autorais pertinentes

| Evidência | Necessidade compreendida | Adaptação ao Workbench | Aceite próprio |
| --- | --- | --- | --- |
| Login e documentação distinguem identidade e App | Evitar confundir entrar com conceder leitura de repositórios | Exibir estado de sessão, configuração, seleção autorizada e projeto como conceitos separados | Login OAuth não marca uma GitHub App como instalada nem libera privados |
| Ajuda organiza filtros, estados e histórico | Encontrar resultados e entender falha/parcialidade | Rotas próprias de projetos, achados, análises, comparação, relatório e ajuda contextual | Filtro opera sobre dados reais; recarga preserva estado persistido; erro não produz resultado limpo |
| Ajuda oferece revisão e comparação | Acompanhar decisões e mudanças entre execuções | Decisão humana rastreável e comparação de análises compatíveis | Ausência de nova detecção não confirma correção; fatos REA continuam candidatos de baixa confiança |
| Ajuda descreve supressões de fixtures, devDependencies e avisos sem patch | Organizar ruído sem perder risco relevante | Preservar esses contextos como informação e filtros explícitos | Não ocultar ou rebaixar automaticamente risco só pela classe de dependência ou ausência de correção |
| Central de Confiança separa executor do painel | Processar artefatos fora da aplicação pública | Executor local limitado e importação de projeção segura, preservando Workers/D1 | Rede, processos, filesystem e recursos efetivamente limitados; nenhum processo nativo no Worker público |

As adaptações são critérios autorais do Workbench, não alegação de equivalência
com o produto de referência ou de backend recuperado.

## REA: baseline existente e gate para artefatos externos

O [registro de execução](rea-execucao-2026-10-21.md) já contém a primeira análise
nativa **da fixture própria inerte**, retornada pelo operador: uma fonte de
342 bytes, grafo de quatro nós/três arestas, aplicação `complete` e semântica
`unknown`. Portanto não seria correto declarar que nenhuma análise REA ocorreu.
Esse resultado não abrange os scripts GitGuard e não atesta entradas arbitrárias.

O motor está fixado no commit
`3e7c6302233ecbcb9b92e43ee5a60337738961bd`, pacote declarado 6.4.0. O runtime foi
preparado por emissão limitada; o **typecheck completo do motor permanece
pendente**. Os gates de prontidão para entradas não confiáveis continuam
explicitamente false no resumo da fixture. Isso é separado do TypeScript do
aplicativo web.

O pacote mínimo de uma próxima prova deve ser preparado e revisado antes de
qualquer execução externa:

1. **Manifesto fechado de entrada:** URLs first-party exatas já observadas,
   horário, método, tipo de conteúdo, bytes/digests e motivo da seleção. Não
   ampliar para APIs, source maps, novos hosts ou conta autenticada por inferência.
2. **Proveniência do executor:** commit/lockfile e hashes do runtime conferidos;
   tratar o typecheck incompleto como gate explícito, com revisão da compatibilidade
   do parser antes de processar um pacote maior que a fixture conhecida.
3. **Isolamento comprovado para a chamada:** sem rede, entrada/runtime somente
   leitura, escrita temporária controlada, sem importar ou executar o JavaScript
   alvo; CPU, memória, processos, bytes e prazo impostos à família do engine.
   Pré-flight e flags isoladas não substituem a prova nessa chamada.
4. **Robustez e limites internos:** validar o contrato de saída e testar entradas
   estruturais controladas antes de conteúdo externo. Limitar profundidade e
   tamanho aninhados, strings, arrays, nós/arestas/observações, número de fontes,
   bytes totais e de cada arquivo. Falha de parser, estouro de recurso ou JSON
   truncado deve recusar importação ou preservar cobertura parcial explícita.
5. **Resultado mínimo revisável:** saída nativa privada com versão, digests,
   cobertura, omissões e horário; projeção validada pelo Workbench, sem código
   bruto, valores sensíveis ou caminhos absolutos. Revisão e persistência são
   testes posteriores e separados da execução do engine.

Esse roteiro **não autoriza entrada arbitrária nem libera o gate externo**.
O operador/engenharia devem conferir o manifesto específico contra o escopo já
autorizado e resolver os gates pendentes. A importação não deve atribuir aos arquivos externos verificação de
commit/repositório GitHub que não aconteceu. Fatos estruturais não são
vulnerabilidades confirmadas, e nenhum desses passos recupera backend privado.

## Contexto GitHub consultado nesta rodada

Em 21/10 às 21:20–21:23 BRT, `main` continuava em
`cf906efd01c832632f96eafac6555d55f4e39ff9`, com proteção e check público obrigatório
`test`. A integração retornou 403 para detalhes da proteção clássica; não foi
reafirmado o estado de todas as regras administrativas.

A pré-release pública [v0.1.0](https://github.com/ofelipepeixoto/security-workbench/releases/tag/v0.1.0)
continua datada de 17/10 e sua tag aponta para
`13ae2e563b4507c685bea5f64b2aa0a1d0b010ad`, diferente da main atual. Os PRs
#16–#32 consultados estavam abertos/em rascunho e seus heads tinham CI aprovada;
em particular, [#29](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39696905178)
e [#32](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39696901892).
Essas CIs existentes foram consultadas, não executadas novamente nesta observação.
Os issues [#13](https://github.com/ofelipepeixoto/security-workbench/issues/13) e
[#14](https://github.com/ofelipepeixoto/security-workbench/issues/14) permaneciam
abertos. Não foi obtida nova contagem autenticada Dependabot e nenhum número do
audit npm foi apresentado como equivalente ao painel GitHub.
