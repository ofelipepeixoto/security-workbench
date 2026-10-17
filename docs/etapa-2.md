# Etapa 2 — aquisição GitHub e interface local

## Escopo implementado

- Somente repositórios previamente cadastrados com declaração explícita de autorização.
- `scan-github` requer SHA completo de commit, consulta `GET` na API oficial de repositório, commit, árvore recursiva e blobs. Confere `full_name` e igualdade exata do `repository_id` positivo previamente autorizado, SHA do commit, SHA da árvore e SHA Git de cada blob lido. Não faz clone, executa arquivos, scripts ou hooks nem grava o código recebido no banco.
- Os mesmos detectores estáticos e inventário de dependências da etapa 1 produzem candidatos com evidência sem valor de segredo, impacto possível, confiança e recomendação. Revisão humana e relatórios permanecem locais.
- A interface `serve` escuta apenas em `127.0.0.1`, usa senha aleatória por execução e formulários com token CSRF, valida `Host` e `Origin`, limita corpo de requisição e escapa HTML. Permite cadastrar escopo, analisar, ver histórico, revisar achados e baixar Markdown.
- Bancos anteriores ganham colunas de origem, verificação e `repository_id`. A origem já registrada é preservada; execuções sem ID ficam com revisão **não verificada**, inclusive registros GitHub da versão anterior. IDs não são inferidos do nome. Revisar explicitamente o escopo permite novas aquisições e não altera a evidência histórica.

## Cobertura e limites

- A entrada é um SHA de commit completo. Não há resolução de branch, agendamento ou monitoração automática.
- Árvore truncada, arquivos suportados acima de 1 MiB, binários e links simbólicos são informados como cobertura parcial. A leitura limita 5.000 arquivos e 25 MiB no total. Pastas de dependências, arquivos `.env` e formatos fora da lista suportada não são inspecionados. A ausência de achados não demonstra ausência de vulnerabilidades.
- A API pode impor limite de requisições; uma falha interrompe a análise sem salvar uma execução incompleta. Para repositórios privados, `GITHUB_TOKEN` deve ser configurado fora do projeto com acesso de leitura ao conteúdo do repositório. A ferramenta não copia o token ao relatório.
- A senha da interface vale apenas enquanto o processo está ativo. O servidor usa HTTP exclusivamente no loopback e **não é apropriado para proxy, rede local ou internet**. Uma futura operação remota exigirá HTTPS e autenticação próprios.
- Não há auditoria de CVEs, busca de segredos no histórico, integração REA, análise de sites, IA paga, Supabase, n8n ou deploy.

## Verificação desta entrega

`python3 -m unittest discover -s tests -v`: 12 testes locais aprovados em 16/10/2026. Incluem API simulada, troca de ID 123→456, IDs inválidos/ausentes, migrações de ambas as versões anteriores, persistência, CLI e fluxo HTTP local com autenticação/CSRF.

A [validação real](validacao-identidade.md) usa API pelo conector autorizado e uma cópia estática parcial de dois arquivos completos. O transporte direto de `scan-github` continua bloqueado no ambiente (`URLError`); não foi validado ponta a ponta nem substituído por credenciais do conector.
