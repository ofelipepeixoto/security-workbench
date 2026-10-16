# Etapa 2 — aquisição GitHub e interface local

## Escopo implementado

- Somente repositórios previamente cadastrados com declaração explícita de autorização.
- `scan-github` requer SHA completo de commit, consulta `GET` na API oficial de repositório, commit, árvore recursiva e blobs. Confere `full_name`, identificador numérico, SHA do commit, SHA da árvore e SHA Git de cada blob lido. Não faz clone, executa arquivos, scripts ou hooks nem grava o código recebido no banco.
- Os mesmos detectores estáticos e inventário de dependências da etapa 1 produzem candidatos com evidência sem valor de segredo, impacto possível, confiança e recomendação. Revisão humana e relatórios permanecem locais.
- A interface `serve` escuta apenas em `127.0.0.1`, usa senha aleatória por execução e formulários com token CSRF, valida `Host` e `Origin`, limita corpo de requisição e escapa HTML. Permite cadastrar escopo, analisar, ver histórico, revisar achados e baixar Markdown.
- Bancos da etapa 1 ganham colunas de origem e verificação; execuções antigas seguem marcadas como cópia local com revisão **não verificada**.

## Cobertura e limites

- A entrada é um SHA de commit completo. Não há resolução de branch, agendamento ou monitoração automática.
- Árvore truncada, arquivos suportados acima de 1 MiB, binários e links simbólicos são informados como cobertura parcial. A leitura limita 5.000 arquivos e 25 MiB no total. Pastas de dependências, arquivos `.env` e formatos fora da lista suportada não são inspecionados. A ausência de achados não demonstra ausência de vulnerabilidades.
- A API pode impor limite de requisições; uma falha interrompe a análise sem salvar uma execução incompleta. Para repositórios privados, `GITHUB_TOKEN` deve ser configurado fora do projeto com acesso de leitura ao conteúdo do repositório. A ferramenta não copia o token ao relatório.
- A senha da interface vale apenas enquanto o processo está ativo. O servidor usa HTTP exclusivamente no loopback e **não é apropriado para proxy, rede local ou internet**. Uma futura operação remota exigirá HTTPS e autenticação próprios.
- Não há auditoria de CVEs, busca de segredos no histórico, integração REA, análise de sites, IA paga, Supabase, n8n ou deploy.

## Verificação desta entrega

`python3 -m unittest discover -s tests -v`: 8 testes locais aprovados em 16/10/2026, incluindo respostas simuladas da API e fluxo HTTP local. A aquisição ao vivo pela API GitHub ainda não foi exercitada neste ambiente; a validação do próprio produto usa fixtures com SHA Git calculado sobre bytes de teste. Executar uma análise real de um commit autorizado em ambiente com acesso à API antes de tratar a integração como validada ponta a ponta.
