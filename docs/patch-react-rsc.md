# Patch do renderer RSC

Refs #13. Camada dependente do PR #18; revisar e integrar #18 primeiro.

O audit novo identificou `react-server-dom-webpack 19.2.6`, embora o painel
Dependabot ainda mostrasse um inventário de 17/10. O plugin RSC inclui esse pacote
no servidor: a classificação devDependencies não basta para descartar alcance.
O [aviso oficial do React](https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g)
descreve consumo excessivo de memória/CPU em endpoints de Server Functions e
confirma 19.2.8 como versão corrigida da linha 19.2. Não foi executada exploração
ou teste de exaustão contra o Site.

Atualizar `react-server-dom-webpack` para 19.2.8 e fixar também a cópia transitiva
do plugin. Os peerDependencies oficiais exigem react/react-dom ^19.2.8; por isso
os dois pacotes passam juntos de 19.2.6 para 19.2.8. Não alterar Next/Vinext nem
atribuir a esse patch uma auditoria das cópias compiladas internas de outros
frameworks. O lockfile é gerado com pnpm 11.25.0.

Esta mudança permanece para revisão. Antes de publicar, portar a fonte revisada
para o repositório Sites, repetir os checks da combinação final com #17 e registrar
versão/commit do deploy. Não descrever o Site v10 como corrigido por este PR.
Reversão antes de publicar: fechar o PR sem integrar; bancos não são alterados.
