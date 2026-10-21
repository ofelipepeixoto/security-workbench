import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createGitHubAuth, isGitHubLoginConfigured } from '../lib/github-auth.mjs';

const ORIGIN = 'https://workbench.example';
const FLOW = '__Host-workbench_github_flow';
const SESSION = '__Host-workbench_github_session';
const TOKEN = 'inert_provider_token_not_a_credential';
const config = { enabled: true, origin: ORIGIN, clientId: 'inert_client', clientSecret: 'inert_client_secret', githubOwnerId: '101', workbenchOwnerId: 'existing-site-owner' };
const hash = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('base64url');

function database() {
  const sql = new DatabaseSync(':memory:');
  const directory = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(file, directory), 'utf8'));
  return { sql, prepare(query) { return { bind(...values) {
    const statement = sql.prepare(query);
    return {
      async first() { return statement.get(...values) ?? null; },
      async run() { const result = statement.run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
  } }; }, close() { sql.close(); } };
}
function fixture(options = {}) {
  const db = database(), calls = [];
  let time = Date.parse('2026-10-21T12:00:00Z');
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (options.fetcher) return options.fetcher(url, init);
    if (url === 'https://github.com/login/oauth/access_token') return new Response(JSON.stringify({ access_token: TOKEN, token_type: 'bearer', scope: '', ...options.token }), { status: 200 });
    assert.equal(url, 'https://api.github.com/user');
    return new Response(JSON.stringify({ id: 101, login: 'fixture-owner', ...options.user }), { status: 200 });
  };
  const now = () => new Date(time);
  const auth = createGitHubAuth({ config: { ...config, ...options.config }, db, fetcher, now });
  return { db, calls, auth, now, advance(seconds) { time += seconds * 1000; } };
}
const request = (path, cookie, options = {}) => new Request(`${ORIGIN}${path}`, { ...options, headers: { ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
function cookieValue(response, name) {
  const value = response.headers.getSetCookie().find(item => item.startsWith(`${name}=`));
  return value?.split(';')[0] ?? null;
}
async function start(f) {
  const result = await f.auth.start(request('/api/auth/github/start'));
  assert.equal(result.status, 302);
  const location = new URL(result.headers.get('location'));
  return { result, state: location.searchParams.get('state'), cookie: cookieValue(result, FLOW), location };
}
async function signIn(f, extra = {}) {
  const begin = await start(f);
  const result = await f.auth.callback(request(`/api/auth/github/callback?state=${begin.state}&code=inert_code`, begin.cookie, extra));
  return { begin, result, sessionCookie: cookieValue(result, SESSION) };
}
function faultingStorage(db, fault) {
  return { prepare(query) { return { bind(...values) {
    const bound = db.prepare(query).bind(...values);
    return {
      async first() { if (fault.read) throw new Error('storage'); return bound.first(); },
      async run() {
        if (fault.write === 'throw') throw new Error('storage');
        if (fault.write === 'result') return { success: false };
        return bound.run();
      },
    };
  } }; } };
}

test('disabled or invalid configuration never reaches storage/provider or grants access', async () => {
  let touched = false;
  const db = { prepare() { touched = true; throw new Error('sensitive'); } };
  for (const bad of [{}, { ...config, enabled: false }, { ...config, origin: 'http://workbench.example' }, { ...config, origin: `${ORIGIN}/evil` }, { ...config, clientSecret: '' }, { ...config, githubOwnerId: '0' }, { ...config, githubOwnerId: '01' }, { ...config, workbenchOwnerId: '' }]) {
    assert.equal(isGitHubLoginConfigured(bad), false);
    const auth = createGitHubAuth({ config: bad, db, fetcher() { touched = true; throw new Error('sensitive'); } });
    assert.equal((await auth.start(request('/api/auth/github/start'))).status, 503);
    assert.equal(await auth.getSession(request('/')), null);
    assert.equal((await auth.callback(request('/api/auth/github/callback'))).headers.get('location'), '/access?auth=unavailable');
  }
  assert.equal(touched, false);
  assert.equal(isGitHubLoginConfigured(config), true);
});

test('start uses fixed GitHub, exact callback, empty scope, PKCE S256 and host-bound cookie', async () => {
  const f = fixture(), begin = await start(f);
  assert.equal(begin.location.origin + begin.location.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(begin.location.searchParams.get('redirect_uri'), `${ORIGIN}/api/auth/github/callback`);
  assert.equal(begin.location.searchParams.get('scope'), '');
  assert.equal(begin.location.searchParams.get('code_challenge_method'), 'S256');
  const row = f.db.sql.prepare('SELECT * FROM workbench_oauth_flows').get();
  assert.equal(row.state_hash, await hash(begin.state));
  assert.equal(row.browser_hash, await hash(begin.cookie.split('=')[1]));
  assert.equal(begin.location.searchParams.get('code_challenge'), await hash(row.verifier));
  const header = begin.result.headers.getSetCookie()[0];
  assert.match(header, /Path=\/; Max-Age=600; Secure; HttpOnly; SameSite=Lax/);
  assert.doesNotMatch(header, /Domain=/i);
  assert.equal(begin.result.headers.get('cache-control'), 'no-store');
  assert.equal(begin.result.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(f.calls.length, 0);
  f.db.close();
});

test('successful callback verifies stable ID, preserves canonical owner, stores hashes, never provider token', async () => {
  const f = fixture(), signed = await signIn(f);
  assert.equal(signed.result.status, 303);
  assert.equal(signed.result.headers.get('location'), '/');
  assert.equal(f.calls.length, 2);
  const body = new URLSearchParams(f.calls[0].init.body);
  assert.equal(body.get('client_secret'), config.clientSecret);
  assert.equal(body.get('redirect_uri'), `${ORIGIN}/api/auth/github/callback`);
  assert.ok(body.get('code_verifier'));
  assert.equal(f.calls[1].init.headers.Authorization, `Bearer ${TOKEN}`);
  for (const call of f.calls) {
    assert.equal(call.init.redirect, 'manual');
    assert.equal(call.init.credentials, 'omit');
    assert.equal(call.init.cache, 'no-store');
  }
  const token = signed.sessionCookie.split('=')[1];
  const row = f.db.sql.prepare('SELECT * FROM workbench_github_sessions').get();
  assert.equal(row.token_hash, await hash(token));
  const session = await f.auth.getSession(request('/', signed.sessionCookie));
  assert.equal(session.userId, config.workbenchOwnerId);
  assert.equal(session.provider, 'github');
  assert.equal(session.displayName, 'fixture-owner');
  assert.equal(row.csrf_hash, await hash(session.csrfToken));
  const stored = JSON.stringify(row);
  assert.doesNotMatch(stored, new RegExp(TOKEN));
  assert.equal(stored.includes(token), false);
  assert.equal(stored.includes(config.clientSecret), false);
  assert.equal(f.db.sql.prepare('SELECT count(*) AS n FROM workbench_oauth_flows').get().n, 0);
  f.db.close();
});

test('provider consent denial consumes the bound state without fetching and cannot be replayed', async () => {
  const f = fixture(), begin = await start(f);
  const req = request(`/api/auth/github/callback?state=${begin.state}&error=access_denied`, begin.cookie);
  assert.equal((await f.auth.callback(req)).headers.get('location'), '/access?auth=denied');
  assert.equal((await f.auth.callback(req)).headers.get('location'), '/access?auth=invalid');
  assert.equal(f.calls.length, 0);
  f.db.close();
});

test('missing/mismatched cookies, duplicate parameters and expired states never exchange a code', async () => {
  for (const variant of ['no-cookie', 'wrong-cookie', 'duplicate-state', 'duplicate-code', 'expired']) {
    const f = fixture(), begin = await start(f);
    let params = `state=${begin.state}&code=inert_code`, cookies = begin.cookie;
    if (variant === 'no-cookie') cookies = null;
    if (variant === 'wrong-cookie') cookies = `${FLOW}=${'z'.repeat(43)}`;
    if (variant === 'duplicate-state') params += `&state=${begin.state}`;
    if (variant === 'duplicate-code') params += '&code=other';
    if (variant === 'expired') f.advance(601);
    assert.equal((await f.auth.callback(request(`/api/auth/github/callback?${params}`, cookies))).headers.get('location'), '/access?auth=invalid');
    assert.equal(f.calls.length, 0);
    f.db.close();
  }
});

test('callback replay and concurrent callbacks exchange only once', async () => {
  const f = fixture(), begin = await start(f);
  const req = request(`/api/auth/github/callback?state=${begin.state}&code=inert_code`, begin.cookie);
  const results = await Promise.all([f.auth.callback(req), f.auth.callback(req)]);
  assert.deepEqual(results.map(result => result.headers.get('location')).sort(), ['/', '/access?auth=invalid']);
  assert.equal(f.calls.length, 2);
  assert.equal((await f.auth.callback(req)).headers.get('location'), '/access?auth=invalid');
  f.db.close();
});

test('valid GitHub accounts, usernames or emails cannot replace the authorized numeric ID', async () => {
  for (const user of [{ id: 102, login: 'fixture-owner', email: 'inert@example.invalid' }, { id: '101' }, { id: null }, { id: 0 }, { id: 101, login: '<script>' }]) {
    const f = fixture({ user }), signed = await signIn(f);
    assert.equal(signed.sessionCookie, null);
    assert.notEqual(signed.result.headers.get('location'), '/');
    assert.equal(f.db.sql.prepare('SELECT count(*) AS n FROM workbench_github_sessions').get().n, 0);
    f.db.close();
  }
});

test('excess provider scopes or malformed responses fail closed without session or reflected secrets', async () => {
  for (const token of [{ scope: 'repo' }, { scope: 'user:email' }, { token_type: 'other' }, { access_token: '' }, { error: TOKEN }]) {
    const f = fixture({ token }), signed = await signIn(f);
    assert.equal(signed.result.headers.get('location'), '/access?auth=unavailable');
    assert.equal(signed.sessionCookie, null);
    assert.equal(f.calls.length, 1);
    assert.doesNotMatch(await signed.result.text(), new RegExp(TOKEN));
    f.db.close();
  }
});

test('provider redirects, failures, oversized streams, content length and invalid JSON are bounded', async () => {
  for (const response of [
    () => new Response(null, { status: 302, headers: { Location: 'https://outside.example/token' } }),
    () => new Response('private failure', { status: 500 }),
    () => new Response('x'.repeat(17000)),
    () => new Response('{}', { headers: { 'Content-Length': '999999' } }),
    () => new Response('invalid json'),
  ]) {
    const f = fixture({ fetcher: async () => response() }), signed = await signIn(f);
    assert.equal(signed.result.headers.get('location'), '/access?auth=unavailable');
    assert.equal(f.calls.length, 1);
    assert.equal(signed.sessionCookie, null);
    f.db.close();
  }
});

test('a provider stream with unending cancellation never delays callback failure', async () => {
  for (const variant of ['status', 'content-length', 'stream-size']) {
    let cancelled = false;
    const f = fixture({ fetcher: async () => new Response(new ReadableStream({
      start(controller) { if (variant === 'stream-size') controller.enqueue(new Uint8Array(17000)); },
      cancel() { cancelled = true; return new Promise(() => {}); },
    }), variant === 'status' ? { status: 503 } : variant === 'content-length' ? { headers: { 'Content-Length': '999999' } } : {}) });
    let timeout;
    try {
      const signed = await Promise.race([signIn(f), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('cancellation exceeded deadline')), 1000); })]);
      assert.equal(signed.result.headers.get('location'), '/access?auth=unavailable');
      assert.equal(signed.sessionCookie, null);
      assert.equal(cancelled, true);
    } finally { clearTimeout(timeout); f.db.close(); }
  }
});

test('a hung provider is aborted after the finite callback deadline', async () => {
  let signal;
  const f = fixture({ fetcher: async (_url, init) => {
    signal = init.signal;
    return new Promise(() => {});
  } });
  const signed = await signIn(f);
  assert.equal(signal.aborted, true);
  assert.equal(signed.result.headers.get('location'), '/access?auth=unavailable');
  assert.equal(signed.sessionCookie, null);
  assert.equal(f.calls.length, 1);
  f.db.close();
});

test('session expiry, owner config changes, tampered and duplicate cookies revoke local access', async () => {
  const f = fixture(), signed = await signIn(f);
  assert.equal(await f.auth.getSession(request('/', `${signed.sessionCookie}; ${signed.sessionCookie}`)), null);
  assert.equal(await f.auth.getSession(request('/', `${SESSION}=${'x'.repeat(43)}`)), null);
  const changed = createGitHubAuth({ config: { ...config, githubOwnerId: '102' }, db: f.db });
  assert.equal(await changed.getSession(request('/', signed.sessionCookie)), null);
  const changedOwner = createGitHubAuth({ config: { ...config, workbenchOwnerId: 'different-owner' }, db: f.db });
  assert.equal(await changedOwner.getSession(request('/', signed.sessionCookie)), null);
  f.advance(43201);
  assert.equal(await f.auth.getSession(request('/', signed.sessionCookie)), null);
  f.db.close();
});

test('logout requires exact Origin, POST and session-bound CSRF; successful logout revokes the cookie', async () => {
  const f = fixture(), signed = await signIn(f);
  const session = await f.auth.getSession(request('/', signed.sessionCookie));
  assert.equal((await f.auth.logout(request('/api/auth/github/logout', signed.sessionCookie))).status, 405);
  assert.equal((await f.auth.logout(request('/api/auth/github/logout', signed.sessionCookie, { method: 'POST', headers: { Origin: 'https://outside.example', 'X-Workbench-CSRF': session.csrfToken } }))).status, 403);
  assert.equal((await f.auth.logout(request('/api/auth/github/logout', signed.sessionCookie, { method: 'POST', headers: { Origin: ORIGIN } }))).status, 403);
  const result = await f.auth.logout(request('/api/auth/github/logout', signed.sessionCookie, { method: 'POST', headers: { Origin: ORIGIN, 'X-Workbench-CSRF': session.csrfToken } }));
  assert.equal(result.status, 200);
  assert.match(result.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(await f.auth.getSession(request('/', signed.sessionCookie)), null);
  f.db.close();
});

test('same-origin logout without a GitHub cookie succeeds even when login and storage are absent', async () => {
  for (const settings of [{}, { ...config, enabled: false }]) {
    const auth = createGitHubAuth({ config: settings });
    const result = await auth.logout(request('/api/auth/github/logout', null, { method: 'POST', headers: { Origin: ORIGIN } }));
    assert.equal(result.status, 200);
    assert.match(result.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await auth.logout(request('/api/auth/github/logout', null, { method: 'POST', headers: { Origin: 'https://outside.example' } }))).status, 403);
  }
  const auth = createGitHubAuth({ config: { ...config, origin: 'https://canonical.example', enabled: false } });
  assert.equal((await auth.logout(request('/api/auth/github/logout', null, { method: 'POST', headers: { Origin: ORIGIN } }))).status, 403);
});

test('D1 failure during identity fallback cannot masquerade as an expired or logged-out GitHub session', async () => {
  const f = fixture(), signed = await signIn(f), fault = { read: true };
  const session = await f.auth.getSession(request('/', signed.sessionCookie));
  const auth = createGitHubAuth({ config, db: faultingStorage(f.db, fault), now: f.now });
  const identity = await auth.getSession(request('/', signed.sessionCookie)) || { provider: 'chatgpt' };
  assert.equal(identity.provider, 'chatgpt');
  // The fallback UI may have no GitHub CSRF token; storage failure still must
  // block sign-out instead of authorizing the UI to complete ChatGPT logout.
  const failed = await auth.logout(request('/api/auth/github/logout', signed.sessionCookie, { method: 'POST', headers: { Origin: ORIGIN } }));
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('set-cookie'), null);
  fault.read = false;
  assert.ok(await auth.getSession(request('/', signed.sessionCookie)));
  const result = await auth.logout(request('/api/auth/github/logout', signed.sessionCookie, { method: 'POST', headers: { Origin: ORIGIN, 'X-Workbench-CSRF': session.csrfToken } }));
  assert.equal(result.status, 200);
  assert.equal(await auth.getSession(request('/', signed.sessionCookie)), null);
  assert.equal(await f.auth.getSession(request('/', signed.sessionCookie)), null);
  f.db.close();
});

test('logout never claims revocation when D1 deletion throws or reports failure', async () => {
  for (const write of ['throw', 'result']) {
    const f = fixture(), signed = await signIn(f);
    const session = await f.auth.getSession(request('/', signed.sessionCookie));
    const auth = createGitHubAuth({ config, db: faultingStorage(f.db, { write }), now: f.now });
    const result = await auth.logout(request('/api/auth/github/logout', signed.sessionCookie, { method: 'POST', headers: { Origin: ORIGIN, 'X-Workbench-CSRF': session.csrfToken } }));
    assert.equal(result.status, 503);
    assert.equal(result.headers.get('set-cookie'), null);
    assert.ok(await f.auth.getSession(request('/', signed.sessionCookie)));
    f.db.close();
  }
});

test('disabled, changed or expired sessions are persistently revoked before clearing the cookie', async () => {
  for (const variant of ['disabled', 'changed-owner', 'expired']) {
    const f = fixture(), signed = await signIn(f);
    if (variant === 'expired') f.advance(43201);
    const settings = { ...config, ...(variant === 'disabled' ? { enabled: false } : variant === 'changed-owner' ? { workbenchOwnerId: 'different-owner' } : {}) };
    for (const fault of [{ read: true }, { write: 'throw' }, { write: 'result' }]) {
      const down = createGitHubAuth({ config: settings, db: faultingStorage(f.db, fault), now: f.now });
      const result = await down.logout(request('/api/auth/github/logout', signed.sessionCookie, { method: 'POST', headers: { Origin: ORIGIN } }));
      assert.equal(result.status, 503);
      assert.equal(result.headers.get('set-cookie'), null);
      assert.equal(f.db.sql.prepare('SELECT count(*) AS n FROM workbench_github_sessions').get().n, 1);
    }
    const auth = createGitHubAuth({ config: settings, db: f.db, now: f.now });
    const result = await auth.logout(request('/api/auth/github/logout', signed.sessionCookie, { method: 'POST', headers: { Origin: ORIGIN } }));
    assert.equal(result.status, 401);
    assert.match(result.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal(f.db.sql.prepare('SELECT count(*) AS n FROM workbench_github_sessions').get().n, 0);
    assert.equal(await f.auth.getSession(request('/', signed.sessionCookie)), null);
    f.db.close();
  }
});

test('ambiguous cookies cannot conceal an active session while claiming sign-out', async () => {
  const f = fixture(), signed = await signIn(f);
  const result = await f.auth.logout(request('/api/auth/github/logout', `${signed.sessionCookie}; ${signed.sessionCookie}`, { method: 'POST', headers: { Origin: ORIGIN } }));
  assert.equal(result.status, 400);
  assert.equal(result.headers.get('set-cookie'), null);
  assert.ok(await f.auth.getSession(request('/', signed.sessionCookie)));
  f.db.close();
});

test('a forged cookie is cleared only after storage confirms and accepts its revocation', async () => {
  const f = fixture(), forged = `${SESSION}=${'x'.repeat(43)}`;
  const down = createGitHubAuth({ config, db: faultingStorage(f.db, { read: true }), now: f.now });
  assert.equal((await down.logout(request('/api/auth/github/logout', forged, { method: 'POST', headers: { Origin: ORIGIN } }))).status, 503);
  const result = await f.auth.logout(request('/api/auth/github/logout', forged, { method: 'POST', headers: { Origin: ORIGIN } }));
  assert.equal(result.status, 401);
  assert.match(result.headers.get('set-cookie'), /Max-Age=0/);
  f.db.close();
});

test('flow admission is finite and expired records can be replaced without runtime schema creation', async () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) await start(f);
  assert.equal((await f.auth.start(request('/api/auth/github/start'))).status, 429);
  assert.equal(f.db.sql.prepare('SELECT count(*) AS n FROM workbench_oauth_flows').get().n, 20);
  f.advance(601);
  await start(f);
  assert.equal(f.db.sql.prepare('SELECT count(*) AS n FROM workbench_oauth_flows').get().n, 1);
  f.db.close();
});

test('failed callback preserves an existing owner session and new success rotates its cookie', async () => {
  const f = fixture(), first = await signIn(f), begin = await start(f);
  const denied = await f.auth.callback(request(`/api/auth/github/callback?state=${begin.state}&error=access_denied`, `${begin.cookie}; ${first.sessionCookie}`));
  assert.equal(denied.headers.get('location'), '/access?auth=denied');
  assert.ok(await f.auth.getSession(request('/', first.sessionCookie)));
  const second = await signIn(f, { headers: { Cookie: `${(await start(f)).cookie}; ${first.sessionCookie}` } });
  // A mismatched browser binding must not rotate the existing session.
  assert.equal(second.result.headers.get('location'), '/access?auth=invalid');
  assert.ok(await f.auth.getSession(request('/', first.sessionCookie)));
  const fresh = await start(f);
  const success = await f.auth.callback(request(`/api/auth/github/callback?state=${fresh.state}&code=inert_code`, `${fresh.cookie}; ${first.sessionCookie}`));
  assert.equal(success.headers.get('location'), '/');
  assert.equal(await f.auth.getSession(request('/', first.sessionCookie)), null);
  assert.ok(await f.auth.getSession(request('/', cookieValue(success, SESSION))));
  f.db.close();
});
