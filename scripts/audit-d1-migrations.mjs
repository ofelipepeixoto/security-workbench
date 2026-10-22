/** Local-only migration audit: ephemeral Miniflare D1, synthetic data, no Sites. */
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFile, realpath} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const summary = {local_d1: false, external_network_allowed: false, production_accessed: false};
let runtime, hostDispatcher, restoreDispatcher;
const directory = new URL('../web/drizzle/', import.meta.url);
const files = ['0000_careful_shriek.sql', '0001_strong_swarm.sql', '0002_workspace_relations.sql',
  '0003_github_app_connections.sql', '0004_jobs.sql', '0005_project_catalog.sql'];
const original = {
  workbench_projects: 'id,owner_id,repo,repository_id,authorized_at',
  workbench_runs: '*', workbench_reviews: '*', workbench_github_sessions: '*', workbench_oauth_flows: '*',
};
async function apply(db, file) {
  // Trigger BEGIN/END contains semicolons. Only the migration delimiter splits.
  const sql = await readFile(new URL(file, directory), 'utf8');
  const statements = sql.split('--> statement-breakpoint').map(part => part.trim()).filter(Boolean);
  const results = await db.batch(statements.map(part => db.prepare(part)));
  assert.ok(results.length === statements.length && results.every(item => item.success === true));
}
async function seed(db, mismatch = false) {
  const stamp = '2026-10-22T00:00:00Z';
  await db.batch([
    db.prepare('INSERT INTO workbench_projects VALUES (?,?,?,?,?)').bind('project-a', 'legacy-owner', 'fixture/a', 17, stamp),
    db.prepare('INSERT INTO workbench_projects VALUES (?,?,?,?,?)').bind('project-b', 'legacy-b', 'fixture/b', 18, stamp),
    db.prepare('INSERT INTO workbench_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind('run-a', mismatch ? 'legacy-b' : 'legacy-owner', 'project-a', 'fixture/a', 17, 'request-a', 'a'.repeat(40), 'a'.repeat(40), 'complete', '{"source":"rea-import","findings":[],"partial":true}', null, stamp, stamp),
    db.prepare('INSERT INTO workbench_reviews VALUES (?,?,?,?,?,?)').bind('review-a', 'legacy-owner', 'run-a', 'synthetic-fingerprint', 'false_positive', stamp),
    db.prepare('INSERT INTO workbench_github_sessions VALUES (?,?,?,?,?,?,?,?)').bind('inert-session-hash', 'inert-csrf-hash', '101', 'legacy-owner', 'fixture-owner', 'inert-config-hash', 2000000000, 1900000000),
    db.prepare('INSERT INTO workbench_oauth_flows VALUES (?,?,?,?,?,?)').bind('inert-state-hash', 'inert-browser-hash', 'inert-verifier', 'inert-config-hash', 2000000000, 1900000000),
  ]);
}
async function digestLegacy(db) {
  const values = [];
  for (const [table, columns] of Object.entries(original)) values.push([table, (await db.prepare(`SELECT ${columns} FROM ${table} ORDER BY 1`).all()).results]);
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}
async function rejected(operation) {try {await operation(); return false;} catch {return true;}}

try {
  if (process.argv.length > 3) throw new Error('arguments');
  const wrangler = process.argv[2] || fileURLToPath(new URL('../web/node_modules/wrangler/package.json', import.meta.url));
  const dependency = createRequire(await realpath(wrangler));
  const {Miniflare, Log, LogLevel} = dependency('miniflare');
  const undici = createRequire(dependency.resolve('miniflare'))('undici');
  const previousDispatcher = undici.getGlobalDispatcher();
  hostDispatcher = new undici.MockAgent();
  hostDispatcher.disableNetConnect();
  hostDispatcher.enableNetConnect(/^127\.0\.0\.1(?::[0-9]+)?$/);
  undici.setGlobalDispatcher(hostDispatcher);
  restoreDispatcher = () => undici.setGlobalDispatcher(previousDispatcher);
  summary.host_undici_external_blocked = true;
  summary.miniflare_version = dependency('miniflare/package.json').version;
  runtime = new Miniflare({
    modules: true, script: 'export default {fetch() {return new Response(null,{status:404});}}',
    compatibilityDate: '2026-05-15', host: '127.0.0.1', port: 0,
    // Miniflare otherwise fetches workers.cloudflare.com/cf.json on startup.
    // Explicit false returns its local placeholder without that request/cache.
    cf: false,
    log: new Log(LogLevel.NONE), d1Databases: {DB: randomUUID(), BAD: randomUUID()}, d1Persist: false,
    outboundService: () => new Response(null, {status: 403}),
  });
  const [db, bad] = await Promise.all([runtime.getD1Database('DB'), runtime.getD1Database('BAD')]);
  summary.local_d1 = true;
  for (const target of [db, bad]) {for (const file of files.slice(0, 2)) await apply(target, file);}
  await seed(db); await seed(bad, true);
  const before = await digestLegacy(db), badBefore = await digestLegacy(bad);
  await apply(db, files[2]);
  summary.legacy_preserved_after_0002 = before === await digestLegacy(db);
  summary.migration_0002_rejected_inconsistent_owner = await rejected(() => apply(bad, files[2]));
  summary.migration_failure_data_rollback = badBefore === await digestLegacy(bad);
  const rollbackNames = await bad.prepare("SELECT name FROM sqlite_schema WHERE name = 'workbench_project_owner_id' OR name LIKE '__new_%' OR name = '__workbench_workspace_guard'").all();
  summary.migration_failure_schema_rollback = rollbackNames.results.length === 0;
  for (const file of files.slice(3)) await apply(db, file);
  summary.legacy_preserved_after_0005 = before === await digestLegacy(db);
  const metadata = await db.prepare("SELECT source,installation_id,visibility,revoked_at FROM workbench_projects WHERE id='project-a'").first();
  summary.legacy_project_defaults = metadata.source === 'github-public' && metadata.visibility === 'public' && metadata.installation_id === null && metadata.revoked_at === null;
  const crossRun = () => db.prepare("INSERT INTO workbench_runs (id,owner_id,project_id,repo,repository_id,request_id,status,created_at,updated_at) VALUES ('cross-run','legacy-b','project-a','fixture/a',17,'cross-request','running','now','now')").run();
  summary.cross_owner_run_rejected = await rejected(crossRun);
  summary.cross_owner_review_rejected = await rejected(() => db.prepare("INSERT INTO workbench_reviews VALUES ('cross-review','legacy-b','run-a','synthetic','confirmed','now')").run());
  summary.cross_owner_job_rejected = await rejected(() => db.prepare("INSERT INTO workbench_analysis_jobs (id,owner_id,github_id,project_id,run_id,repository_id,installation_id,repo,revision,request_id,engine_version,config_key,status,available_at,created_at,updated_at) VALUES ('cross-job','legacy-b','202','project-b','run-a',18,99,'fixture/b',?,'job-request','fixture/1','inert-config','queued','now','now','now')").bind('a'.repeat(40)).run());
  summary.batch_failed = await rejected(() => db.batch([
    db.prepare("INSERT INTO workbench_projects (id,owner_id,repo,repository_id,authorized_at) VALUES ('rollback-project','legacy-b','fixture/rollback',19,'now')"),
    db.prepare("INSERT INTO workbench_runs (id,owner_id,project_id,repo,repository_id,request_id,status,created_at,updated_at) VALUES ('rollback-run','legacy-b','project-a','fixture/a',17,'rollback-request','running','now','now')"),
  ]));
  summary.batch_rollback = (await db.prepare("SELECT count(*) AS n FROM workbench_projects WHERE id='rollback-project'").first()).n === 0;
  summary.foreign_key_check_clean = (await db.prepare('PRAGMA foreign_key_check').all()).results.length === 0;
  summary.user_table_count = (await db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table' AND name LIKE 'workbench_%'").first()).n;
  summary.all_migrations_applied = summary.user_table_count === 8;
  const flags = Object.entries(summary).filter(([key, value]) => typeof value === 'boolean' && !['external_network_allowed', 'production_accessed'].includes(key));
  summary.passed = flags.every(([, value]) => value === true);
} catch {
  summary.passed = false;
  summary.failure = summary.local_d1 ? 'local_migration_audit_failed' : 'miniflare_runtime_unavailable';
} finally {
  if (runtime) {try {await runtime.dispose();} catch {summary.passed = false; summary.failure = 'runtime_cleanup_failed';}}
  restoreDispatcher?.();
  if (hostDispatcher) {try {await hostDispatcher.close();} catch {summary.passed = false; summary.failure = 'dispatcher_cleanup_failed';}}
}
process.stdout.write(JSON.stringify(summary) + '\n');
if (!summary.passed) process.exitCode = 1;
