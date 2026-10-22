# Security Workbench — demonstração pública e área de operação protegida

## Estado revisável do MVP v2

A implementação controlada acrescenta catálogo GitHub App, identidades por ID
numérico, autorização por objeto e jobs duráveis. **As flags nascem desligadas;
isso não está publicado nem homologado com duas contas reais.** O histórico abaixo
descreve entregas anteriores e não substitui a
[matriz atual de implementação e aceite](../docs/mvp-v2-entrega.md).
Consulte a [decisão D1](../docs/adr-mvp-v2.md), o
[roteiro da App](../docs/github-app-piloto.md) e o
[manifesto dos motores](../docs/mvp-v2-cobertura.md). Nenhuma migração de produção,
App, credencial persistente ou consumidor hospedado foi ativado nesta entrega.

Adaptador web do núcleo Python/SQLite do Workbench, na linha do PR #6. O runtime de Sites usa JavaScript/Workers; o núcleo original e os bancos locais permanecem preservados.

## Jornada

Visitante: abrir a [demonstração pública](https://security-workbench.camaleaoweb3.com.br/) sem login e selecionar **Explorar exemplo**. Proprietário autenticado: adicionar link de repositório público próprio → conferir identidade e autorizar escopo → analisar versão atual ou SHA específico → revisar candidatos → baixar Markdown → comparar histórico.

O modo **Demonstração** usa dados fictícios em memória: não analisa repositórios nem grava dados no servidor. A audiência do Site é pública, mas a API da operação real exige sessão GitHub do proprietário no servidor, protege POST por origem/CSRF e vincula os registros ao owner canônico. Publicar o código-fonte é decisão separada da visibilidade do Site.

## Escopo

- API GitHub pública, somente namespace `ofelipepeixoto`, sem token, cookie, redirect ou execução de código alvo.
- Nome/ID estável autorizados; commit e hashes dos blobs verificados.
- Até 20 arquivos, 2 MiB totais, 256 KiB por arquivo, prazo 45s, 100 candidatos e 500 dependências. Limites/truncamentos geram cobertura parcial.
- Possível credencial atribuída e permissões amplas de Actions. Inventário sem CVEs. Candidatos exigem revisão humana.
- Histórico, revisões e relatórios em D1 isolado do próprio site. Os projetos Supabase de outros sistemas não são usados ou alterados.
- Repositórios privados por GitHub App ainda não estão integrados. A hospedagem importa Evidence REA limitado e persiste somente a projeção segura; o motor permanece local, sem execução no Worker.

## Verificação observada em 17/10/2026

23 testes Node locais aprovados: `node --test tests/*.test.mjs`. TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false`. Fixture simples confirma textos, fingerprints, inventário e digest iguais ao Python PR #6; não prova paridade integral. No runtime Workers, o scanner usa `redirect: manual` e rejeita toda resposta diferente de HTTP 200, sem seguir o destino de redirecionamentos. Se a cota pública compartilhada do GitHub acabar, a interface mostra o bloqueio e não cria uma autorização nem análise vazia.

Navegador: exemplo fictício de nova análise, revisão para falso positivo e comparação. Não equivale a login e persistência hospedados homologados.

[CI real do adaptador](https://github.com/ofelipepeixoto/security-workbench/actions/runs/39063959367): 20 arquivos / 72.882 bytes do REA, cobertura parcial, zero candidatos e dependências nesse subconjunto. Digest `a2b6013d0338a03d9017f979a814ef781d6066d98080849a0f28d50943e9370b`.

## Fonte e operação

Veja `PROVENANCE.md`. A base é o starter oficial Sites 1.0.1. O build segue `node <plugin-root>/scripts/build-site.mjs`. A migração `drizzle/0000_careful_shriek.sql` foi gerada por `drizzle-kit generate`, é schema-only e deve ser aplicada apenas ao banco de QA ou pelo fluxo nativo de publicação.

`tests/live-smoke.mjs` é separado dos mocks e restrito ao Actions do Workbench. Fixa REA ID `1417322346` e commit `3e7c6302233ecbcb9b92e43ee5a60337738961bd`, sem conteúdo alvo nos logs.

Registro histórico de 17/10: versão 10 publicada no Site com domínio e HTTPS ativos, atualizando `next` para 16.3.8. O proprietário executou uma análise parcial real do REA na versão anterior; revisão de candidato real e comparação de duas análises hospedadas continuam sem homologação na versão atual. [Estado verificado e limites](../docs/sistema-web-privado.md). Credenciais, bancos, fonte alvo e estado de QA ficam fora do pacote.

## Continuidade em 21/10/2026

A versão 13 foi reconferida antes desta revisão. O código posterior organiza resultado/revisão e omissões REA, preserva identidade da retentativa no formulário aberto e evita limpeza de transporte sem prazo. Implementação, versão efetivamente publicada e homologação estão discriminadas no [registro de continuidade](../docs/homologacao-2026-10-21.md). Login não instala a futura GitHub App; helpers de conectores do starter não são agentes operacionais.
