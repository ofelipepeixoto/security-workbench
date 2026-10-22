import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createWorkbenchService, handleWorkbenchRequest, handleReaImportRequest } from '../lib/workbench-service.mjs';
import { newReaImportAttemptTracker } from '../lib/rea-import-attempt.mjs';
import { GitHubRateLimitError, GitHubAcquisitionTimeoutError, repositoryMetadata, SCANNER_LIMITS } from '../lib/scanner.mjs';

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

function reaFixture() {
  const digest = 'a'.repeat(64), node = 'jag_node_' + '1'.repeat(64);
  return JSON.stringify({
    fixture_notice: 'Synthetic import-contract fixture; not a completed REA execution.',
    evidence_id: 'ev_' + '2'.repeat(64),
    provider: { id: 'rea-javascript-application', version: '1' },
    operation: 'analyze_javascript_application', predicate_type: 'rea.javascript-application-analysis',
    authority: 'shipped-artifact', confidence: 'derived',
    subject: { digest: { sha256: digest }, format: 'directory', local_path: '/NEVER_PERSIST' },
    normalized_result: { root_artifact_sha256: digest, format: 'directory',
      statistics: { relevant_files: 1, parsed_javascript_files: 1, parse_failures: 0, text_bytes_read: 50, findings: 1 },
      graph: { schema: 'JavaScriptApplicationGraph', root_node_ids: [node],
        coverage: { status: 'complete', truncated: false, omitted_count: 0, limits: [] },
        nodes: [{ node_id: node, kind: 'endpoint', observations: [{ observation_id: 'jag_observation_' + '3'.repeat(64),
          properties: { value: 'NEVER_PERSIST', status: 'confirmed' },
          evidence: { authority: 'ast-static-analysis', state: 'observed',
            artifact: { available: true, artifact_id: 'art_' + digest, sha256: digest },
            location: { available: true, value: { kind: 'source-range', source: 'fixture.js', start: { line: 1, column: 0 }, end: { line: 1, column: 10 } } } } }] }] } },
  });
}

async function authorize(service) {
  return (await service.act({ action: 'authorize', repo: REPO, repositoryId: 10, confirmed: true })).project;
}

function dependencies(db, options = {}) {
  return { authorizedOwnerId: 'owner-a', getUser: async () => ({ userId: 'owner-a' }), getDb: () => db, scanner: scanner(), ...options };
}

function request(payload, headers = {}, path = '/api/workbench') {
  return new Request(`https://workbench.example${path}`, { method: 'POST', headers: { Origin: 'https://workbench.example', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
}

function simultaneousRequestLookup(db) {
  let arrivals = 0, release;
  const bothRead = new Promise(resolve => { release = resolve; });
  return { ...db, prepare(query) { return { bind(...values) {
    const bound = db.prepare(query).bind(...values);
    return { ...bound, async first() {
      const row = await bound.first();
      if (query === 'SELECT * FROM workbench_runs WHERE owner_id = ? AND request_id = ?' && !row && arrivals < 2) {
        if (++arrivals === 2) release();
        await bothRead;
      }
      return row;
    } };
  } }; } };
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

test('oversized REA streams are rejected even when cancellation never settles', async () => {
  let cancelled = false, accessed = false, timeout;
  const token = 'c'.repeat(43);
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 8193)); },
    cancel() { cancelled = true; return new Promise(() => {}); },
  });
  const req = new Request('https://workbench.example/api/workbench/rea', { method: 'POST', headers: { Origin: 'https://workbench.example', 'Content-Type': 'application/json', 'X-Workbench-CSRF': token }, body: stream, duplex: 'half' });
  try {
    const result = await Promise.race([
      handleReaImportRequest(req, dependencies(null, { getUser: async () => ({ userId: 'owner-a', provider: 'github', csrfToken: token }), getDb() { accessed = true; } })),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('unbounded stream cancellation')), 1000); }),
    ]);
    assert.equal(result.status, 413);
    assert.equal(cancelled, true);
    assert.equal(accessed, false);
  } finally { clearTimeout(timeout); }
});

test('a stalled upload reaches its fixed read deadline without waiting on cancellation', { timeout: 15000 }, async () => {
  let cancelled = false, accessed = false;
  const token = 'c'.repeat(43);
  const stream = new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}); } });
  const req = new Request('https://workbench.example/api/workbench/rea', { method: 'POST', headers: { Origin: 'https://workbench.example', 'Content-Type': 'application/json', 'X-Workbench-CSRF': token }, body: stream, duplex: 'half' });
  const result = await handleReaImportRequest(req, dependencies(null, { getUser: async () => ({ userId: 'owner-a', provider: 'github', csrfToken: token }), getDb() { accessed = true; } }));
  assert.equal(result.status, 408);
  assert.equal(cancelled, true);
  assert.equal(accessed, false);
  assert.equal(result.headers.get('cache-control'), 'no-store');
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

test('failed scans persist only closed typed diagnostics and cannot infer a cause from messages or names', async t => {
  const privateValue = 'private upstream URL/body/token diagnostic';
  const cases = [
    [new GitHubRateLimitError(), 'github_rate_limited'],
    [new GitHubAcquisitionTimeoutError(), 'acquisition_timeout'],
    [Object.assign(new Error(privateValue), {name: 'GitHubRateLimitError'}), 'acquisition_failed'],
    [new Error('timeout rate limit ' + privateValue), 'acquisition_failed'],
  ];
  for (const [error, expectedCode] of cases) {
    error.message = privateValue;
    error.cause = {body: privateValue, url: privateValue};
    const db = database();
    t.after(() => db.close());
    let calls = 0;
    const mocked = scanner({ async inspectGitHub() { calls++; throw error; } });
    const svc = createWorkbenchService({ db, ownerId: 'owner-a', scanner: mocked });
    const project = await authorize(svc);
    const payload = { action: 'scan', projectId: project.id, requestId: REQUEST, revision: REVISION };
    const response = await handleWorkbenchRequest(request(payload), dependencies(db, {scanner: mocked}));
    assert.equal(response.status, 200);
    const {run} = await response.json();
    assert.equal(run.status, 'failed');
    assert.equal(run.failure_code, expectedCode);
    assert.equal(JSON.stringify(run).includes(privateValue), false);
    const stored = await db.prepare('SELECT result_json, failure_code, revision FROM workbench_runs WHERE id = ?').bind(run.id).first();
    assert.equal(stored.result_json, null);
    assert.equal(stored.revision, null);
    assert.equal(stored.failure_code, expectedCode);
    assert.equal((await svc.list()).runs[0].failure_code, expectedCode);
    assert.equal((await svc.act(payload)).run.id, run.id);
    assert.equal(calls, 1);
    await assert.rejects(svc.act({action: 'report', runId: run.id}), error => error.status === 409);
  }
});

test('the actual scanner deadline produces a typed timeout without a network call or automatic retry', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const db = database();
  t.after(() => db.close());
  let entered, requests = 0, aborted = false;
  const started = new Promise(resolve => { entered = resolve; });
  const mocked = scanner({
    async inspectGitHub() {
      return repositoryMetadata(REPO, {fetcher: async (_url, options) => {
        requests++;
        options.signal.addEventListener('abort', () => { aborted = true; }, {once: true});
        entered();
        return new Promise(() => {});
      }});
    },
  });
  const svc = createWorkbenchService({ db, ownerId: 'owner-a', scanner: mocked });
  const project = await authorize(svc);
  let settled = false;
  const pending = svc.act({action: 'scan', projectId: project.id, requestId: REQUEST, revision: REVISION});
  pending.finally(() => { settled = true; });
  await started;
  t.mock.timers.tick(SCANNER_LIMITS.deadlineMs - 1);
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(aborted, false);
  t.mock.timers.tick(1);
  const {run} = await pending;
  assert.equal(run.status, 'failed');
  assert.equal(run.failure_code, 'acquisition_timeout');
  assert.equal(aborted, true);
  assert.equal(requests, 1);
});

test('unconfirmed database writes never masquerade as acquisition failures or confirmed completion', async t => {
  const privateValue = 'private database diagnostic';
  for (const target of ['complete', 'failed']) {
    for (const failure of ['throw', 'unconfirmed', 'response-lost-after-commit']) {
      const db = database();
      t.after(() => db.close());
      let failedStateWrites = 0;
      const storage = { ...db, prepare(query) { return { bind(...values) {
        const bound = db.prepare(query).bind(...values);
        return { ...bound, async run() {
          const failureState = query.startsWith("UPDATE workbench_runs SET status = 'failed', failure_code = ?");
          if (failureState) failedStateWrites++;
          const selected = target === 'complete' ? query.startsWith("UPDATE workbench_runs SET status = 'complete'") : failureState;
          if (!selected) return bound.run();
          if (failure === 'response-lost-after-commit') await bound.run();
          if (failure === 'unconfirmed') return {success: false};
          throw new Error(privateValue);
        }};
      }}; }};
      const mocked = scanner(target === 'failed' ? {async inspectGitHub() {throw new GitHubRateLimitError();}} : {});
      const project = await authorize(createWorkbenchService({db: storage, ownerId: 'owner-a', scanner: mocked}));
      const response = await handleWorkbenchRequest(request({action: 'scan', projectId: project.id, requestId: REQUEST}), dependencies(storage, {scanner: mocked}));
      assert.equal(response.status, 503, `${target}/${failure}`);
      const body = await response.json();
      assert.match(body.error, /armazenamento não confirmou/);
      assert.equal(JSON.stringify(body).includes(privateValue), false);
      const stored = await db.prepare('SELECT status, failure_code, result_json FROM workbench_runs WHERE request_id = ?').bind(REQUEST).first();
      assert.equal(stored.status, failure === 'response-lost-after-commit' ? target : 'running');
      assert.equal(stored.failure_code, target === 'failed' && failure === 'response-lost-after-commit' ? 'github_rate_limited' : null);
      assert.equal(stored.result_json === null, !(target === 'complete' && failure === 'response-lost-after-commit'));
      assert.equal(failedStateWrites, target === 'failed' ? 1 : 0);
    }
  }
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

test('historical findings retain current review decisions and never cross owner boundaries', async () => {
  const db = database();
  const svc = createWorkbenchService({ db, ownerId: 'owner-a', scanner: scanner() });
  const project = await authorize(svc);
  const { run } = await svc.act({ action: 'scan', projectId: project.id, requestId: REQUEST });
  await svc.act({ action: 'review', runId: run.id, fingerprint: 'f1', decision: 'accepted_risk' });
  const reloaded = createWorkbenchService({ db, ownerId: 'owner-a', scanner: scanner() });
  const view = await reloaded.act({ action: 'findings' });
  assert.equal(view.findings[0].status, 'accepted_risk');
  assert.equal(view.findings[0].run_id, run.id);
  assert.equal(view.findings[0].project_id, project.id);
  assert.equal(view.runs_considered, 1);
  assert.equal(view.truncated, false);
  const other = createWorkbenchService({ db, ownerId: 'owner-b', scanner: scanner() });
  assert.deepEqual((await other.act({ action: 'findings' })).findings, []);
  assert.equal((await svc.list()).projects[0].has_runs, true);
  db.close();
});

test('historical sample signals omitted runs rather than presenting a complete count', async () => {
  const db = database();
  const svc = createWorkbenchService({ db, ownerId: 'owner-a', scanner: scanner() });
  const project = await authorize(svc);
  for (let i = 0; i < 21; i++) await svc.act({ action: 'scan', projectId: project.id, requestId: crypto.randomUUID() });
  const result = await svc.act({ action: 'findings' });
  assert.equal(result.runs_considered, 20);
  assert.equal(result.findings.length, 20);
  assert.equal(result.truncated, true);
  db.close();
});

test('GitHub POST requests require the session CSRF token before touching D1', async () => {
  let touched = false;
  const token = 'c'.repeat(43);
  const deps = dependencies(null, { getUser: async () => ({ userId: 'owner-a', provider: 'github', csrfToken: token }), getDb() { touched = true; } });
  for (const header of [undefined, 'wrong-token']) {
    const req = request({ action: 'findings' });
    if (header) req.headers.set('X-Workbench-CSRF', header);
    assert.equal((await handleWorkbenchRequest(req, deps)).status, 403);
  }
  assert.equal(touched, false);
  const db = database();
  const req = request({ action: 'findings' }, { 'X-Workbench-CSRF': token });
  assert.equal((await handleWorkbenchRequest(req, { ...deps, getDb: () => db })).status, 200);
  db.close();
});

test('REA upload guards reject anonymous, wrong-owner, oversized and wrong-action requests', async () => {
  let touched = false;
  const deps = dependencies(null, { getDb() { touched = true; } });
  assert.equal((await handleReaImportRequest(request({ evidence: '{}' }), { ...deps, getUser: async () => null })).status, 401);
  assert.equal((await handleReaImportRequest(request({ evidence: '{}' }), { ...deps, getUser: async () => ({ userId: 'other' }) })).status, 403);
  assert.equal((await handleReaImportRequest(request({ action: 'authorize' }), deps)).status, 400);
  const large = request({}, { 'Content-Length': String(3 * 1024 * 1024) });
  assert.equal((await handleReaImportRequest(large, deps)).status, 413);
  assert.equal(touched, false);
});

test('REA import persists only a safe projection and supports reload, review, report and bounded comparison', async () => {
  const db = database();
  const svc = createWorkbenchService({ db, ownerId: 'owner-a', scanner: scanner() });
  const project = await authorize(svc);
  const payload = { action: 'import-rea', projectId: project.id, requestId: REQUEST, revision: REVISION, evidence: reaFixture() };
  const token = 'c'.repeat(43);
  const uploaded = await handleReaImportRequest(request(payload, { 'X-Workbench-CSRF': token }, '/api/workbench/rea'),
    dependencies(db, { getUser: async () => ({ userId: 'owner-a', provider: 'github', csrfToken: token }) }));
  assert.equal(uploaded.status, 200);
  assert.equal(uploaded.headers.get('cache-control'), 'no-store');
  const { run } = await uploaded.json();
  assert.equal(run.source, 'rea-import');
  assert.equal(run.verified_revision, false);
  assert.equal(run.partial, true);
  assert.equal(run.findings[0].status, 'candidate');
  const stored = await db.prepare('SELECT result_json FROM workbench_runs WHERE id = ?').bind(run.id).first();
  assert.doesNotMatch(stored.result_json, /NEVER_PERSIST|normalized_result|local_path/);
  assert.equal((await svc.act(payload)).run.id, run.id);
  await assert.rejects(svc.act({ ...payload, evidence: payload.evidence + '\n' }), error => error.status === 409);
  await assert.rejects(svc.act({ action: 'scan', projectId: project.id, requestId: REQUEST, revision: REVISION }), error => error.status === 409);
  await svc.act({ action: 'review', runId: run.id, fingerprint: run.findings[0].fingerprint, decision: 'false_positive' });
  const reloaded = createWorkbenchService({ db, ownerId: 'owner-a', scanner: scanner() });
  assert.equal((await reloaded.act({ action: 'run', runId: run.id })).run.findings[0].status, 'false_positive');
  const realRenderer = createWorkbenchService({ db, ownerId: 'owner-a' });
  const report = (await realRenderer.act({ action: 'report', runId: run.id })).markdown;
  assert.match(report, /Proveniência da importação REA/);
  assert.match(report, /não executou o REA/);
  assert.doesNotMatch(report, /NEVER_PERSIST|até 20 arquivos/);
  const second = await reloaded.act({ ...payload, requestId: REQUEST2 });
  assert.equal((await svc.act({ action: 'compare', before: run.id, after: second.run.id })).comparison.partial, true);
  const scanned = await svc.act({ action: 'scan', projectId: project.id, requestId: crypto.randomUUID() });
  await assert.rejects(svc.act({ action: 'compare', before: run.id, after: scanned.run.id }), /mesmo método/);
  const other = createWorkbenchService({ db, ownerId: 'owner-b' });
  await assert.rejects(other.act({ ...payload, requestId: crypto.randomUUID() }), error => error.status === 404);
  db.close();
});

test('simultaneous matching REA uploads return one persisted run through HTTP', { timeout: 2000 }, async () => {
  const db = database(), shared = simultaneousRequestLookup(db);
  const svc = createWorkbenchService({ db: shared, ownerId: 'owner-a', scanner: scanner() });
  const project = await authorize(svc), token = 'c'.repeat(43);
  const payload = { projectId: project.id, requestId: REQUEST, revision: REVISION, evidence: reaFixture() };
  const deps = dependencies(shared, { getUser: async () => ({ userId: 'owner-a', provider: 'github', csrfToken: token }) });
  const replies = await Promise.all([handleReaImportRequest(request(payload, { 'X-Workbench-CSRF': token }, '/api/workbench/rea'), deps), handleReaImportRequest(request(payload, { 'X-Workbench-CSRF': token }, '/api/workbench/rea'), deps)]);
  assert.deepEqual(replies.map(reply => reply.status), [200, 200]);
  const imported = await Promise.all(replies.map(reply => reply.json()));
  assert.equal(imported[0].run.id, imported[1].run.id);
  assert.equal((await svc.list()).runs.length, 1);
  db.close();
});

test('concurrent imports reject conflicting report bytes or revision instead of returning another result', { timeout: 2000 }, async () => {
  for (const conflict of [{ evidence: reaFixture() + '\n' }, { revision: 'b'.repeat(40) }]) {
    const db = database(), shared = simultaneousRequestLookup(db);
    const svc = createWorkbenchService({ db: shared, ownerId: 'owner-a', scanner: scanner() });
    const project = await authorize(svc);
    const payload = { action: 'import-rea', projectId: project.id, requestId: REQUEST, revision: REVISION, evidence: reaFixture() };
    const results = await Promise.allSettled([svc.act(payload), svc.act({ ...payload, ...conflict })]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
    assert.equal((await svc.list()).runs.length, 1);
    db.close();
  }
});

test('GitHub acquisition and REA import never reuse the other method under concurrent request-ID collision', { timeout: 2000 }, async () => {
  const db = database(), shared = simultaneousRequestLookup(db);
  const svc = createWorkbenchService({ db: shared, ownerId: 'owner-a', scanner: scanner() });
  const project = await authorize(svc);
  const imported = { action: 'import-rea', projectId: project.id, requestId: REQUEST, revision: REVISION, evidence: reaFixture() };
  const acquired = { action: 'scan', projectId: project.id, requestId: REQUEST, revision: REVISION };
  const results = await Promise.allSettled([svc.act(imported), svc.act(acquired)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal((await svc.list()).runs.length, 1);
  db.close();
});


test('REA client retry after a lost response reuses one persisted analysis', async t => {
  const db = database();
  t.after(() => db.close());
  const svc = createWorkbenchService({ db, ownerId: 'owner-a', scanner: scanner() });
  const project = await authorize(svc), evidence = reaFixture();
  const reportDigest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(evidence)))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
  const attempts = newReaImportAttemptTracker(), token = 'c'.repeat(43);
  let lost = true;
  async function send() {
    const requestId = attempts.resolve({ projectId: project.id, commitSha: REVISION, reportDigest });
    const response = await handleReaImportRequest(request({ projectId: project.id, revision: REVISION, requestId, evidence },
      { 'X-Workbench-CSRF': token }, '/api/workbench/rea'),
    dependencies(db, { getUser: async () => ({ userId: 'owner-a', provider: 'github', csrfToken: token }) }));
    assert.equal(response.status, 200);
    if (lost) { lost = false; throw new TypeError('simulated response lost after persistence'); }
    return { ...await response.json(), requestId };
  }
  await assert.rejects(send(), /simulated response lost/);
  const repeated = await send();
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM workbench_runs').bind().first()).count, 1);
  assert.equal(repeated.run.id, (await svc.list()).runs[0].id);
  assert.equal(attempts.resetAfterSuccess({ id: repeated.requestId }), true);
  const next = await send();
  assert.notEqual(next.run.id, repeated.run.id);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM workbench_runs').bind().first()).count, 2);
});
