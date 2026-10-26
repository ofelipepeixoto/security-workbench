import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createGitHubAppAuth, isGitHubAppConfigured } from '../lib/github-app-auth.mjs';

const ORIGIN = 'https://workbench.example';
const TOKEN = 'ghu_inert_fixture_user_token';
const REFRESH = 'ghr_inert_refresh_never_persist';
const USER = { userId: 'legacy-owner', githubId: '101', provider: 'github', displayName: 'fixture-owner', csrfToken: 'c'.repeat(43) };
const OTHER = { ...USER, userId: 'github:202', githubId: '202' };
const config = { enabled: true, origin: ORIGIN, appId: '20', slug: 'fixture-workbench', clientId: 'Iv1.inert', clientSecret: 'inert_server_secret', encryptionKey: Buffer.alloc(32, 7).toString('base64url'), keyVersion: '1' };

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../drizzle/0003_github_app_connections.sql', import.meta.url), 'utf8'));
  return { sql, prepare(query) { return { bind(...args) {
    const statement = sql.prepare(query);
    return { async first() { return statement.get(...args) ?? null; }, async run() { const result = statement.run(...args); return { success: true, meta: { changes: Number(result.changes) } }; } };
  } }; }, close() { sql.close(); } };
}

function fixture(options = {}) {
  const db = database(), calls = [];
  let user = USER, time = Date.parse('2026-10-21T12:00:00Z');
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (options.fetcher) { const result = await options.fetcher(url, init); if (result) return result; }
    if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: TOKEN, expires_in: 28800, refresh_token: REFRESH, refresh_token_expires_in: 15897600, token_type: 'bearer', scope: '', ...options.token });
    if (url === 'https://api.github.com/user') return Response.json({ id: 101, login: 'fixture-owner', ...options.identity });
    if (url === 'https://api.github.com/applications/Iv1.inert/token') return new Response(null, { status: 204 });
    throw new Error('unexpected mock provider');
  };
  const auth = createGitHubAppAuth({ config: { ...config, ...options.config }, db, getUser: async () => user, fetcher, now: () => new Date(time) });
  return { db, auth, calls, fetcher, now: () => new Date(time), setUser(value) { user = value; }, advance(seconds) { time += seconds * 1000; } };
}

function request(path, cookie, options = {}) {
  return new Request(`${ORIGIN}${path}`, { ...options, headers: { ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
}
const mutation = (path, cookie, headers = {}) => request(path, cookie, { method: 'POST', headers: { Origin: ORIGIN, 'X-Workbench-CSRF': USER.csrfToken, ...headers } });
async function start(f) {
  const result = await f.auth.start(mutation('/api/auth/github-app/start'));
  assert.equal(result.status, 200);
  const body = await result.json(), url = new URL(body.authorization_url);
  return { result, url, state: url.searchParams.get('state'), cookie: result.headers.get('set-cookie').split(';')[0] };
}
async function connect(f) {
  const begin = await start(f);
  const callback = request(`/api/auth/github-app/callback?state=${begin.state}&code=inert_code`, begin.cookie);
  return { begin, callback, result: await f.auth.callback(callback) };
}
const count = (f, table) => Number(f.db.sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);

test('App connection is disabled by default and malformed configuration never reaches provider/storage', async () => {
  let touched = false;
  for (const bad of [{}, { ...config, enabled: false }, { ...config, encryptionKey: 'bad' }, { ...config, origin: 'http://example.com' }, { ...config, origin: `${ORIGIN}/other` }, { ...config, appId: '020' }, { ...config, keyVersion: '0' }, { ...config, clientSecret: '' }]) {
    assert.equal(isGitHubAppConfigured(bad), false);
    const auth = createGitHubAppAuth({ config: bad, getUser() { touched = true; }, db: { prepare() { touched = true; } }, fetcher() { touched = true; } });
    assert.equal((await auth.start(mutation('/api/auth/github-app/start'))).status, 503);
    assert.equal((await auth.getConnection(USER)).state, 'not_configured');
  }
  assert.equal(touched, false); assert.equal(isGitHubAppConfigured(config), true);
});

test('start is session-bound POST with Origin/CSRF and fixed PKCE authorization URL', async () => {
  const f = fixture();
  const begin = await start(f);
  assert.equal(begin.url.origin + begin.url.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(begin.url.searchParams.get('redirect_uri'), `${ORIGIN}/api/auth/github-app/callback`);
  assert.equal(begin.url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(begin.url.searchParams.get('scope'), 'offline_access');
  assert.match(begin.url.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.match(begin.result.headers.get('set-cookie'), /Secure; HttpOnly; SameSite=Lax/);
  assert.equal(begin.result.headers.get('cache-control'), 'no-store');
  assert.equal(f.calls.length, 0);
  for (const req of [request('/api/auth/github-app/start'), mutation('/api/auth/github-app/start', null, { Origin: 'https://evil.invalid' }), mutation('/api/auth/github-app/start', null, { 'X-Workbench-CSRF': 'wrong' })]) assert.equal((await f.auth.start(req)).status, 403);
  f.setUser(null);
  assert.equal((await f.auth.start(mutation('/api/auth/github-app/start'))).status, 401);
  f.db.close();
});

test('callback verifies same GitHub identity and stores only owner-bound encrypted short-lived access token', async () => {
  const f = fixture(), signed = await connect(f);
  assert.equal(signed.result.headers.get('location'), '/projects?github_app=connected');
  const row = f.db.sql.prepare('SELECT * FROM workbench_github_app_connections').get();
  assert.equal(row.owner_id, USER.userId); assert.equal(row.github_id, USER.githubId);
  assert.equal(row.expires_at - row.created_at, 28800);
  const stored = JSON.stringify(row);
  for (const value of [TOKEN, REFRESH, config.clientSecret, config.encryptionKey]) assert.ok(!stored.includes(value));
  assert.deepEqual(Object.keys(JSON.parse(row.token_envelope)).sort(), ['ciphertext', 'iv', 'v']);
  assert.equal(count(f, 'workbench_github_app_flows'), 0);
  assert.deepEqual(await f.auth.getConnection(USER), { connect_path: '/api/auth/github-app/start', manage_url: 'https://github.com/settings/installations', installation_url: 'https://github.com/apps/fixture-workbench/installations/new', state: 'connected', connected: true, expires_at: '2026-10-21T20:00:00.000Z', validated_at: '2026-10-21T12:00:00.000Z' });
  const client = await f.auth.getClient(USER);
  assert.deepEqual(await client.getIdentity(), { id: 101, login: 'fixture-owner' });
  assert.equal(f.calls[2].init.headers.Authorization, `Bearer ${TOKEN}`);
  const form = new URLSearchParams(f.calls[0].init.body);
  assert.ok(form.get('code_verifier')); assert.equal(form.get('client_secret'), config.clientSecret);
  assert.ok(f.calls.every(call => call.init.redirect === 'manual' && call.init.credentials === 'omit'));
  f.db.close();
});

test('wrong GitHub account, forged state, other workspace session and callback replay never connect', async () => {
  const f = fixture({ identity: { id: 202 } }), signed = await connect(f);
  assert.equal(signed.result.headers.get('location'), '/projects?github_app=forbidden'); assert.equal(count(f, 'workbench_github_app_connections'), 0);
  const before = f.calls.length;
  assert.equal((await f.auth.callback(signed.callback)).headers.get('location'), '/projects?github_app=invalid');
  assert.equal(f.calls.length, before);
  const begin = await start(f); f.setUser(OTHER);
  assert.equal((await f.auth.callback(request(`/api/auth/github-app/callback?state=${begin.state}&code=inert`, begin.cookie))).headers.get('location'), '/projects?github_app=invalid');
  assert.equal(f.calls.length, before);
  f.db.close();
});

test('non-expiring tokens, installation tokens and unexpected scopes are rejected', async () => {
  for (const token of [{ expires_in: undefined }, { expires_in: 28801 }, { expires_in: 0 }, { access_token: 'ghs_inert_installation_token' }, { scope: 'repo' }]) {
    const f = fixture({ token }), signed = await connect(f);
    assert.equal(signed.result.headers.get('location'), '/projects?github_app=unavailable');
    assert.equal(count(f, 'workbench_github_app_connections'), 0);
    assert.equal(f.calls.length, 1); f.db.close();
  }
});

test('denied consent, duplicate query parameters and missing browser binding are safe', async () => {
  const f = fixture(), begin = await start(f);
  for (const req of [request(`/api/auth/github-app/callback?state=${begin.state}&state=${begin.state}&code=inert`, begin.cookie), request(`/api/auth/github-app/callback?state=${begin.state}&code=inert`)]) assert.equal((await f.auth.callback(req)).headers.get('location'), '/projects?github_app=invalid');
  assert.equal((await f.auth.callback(request(`/api/auth/github-app/callback?state=${begin.state}&error=access_denied`, begin.cookie))).headers.get('location'), '/projects?github_app=denied');
  assert.equal(f.calls.length, 0); f.db.close();
});

test('expired connection and key rotation require reconnect, preserving separation from login', async () => {
  const f = fixture(); await connect(f);
  const rotated = createGitHubAppAuth({ config: { ...config, keyVersion: '2' }, db: f.db, getUser: async () => USER, fetcher: f.fetcher, now: f.now });
  assert.equal((await rotated.getConnection(USER)).connected, false);
  await assert.rejects(rotated.getClient(USER), { code: 'disconnected' });
  f.advance(28801);
  assert.equal((await f.auth.getConnection(USER)).state, 'expired');
  await assert.rejects(f.auth.getClient(USER), { code: 'disconnected' });
  assert.equal(USER.provider, 'github'); f.db.close();
});

test('swapped owner/identity/expiry and ciphertext tampering cannot decrypt another connection', async () => {
  for (const change of ["owner_id = 'github:202', github_id = '202'", 'expires_at = expires_at + 1', "token_envelope = '{}'", "token_envelope = replace(token_envelope, 'ciphertext', 'changed')"]) {
    const f = fixture(); await connect(f);
    f.db.sql.exec(`UPDATE workbench_github_app_connections SET ${change}`);
    await assert.rejects(f.auth.getClient(change.startsWith('owner_id') ? OTHER : USER), { code: 'disconnected' }); f.db.close();
  }
});

test('disconnect revokes local access and reports provider revocation independently', async () => {
  for (const failProvider of [false, true]) {
    const f = fixture({ fetcher: url => failProvider && url.includes('/applications/') ? new Response('not logged', { status: 503 }) : null });
    await connect(f);
    const result = await f.auth.disconnectRequest(mutation('/api/auth/github-app/disconnect'));
    assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true, provider_revoked: !failProvider });
    assert.equal(count(f, 'workbench_github_app_connections'), 0);
    assert.equal(count(f, 'workbench_github_app_flows'), 0);
    await assert.rejects(f.auth.getClient(USER), { code: 'disconnected' }); f.db.close();
  }
});

test('concurrent callbacks consume a flow only once', async () => {
  const f = fixture(), begin = await start(f);
  const requestForCallback = () => request(`/api/auth/github-app/callback?state=${begin.state}&code=inert`, begin.cookie);
  const responses = await Promise.all([f.auth.callback(requestForCallback()), f.auth.callback(requestForCallback())]);
  assert.deepEqual(responses.map(response => response.headers.get('location')).sort(), ['/projects?github_app=connected', '/projects?github_app=invalid']);
  assert.equal(f.calls.filter(call => call.url.includes('/access_token')).length, 1);
  assert.equal(count(f, 'workbench_github_app_connections'), 1); f.db.close();
});

test('disconnect during callback cannot restore access after the provider responds', async () => {
  let release, entered;
  const observed = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const f = fixture({ fetcher: async url => { if (url.includes('/access_token')) { entered(); await wait; } } });
  const begin = await start(f);
  const pending = f.auth.callback(request(`/api/auth/github-app/callback?state=${begin.state}&code=inert`, begin.cookie));
  await observed;
  assert.equal((await f.auth.disconnectRequest(mutation('/api/auth/github-app/disconnect'))).status, 200);
  release();
  assert.equal((await pending).headers.get('location'), '/projects?github_app=invalid');
  assert.equal(count(f, 'workbench_github_app_connections'), 0); f.db.close();
});

test('login revoked while callback is in flight cannot create a connection', async () => {
  let release, entered;
  const observed = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const f = fixture({ fetcher: async url => { if (url.includes('/access_token')) { entered(); await wait; } } });
  const begin = await start(f), pending = f.auth.callback(request(`/api/auth/github-app/callback?state=${begin.state}&code=inert`, begin.cookie));
  await observed; f.setUser(null); release();
  assert.equal((await pending).headers.get('location'), '/projects?github_app=unavailable');
  assert.equal(count(f, 'workbench_github_app_connections'), 0); f.db.close();
});

test('pending flow bounds are per-user and global, without provider calls', async () => {
  const f = fixture();
  for (let index = 0; index < 4; index++) await start(f);
  const result = await f.auth.start(mutation('/api/auth/github-app/start'));
  assert.equal(result.status, 429); assert.equal(count(f, 'workbench_github_app_flows'), 4);
  assert.equal(f.calls.length, 0); f.advance(601);
  assert.equal((await f.auth.start(mutation('/api/auth/github-app/start'))).status, 200); f.db.close();
});

test('storage failure is not an empty catalog or a successful connection', async () => {
  const broken = { prepare() { throw new Error('private database error'); } };
  const auth = createGitHubAppAuth({ config, db: broken, getUser: async () => USER });
  const result = await auth.start(mutation('/api/auth/github-app/start'));
  assert.equal(result.status, 503); assert.doesNotMatch(await result.text(), /private database/);
  await assert.rejects(auth.getConnection(USER), { code: 'unavailable' });
});

test('connection status validates the provider, distinguishes revocation and purges the credential', async () => {
  let revoked = false;
  const f = fixture({ fetcher: url => revoked && url === 'https://api.github.com/user' ? new Response('not exposed', { status: 401 }) : null });
  await connect(f);
  revoked = true;
  const status = await f.auth.getConnection(USER);
  assert.equal(status.state, 'revoked'); assert.equal(status.connected, false);
  assert.equal(count(f, 'workbench_github_app_connections'), 0);
  assert.equal((await f.auth.getConnection(USER)).state, 'not_connected');
  f.db.close();
});

test('connection status never turns provider rate limit into disconnected or empty', async () => {
  let limited = false;
  const f = fixture({ fetcher: url => limited && url === 'https://api.github.com/user' ? new Response('not exposed', { status: 429, headers: { 'Retry-After': '60' } }) : null });
  await connect(f); limited = true;
  await assert.rejects(f.auth.getConnection(USER), error => error.code === 'rate_limited' && Date.parse(error.retryAt) >= f.now().valueOf() + 60000);
  assert.equal(count(f, 'workbench_github_app_connections'), 1); f.db.close();
});

test('a delayed connection status cannot delete or validate a replaced or disconnected credential generation', async () => {
  for (const change of ['reconnect', 'disconnect']) {
    for (const status of [200, 401]) {
      let checking = false, observed, resume;
      const reached = new Promise(resolve => { observed = resolve; });
      const f = fixture({ fetcher: async url => {
        if (checking && url === 'https://api.github.com/user') {
          checking = false; observed();
          return new Promise(resolve => { resume = resolve; });
        }
        return null;
      } });
      try {
        await connect(f);
        const oldEnvelope = f.db.sql.prepare('SELECT token_envelope FROM workbench_github_app_connections').get().token_envelope;
        checking = true;
        const pending = f.auth.getConnection(USER);
        const rejected = assert.rejects(pending, { code: 'unavailable' });
        await reached;
        if (change === 'reconnect') await connect(f);
        else assert.equal((await f.auth.disconnectRequest(mutation('/api/auth/github-app/disconnect'))).status, 200);
        const replacement = f.db.sql.prepare('SELECT token_envelope FROM workbench_github_app_connections').get()?.token_envelope;
        if (change === 'reconnect') assert.notEqual(replacement, oldEnvelope);
        else assert.equal(replacement, undefined);
        resume(status === 200 ? Response.json({ id: 101, login: 'fixture-owner' }) : new Response('inert denial', { status }));
        await rejected;
        assert.equal(f.db.sql.prepare('SELECT token_envelope FROM workbench_github_app_connections').get()?.token_envelope, replacement);
        assert.equal((await f.auth.getConnection(USER)).state, change === 'reconnect' ? 'connected' : 'not_connected');
      } finally { f.db.close(); }
    }
  }
});

test('a connection expiring during the provider check is not reported as connected', async () => {
  let checking = false, observed, resume;
  const reached = new Promise(resolve => { observed = resolve; });
  const f = fixture({ fetcher: async url => {
    if (checking && url === 'https://api.github.com/user') {
      checking = false; observed();
      return new Promise(resolve => { resume = resolve; });
    }
    return null;
  } });
  try {
    await connect(f); checking = true;
    const pending = f.auth.getConnection(USER);
    await reached; f.advance(28801);
    resume(Response.json({ id: 101, login: 'fixture-owner' }));
    const status = await pending;
    assert.equal(status.state, 'expired'); assert.equal(status.connected, false);
    assert.equal(count(f, 'workbench_github_app_connections'), 1);
  } finally { f.db.close(); }
});

test('callback rejects redirects and oversized provider responses without following a new URL', async () => {
  for (const provider of [new Response(null, { status: 302, headers: { Location: 'https://evil.invalid' } }), new Response('{}', { headers: { 'Content-Length': '32769' } })]) {
    const f = fixture({ fetcher: url => url.includes('/access_token') ? provider : null });
    const signed = await connect(f);
    assert.equal(signed.result.headers.get('location'), '/projects?github_app=unavailable');
    assert.equal(count(f, 'workbench_github_app_connections'), 0); assert.equal(f.calls.length, 1); f.db.close();
  }
});
