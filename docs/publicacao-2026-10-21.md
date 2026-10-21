# Publicação e limites — 21/10/2026

O Site publicou a **versão 12** após autorização do proprietário. A demonstração
pública e a página de acesso estão disponíveis em
https://security-workbench.camaleaoweb3.com.br/. O fluxo oferecido pela aplicação
é exclusivamente GitHub. **O login real ainda não foi homologado e permanece
desabilitado por configuração.** Publicação de código não equivale à conclusão
da autenticação ou da homologação operacional.

O [relatório consolidado de pendências](pendencias-2026-10-21.md) reúne os próximos
gates, os responsáveis pela retomada e os critérios de aceite, incluindo o REA.

## Artefato publicado

| Item | Estado confirmado |
| --- | --- |
| Versão 12 | Deploy `succeeded` em 21/10/2026, às 19:53:34 UTC / 16:53:34 BRT |
| Fonte Sites | `236082902476a9c943629b1005a23b01682c7252` |
| Deployment inicial | `appgdep_6ad9182ceb0c8191b70ed6c779f1a763` |
| Republicação da mesma v12 | `appgdep_6ad91b6813f08191bf3a8e0491c0a2a1`, `succeeded` às 20:07:20 UTC / 17:07:20 BRT |
| Revisão atual do ambiente | `2`, preservando fonte e audiência |
| Audiência | Demonstração pública; operação real exige autenticação e autorização no servidor |
| Versão 11 anterior | Publicada nesta sessão às 19:48 UTC / 16:48 BRT; substituída pela versão 12 |
| GitHub | Não houve merge dos PRs #17–#21; `main` e a release permanecem independentes desta publicação do Site |

A versão 12 corrigiu a navegação observada em produção na versão 11 entre `/`
e `/access`: as ações relevantes passaram a usar âncoras com navegação de topo.
O domínio e o percurso entre essas páginas foram novamente verificados. Isso não
comprova a navegação posterior ao OAuth, que depende da configuração pendente.

O artefato incorpora React, React DOM e renderer RSC 19.2.8, sharp 0.35.5 e
source-map-js 1.2.2. A correção dessas dependências não significa ausência de
outras correspondências no inventário; a triagem de risco residual continua
documentada separadamente.

## Verificação efetivamente realizada

- Passaram **56 testes Node**, **17 testes Python**, a checagem TypeScript, o lint
  do código novo e o build no ambiente de validação. As CIs dos PRs #20 e
  [#22](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39666451867)
  foram aprovadas.
  Os testes com respostas simuladas do provedor não são autenticação GitHub real.
- A interface pública foi inspecionada também com largura mobile de **390 px**.
  Isso não representa teste com usuários, auditoria completa de acessibilidade
  ou validação de todas as jornadas em dispositivos reais.
- Em HTTPS, sem cookies, as chamadas **GET e POST a `/api/workbench` retornaram
  401**, com `Cache-Control: no-store`, às 19:58:32 UTC / 16:58:32 BRT. Esses casos
  confirmam a recusa anônima observada; não equivalem a testar uma sessão legítima.
- Nas mesmas condições, **GET `/api/auth/github/start` retornou 503** com o login
  desabilitado. A página de acesso mostrou a configuração pendente, sem simular
  sucesso nem oferecer outro provedor.
- Após aplicar a revisão 2, às 20:09:05 UTC / 17:09:05 BRT, a recusa anônima
  permaneceu: GET `/api/workbench` 401 e início OAuth 503, ambos `no-store`.
- O REA **não foi executado** nesta publicação. Não houve teste intrusivo contra
  plataforma externa, integração permanente do REA ou ampliação para repositórios
  privados, organizações, bancos ou monitoramento automático.

## OAuth: preparado, com homologação real pendente

Foi criado o aplicativo OAuth dedicado no GitHub e configurado o callback
`https://security-workbench.camaleaoweb3.com.br/api/auth/github/callback`.
A identidade GitHub do proprietário foi verificada. **Ainda não foi gerado um
Client Secret.** `GITHUB_LOGIN_ENABLED` permanece `false`.

O `WORKBENCH_OWNER_ID` foi configurado como segredo na revisão 2. A leitura
administrativa limitada à tabela de projetos localizou o registro legado do
repositório `ofelipepeixoto/rea`, ID imutável `1417322346`, autorizado em
17/10/2026 às 20:19:10 UTC. O conector GitHub confirmou independentemente esse
repositório e seu proprietário. Foi preservada a chave já persistida, sem
reatribuir ou mesclar registros. O valor não foi copiado para Git ou logs.
Isso não comprova equivalência com a identidade nativa da sessão atual nem
homologa o OAuth: o vínculo é uma configuração administrativa do servidor para
conservar o histórico sob o login GitHub autorizado. Não foi usado cadastro
automático, e-mail ou ID do painel Sites para eleger um novo proprietário.

O inventário D1 confirmou as duas tabelas de autenticação após o deploy;
seus registros não foram consultados. A republicação da mesma versão aplicou
a revisão 2 sem habilitar o login. O menor passo restante é gerar/configurar o
Client Secret por meio protegido. Não publicar o valor no chat, fonte, frontend
ou logs. Nenhuma tela específica de configuração do Sites é presumida aqui;
usar somente um mecanismo protegido efetivamente disponível. A conexão do
navegador passou a expirar durante o fechamento; não houve nova geração de
credencial ou tentativa de contornar essa indisponibilidade.

Depois de conferir a configuração, realizar a homologação autorizada do fluxo:
entrada pelo GitHub, retorno ao mesmo histórico do proprietário, conta sem
permissão, consentimento negado, callback inválido/reutilizado, expiração e logout.
Só então retomar duas análises de commits fixados, revisão persistida, comparação
e download confirmado. O [guia de autenticação](autenticacao-github.md) detalha os
controles e os casos de aceite; distinguir seu roteiro preparatório dos resultados
de publicação registrados neste documento.

## Riscos e reversão

O limite global de **20 fluxos OAuth pendentes** limita recursos, mas também pode
ser ocupado e causar indisponibilidade temporária de novos logins. Não há evidência
de teste de exaustão em produção; proteção de disponibilidade exige avaliação
própria antes da abertura operacional.

Desabilitar a flag bloqueia temporariamente o uso do login, mas **não constitui
revogação durável das sessões já emitidas**: elas podem voltar a ser válidas após
reativar a flag, se não tiverem expirado ou sido revogadas por outro controle.
Uma suspensão durável exige revogação explícita, não apenas alternar a flag.

Preferir uma nova versão revisada com a operação real suspensa pela flag,
preservando a demonstração e o schema aditivo. Não apagar as tabelas novas ou o
histórico para reverter a interface. Voltar à versão 10 exige decisão explícita
do proprietário, pois ela usa o acesso ChatGPT anterior e não atende à orientação
final de autenticação exclusivamente GitHub. Não restaurar esse provedor como
fallback automático.

Captura da [verificação mobile](publicacao-mobile-2026-10-21.jpg) feita na v11 durante esta publicação; os estilos e a tela de projetos foram preservados na v12. A alteração entre elas afeta a navegação da página de acesso.

[Registro HTTP sem cookies da versão 12](publicacao-verificacoes-2026-10-21.json): respostas e horário, sem identidade, credencial ou dados de projetos.
