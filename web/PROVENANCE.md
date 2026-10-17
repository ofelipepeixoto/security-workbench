# Origem dos arquivos

## Aplicação

`app/workbench.tsx`, `app/page.tsx`, `app/globals.css`, `app/api/workbench/route.ts`, `lib/scanner.mjs`, `lib/workbench-service.mjs`, `db/schema.ts`, `tests/`, `public/favicon.svg` e os documentos são código preparado para o Security Workbench. As regras adaptam o Python da versão `c7bbc3d7609c61868daaeaddb492d60da01312b6` do próprio projeto. A fixture de conformidade usa valores sintéticos.

## Base gerada

Helpers de build/autenticação e configuração vieram do starter Vinext de Sites 1.0.1 deste ambiente: `build/`, `scripts/`, `app/chatgpt-auth.ts`, helpers `lib/connector*`, configurações TypeScript/Vite/Next/PostCSS/ESLint e arquivos de pacote/lock. A licença de `build/sites-vite-plugin` foi preservada. O site não declara conectores: esses helpers herdados não concedem acesso a apps.

`app/layout.tsx` e `package.json` foram ajustados para título, idioma, metadados e comandos. Dependências instaladas seguem o lockfile. Nenhum instalador, script ou hook de alvo é executado.

`drizzle/0000_careful_shriek.sql`, `drizzle/meta/0000_snapshot.json` e `_journal.json` foram gerados por `drizzle-kit generate` a partir das três tabelas da aplicação, sem dados de usuário.

`.openai/hosting.json` identifica o Site publicado e o binding isolado `DB`; o ID não é credencial. A audiência pública do Site não libera a API sem identidade ChatGPT. `.sites-runtime`, `.wrangler`, `.env*`, bancos, node_modules, artefatos de build e credenciais não fazem parte da fonte versionada.
