# Pendências e próximos aceites — 21/10/2026

Este registro fecha a publicação autorizada, sem confundir código publicado,
configuração e homologação. A demonstração continua pública e fictícia. Nenhum
merge, ampliação de acesso, serviço pago ou integração operacional nova é inferido
da publicação.

## Estado confirmado nesta conversa

- Site **v12**, fonte `236082902476a9c943629b1005a23b01682c7252`, com ambiente
  **revisão 2** aplicado em deploy `succeeded` às 20:07:20 UTC / 17:07:20 BRT.
- Página de acesso exclusivamente GitHub, sessão/expiração/logout no servidor,
  restrição ao proprietário, busca de projetos, filtro do histórico e “Conta e
  acesso” publicados. A navegação acesso/demonstração foi corrigida em produção.
- OAuth App dedicada criada. Origem, Client ID, ID GitHub e chave interna legada
  do proprietário configurados no servidor. A chave interna é segredo e não é
  reproduzida neste documento. **Client Secret ausente; login flag false.**
- D1 confirmou as tabelas aditivas de autenticação; suas linhas não foram lidas.
  Nenhum projeto ou análise foi reatribuído para configurar o proprietário.
- React/DOM/RSC **19.2.8**, sharp **0.35.5** e source-map-js **1.2.2** incorporados
  no artefato publicado. Isso não encerra a manutenção das demais dependências.
- Candidato combinado aprovado em 56 testes Node, 17 Python, TypeScript e build.
  [CI do PR #22 aprovada](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39668067881)
  no commit `74920b432b1a7b4950f5fe6e22a449691764d4df`.
- Recusas HTTPS sem cookies registradas: GET/POST à API 401; início OAuth 503
  enquanto desabilitado. Após revisão 2, GET 401/start 503 novamente às 20:09 UTC.
- `main` e pré-release `v0.1.0` continuam separados da fonte Sites. Não houve merge.
  Os [issues #13](https://github.com/ofelipepeixoto/security-workbench/issues/13) e
  [#14](https://github.com/ofelipepeixoto/security-workbench/issues/14) seguem abertos.

## Gates para encerrar a entrega operacional

O proprietário realiza a entrada da credencial por mecanismo protegido. A
engenharia retoma configuração, homologação e correções; o proprietário mantém
a decisão humana sobre achados, merges e ampliação de escopo. Nada exige enviar
segredos ou o identificador interno no chat.

| Ordem | Pendência | Bloqueio ou risco | Critério de aceite |
| --- | --- | --- | --- |
| 1 | Salvar `GITHUB_LOGIN_CLIENT_SECRET` como segredo no servidor | Credencial ainda não gerada/configurada; nunca enviar no chat | Configuração protegida presente, demais chaves preservadas, revisão aplicada por deploy de versão salva |
| 2 | Homologar login GitHub real | Fluxo externo/cookies/callback ainda sem prova completa hospedada | Proprietário entra, mantém histórico esperado, nenhuma exigência de login ChatGPT operacional; falha desativa a flag e fica documentada |
| 3 | Homologar fronteiras e sessão | Testes simulados não substituem provedor/hospedagem | Conta não autorizada, negação de consentimento, callback inválido/reutilizado, expiração e logout recusam acesso indevido; recarga não restaura sessão revogada |
| 4 | Concluir issue #14 | Depende do login legítimo | Duas análises próprias de commits fixados, identidade/cobertura/horário/limites; candidato real revisado e persistido após recarga; comparação e Markdown baixado/inspecionado |
| 5 | Completar prova de isolamento | Recusa HTTP já observada cobre somente os casos registrados | Sessão anônima não lê projetos, análises ou relatórios reais; outro proprietário não acessa dados cruzados |
| 6 | Concluir issue #13 por grupos | Alertas residuais; inventários GitHub e npm têm bases diferentes | Fontes oficiais, versões/caminhos/alcance reconciliados, patches pequenos, lockfile/CI e versão hospedada conferidos em cada mudança |
| 7 | Revisão humana e integração GitHub | Site contém combinação ainda não incorporada à main/release | Revisar bases e sobreposição dos PRs, aprovar ordem de integração, executar CI aplicável e decidir merge/release; sem merge automático |
| 8 | Fechar qualidade e operação | Lint global legado e validação assistiva ainda incompletos | Corrigir erros de Hooks existentes; teclado/foco/zoom/mobile e mensagens testados; limites, retenção e revogação documentados e verificáveis |

Se duas análises não produzirem candidato, registrar a ausência e usar a fixture
segura em repositório próprio para testar revisão. Nunca produzir um achado
inventado nem converter uma observação estrutural em vulnerabilidade confirmada.

O lint global legado registrou quatro erros e dois avisos em Hooks; o código novo
de acesso e sua correção de navegação passaram no lint direcionado. A prova mobile
de 390 px não equivale a auditoria de acessibilidade ou teste com usuários.

## Risco residual de dependências e autenticação

O painel GitHub observado nesta conversa mostrava **38 alertas** (16 altos,
15 moderados, 7 baixos, nenhum crítico), mas indicava processamento em 17/10.
Não há evidência de recálculo desse painel após a publicação: as correções estão
no Site e em PRs, ainda não em `main`. O conector não fornece o endpoint Dependabot
e a conexão do navegador passou a expirar no fechamento. O próximo responsável
deve consultar novamente o painel autenticado, sem descartar alertas em massa.

O snapshot npm inicial tem **58 entradas / 52 GHSAs / 14 pacotes**, após os
primeiros patches sharp/source-map-js e **antes** do patch RSC.
A [nova consulta do lockfile final](dependencias-audit-pos-publicacao-2026-10-21.json),
concluída às 20:14 UTC, apontou **57 entradas / 51 GHSAs / 13 pacotes**:
27 altas, 22 moderadas, 8 baixas, nenhuma crítica. Package.json e lockfile foram
comparados byte a byte com a fonte Sites publicada. O comando audit terminou com
código 1 por existirem correspondências, sem falha de build/teste. Esse inventário
inclui ferramentas; não comprova que cada caminho participa do runtime hospedado.
Não deve ser subtraído dos 38 alertas GitHub nem interpretado como exploração.

Manutenção residual: undici/ws; Vite; js-yaml, brace-expansion, braces e fast-uri;
browserslist/baseline-browser-mapping; Babel/esbuild; image-size/fflate. A classificação
devDependencies não comprova ausência de um pacote no servidor. O snapshot não
informou patch para braces; avaliar o pacote pai e as entradas, sem ocultar a
exceção. Uma correspondência de versão não demonstra exploração.

O teto global de 20 fluxos OAuth pendentes pode causar indisponibilidade temporária.
Avaliar mitigação e comportamento antes da abertura operacional. Desligar a flag
suspende acesso, mas reativá-la pode restaurar sessões ainda válidas: não é
revogação durável. Logout exige revogação confirmada em D1. Reversão deve conservar
dados/schema e GitHub exclusivo; não restaurar o acesso ChatGPT da v10 como fallback.

## Engenharia reversa: o que existe e o que falta

O [estudo estático](rea-estudo-2026-10-21.md) inspecionou o REA no commit fixado
`3e7c6302233ecbcb9b92e43ee5a60337738961bd`, licença, CLI, parser e limites. Também
houve leitura limitada de HTML/JavaScript públicos de referência, sem executar o
alvo, acessar conta ou enviar repositórios. **O REA não concluiu uma análise e não
foi integrado ao Workbench.** Runtime compilado ausente e namespaces de isolamento
sem rede indisponíveis bloquearam essa execução. Nenhuma restrição foi contornada.

O passo a passo de ativação deve ocorrer depois dos gates anteriores:

1. Disponibilizar ambiente de execução que imponha isolamento sem rede; não
   executar o analisador dentro do Worker público nem contratar VPS automaticamente.
2. Preparar runtime rastreável a uma versão/commit do REA, preservar licenças e
   conferir diferença entre o checkout estudado e o pacote npm.
3. Aceitar somente arquivos JavaScript locais fornecidos pelo operador, com
   digest e limites externos de bytes, arquivos, tempo e memória. Não executar o
   código alvo, instalar suas dependências ou usar o modo de navegador/runtime.
4. Testar uma fixture benigna e outra com efeitos que não podem acontecer.
   Verificar ausência de rede, escrita indevida e execução de código do alvo.
5. Conferir uma saída estática real, cobertura e omissões; adaptar fatos para
   candidatos com origem/confiança e revisão humana, em PR próprio.

Análise estática pode reconstruir estrutura observável dos artefatos fornecidos;
não recupera código privado do servidor nem garante cobertura completa. Observar
um site em execução é outra modalidade e exigiria nova definição explícita do
escopo, pois a autorização atual proíbe executar o código do alvo.

## Backlog posterior, sem ativação automática

| Próxima fatia | O que falta | Aceite mínimo |
| --- | --- | --- |
| Sites explicitamente autorizados | Adaptador com proteção SSRF, política de domínio/caminhos e revalidação DNS/IP/redirecionamentos | HTTPS válido, limites, bloqueio de rede privada/metadados, falha relatada como cobertura parcial; início controlado no domínio autorizado |
| Repositórios privados e organizações | GitHub App própria de leitura mínima, instalação e seleção verificadas | Credencial curta só no servidor; revogação, expiração, 403, isolamento e repository/installation IDs testados; OAuth de login não substitui App |
| Advisories/CVEs dos alvos | Inventário/versionamento, fonte e intervalos com proveniência | Distinguir inventário, correspondência e confirmação humana; limites e cache; Dependabot do Workbench não cobre os alvos |
| UX e métricas | Agregados reais por decisão, filtros de achados/atividade e duração fundamentada | Nenhum contador fictício; persistência e contagem sem duplicação; validação de correção separada de “não detectado novamente” |
| Monitoramento/webhooks | Runtime assíncrono, assinatura, idempotência, pausa e revogação | Replay/duplicação/falha limitados e testados; sem execução recorrente implícita |
| Bancos, Supabase, n8n, VPS e agentes/MCP | Necessidade, custo, contratos, isolamento e operação demonstrados | Projeto e autorização próprios, restauração/reversão testadas; nenhuma despesa ou IA paga automática |

Os estudos #3/#4 e a fixture #16 não constituem funcionalidades publicadas por
estarem em branches. A combinação #22 inclui bases de #17/#20, patches #18/#19 e
documentação #21; revisar sobreposições antes de integrar para não reaplicar as
mesmas mudanças. O [roadmap](proximas-integracoes.md) mantém os contratos de cada
expansão. A matriz UX registra a base anterior examinada: busca de projetos,
filtro do histórico e “Conta e acesso” já foram implementados depois dela.

O [guia de login](autenticacao-github.md) contém o passo manual imediato. O valor
do segredo não deve ser enviado; basta informar **“segredo configurado”**. Manter
a flag false até retomar a homologação autorizada. O identificador interno do
proprietário já está configurado e não precisa ser enviado ou recriado.
