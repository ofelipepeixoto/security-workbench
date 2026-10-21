import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createGitHubAuth } from '../lib/github-auth.mjs';
import { createWorkbenchService, handleWorkbenchRequest } from '../lib/workbench-service.mjs';

// Local integration only: no hosted identity, target acquisition or real OAuth.
const ORIGIN = 'https://workbench.example';
const OWNER = 'existing-site-owner';
const OTHER_OWNER = 'another-site-owner';
const REPO = 'ofelipepeixoto/inert-owner-fixture';
const REVISION = 'a'.repeat(40);
const FLOW_COOKIE = '__Host-workbench_github_flow';
const SESSION_COOKIE = '__Host-workbench_github_session';
const NOW = new Date('2026-10-21T12:00:00Z');
const CONFIG = {
  enabled: true, origin: ORIGIN, clientId: 'inert_client', clientSecret: 'inert_secret',
  githubOwnerId: '101', workbenchOwnerId: OWNER,
};

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  const directory = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
    sql.exec(readFileSync(new URL(file, directory), 'utf8'));
  }
  return {
    sql,
    prepare(query) {
      return { bind(...values) {
        const statement = sql.prepare(query);
        return {
          async first() { return statement.get(...values) ?? null; },
          async all() { return { results: statement.all(...values) }; },
          async run() {
            return { success: true, meta: { changes: Number(statement.run(...values).changes) } };
          },
        };
      } };
    },
    close() { sql.close(); },
  };
}

const scanner = {
  normalizeRepo(repo) { assert.equal(repo, REPO); return repo; },
  async repositoryMetadata(repo) {
    return { repo, repository_id: 17, default_branch: 'main', private: false };
  },
  async inspectGitHub(repo, repositoryId, revision) {
    assert.equal(repo, REPO);
    assert.equal(repositoryId, 17);
    assert.equal(revision, REVISION);
    return {
      repository_id: 17, revision: REVISION, snapshot_digest: 'b'.repeat(64),
      files_read: 1, bytes_read: 40, partial: false, omissions: [], dependencies: [],
      source: 'local-test-fixture', verified_revision: true,
      findings: [{
        fingerprint: 'inert-structural-candidate', kind: 'structural-observation',
        path: 'fixture.js', line: 1, status: 'candidate',
        evidence: 'Inert fixture for identity isolation; no confirmed vulnerability.',
      }],
    };
  },
  renderReport(run) {
    return `# Local fixture\n${run.repo}\n${run.findings.map(finding => finding.status).join(',')}\n`;
  },
};

function request(path, sessionCookie, payload) {
  return new Request(`${ORIGIN}${path}`, {
    ...(payload ? { method: 'POST', body: JSON.stringify(payload) } : {}),
    headers: {
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      ...(payload ? { Origin: ORIGIN, 'Content-Type': 'application/json' } : {}),
    },
  });
}

function cookie(response, name) {
  return response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0] ?? null;
}

function fixture(t, githubUser = { id: 101, login: 'fixture-owner' }) {
  const db = database();
  t.after(() => db.close());
  const calls = [];
  const auth = createGitHubAuth({
    config: CONFIG, db, now: () => NOW,
    async fetcher(url, init) {
      calls.push(url);
      assert.equal(init.redirect, 'manual');
      if (url === 'https://github.com/login/oauth/access_token') {
        assert.equal(new URLSearchParams(init.body).get('code'), 'inert_code');
        return Response.json({ access_token: 'inert_mock_token', token_type: 'bearer', scope: '' });
      }
      assert.equal(url, 'https://api.github.com/user');
      assert.equal(init.headers.Authorization, 'Bearer inert_mock_token');
      return Response.json(githubUser);
    },
  });
  async function signIn() {
    const start = await auth.start(request('/api/auth/github/start'));
    assert.equal(start.status, 302);
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const response = await auth.callback(request(`/api/auth/github/callback?state=${state}&code=inert_code`, cookie(start, FLOW_COOKIE)));
    return { response, sessionCookie: cookie(response, SESSION_COOKIE) };
  }
  async function api(sessionCookie, payload) {
    const incoming = request('/api/workbench', sessionCookie, payload);
    const session = await auth.getSession(incoming);
    if (payload && session) incoming.headers.set('X-Workbench-CSRF', session.csrfToken);
    return handleWorkbenchRequest(incoming, {
      getUser: () => auth.getSession(incoming), getDb: () => db,
      authorizedOwnerId: OWNER, scanner, now: () => NOW,
    });
  }
  return { db, auth, calls, signIn, api };
}

async function seedOwner(db, ownerId) {
  const service = createWorkbenchService({ db, ownerId, scanner, now: () => NOW });
  const { project } = await service.act({ action: 'authorize', repo: REPO, repositoryId: 17, confirmed: true });
  const { run } = await service.act({ action: 'scan', projectId: project.id, requestId: crypto.randomUUID(), revision: REVISION });
  assert.equal(run.status, 'complete');
  await service.act({ action: 'review', runId: run.id, fingerprint: 'inert-structural-candidate', decision: 'false_positive' });
  return { service, project, run };
}

test('GitHub owner session opens existing canonical history and cannot read or change another owner', async t => {
  const f = fixture(t);
  // These records exist before the GitHub sign-in is introduced.
  const existing = await seedOwner(f.db, OWNER);
  const other = await seedOwner(f.db, OTHER_OWNER);
  const before = await existing.service.list();
  const signed = await f.signIn();
  assert.equal(signed.response.status, 303);
  assert.equal(signed.response.headers.get('location'), '/');
  assert.ok(signed.sessionCookie);
  assert.equal(f.calls.length, 2);
  const session = await f.auth.getSession(request('/', signed.sessionCookie));
  assert.equal(session.userId, OWNER);
  assert.equal(session.provider, 'github');
  assert.notEqual(session.userId, CONFIG.githubOwnerId);

  const list = await f.api(signed.sessionCookie);
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), before);
  const detail = await f.api(signed.sessionCookie, { action: 'run', runId: existing.run.id });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).run.findings[0].status, 'false_positive');

  const reviewed = await f.api(signed.sessionCookie, {
    action: 'review', runId: existing.run.id, fingerprint: 'inert-structural-candidate', decision: 'accepted_risk',
  });
  assert.equal(reviewed.status, 200);
  const originalView = await existing.service.act({ action: 'run', runId: existing.run.id });
  assert.equal(originalView.run.findings[0].status, 'accepted_risk');
  const report = await f.api(signed.sessionCookie, { action: 'report', runId: existing.run.id });
  assert.equal(report.status, 200);
  assert.match((await report.json()).markdown, /accepted_risk/);

  for (const action of [
    { action: 'run', runId: other.run.id },
    { action: 'report', runId: other.run.id },
    { action: 'review', runId: other.run.id, fingerprint: 'inert-structural-candidate', decision: 'confirmed' },
    { action: 'scan', projectId: other.project.id, requestId: crypto.randomUUID(), revision: REVISION },
    { action: 'compare', before: existing.run.id, after: other.run.id },
  ]) {
    const denied = await f.api(signed.sessionCookie, { ...action, ownerId: OTHER_OWNER });
    assert.equal(denied.status, 404);
  }
  assert.equal((await other.service.act({ action: 'run', runId: other.run.id })).run.findings[0].status, 'false_positive');
  assert.equal(f.db.sql.prepare('SELECT count(*) AS count FROM workbench_projects').get().count, 2);
  assert.equal(f.db.sql.prepare('SELECT count(*) AS count FROM workbench_runs').get().count, 2);
});

test('a different GitHub numeric identity cannot obtain an owner session or access existing data', async t => {
  // A matching login cannot substitute for the configured numeric identity.
  const f = fixture(t, { id: 202, login: 'fixture-owner' });
  const existing = await seedOwner(f.db, OWNER);
  const signed = await f.signIn();
  assert.equal(signed.response.status, 303);
  assert.equal(signed.response.headers.get('location'), '/access?auth=forbidden');
  assert.equal(signed.sessionCookie, null);
  assert.equal(f.db.sql.prepare('SELECT count(*) AS count FROM workbench_github_sessions').get().count, 0);
  assert.equal(f.calls.length, 2);
  for (const payload of [undefined, { action: 'run', runId: existing.run.id }, { action: 'report', runId: existing.run.id, ownerId: OWNER }]) {
    const denied = await f.api(signed.sessionCookie, payload);
    assert.equal(denied.status, 401);
    assert.deepEqual(Object.keys(await denied.json()), ['error']);
  }
  assert.equal((await existing.service.list()).runs.length, 1);
});

test('logout revokes the actual API session while preserving canonical owner history for a new login', async t => {
  const f = fixture(t);
  const existing = await seedOwner(f.db, OWNER);
  const signed = await f.signIn();
  const session = await f.auth.getSession(request('/', signed.sessionCookie));
  const logout = await f.auth.logout(new Request(`${ORIGIN}/api/auth/github/logout`, {
    method: 'POST', headers: { Cookie: signed.sessionCookie, Origin: ORIGIN, 'X-Workbench-CSRF': session.csrfToken },
  }));
  assert.equal(logout.status, 200);
  assert.match(logout.headers.getSetCookie()[0], /Max-Age=0/);
  // Even a client replaying the previous cookie no longer reaches real data.
  assert.equal((await f.api(signed.sessionCookie)).status, 401);
  assert.equal((await f.api(null, { action: 'report', runId: existing.run.id })).status, 401);

  const again = await f.signIn();
  assert.notEqual(again.sessionCookie, signed.sessionCookie);
  const history = await f.api(again.sessionCookie);
  assert.equal(history.status, 200);
  assert.deepEqual(await history.json(), await existing.service.list());
});
