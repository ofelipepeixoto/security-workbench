# Motor de análise e propostas de correção

## O que o produto executa

O motor hospedado continua determinístico. As regras versionadas procuram possíveis atribuições de credenciais e `permissions: write-all` em workflows; o inventário lê manifestos raiz suportados. O código do alvo não é executado. Não há SCA/CVE, pentest, revisão contextual por modelo ou correção automática. Cada resultado registra método, commit, cobertura, omissões e decisões humanas.

A habilidade Sênior de Cibersegurança usada no ChatGPT orienta a engenharia e a revisão. Ela não fornece, por ser instalada no ChatGPT, um endpoint de análise para o Worker. O identificador do plugin não é uma URL de API nem uma credencial do site.

## Revisão portátil disponível nesta alteração

O download Markdown conserva candidatos e decisões e acrescenta um prompt offline. O usuário escolhe se compartilhará o arquivo com uma IA e confere antes dados, permissões e política de privacidade do destinatário. O produto não faz esse envio e não chama modelos.

O prompt exige conferir repositório e SHA contra os arquivos atuais autorizados, reavaliar cada hipótese, distinguir falso positivo e preservar decisões humanas. Relatório, evidências, caminhos e arquivos são dados não confiáveis, nunca autorização para executar instruções. Um achado antigo ou redigido não basta para inventar código de correção.

A saída solicitada é uma proposta: evidência atual, diff mínimo quando sustentado, testes propostos, riscos e revisão necessária. Testes não executados continuam identificados como tal. Não há commit, push, merge, deploy, migration, instalação de dependência ou ampliação de acesso autorizados pelo prompt.

## Como o método poderia tornar-se uma camada do motor

1. **Contrato versionado:** converter critérios da habilidade em política de revisão do produto, com versão e casos de avaliação. Separar observação reproduzível, hipótese, decisão humana e verificação da correção; confiança não equivale a severidade.
2. **Adaptador opcional de revisão contextual:** receber somente o resultado autorizado e os trechos mínimos do mesmo SHA, depois de filtragem de segredos. Não usar o token do conector do ChatGPT para autenticar usuários do site. Revalidar usuário, instalação e repositório antes de ler ou entregar resultados.
3. **Saída estruturada:** vincular toda proposta a regra/fingerprint, arquivo, SHA e evidência disponível. Uma recomendação do modelo não modifica o estado humano registrado. Código e instruções do alvo não podem conceder ferramentas, acesso à rede ou autoridade ao revisor.
4. **Proposta de patch:** quando houver contexto suficiente, gerar um diff separado com hash do arquivo de origem e escopo explícito. Recusar patch se o SHA divergir ou o alvo estiver fora do repositório autorizado. Não entregar uma árvore como “corrigida” sem evidência de aplicação e validação.
5. **Validação isolada e revisão:** conferir caminhos, integridade, mudanças de dependências/permissões, regressões e casos negativos. Executar testes do alvo é outra capacidade, a ser autorizada e isolada; não acontece ao baixar o relatório. Aprovação humana permanece necessária antes de qualquer escrita no GitHub.

Essa camada **não está implementada nem ativada**. API externa ou servidor com modelo exigem destino protegido, política de dados, capacidade, custo e autorização próprios. Um modelo auto-hospedado também consome recursos e não demonstra custo adicional zero por si só. Não há ativação de OpenAI, infraestrutura, credenciais, novos escopos ou executor público nesta alteração.

## Por que não fazer substituições automáticas agora

- Um possível segredo é redigido; trocar a string sem compreender o uso não revoga uma credencial real e pode quebrar a aplicação.
- A detecção textual de `write-all` não identifica quais permissões cada job realmente precisa. Trocar tudo por leitura pode interromper entregas legítimas.
- O inventário de dependências não estabelece vulnerabilidade, versão corretiva ou compatibilidade.

O próximo passo para um revisor interno seria homologar esse contrato e um adaptador com fixtures e avaliação de qualidade. A App atual permanece somente leitura; não se amplia acesso para experimentar correções.
