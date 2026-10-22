import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkbenchIdentity } from '../lib/workbench-access.mjs';

const ORIGIN = 'https://workbench.example';
const config = { enabled: true, origin: ORIGIN, clientId: 'inert_client', clientSecret: 'inert_client_secret', githubOwnerId: '101', workbenchOwnerId: 'existing-site-owner' };
const githubSession = { userId: config.workbenchOwnerId, githubId: '101', role: 'admin', displayName: 'fixture-owner', provider: 'github', csrfToken: 'x'.repeat(43) };
const request = () => new Request(`${ORIGIN}/api/workbench`, { headers: {
  'oai-authenticated-user-id': config.workbenchOwnerId,
  'oai-authenticated-user-email': 'owner@example.invalid',
  'oai-authenticated-user-full-name': 'Native owner',
  Authorization: 'Bearer inert_native_credential',
} });

test('native owner headers and injected ChatGPT identity cannot replace a missing GitHub session', async () => {
  let nativeCalls = 0;
  const identity = await resolveWorkbenchIdentity({ config, request: request(), getGitHubSession: async () => null,
    getNativeUser: async () => { nativeCalls++; return { userId: config.workbenchOwnerId }; },
    chatGPTUser: { userId: config.workbenchOwnerId },
  });
  assert.equal(identity, null);
  assert.equal(nativeCalls, 0);
});

test('validated GitHub identity preserves the existing canonical owner and no extra credentials', async () => {
  const source = request();
  const identity = await resolveWorkbenchIdentity({ config, request: source, getGitHubSession: async value => {
    assert.equal(value, source);
    return { ...githubSession, accessToken: 'inert_provider_token', opaqueSession: 'inert_cookie', email: 'owner@example.invalid' };
  } });
  assert.deepEqual(identity, githubSession);
  assert.deepEqual(Object.keys(identity).sort(), ['csrfToken', 'displayName', 'githubId', 'provider', 'role', 'userId']);
});

test('non-GitHub identities are rejected even when their user ID matches the configured owner', async () => {
  for (const provider of ['chatgpt', 'native', 'anonymous', undefined]) {
    assert.equal(await resolveWorkbenchIdentity({ config, request: request(), getGitHubSession: async () => ({ ...githubSession, provider }) }), null);
  }
});

test('another canonical owner cannot gain access through matching names or email', async () => {
  for (const userId of ['different-owner', '101', undefined, null, 101]) {
    assert.equal(await resolveWorkbenchIdentity({ config, request: request(), getGitHubSession: async () => ({ ...githubSession, userId, email: 'owner@example.invalid' }) }), null);
  }
});

test('disabled and incomplete configuration cannot bootstrap an owner or call session storage', async () => {
  let calls = 0;
  for (const settings of [undefined, {}, { ...config, enabled: false }, { ...config, clientSecret: '' }, { ...config, githubOwnerId: '' }, { ...config, workbenchOwnerId: '' }]) {
    assert.equal(await resolveWorkbenchIdentity({ config: settings, request: request(), getGitHubSession: async () => { calls++; return githubSession; } }), null);
  }
  assert.equal(calls, 0);
});

test('storage exceptions fail closed without selecting the native owner', async () => {
  assert.equal(await resolveWorkbenchIdentity({ config, request: request(), getGitHubSession: async () => { throw new Error('private storage failure'); },
    chatGPTUser: { userId: config.workbenchOwnerId },
  }), null);
});

test('missing or malformed requests and foreign origins never reach session storage', async () => {
  let calls = 0;
  for (const source of [undefined, {}, { url: 'invalid' }, new Request('https://outside.example/api/workbench', { headers: { Origin: ORIGIN, 'oai-authenticated-user-id': config.workbenchOwnerId } })]) {
    assert.equal(await resolveWorkbenchIdentity({ config, request: source, getGitHubSession: async () => { calls++; return githubSession; } }), null);
  }
  assert.equal(calls, 0);
});

test('malformed session identity and absent session adapter fail closed', async () => {
  for (const extra of [{ csrfToken: '' }, { csrfToken: 'invalid' }, { displayName: '' }, { displayName: null }, {githubId: undefined}, {githubId: 101}, {githubId: '202'}, {role: 'member'}, {role: undefined}]) {
    assert.equal(await resolveWorkbenchIdentity({ config, request: request(), getGitHubSession: async () => ({ ...githubSession, ...extra }) }), null);
  }
  assert.equal(await resolveWorkbenchIdentity({ config, request: request() }), null);
  assert.equal(await resolveWorkbenchIdentity(), null);
});

test('pilot access needs both server activation and the exact stable-ID principal without admin promotion', async () => {
  const pilot = {...config, multiUserEnabled: true, allowedGitHubIds: ['202', '303']};
  const member = {...githubSession, userId: 'github:202', githubId: '202', role: 'member', displayName: 'fixture-member'};
  const resolve = (settings, session = member) => resolveWorkbenchIdentity({config: settings, request: request(), getGitHubSession: async () => session});
  assert.deepEqual(await resolve(pilot), member);
  assert.equal(await resolve(config), null);
  assert.equal(await resolve({...pilot, multiUserEnabled: false}), null);
  assert.equal(await resolve({...pilot, allowedGitHubIds: ['303']}), null);
  for (const extra of [{role: 'admin'}, {userId: config.workbenchOwnerId}, {githubId: '303'}, {githubId: 'fixture-owner'}, {provider: 'chatgpt'}]) {
    assert.equal(await resolve(pilot, {...member, ...extra}), null);
  }
  assert.deepEqual(await resolve(pilot, githubSession), githubSession);
});
