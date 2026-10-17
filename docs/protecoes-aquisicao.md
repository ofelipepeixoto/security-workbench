# Proteções da aquisição — 17/10/2026

Revisão sobre a versão `c8489f1a9fa73aafa8ecbb010281488815128801` do PR #2, preservando sua vinculação por nome e ID estável. Dois defeitos foram reproduzidos com dados fictícios e corrigidos.

## Orçamento de downloads

Antes, blobs binários com extensão suportada eram baixados, verificados e descartados antes de incrementar os contadores usados no limite. Com limites de teste de 2 arquivos e 5 bytes, 8 blobs de 4 bytes podiam resultar em 8 downloads/32 bytes, embora o resultado informasse 0 arquivos analisados/0 bytes.

Agora o orçamento conta cada blob adquirido, inclusive binários descartados e blobs vazios. O limite continua em 5.000 aquisições e 25 MiB de conteúdo; cada arquivo continua limitado a 1 MiB. A resposta JSON da API tem limite próprio de 8 MiB por requisição. `files_read`/`bytes_read` continuam representando apenas conteúdo analisado. `files_acquired`/`bytes_acquired` são contadores internos do resultado do coletor, sem migração do SQLite nesta correção.

Três regressões simulam limites de arquivos, bytes e requisições de blobs vazios. Não há requisições externas nesses testes.

## Privacidade do inventário

Antes, `package.json` podia incluir uma especificação de dependência com credencial na URL; a string inteira chegava ao SQLite e ao relatório. Uma reprodução com valor fictício confirmou essa exposição.

Agora versões, ranges e tags comuns são preservados; especificações de origem, transporte ou texto fora dos formatos aceitos viram `[REDACTED]` **antes da persistência**. A especificação inteira é removida para também cobrir credenciais em query ou fragmento, além de usuário/senha na URL. Não se verifica a validade da credencial nem se faz contato com essa origem. A redação conservadora pode remover especificações legítimas e não representa uma vulnerabilidade confirmada no alvo.

Dois testes verificam preservação de versões comuns e ausência dos valores fictícios em inventário, relatório e bytes do SQLite. A correção aplica-se às novas análises; não reescreve bancos ou relatórios históricos. Se houver histórico gerado com URLs de origem, revisar esse histórico localmente antes de compartilhá-lo e gerar novas análises com a versão corrigida.

## Resultado local

Python 3.12: `python3 -m unittest discover -s tests -v` — **17 testes aprovados localmente em 17/10/2026**, incluindo cinco novas regressões com dados fictícios. Elas não comprovam acesso real à API; a homologação do transporte é uma camada separada. O CI remoto é registrado no PR após o envio.
