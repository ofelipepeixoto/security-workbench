# Supabase: catálogo de controles e plano por perfil

Extração conceitual da auditoria de `dmanske/auditoria-seguranca-supabase`, upstream 5542c72a933a4c9ebfccb07f5c48f591d1cbd387. Implementação original no Workbench; não incorpora SQL upstream, instalador, skill global ou cliente Supabase. Referência pública MIT: https://github.com/ofelipepeixoto/auditoria-seguranca-supabase.

O novo comando transforma uma análise local autorizada em oito grupos de revisão: grants/RLS, organizações, RPC, Storage, Edge Functions, chaves, sessões/links e views. Cada controle tem perfis e desenho de teste. Todos começam **not_validated**, evidências vazias e **authorization_to_execute: false**. Não é um scanner SQL nem um parecer de segurança.

```sh
python3 -m workbench --state /CAMINHO/PRIVADO/workbench.sqlite3 authorize --repo fixture/supabase --confirm-owned
python3 -m workbench --state /CAMINHO/PRIVADO/workbench.sqlite3 scan --repo fixture/supabase --snapshot /COPIA/AUTORIZADA --revision SHA_COMPLETO
python3 -m workbench --state /CAMINHO/PRIVADO/workbench.sqlite3 supabase-plan --run ID_ANALISE --path supabase/migrations/exemplo.sql
python3 -m workbench --state /CAMINHO/PRIVADO/workbench.sqlite3 supabase-plan-show --context ID_CONTEXTO
```

O plano usa os controles existentes de escopo, análise mais recente, manifesto e limites: até dez arquivos, 64 KiB por arquivo e 256 KiB selecionados. Extensão `.sql` passa a ser lida como texto limitado (sem parser nem execução); a aquisição GitHub herda o mesmo conjunto de extensões. SQLite conserva contexto, versão e hash do catálogo; a recuperação exige a mesma versão do catálogo. Nenhum texto SQL, chave, resposta de banco ou linha de cliente é copiado para o plano. Os caminhos e hashes continuam privados. Cópia local conserva SHA **declarado**, sem promover a verificação GitHub.

A ausência de WITH CHECK explícito não prova falha: PostgreSQL pode reutilizar USING. Os testes de isolamento devem combinar grants e policies, dados fictícios em ambiente descartável, pessoas de organizações diferentes e efeitos externos simulados. Cada produto mantém migrations e testes próprios. Evidência e revisão humana reais permanecem fora desta camada de planejamento.

Validação: 33 testes Python aprovados, sendo seis novos para matriz sem resultados inventados, recuperação, análise antiga, seleção de caminhos, contexto incompatível e CLI. Sem banco Supabase real, credenciais reais, SQL executado, LLM ou n8n. O teste de rede proibida é uma guarda adicional; esta implementação não importa um cliente HTTP.

PR empilhada após #3: revisar #1 → #2 → #3 → esta mudança. Sem alteração de schema SQLite. Rollback: retornar à branch de #3; os contextos são compatíveis com context-show, embora o comando específico não exista na versão anterior. Fazer backup do SQLite com processo parado antes de qualquer atualização.
