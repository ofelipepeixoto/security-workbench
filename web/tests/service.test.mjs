import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createWorkbenchService, handleWorkbenchRequest } from '../lib/workbench-service.mjs';

const REPO = 'ofelipepeixoto/rea';
const REVISION = 'a'.repeat(40);
const REQUEST = '11000000-0000-4000-8000-000000000001';
const REQUEST2 = '11000000-0000-4000-8000-000000000002';

// Exercise actual SQLite constraints through the small D1 statement interface.
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE workbench_projects (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, repo TEXT NOT NULL, repository_id INTEGER NOT NULL, authorized_at TEXT NOT NULL);
    CREATE UNIQUE INDEX workbench_project_owner_repo ON workbench_projects(owner_id, repo);
    CREATE TABLE workbench_runs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES workbench_projects(id), repo TEXT NOT NULL, repository_id INTEGER NOT NULL, request_id TEXT NOT NULL, requested_revision TEXT, revision TEXT, status TEXT NOT NULL, result_json TEXT, failure_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX workbench_run_owner_request ON workbench_runs(owner_id, request_id);
    CREATE UNIQUE INDEX workbench_run_one_running ON workbench_runs(owner_id, project_id) WHERE status = 'running';
    CREATE TABLE workbench_reviews (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES workbench_runs(id), fingerprint TEXT NOT NULL, decision TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX workbench_review_owner_finding ON workbench_reviews(owner_id, run_id, fingerprint);
  `);
  return {
    prepare(query) {
      return { bind(...values) {
        const statement = sql.prepare(query);
        return {
          async first() { return statement.get(...values) ?? null; },
          async all() { return { results: statement.all(...values) }; },
          async run() { const result = statement.run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
        };
      } };
    },
    close() { sql.close(); },
  };
}

function scanner(overrides = {}) {
  return {
    normalizeRepo(input) { if (input !== REPO) throw new Error('invalid'); return input; },
    async repositoryMetadata(repo) { return { repo, repository_id: 10, default_branch: 'main', private: false }; },
    async inspectGitHub() {
      return { repository_id: 10, revision: REVISION, snapshot_digest: 'b'.repeat(64), files_read: 1, bytes_read: 20, partial: false, omissions: [], findings: [{ fingerprint: 'f1', kind: 'secret', path: 'app.py', line: 1, status: 'candidate', evidence: '[REDACTED]' }], dependencies: [], source: 'github-public', verified_revision: true };
    },
    renderReport(run) { return `${run.repo} ${run.findings.map(finding => finding.status).join(',')}`; },
    ...overrides,
  };
}

async function authorize(service) {
  return (await service.act({ action: 'authorize', repo: REPO, repositoryId: 10, confirmed: true })).project;
}

function dependencies(db, options = {}) {
  return { authorizedOwnerId: 'owner-a', getUser: async () => ({ userId: 'owner-a' }), getDb: () => db, scanner: scanner(), ...options };
}

function request(payload, headers = {}) {
  return new Request('https://workbench.example/api/workbench', { method: 'POST', headers: { Origin: 'https://workbench.example', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
}

test('only the configured Site owner reaches any real API operation', async () => {
  let touched = false;
  const deps = dependencies(null, {
    getUser: async () => ({ userId: 'another-signed-in-user' }),
    getDb() { touched = true; throw new Error('database must stay untouched'); },
  });
  const requests = [new Request('https://workbench.example/api/workbench'),
    ...['inspect', 'authorize', 'scan', 'run', 'review', 'compare', 'report'].map(action =>
      request({ action, ownerId: 'owner-a', authorizedOwnerId: 'another-signed-in-user' }))];
  for (const req of requests) {
    const result = await handleWorkbenchRequest(req, deps);
    assert.equal(result.status, 403);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  }
  for (const authorizedOwnerId of [undefined, '', '   ', null]) {
    const result = await handleWorkbenchRequest(new Request('https://workbench.example/api/workbench'),
      { ...deps, authorizedOwnerId, getUser: async () => ({ userId: 'owner-a' }) });
    assert.equal(result.status, 503);
  }
  assert.equal(touched, false);
  const db = database();
  assert.equal((await handleWorkbenchRequest(new Request('https://workbench.example/api/workbench'), dependencies(db))).status, 200);
  db.close();
});

test('authentication and request guards run before database or acquisition', async () => {
  let accessed = false;
  const deps = dependencies(null, { getDb() { accessed = true; throw new Error('db'); } });
  const unauth = await handleWorkbenchRequest(request({ action: 'inspect', repo: REPO }), { ...deps, getUser: async () => null });
  assert.equal(unauth.status, 401);
  assert.equal(unauth.headers.get('cache-control'), 'no-store');
  assert.equal(accessed, false);
  const crossOrigin = await handleWorkbenchRequest(request({ action: 'inspect', repo: REPO }, { Origin: 'https://attacker.example' }), deps);
  assert.equal(crossOrigin.status, 403);
  const missingOrigin = request({ action: 'inspect', repo: REPO });
  missingOrigin.headers.delete('Origin');
  assert.equal((await handleWorkbenchRequest(missingOrigin, deps)).status, 403);
  assert.equal((await handleWorkbenchRequest(request({}, { 'Content-Type': 'text/plain' }), deps)).status, 415);
  assert.equal((await handleWorkbenchRequest(request({ padding: 'x'.repeat(9000) }), deps)).status, 413);
  assert.equal(accessed, false);
});

test('streamed JSON is bounded without a trusted content length and errors never echo sources', async () => {
  let accessed = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"padding":"' + 'x'.repeat(8200))); controller.close(); } });
  const req = new Request('https://workbench.example/api/workbench', { method: 'POST', headers: { Origin: 'https://workbench.example', 'Content-Type': 'application/json' }, body: stream, duplex: 'half' });
  const result = await handleWorkbenchRequest(req, dependencies(null, { getDb() { accessed = true; } }));
  assert.equal(result.status, 413);
  assert.equal(accessed, false);
  const rawError = await handleWorkbenchRequest(new Request('https://workbench.example/api/workbench'), dependencies(null, { getDb() { throw new Error('private token=abc source'); } }));
  assert.equal(rawError.status, 500);
  assert.equal((await rawError.text()).includes('token=abc'), false);
});

test('public GitHub quota exhaustion returns a safe retry message', async () => {
  const db = database();
  const limited = scanner({async repositoryMetadata() {throw Object.assign(new Error('sensitive source'), {name: 'GitHubRateLimitError'});}});
  const result = await handleWorkbenchRequest(request({action: 'inspect', repo: REPO}), dependencies(db, {scanner: limited}));
  assert.equal(result.status, 429);
  const text = await result.text();
  assert.match(text, /cota pública do GitHub/);
  assert.doesNotMatch(text, /sensitive source/);
  db.close();
});

test('authorization rechecks public metadata, preserves identity, and does not trust browser owner fields', async () => {
  const db = database();
  let repositoryId = 10;
  let privateRepo = false;
  const svc = createWorkbenchService({ db, ownerId: 'owner-a', scanner: scanner({ async repositoryMetadata(repo) { return { repo, repository_id: repositoryId, default_branch: 'main', private: privateRepo }; } }) });
  const project = await authorize(svc);
  assert.equal((await authorize(svc)).id, project.id);
  repositoryId = 11;
  await assert.rejects(authorize(svc), /identidade/);
  await assert.rejects(svc.act({ action: 'authorize', repo: REPO, repositoryId: 11, confirmed: true }), /preservado/);
  assert.equal((await svc.list()).projects[0].repository_id, 10);
  privateRepo = true;
  await assert.rejects(svc.act({ action: 'inspect', repo: REPO }), /público/);
  db.close();
});

test('a second authenticated owner cannot read, review, report, scan, or compare the first owner data', async () => {
  const db = database();
  const first = createWorkbenchService({ db, ownerId: 'owner-a', scanner: scanner() });
  const project = await authorize(first);
  const { run } = await first.act({ action: 'scan', projectId: project.id, requestId: REQUEST });
  const second = createWorkbenchService({ db, ownerId: 'owner-b', scanner: scanner() });
  assert.deepEqual(await second.list(), { projects: [], runs: [] });
  for (const action of [
    { action: 'run', runId: run.id }, { action: 'review', runId: run.id, fingerprint: 'f1', decision: 'confirmed' },
    { action: 'report', runId: run.id }, { action: 'scan', projectId: project.id, requestId: REQUEST2 },
    { action: 'compare', before: run.id, after: run.id },
  ]) await assert.rejects(second.act({ ...action, ownerId: 'owner-a' }), error => error.status === 404);
  const ownProject = await authorize(second);
  assert.notEqual(ownProject.id, project.id);
  const { run: ownRun } = await second.act({ action: 'scan', projectId: ownProject.id, requestId: REQUEST });
  assert.notEqual(ownRun.id, run.id);
  const http = await handleWorkbenchRequest(request({ action: 'run', runId: run.id, ownerId: 'owner-a' }), dependencies(db, { authorizedOwnerId: 'owner-b', getUser: async () => ({ userId: 'owner-b' }) }));
  assert.equal(http.status, 404);
  db.close();
});

test('scan request is idempotent and concurrent scans are constrained per project', async () => {
  const db = database();
  let finish;
  let calls = 0;
  const gate = new Promise(resolve => { finish = resolve; });
  const mocked = scanner({ async inspectGitHub(...args) { calls++; await gate; return scanner().inspectGitHub(...args); } });
  const svc = createWorkbenchService({ db, ownerId: 'owner-a', scanner: mocked });
  const project = await authorize(svc);
  const pending = svc.act({ action: 'scan', projectId: project.id, requestId: REQUEST });
  while (!calls) await new Promise(resolve => setImmediate(resolve));
  const repeated = await svc.act({ action: 'scan', projectId: project.id, requestId: REQUEST });
  assert.equal(repeated.run.status, 'running');
  await assert.rejects(svc.act({ action: 'scan', projectId: project.id, requestId: REQUEST2 }), error => error.status === 409);
  finish();
  const completed = await pending;
  assert.equal(completed.run.status, 'complete');
  const retry = await svc.act({ action: 'scan', projectId: project.id, requestId: REQUEST });
  assert.equal(retry.run.id, completed.run.id);
  assert.equal(calls, 1);
  await assert.rejects(svc.act({ action: 'scan', projectId: project.id, requestId: REQUEST, revision: REVISION }), error => error.status === 409);
  db.close();
});

test('stale request becomes interrupted without replay and late completion cannot overwrite failure', async () => {
  const db = database();
  let current = new Date('2026-10-17T10:00:00Z');
  let finish;
  let calls = 0;
  const gate = new Promise(resolve => { finish = resolve; });
  const svc = createWorkbenchService({ db, ownerId: 'owner-a', now: () => current, scanner: scanner({ async inspectGitHub(...args) { calls++; await gate; return scanner().inspectGitHub(...args); } }) });
  const project = await authorize(svc);
  const pending = svc.act({ action: 'scan', projectId: project.id, requestId: REQUEST });
  while (!calls) await new Promise(resolve => setImmediate(resolve));
  current = new Date(current.valueOf() + 120001);
  const retry = await svc.act({ action: 'scan', projectId: project.id, requestId: REQUEST });
  assert.equal(retry.run.status, 'failed');
  assert.equal(retry.run.failure_code, 'interrupted');
  assert.equal(retry.run.files_read, null);
  assert.equal(calls, 1);
  finish();
  assert.equal((await pending).run.status, 'failed');
  db.close();
});

test('failed acquisition stores a safe failure state and review/report remain unavailable', async () => {
  const db = database();
  let calls = 0;
  const svc = createWorkbenchService({ db, ownerId: 'owner-a', scanner: scanner({ async inspectGitHub() { calls++; throw new Error('sensitive source and token=abc'); } }) });
  const project = await authorize(svc);
  const payload = { action: 'scan', projectId: project.id, requestId: REQUEST };
  const { run } = await svc.act(payload);
  assert.equal(run.status, 'failed');
  assert.equal(run.failure_code, 'acquisition_failed');
  assert.equal(run.files_read, null);
  assert.equal(JSON.stringify(run).includes('token=abc'), false);
  await svc.act(payload);
  assert.equal(calls, 1);
  await assert.rejects(svc.act({ action: 'report', runId: run.id }), error => error.status === 409);
  await assert.rejects(svc.act({ action: 'review', runId: run.id, fingerprint: 'f1', decision: 'confirmed' }), error => error.status === 409);
  db.close();
});

test('reviews are scoped to actual findings and comparison does not treat reviews as disappeared findings', async () => {
  const db = database();
  const svc = createWorkbenchService({ db, ownerId: 'owner-a', scanner: scanner() });
  const project = await authorize(svc);
  const { run: before } = await svc.act({ action: 'scan', projectId: project.id, requestId: REQUEST });
  const reviewed = await svc.act({ action: 'review', runId: before.id, fingerprint: 'f1', decision: 'false_positive' });
  assert.equal(reviewed.run.findings[0].decision, 'false_positive');
  assert.equal(reviewed.run.findings[0].status, 'false_positive');
  assert.equal(reviewed.run.verified_revision, true);
  assert.match((await svc.act({ action: 'report', runId: before.id })).markdown, /false_positive/);
  await assert.rejects(svc.act({ action: 'review', runId: before.id, fingerprint: 'missing', decision: 'confirmed' }), error => error.status === 404);
  const { run: after } = await svc.act({ action: 'scan', projectId: project.id, requestId: REQUEST2 });
  assert.deepEqual((await svc.act({ action: 'compare', before: before.id, after: after.id })).comparison, { new: [], no_longer_detected: [], still_detected: ['f1'], partial: false });
  assert.equal((await svc.list()).runs[0].findings_count, 1);
  db.close();
});
