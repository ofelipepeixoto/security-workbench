import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createGitHubAuth } from '../lib/github-auth.mjs';
import { resolveWorkbenchIdentity } from '../lib/workbench-access.mjs';
import { publicGitHubSession, handleGitHubSessionRequest } from '../lib/github-session-response.mjs';
import { createGitHubSessionMonitor, initialGitHubSessionState, GITHUB_SESSION_FRESHNESS_MS } from '../lib/github-session-monitor.mjs';

const START = Date.now(), KEY_A = 'a'.repeat(43), KEY_B = 'b'.repeat(43);
const session = (extra = {}) => ({ state: 'authenticated', provider: 'github', displayName: 'fixture-owner', sessionKey: KEY_A, verifiedAt: START, expiresAt: START + 120_000, ...extra });
const flush = () => new Promise(resolve => setImmediate(resolve));
function monitorFixture(initial = session()) {
  let time = START, lost = 0, sequence = 0;
  const timers = new Map(), calls = [];
  let respond = () => new Response(JSON.stringify({ session: session({ verifiedAt: time }) }));
  const monitor = createGitHubSessionMonitor({ initialSession: initial, now: () => time, setTimer(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: time + delay }); return id; }, clearTimer(id) { timers.delete(id); }, onSessionLost() { lost++; }, async fetcher(url, init) { calls.push({ url, init }); return respond(url, init); } });
  return { monitor, calls, timers, get lost() { return lost; }, respond(fn) { respond = fn; }, async advance(ms) {
    const end = time + ms;
    while (true) {
      const next = [...timers].sort((a,b) => a[1].at - b[1].at).find(([,v]) => v.at <= end);
      if (!next) break;
      time = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
    }
    time = end; await flush();
  } };
}

test('only fresh unexpired GitHub session metadata can initialize the green state', () => {
  assert.equal(initialGitHubSessionState(session(), START).state, 'authenticated');
  for (const value of [null, { state: 'anonymous' }, { state: 'unavailable' }, session({ provider: 'native' }), session({ sessionKey: '' }), session({ verifiedAt: START - GITHUB_SESSION_FRESHNESS_MS }), session({ verifiedAt: START + 6000 })]) assert.notEqual(initialGitHubSessionState(value, START).state, 'authenticated');
  assert.equal(initialGitHubSessionState(session({ expiresAt: START }), START).state, 'expired');
});

test('mount and focus revalidation remove green before GET, restoring it only for the same current session', async () => {
  const f = monitorFixture();
  f.monitor.start(); assert.equal(f.monitor.getSnapshot().state, 'checking'); await flush();
  assert.equal(f.monitor.getSnapshot().state, 'authenticated');
  const call = f.calls[0]; assert.equal(call.url, '/api/auth/github/session');
  assert.equal(call.init.method, 'GET'); assert.equal(call.init.cache, 'no-store'); assert.equal(call.init.credentials, 'same-origin'); assert.equal(call.init.redirect, 'error');
  assert.equal('body' in call.init, false); assert.equal('X-Workbench-CSRF' in call.init.headers, false);
  const pending = f.monitor.refresh(); assert.equal(f.monitor.getSnapshot().state, 'checking'); await pending;
  assert.equal(f.monitor.getSnapshot().state, 'authenticated'); assert.equal(f.lost, 0); f.monitor.stop();
});

test('expiration clears validity and private-view callback without another provider request', async () => {
  const f = monitorFixture(session({ expiresAt: START + 2000 }));
  f.respond(() => new Response(JSON.stringify({ session: session({ expiresAt: START + 2000 }) })));
  f.monitor.start(); await flush(); await f.advance(2000);
  assert.equal(f.monitor.getSnapshot().state, 'expired'); assert.equal(f.calls.length, 1); assert.equal(f.lost, 1); f.monitor.stop();
});

test('freshness revalidation is bounded and hidden tabs send no periodic session reads', async () => {
  const f = monitorFixture(); f.monitor.start(); await flush();
  await f.advance(60_000); assert.equal(f.calls.length, 2); assert.equal(f.monitor.getSnapshot().state, 'authenticated');
  f.monitor.setVisible(false); assert.equal(f.monitor.getSnapshot().state, 'checking'); await f.advance(180_000); assert.equal(f.calls.length, 2);
  f.monitor.setVisible(true); assert.equal(f.monitor.getSnapshot().state, 'checking'); await flush();
  assert.equal(f.monitor.getSnapshot().state, 'expired'); assert.equal(f.lost, 1); f.monitor.stop();
});

test('HTTP, body, timeout and anonymous revalidation failures never retain green or retry automatically', async () => {
  for (const failure of [() => new Response('{}', { status: 401 }), () => new Response('{}', { status: 503 }), () => new Response('invalid'), () => Promise.reject(new Error('private transport details')), () => new Response(JSON.stringify({ session: { state: 'anonymous' } })), () => new Promise(() => {})]) {
    const f = monitorFixture(); f.respond(failure); f.monitor.start(); await flush(); await f.advance(8000);
    assert.notEqual(f.monitor.getSnapshot().state, 'authenticated'); assert.equal(f.lost, 1); assert.equal(f.calls.length, 1);
    await f.advance(180_000); assert.equal(f.calls.length, 1); assert.equal(JSON.stringify(f.monitor.getSnapshot()).includes('private transport details'), false); f.monitor.stop();
  }
});

test('account A to B and renewed same-account sessions require reload instead of adopting stale data/CSRF', async () => {
  for (const replacement of [session({ sessionKey: KEY_B, displayName: 'fixture-member' }), session({ sessionKey: KEY_B })]) {
    const f = monitorFixture(); f.monitor.start(); await flush();
    f.respond(() => new Response(JSON.stringify({ session: replacement })));
    await f.monitor.refresh(); assert.deepEqual(f.monitor.getSnapshot(), { state: 'changed' }); assert.equal(f.lost, 1);
    assert.equal(JSON.stringify(f.monitor.getSnapshot()).includes(replacement.displayName), false);
    await f.monitor.refresh(); assert.equal(f.calls.length, 2); f.monitor.stop();
  }
});

test('an anonymous document cannot silently adopt an account from another tab', async () => {
  const f = monitorFixture({ state: 'anonymous' }); f.monitor.start(); await flush();
  assert.equal(f.monitor.getSnapshot().state, 'changed'); assert.equal(f.lost, 1); f.monitor.stop();
});

test('tab suspension cancels an older read and ignores its response after a newer validation fails', async () => {
  const f = monitorFixture(); let resolveOld;
  f.respond(() => new Promise(resolve => { resolveOld = resolve; })); f.monitor.start(); await flush();
  const signal = f.calls[0].init.signal; f.monitor.setVisible(false); assert.equal(signal.aborted, true);
  f.respond(() => new Response('{}', { status: 503 })); f.monitor.setVisible(true); await flush();
  resolveOld(new Response(JSON.stringify({ session: session() }))); await flush();
  assert.equal(f.monitor.getSnapshot().state, 'unavailable'); assert.equal(f.lost, 1); f.monitor.stop();
});

test('logout removes green before network completion and never treats failed revocation as success', async () => {
  for (const status of [200, 401, 503]) {
    const f = monitorFixture(); f.monitor.start(); await flush();
    f.respond(() => new Response('{}', { status })); const done = f.monitor.logout('inert_csrf_value');
    assert.equal(f.monitor.getSnapshot().state, 'signing_out'); assert.equal(f.lost, 1);
    assert.equal(await done, status !== 503); assert.equal(f.monitor.getSnapshot().state, status === 503 ? 'logout_error' : 'anonymous');
    assert.equal(f.calls.at(-1).init.headers['X-Workbench-CSRF'], 'inert_csrf_value'); f.monitor.stop();
  }
});

test('logout has a finite deadline and cannot revive a late session response', async () => {
  const f = monitorFixture(); f.monitor.start(); await flush(); f.respond(() => new Promise(() => {}));
  const done = f.monitor.logout('inert_csrf_value'); await f.advance(8000); assert.equal(await done, false);
  assert.equal(f.monitor.getSnapshot().state, 'logout_error'); assert.equal(f.lost, 1); f.monitor.stop();
});

test('public session projection and read-only endpoint whitelist all response fields and security headers', async () => {
  const projected = publicGitHubSession({ ...session(), csrfToken: 'private_csrf', githubId: '101', userId: 'canonical-owner', token_hash: 'private_hash', accessToken: 'private_token' }, START);
  assert.deepEqual(Object.keys(projected).sort(), ['displayName','expiresAt','provider','sessionKey','state','verifiedAt']);
  let reads = 0;
  const access = async () => { reads++; return { session: { ...projected, accessToken: 'private_token' }, user: { csrfToken: 'private_csrf' } }; };
  const response = await handleGitHubSessionRequest(new Request('https://workbench.example/api/auth/github/session'), access);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { session: projected }); assert.equal(reads, 1);
  for (const [key,value] of Object.entries({ 'cache-control':'no-store', vary:'Cookie', 'x-content-type-options':'nosniff', 'cross-origin-resource-policy':'same-origin' })) assert.equal(response.headers.get(key), value);
  assert.equal(response.headers.has('set-cookie'), false);
  assert.equal((await handleGitHubSessionRequest(new Request('https://workbench.example/api/auth/github/session', { method:'POST' }), access)).status, 405); assert.equal(reads, 1);
  assert.deepEqual(await (await handleGitHubSessionRequest(new Request('https://workbench.example/api/auth/github/session'), async () => { throw new Error('private failure'); })).json(), { session: { state:'unavailable' } });
});

test('real session storage adapter returns only a domain-separated UI marker and reads without cleanup', async () => {
  const sql = new DatabaseSync(':memory:'); const directory = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(file,directory),'utf8'));
  const queries = [];
  const db = { prepare(query) { queries.push(query); return { bind(...values) { const stmt=sql.prepare(query); return { async first(){ return stmt.get(...values)??null; }, async run(){ return {success:true,meta:{changes:Number(stmt.run(...values).changes)}}; } }; } }; } };
  let time = START, id = 101;
  const origin = 'https://workbench.example', config = {enabled:true,origin,clientId:'inert_client',clientSecret:'inert_client_secret',githubOwnerId:'101',workbenchOwnerId:'canonical-owner',multiUserEnabled:true,allowedGitHubIds:['202']};
  const auth = createGitHubAuth({config,db,now:()=>new Date(time),fetcher:async url => new Response(JSON.stringify(url.includes('access_token')?{access_token:'inert_provider_token',token_type:'bearer',scope:''}:{id,login:id===101?'fixture-owner':'fixture-member'}))});
  const request = (path,cookie,init={}) => new Request(origin+path,{...init,headers:{...(cookie?{Cookie:cookie}:{}),...init.headers}});
  const cookieOf = (response,name) => response.headers.getSetCookie().find(v=>v.startsWith(name+'='))?.split(';')[0];
  async function signIn() {
    const begin=await auth.start(request('/api/auth/github/start')), state=new URL(begin.headers.get('location')).searchParams.get('state');
    const result=await auth.callback(request('/api/auth/github/callback?state='+state+'&code=inert_code',cookieOf(begin,'__Host-workbench_github_flow')));
    return cookieOf(result,'__Host-workbench_github_session');
  }
  try {
    const cookieA=await signIn(); id=202; const cookieB=await signIn(); id=101; const renewedA=await signIn();
    queries.length=0;
    const read=async cookie=>resolveWorkbenchIdentity({config,request:request('/',cookie),getGitHubSession:source=>auth.getSession(source,{throwOnUnavailable:true})});
    const a=await read(cookieA), b=await read(cookieB), renewed=await read(renewedA);
    assert.equal(a.userId,'canonical-owner'); assert.equal(b.userId,'github:202'); assert.equal(b.role,'member');
    assert.notEqual(a.sessionKey,b.sessionKey); assert.notEqual(a.sessionKey,renewed.sessionKey); assert.notEqual(a.csrfToken,renewed.csrfToken);
    const hash = async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('base64url');
    const cookieValue=cookieA.split('=')[1]; assert.equal(a.sessionKey,await hash('workbench-session-ui\0'+cookieValue));
    assert.notEqual(a.sessionKey,a.csrfToken); assert.notEqual(a.sessionKey,await hash(cookieValue)); assert.equal(a.expiresAt,Math.floor(time/1000)*1000+43_200_000);
    assert.ok(queries.every(q=>q.startsWith('SELECT '))); assert.equal(queries.length,3);
    const logout=await auth.logout(request('/api/auth/github/logout',cookieA,{method:'POST',headers:{Origin:origin,'X-Workbench-CSRF':a.csrfToken}})); assert.equal(logout.status,200);
    assert.equal(await read(cookieA),null); assert.equal((await read(cookieB)).userId,'github:202');
    time+=43_200_000; assert.equal(await read(cookieB),null);
    const broken=createGitHubAuth({config,db:{prepare(){throw new Error('private storage failure');}},now:()=>new Date(START)});
    assert.equal(await broken.getSession(request('/',renewedA)),null);
    await assert.rejects(broken.getSession(request('/',renewedA),{throwOnUnavailable:true}),/^Error: session_unavailable$/);
  } finally { sql.close(); }
});
