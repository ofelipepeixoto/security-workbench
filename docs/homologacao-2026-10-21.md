# Retomada da homologação — 21/10/2026

Refs #14. Documento de metadados, sem relatórios reais, bancos ou credenciais.

## Estado reconciliado

- Release `v0.1.0` existente, pública e experimental (prerelease), publicada em
  17/10. A leitura nesta sessão não repetiu os testes históricos.
- `main` em `cf906efd01c832632f96eafac6555d55f4e39ff9`, protegida, com check
  obrigatório `test`. PRs #10/#11/#12/#15 integrados; estudos #3/#4 em rascunho.
  Último run da main consultado: `39073015416`, sucesso em 17/10.
- Site `appgprj_6ad3cd3180a481918c0f7b58dfd6f3e7`, audiência pública, versão 10,
  fonte `8dcf2207c8b2474c72c61cd34ebd9adfa4b7a38c`; deploy
  `appgdep_6ad3ee642fdc81918344d274bc49d290` confirmado `succeeded`.
  Domínio personalizado abriu. Fonte Sites recuperada sem edições: a página,
  a API e a interface conferidas coincidem com o adaptador GitHub.
- Não havia checkout Workbench neste workspace. Clone novo em diretório próprio,
  sem substituir projetos existentes; status inicialmente limpo, branch main,
  remote GitHub público conferidos. Nenhum AGENTS.md encontrado no checkout.

## Resultado observado no navegador

| Critério | Resultado desta sessão |
| --- | --- |
| Demonstração anônima | Exibe dados fictícios e aviso de que nada é salvo/analisado no servidor |
| Autenticação legítima | Login oficial com a conta proprietária disponível; painel real abriu |
| Persistência histórica | Projeto REA e análise de 17/10 continuam visíveis após login e recarga |
| Nova aquisição real | Tentativa em 21/10, 15:15 BRT, REA ID 1417322346, commit solicitado 3e7c6302233ecbcb9b92e43ee5a60337738961bd; falhou como acquisition_failed, prefixo do run 6b2ce219 |
| Causa visível adicional | Conferir cadastro do próprio Workbench exibiu "A cota pública do GitHub foi atingida"; não registrou nova autorização |
| Candidato de fixture | Fixture publicada apenas na branch do PR #16, commit b6652136a1047ff11b11c348608a0db354e2e0c1; análise hospedada bloqueada na conferência de cadastro |
| Revisão e comparação reais novas | Não homologadas: não houve duas novas análises concluídas nem candidato novo disponível |
| Download | Clique no relatório histórico do REA; evento de arquivo não confirmado dentro do prazo de 15s. Não afirmar download concluído ou conteúdo baixado inspecionado |
| Sessão separada sem identidade | Navegação direta à API exibiu somente erro "Entre para acessar o Workbench", sem dados reais. Status HTTP não foi instrumentado nessa superfície |
| Transporte HTTP do workspace | Retornou 403/1010 antes da aplicação; não comprova resposta de autorização da API nem indisponibilidade global |

`acquisition_failed` sozinho não identifica a causa interna daquela tentativa.
O esgotamento de cota foi observado **na conferência seguinte**, não inferido a
partir do código genérico. Não foram feitas tentativas cegas de repetir scans ou
contornar a cota/autenticação. A análise falha permanece explícita no histórico;
não é resultado limpo. A análise histórica continua com cobertura parcial (20
arquivos / 72.882 bytes, nenhum candidato nesse recorte), não uma nova validação.

## Menor passo de retomada

Após a renovação da cota pública, usar a sessão legítima do proprietário,
conferir `ofelipepeixoto/security-workbench` ID 1419403320 e autorizar leitura
estática. Fixar o commit de fixture acima, executar duas análises independentes,
revisar **apenas** o candidato artificial como falso positivo, recarregar e conferir
persistência, comparar e confirmar o arquivo Markdown efetivamente salvo.
Um candidato artificial nunca deve virar vulnerabilidade confirmada.

Antes de considerar a área homologada para operação individual, revisar o PR #17
e configurar a identidade específica do proprietário deste Site no servidor.
Nenhuma permissão foi ampliada; a configuração não foi inferida pelo ID da conta
do painel. Depois de publicar mudança revisada, repetir também a recusa de outro
usuário autenticado e do anônimo para projetos, análise, revisão e relatório.

Sem tokens/senhas no chat. Se a cota compartilhada impedir operação regular,
avaliar em mudança própria a GitHub App de leitura mínima do contrato existente;
o conector do chat não fornece automaticamente credencial ao Worker.

Nenhum merge, deploy, banco novo, migração, infraestrutura paga, IA paga ou
integração REA executável foi realizado nesta sessão. Expansões permanecem atrás
dos gates descritos em proximas-integracoes.md.
