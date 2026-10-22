import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubAppClient, GitHubAppError } from '../lib/github-app-client.mjs';

const TOKEN = 'ghu_inert_user_token_not_a_credential';
const REVISION = 'a'.repeat(40), TREE = 'b'.repeat(40), BLOB = 'c'.repeat(40);
const installation = (extra = {}) => ({ id: 10, app_id: 20, account: { id: 101, login: 'fixture-owner', type: 'User' }, repository_selection: 'selected', suspended_at: null, permissions: { metadata: 'read', contents: 'read' }, ...extra });
const repository = (extra = {}) => ({ id: 300, name: 'private-one', full_name: 'fixture-owner/private-one', owner: { id: 101, login: 'fixture-owner', type: 'User' }, private: true, visibility: 'private', default_branch: 'main', language: 'JavaScript', archived: false, disabled: false, permissions: { pull: true }, ...extra });
const json = (value, extra = {}) => new Response(JSON.stringify(value), { status: 200, ...extra });

function fixture(handler, options = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    if (handler) { const response = await handler(url, init); if (response) return response; }
    if (path === '/user') return json({ id: 101, login: 'fixture-owner' });
    if (path === '/user/installations') return json({ total_count: 1, installations: [installation()] });
    if (path === '/user/installations/10/repositories') return json({ total_count: 1, repositories: [repository()] });
    if (path === '/repositories/300/commits/main' || path === `/repositories/300/commits/${REVISION}`) return json({ sha: REVISION, commit: { tree: { sha: TREE } } });
    if (path === `/repositories/300/git/trees/${TREE}`) return json({ sha: TREE, truncated: false, tree: [] });
    if (path === `/repositories/300/git/blobs/${BLOB}`) return json({ sha: BLOB, size: 0, encoding: 'base64', content: '' });
    throw new Error('unexpected mock endpoint');
  };
  return { calls, client: createGitHubAppClient({ accessToken: TOKEN, expectedGitHubId: '101', appId: 20, fetcher, now: () => new Date('2026-10-21T12:00:00Z'), random: () => 0, ...options }) };
}

test('catalog uses user-token intersection endpoints, projects only metadata and never exposes tokens', async () => {
  const f = fixture();
  const result = await f.client.listRepositories({ installationId: 10 });
  assert.equal(result.repositories[0].id, 300);
  assert.equal(result.repositories[0].private, true);
  assert.equal(result.repositories[0].permission_state, 'read');
  assert.equal(result.repositories[0].installation_id, 10);
  assert.equal(result.complete, true);
  assert.equal(result.next_page, null);
  assert.doesNotMatch(JSON.stringify(result), /ghu_|authorization|token/i);
  assert.deepEqual(f.calls.map(call => new URL(call.url).pathname), ['/user', '/user/installations', '/user/installations/10/repositories']);
  for (const call of f.calls) {
    assert.equal(call.init.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(call.init.method, 'GET'); assert.equal(call.init.redirect, 'manual'); assert.equal(call.init.credentials, 'omit'); assert.equal(call.init.cache, 'no-store');
    assert.equal(new URL(call.url).origin, 'https://api.github.com');
  }
});

test('pagination is explicit and numeric; organizations/selection/archived remain visible', async () => {
  const f = fixture(url => {
    if (new URL(url).pathname !== '/user/installations/10/repositories') return;
    const page = Number(new URL(url).searchParams.get('page'));
    return json({ total_count: 101, repositories: [repository({ id: 299 + page, archived: true, owner: { id: 999, login: 'fixture-org', type: 'Organization' }, full_name: 'fixture-org/private-one' })] }, page === 1 ? { headers: { Link: '<https://api.github.com/user/installations/10/repositories?per_page=100&page=2>; rel="next"' } } : {});
  });
  const first = await f.client.listRepositories({ installationId: 10 });
  assert.equal(first.complete, false); assert.equal(first.next_page, 2);
  const second = await f.client.listRepositories({ installationId: 10, page: first.next_page });
  assert.equal(second.complete, true); assert.equal(second.repositories[0].owner.type, 'Organization'); assert.equal(second.repositories[0].archived, true);
});

test('malicious pagination Link cannot become a credential-bearing request', async () => {
  const f = fixture(url => new URL(url).pathname === '/user/installations' ? json({ total_count: 1, installations: [installation()] }, { headers: { Link: '<https://evil.invalid/steal?page=2&per_page=100>; rel="next"' } }) : null);
  await assert.rejects(f.client.listInstallations(), error => error instanceof GitHubAppError && error.code === 'unavailable');
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(call => new URL(call.url).origin === 'https://api.github.com'));
});

test('installation IDs not in the authenticated user intersection never reach repository content', async () => {
  const f = fixture();
  await assert.rejects(f.client.authorizeRepository({ installationId: 11, repositoryId: 300 }), { code: 'forbidden' });
  assert.ok(f.calls.every(call => !call.url.includes('/repositories')));
});

test('suspended installations and missing content read permission fail closed', async () => {
  for (const [extra, code] of [[{ suspended_at: '2026-10-21T11:00:00Z' }, 'suspended'], [{ permissions: { metadata: 'read' } }, 'insufficient_permission']]) {
    const f = fixture(url => new URL(url).pathname === '/user/installations' ? json({ total_count: 1, installations: [installation(extra)] }) : null);
    await assert.rejects(f.client.listRepositories({ installationId: 10 }), { code });
    assert.ok(f.calls.every(call => !call.url.includes('/10/repositories')));
  }
});

test('stable token identity and app ID are validated before grants', async () => {
  for (const endpoint of ['user', 'installation']) {
    const f = fixture(url => new URL(url).pathname === (endpoint === 'user' ? '/user' : '/user/installations') ? json(endpoint === 'user' ? { id: 202, login: 'other-user' } : { total_count: 1, installations: [installation({ app_id: 99 })] }) : null);
    await assert.rejects(f.client.listRepositories({ installationId: 10 }), error => error instanceof GitHubAppError);
    assert.ok(f.calls.every(call => !call.url.includes('/10/repositories')));
  }
  for (const accessToken of ['ghs_installation_token', 'plain', '', null]) assert.throws(() => fixture(null, { accessToken }), GitHubAppError);
});

test('repository permission and ID are checked in the selected installation before commit resolution', async () => {
  for (const repo of [repository({ permissions: { pull: false } }), repository({ id: 301 })]) {
    const f = fixture(url => new URL(url).pathname === '/user/installations/10/repositories' ? json({ total_count: 1, repositories: [repo] }) : null);
    await assert.rejects(f.client.authorizeRepository({ installationId: 10, repositoryId: 300 }), { code: 'forbidden' });
    assert.ok(f.calls.every(call => !call.url.includes('/commits/')));
  }
});

test('commit, tree and blob reads remain pinned to the stable repository ID', async () => {
  const f = fixture();
  const grant = await f.client.authorizeRepository({ installationId: 10, repositoryId: 300, revision: REVISION.toUpperCase() });
  assert.equal(grant.revision, REVISION); assert.equal(grant.tree_sha, TREE);
  assert.equal(grant.repository.full_name, 'fixture-owner/private-one');
  assert.equal((await f.client.readTree({ installationId: 10, repositoryId: 300, treeSha: TREE })).sha, TREE);
  assert.equal((await f.client.readBlob({ installationId: 10, repositoryId: 300, blobSha: BLOB })).sha, BLOB);
  const before = f.calls.length;
  for (const invalid of ['../../secrets', 'https://evil.invalid', 'not-sha']) await assert.rejects(f.client.readBlob({ installationId: 10, repositoryId: 300, blobSha: invalid }), { code: 'invalid_request' });
  assert.equal(f.calls.length, before);
});

test('a pagination authorization ceiling denies rather than claiming complete absence', async () => {
  const f = fixture(url => new URL(url).pathname === '/user/installations/10/repositories' ? json({ total_count: 999, repositories: [repository({ id: 999 })] }) : null, { maxPages: 1 });
  await assert.rejects(f.client.authorizeRepository({ installationId: 10, repositoryId: 300 }), { code: 'incomplete' });
  assert.equal(f.calls.length, 3);
});

test('quota headers produce a future retry time; no automatic retry occurs', async () => {
  const f = fixture(url => new URL(url).pathname === '/user' ? new Response('private upstream details', { status: 403, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Date.parse('2026-10-21T12:05:00Z') / 1000) } }) : null);
  await assert.rejects(f.client.listInstallations(), error => error.code === 'rate_limited' && error.status === 429 && error.retryAt === '2026-10-21T12:05:00.000Z' && !error.message.includes('private'));
  await assert.rejects(f.client.listInstallations(), { code: 'rate_limited' });
  assert.equal(f.calls.length, 1);
});

test('429 secondary quota and plain403/401 remain distinct without exposing provider response', async () => {
  for (const [status, headers, code] of [[429, { 'Retry-After': '120' }, 'rate_limited'], [403, {}, 'forbidden'], [401, {}, 'disconnected']]) {
    const f = fixture(() => new Response('sensitive body', { status, headers }));
    await assert.rejects(f.client.listInstallations(), error => error.code === code && !error.message.includes('sensitive'));
    assert.equal(f.calls.length, 1);
  }
});

test('redirects, malformed JSON and oversize responses fail without following or leaking', async () => {
  for (const response of [new Response(null, { status: 302, headers: { Location: 'https://evil.invalid' } }), new Response('not-json'), new Response('{}', { headers: { 'Content-Length': String(4 * 1024 * 1024 + 1) } })]) {
    const f = fixture(() => response);
    await assert.rejects(f.client.listInstallations(), { code: 'unavailable' });
    assert.equal(f.calls.length, 1);
  }
});

test('external abort stops an in-flight provider fetch and prevents subsequent calls', async () => {
  const controller = new AbortController();
  const f = fixture(() => new Promise(() => {}), { signal: controller.signal });
  const pending = f.client.listInstallations();
  controller.abort();
  await assert.rejects(pending, { code: 'timeout' });
  await assert.rejects(f.client.listInstallations(), { code: 'timeout' });
  assert.equal(f.calls.length, 1);
});

test('invalid numeric pages and IDs are rejected locally', async () => {
  const f = fixture();
  for (const page of [0, -1, 1.1, '2', 10001]) await assert.rejects(f.client.listInstallations({ page }), { code: 'invalid_request' });
  assert.equal(f.calls.length, 0);
});

test('a provider Retry-After beyond24hours is never shortened', async () => {
  const f = fixture(() => new Response(null, { status: 429, headers: { 'Retry-After': '172800' } }));
  await assert.rejects(f.client.listInstallations(), error => error.code === 'rate_limited' && error.retryAt === '2026-10-23T12:00:00.000Z');
  assert.equal(f.calls.length, 1);
});

test('batch access walks installation and repository pages once without resolving commits',async()=>{
  const repos=Array.from({length:100},(_,i)=>repository({id:300+i,name:'repo-'+i,full_name:'fixture-owner/repo-'+i}));
  const f=fixture(url=>{
    const u=new URL(url),page=Number(u.searchParams.get('page')||1);
    if(u.pathname==='/user/installations')return json({total_count:101,installations:page===1?[installation({id:9})]:[installation()]});
    if(u.pathname==='/user/installations/10/repositories')return json({total_count:200,repositories:page===1?Array.from({length:100},(_,i)=>repository({id:500+i})):repos});
  });
  const result=await f.client.checkRepositoriesAccess(repos.map(r=>({installationId:10,repositoryId:r.id})));
  assert.equal(result.length,100);assert.ok(result.every(x=>x.repository?.id===x.repositoryId));assert.equal(f.calls.length,5);
  assert.ok(f.calls.every(x=>!x.url.includes('/commits/')));
});

test('access-only refresh never reuses old grants and analysis still resolves its pinned SHA',async()=>{
  let revoked=false;
  const f=fixture(url=>new URL(url).pathname==='/user/installations/10/repositories'?json({total_count:1,repositories:[repository({permissions:{pull:!revoked}})]}):null);
  await f.client.authorizeRepository({installationId:10,repositoryId:300,revision:REVISION});
  const commits=f.calls.filter(x=>x.url.includes('/commits/')).length;
  await f.client.checkRepositoryAccess({installationId:10,repositoryId:300});
  assert.equal(f.calls.filter(x=>x.url.includes('/commits/')).length,commits);
  revoked=true;
  await assert.rejects(f.client.checkRepositoryAccess({installationId:10,repositoryId:300}),{code:'forbidden'});
  await assert.rejects(f.client.authorizeRepository({installationId:10,repositoryId:300,revision:REVISION}),{code:'forbidden'});
  assert.equal(f.calls.filter(x=>x.url.includes('/commits/')).length,commits);
  assert.equal((await f.client.checkRepositoriesAccess([{installationId:10,repositoryId:300}]))[0].repository,null);
});

test('batch missing, suspended and insufficient installations give explicit denied grants without content requests',async()=>{
  for(const extra of [{id:11},{suspended_at:'2026-10-21T12:00:00Z'},{permissions:{metadata:'read'}}]){
    const f=fixture(url=>new URL(url).pathname==='/user/installations'?json({total_count:1,installations:[installation(extra)]}):null);
    const result=await f.client.checkRepositoriesAccess([{installationId:10,repositoryId:300}]);
    assert.equal(result[0].repository,null);assert.equal(f.calls.length,2);
  }
});

test('batch pagination ceiling is an error rather than a denied or incomplete grant set',async()=>{
  const f=fixture(url=>new URL(url).pathname==='/user/installations/10/repositories'?json({total_count:500,repositories:[repository({id:999})]}):null,{maxPages:1});
  await assert.rejects(f.client.checkRepositoriesAccess([{installationId:10,repositoryId:300}]),{code:'incomplete'});
  assert.equal(f.calls.length,3);
});

test('changing pages with duplicate requested IDs cannot keep an earlier positive grant',async()=>{
  const f=fixture(url=>{
    const u=new URL(url),page=Number(u.searchParams.get('page')||1);
    if(u.pathname==='/user/installations/10/repositories')return json({total_count:200,repositories:[repository({permissions:{pull:page===1}})]});
  });
  await assert.rejects(f.client.checkRepositoriesAccess([{installationId:10,repositoryId:300},{installationId:10,repositoryId:301}]),{code:'unavailable'});
});
