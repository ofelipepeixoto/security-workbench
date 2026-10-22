import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { createAnalysisJobs, recoverAnalysisJobs, AnalysisJobError, ANALYSIS_ENGINE_VERSION } from '../lib/analysis-jobs.mjs';
import { GitHubAppError } from '../lib/github-app-client.mjs';

const REVISION = 'a'.repeat(40), START = Date.parse('2026-10-22T02:00:00Z');
function database(t) {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => /^\d{4}.*\.sql$/.test(name)).sort()) {
    sql.exec('BEGIN');
    try { sql.exec(readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8')); sql.exec('COMMIT'); }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  }
  t.after(() => sql.close());
  const prepare = query => ({ bind(...values) {
    return { query, values,
      async first() { return sql.prepare(query).get(...values) ?? null; },
      async all() { return {results: sql.prepare(query).all(...values)}; },
      async run() { return {success: true, meta: {changes: Number(sql.prepare(query).run(...values).changes)}}; },
    };
  } });
  return {sql, prepare, async batch(statements) {
    sql.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(({query, values}) => ({success: true, meta: {changes: Number(sql.prepare(query).run(...values).changes)}}));
      sql.exec('COMMIT'); return results;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  }};
}
function project(db, ownerId = 'github:101', number = 1) {
  const value = {id: randomUUID(), owner_id: ownerId, repository_id: number, installation_id: number + 100, repo: `fixture/repo-${number}`, source: 'github-app'};
  db.sql.prepare("INSERT INTO workbench_projects (id,owner_id,repo,repository_id,authorized_at,source,installation_id,visibility) VALUES (?,?,?,?,?,'github-app',?,'private')").run(value.id, ownerId, value.repo, number, new Date(START).toISOString(), value.installation_id);
  return value;
}
function result(job, digest = 'b') {
  return {revision: job.revision, repository_id: job.repository_id, snapshot_digest: digest.repeat(64),
    files_read: 1, bytes_read: 342, partial: true, source: 'github-app', verified_revision: true,
    engine_version: ANALYSIS_ENGINE_VERSION, findings: [{fingerprint: 'inert-fingerprint', kind: 'possible-secret', path: 'fixture.js', line: 1, status: 'confirmed', confidence: 'low', evidence: '[REDACTED]', raw_code: 'NEVER_PERSIST'}],
    dependencies: [{name: 'fixture-package', version: '1.0.0', source: 'package.json', raw_code: 'NEVER_PERSIST'}],
    omissions: ['Cobertura parcial da fixture sintética.'], coverage: {policy: 'fixture-policy', advisory_coverage: 'unavailable'},
    raw_code: 'NEVER_PERSIST'};
}
function setup(db, scope, options = {}) {
  let clock = START;
  const factory = overrides => createAnalysisJobs({db, ownerId: scope.owner_id, githubId: scope.owner_id.split(':')[1], now: () => new Date(clock),
    authorize: async () => true, analyze: async job => result(job), random: () => 0, ...options, ...overrides});
  return {jobs: factory(), factory, advance(ms) {clock += ms;}, enqueue: (jobs, requestId = randomUUID(), revision = REVISION) => jobs.enqueue({project: scope, revision, requestId, confirmed: true})};
}
const deferred = () => { let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve}; };

test('atomic enqueue is owner-scoped, idempotent and rolls back a competing active job without orphaning its run', async t => {
  const db = database(t), a = project(db), other = project(db, 'github:202', 2), a2 = project(db, a.owner_id, 3);
  const x = setup(db, a), request = randomUUID();
  const [one, repeated] = await Promise.all([x.enqueue(x.jobs, request), x.enqueue(x.jobs, request)]);
  assert.equal(one.job.id, repeated.job.id);
  assert.equal(one.job.status, 'queued');
  assert.equal(one.job.lease_token, undefined);
  assert.equal(one.job.owner_id, undefined);
  await assert.rejects(x.enqueue(x.jobs, request, 'b'.repeat(40)), error => error instanceof AnalysisJobError && error.code === 'conflict');
  await assert.rejects(x.jobs.enqueue({project: a2, revision: REVISION, requestId: randomUUID(), confirmed: true}), error => error.code === 'busy');
  await assert.rejects(x.jobs.enqueue({project: other, revision: REVISION, requestId: randomUUID(), confirmed: true}), error => error.status === 404);
  assert.equal(db.sql.prepare('SELECT count(*) AS n FROM workbench_runs').get().n, 1);
  assert.equal(db.sql.prepare('SELECT count(*) AS n FROM workbench_analysis_jobs').get().n, 1);
  const b = setup(db, other);
  await assert.rejects(b.jobs.get(one.job.id), error => error.status === 404);
  await assert.rejects(b.jobs.cancel(one.job.id), error => error.status === 404);
  const bRun = await b.enqueue(b.jobs, request);
  assert.notEqual(bRun.job.id, one.job.id);
  assert.throws(() => db.sql.prepare('UPDATE workbench_analysis_jobs SET project_id=? WHERE id=?').run(other.id, one.job.id), /FOREIGN KEY/);
});

test('a configured consumer authorizes before acquisition and before commit, stores a whitelist, and permits deliberate reanalysis', async t => {
  const db = database(t), scope = project(db), events = [];
  const x = setup(db, scope, {authorize: async () => {events.push('authorize'); return true;}, analyze: async job => {events.push('analyze'); return result(job);}});
  const {job} = await x.enqueue(x.jobs);
  assert.equal((await x.jobs.process(job.id)).job.status, 'complete');
  assert.deepEqual(events, ['authorize', 'analyze', 'authorize']);
  const stored = db.sql.prepare('SELECT * FROM workbench_runs WHERE id=?').get(job.run_id);
  assert.equal(stored.status, 'complete');
  assert.equal(stored.result_json.includes('NEVER_PERSIST'), false);
  const value = JSON.parse(stored.result_json);
  assert.equal(value.findings[0].status, 'candidate');
  assert.equal(value.engine_version, ANALYSIS_ENGINE_VERSION);
  assert.equal(value.coverage.advisory_coverage, 'unavailable');
  assert.notEqual((await x.enqueue(x.jobs)).job.run_id, job.run_id);
  assert.equal((await x.jobs.cancel(job.id)).job.status, 'complete');
});

test('worker dependencies fail closed and revocation before acquisition or before commit prevents results', async t => {
  const db = database(t), scope = project(db), x = setup(db, scope);
  const {job} = await x.enqueue(x.jobs);
  const noWorker = x.factory({analyze: undefined});
  await assert.rejects(noWorker.process(job.id), error => error.code === 'worker_unavailable');
  assert.equal((await x.jobs.get(job.id)).job.attempts, 0);
  let acquired = false;
  const denied = x.factory({authorize: async () => false, analyze: async () => {acquired = true;}});
  assert.equal((await denied.process(job.id)).job.failure_code, 'access_revoked');
  assert.equal(acquired, false);
  const second = await x.enqueue(x.jobs);
  let checks = 0;
  const revokedAfter = x.factory({authorize: async () => ++checks === 1});
  assert.equal((await revokedAfter.process(second.job.id)).job.status, 'failed');
  assert.equal(db.sql.prepare('SELECT result_json FROM workbench_runs WHERE id=?').get(second.job.run_id).result_json, null);
});

test('single-statement claims enforce two global consumers and keep cancelled in-flight leases reserved', async t => {
  const db = database(t), one = deferred(), two = deferred(), started1 = deferred(), started2 = deferred();
  const a = setup(db, project(db), {analyze: async job => {started1.resolve(); await one.promise; return result(job);}});
  const b = setup(db, project(db, 'github:202', 2), {analyze: async job => {started2.resolve(); await two.promise; return result(job);}});
  const c = setup(db, project(db, 'github:303', 3));
  const [ja, jb, jc] = await Promise.all([a.enqueue(a.jobs), b.enqueue(b.jobs), c.enqueue(c.jobs)]);
  const workA = a.jobs.process(ja.job.id), workB = b.jobs.process(jb.job.id);
  await Promise.all([started1.promise, started2.promise]);
  assert.equal((await c.jobs.process(jc.job.id)).job.attempts, 0);
  await a.jobs.cancel(ja.job.id);
  assert.equal((await c.jobs.process(jc.job.id)).job.status, 'queued');
  one.resolve(); two.resolve();
  await Promise.all([workA, workB]);
  assert.equal((await c.jobs.process(jc.job.id)).job.status, 'complete');
});

test('duplicate delivery cannot acquire twice and cancellation fences a late result', async t => {
  const db = database(t), acquired = deferred(), release = deferred(), x = setup(db, project(db), {analyze: async job => {acquired.resolve(); await release.promise; return result(job);}});
  const {job} = await x.enqueue(x.jobs), work = x.jobs.process(job.id);
  await acquired.promise;
  assert.equal((await x.jobs.process(job.id)).job.attempts, 1);
  assert.equal((await x.jobs.cancel(job.id)).job.status, 'cancelled');
  release.resolve();
  assert.equal((await work).job.status, 'cancelled');
  const stored = db.sql.prepare('SELECT status,failure_code,result_json FROM workbench_runs WHERE id=?').get(job.run_id);
  assert.deepEqual({...stored}, {status: 'failed', failure_code: 'cancelled', result_json: null});
});

test('an expired lease is recovered with a new fencing token and the old consumer cannot overwrite it', async t => {
  const db = database(t), acquired = deferred(), release = deferred(), x = setup(db, project(db));
  const {job} = await x.enqueue(x.jobs);
  const oldWorker = x.factory({analyze: async value => {acquired.resolve(); await release.promise; return result(value, 'c');}});
  const first = oldWorker.process(job.id);
  await acquired.promise;
  x.advance(60001);
  assert.deepEqual(await recoverAnalysisJobs({db, now: () => new Date(START + 60001)}), [{id: job.id, ownerId: 'github:101', githubId: '101'}]);
  assert.equal((await x.jobs.process(job.id)).job.attempts, 2);
  release.resolve(); await first;
  assert.equal(JSON.parse(db.sql.prepare('SELECT result_json FROM workbench_runs WHERE id=?').get(job.run_id).result_json).snapshot_digest, 'b'.repeat(64));
});

test('rate-limit retry honors a provider delay beyond 24 hours, never starts early, and stops after two attempts', async t => {
  const db = database(t), x = setup(db, project(db), {analyze: async () => {throw new GitHubAppError('rate_limited', 429, new Date(START + 172800000).toISOString());}});
  const {job} = await x.enqueue(x.jobs);
  const first = await x.jobs.process(job.id);
  assert.equal(first.job.status, 'queued');
  assert.equal(first.job.retry_at, new Date(START + 172800000).toISOString());
  x.advance(86400000);
  assert.equal((await x.jobs.process(job.id)).job.attempts, 1);
  assert.deepEqual(await recoverAnalysisJobs({db, now: () => new Date(START + 86400000)}), []);
  x.advance(86400000);
  const last = await x.jobs.process(job.id);
  assert.equal(last.job.status, 'failed');
  assert.equal(last.job.attempts, 2);
  assert.equal(last.job.failure_code, 'github_rate_limited');
});

test('timeouts abort cooperative providers, never start analysis after a late authorization, and do not retain error text', async t => {
  const db = database(t), scope = project(db), allowed = deferred();
  let acquired = false;
  const x = setup(db, scope, {timeoutMs: 15, authorize: async () => {await allowed.promise; return true;}, analyze: async () => {acquired = true;}});
  const {job} = await x.enqueue(x.jobs);
  assert.equal((await x.jobs.process(job.id)).job.failure_code, 'acquisition_timeout');
  allowed.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(acquired, false);
  x.advance(60000);
  const failed = x.factory({authorize: async () => true, analyze: async () => {throw new Error('PRIVATE_TOKEN_NEVER_LOG');}});
  assert.equal((await failed.process(job.id)).job.status, 'failed');
  assert.equal(JSON.stringify(db.sql.prepare('SELECT * FROM workbench_analysis_jobs').all()).includes('PRIVATE_TOKEN'), false);
});

test('result storage failure is atomic and remains a storage error, while exhausted stale leases become terminal', async t => {
  const db = database(t), x = setup(db, project(db)), {job} = await x.enqueue(x.jobs);
  db.sql.exec("CREATE TRIGGER reject_fixture_result BEFORE UPDATE OF result_json ON workbench_runs WHEN NEW.result_json IS NOT NULL BEGIN SELECT RAISE(ABORT, 'PRIVATE_DATABASE_DIAGNOSTIC'); END");
  await assert.rejects(x.jobs.process(job.id), error => error instanceof AnalysisJobError && error.code === 'storage_unavailable' && !error.message.includes('PRIVATE'));
  assert.equal((await x.jobs.get(job.id)).job.status, 'running');
  assert.equal(db.sql.prepare('SELECT result_json FROM workbench_runs WHERE id=?').get(job.run_id).result_json, null);
  db.sql.exec('DROP TRIGGER reject_fixture_result');
  db.sql.prepare('UPDATE workbench_analysis_jobs SET attempts=2 WHERE id=?').run(job.id);
  x.advance(60001);
  const exhausted = await x.jobs.process(job.id);
  assert.equal(exhausted.job.failure_code, 'attempts_exhausted');
  assert.equal(exhausted.job.status, 'failed');
  assert.deepEqual(db.sql.prepare('PRAGMA foreign_key_check').all(), []);
});
