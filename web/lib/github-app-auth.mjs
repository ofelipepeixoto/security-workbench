/** Server-side, explicitly enabled GitHub App connection, separate from login. */
import { createGitHubAppClient, GitHubAppError } from './github-app-client.mjs';

const FLOW_COOKIE = '__Host-workbench_github_app_flow';
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const TOKEN = /^ghu_[A-Za-z0-9_]{1,2048}$/;
const HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const encoder = new TextEncoder();
// Internal, non-serializable proof of the exact credential generation used by
// one consumer lease. Neither the token nor this record enters diagnostics.
const executionProofs = new WeakMap();
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomSecret = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));

function decoded(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 8192) throw new Error('envelope');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
}
function configuration(input) {
  try {
    if (input?.enabled !== true) return null;
    const url = new URL(input.origin);
    if (url.protocol !== 'https:' || url.origin !== input.origin || url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null;
    const appId = Number(input.appId);
    if (!Number.isSafeInteger(appId) || appId < 1 || String(appId) !== String(input.appId)) return null;
    if (!/^[a-z0-9-]{1,100}$/.test(input.slug ?? '') || !/^[A-Za-z0-9_.-]{1,200}$/.test(input.clientId ?? '')) return null;
    if (typeof input.clientSecret !== 'string' || !input.clientSecret || input.clientSecret.length > 4096) return null;
    if (!SECRET.test(input.encryptionKey ?? '') || decoded(input.encryptionKey).byteLength !== 32 || !/^[1-9][0-9]{0,8}$/.test(input.keyVersion ?? '')) return null;
    return { ...input, appId };
  } catch { return null; }
}
export const isGitHubAppConfigured = config => configuration(config) !== null;

export function connectionPersistenceFence(proof, job) {
  const record = executionProofs.get(proof);
  if (!record || record.ownerId !== job.owner_id || record.githubId !== job.github_id || record.jobId !== job.id || record.leaseToken !== job.lease_token || !Number.isSafeInteger(record.expiresAtMs)) throw new GitHubAppError('disconnected',401);
  return {
    sql:'EXISTS (SELECT 1 FROM workbench_github_app_connections c WHERE c.owner_id=? AND c.github_id=? AND c.token_envelope=? AND c.key_version=? AND c.config_key=? AND c.expires_at=? AND c.created_at=? AND c.updated_at=?)',
    values:[record.ownerId,record.githubId,record.envelope,record.keyVersion,record.configKey,record.expiresAt,record.createdAt,record.updatedAt],
    expiresAtMs:record.expiresAtMs,
  };
}

function userIdentity(user) {
  if (user?.provider !== 'github' || typeof user.userId !== 'string' || !user.userId || user.userId.length > 200 || !/^[1-9][0-9]*$/.test(user.githubId ?? '') || !Number.isSafeInteger(Number(user.githubId))) throw new GitHubAppError('disconnected', 401);
  return user;
}
function cookie(value, seconds) { return `${FLOW_COOKIE}=${value}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Lax`; }
function browserCookie(request) {
  const header = request.headers.get('cookie') ?? '';
  if (header.length > 8192) return null;
  const values = header.split(';').map(part => part.trim()).filter(part => part.startsWith(`${FLOW_COOKIE}=`));
  const value = values.length === 1 ? values[0].slice(FLOW_COOKIE.length + 1) : null;
  return SECRET.test(value ?? '') ? value : null;
}
function reply(data, status = 200, setCookie) {
  return Response.json(data, { status, headers: { ...HEADERS, ...(setCookie ? { 'Set-Cookie': setCookie } : {}) } });
}
function callbackResult(state) {
  return new Response(null, { status: 303, headers: { ...HEADERS, Location: `/projects?github_app=${state}`, 'Set-Cookie': cookie('', 0) } });
}
function cancel(stream) { try { stream?.cancel().catch(() => {}); } catch { /* cleanup is bounded */ } }

async function providerRequest(fetcher, url, options, transport, json = true) {
  const response = await Promise.race([fetcher(url, { ...options, redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: transport.controller.signal }), transport.stopped]);
  if ((!json && response.status !== 204) || (json && response.status !== 200)) { cancel(response.body); throw new GitHubAppError('unavailable'); }
  if (!json) { cancel(response.body); return null; }
  const size = response.headers.get('content-length');
  if (size && (!/^\d+$/.test(size) || Number(size) > 32768)) { cancel(response.body); throw new GitHubAppError('unavailable'); }
  const reader = response.body?.getReader();
  if (!reader) throw new GitHubAppError('unavailable');
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const part = await Promise.race([reader.read(), transport.stopped]);
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 32768) throw new GitHubAppError('unavailable');
      chunks.push(part.value);
    }
  } catch (error) { cancel(reader); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GitHubAppError('unavailable');
  return value;
}

function deadline() {
  const controller = new AbortController();
  const stopped = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new GitHubAppError('timeout', 504)), { once: true }));
  const timer = setTimeout(() => controller.abort(), 10000);
  return { controller, stopped, close() { clearTimeout(timer); } };
}

export function createGitHubAppAuth({ config, db, getUser, fetcher = fetch, now = () => new Date() }) {
  const settings = configuration(config);
  const stamp = () => Math.floor(new Date(now()).valueOf() / 1000);
  const first = (sql, ...args) => db.prepare(sql).bind(...args).first();
  const write = async (sql, ...args) => {
    const result = await db.prepare(sql).bind(...args).run();
    if (result?.success !== true) throw new GitHubAppError('unavailable');
    return result;
  };
  const configKey = async () => digest(JSON.stringify([settings.origin, settings.appId, settings.clientId, settings.keyVersion]));
  const vaultKey = async () => crypto.subtle.importKey('raw', decoded(settings.encryptionKey), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const aad = (user, key, expires) => encoder.encode(JSON.stringify(['security-workbench.github-app/v1', user.userId, user.githubId, settings.keyVersion, key, expires]));

  async function readToken(user) {
    userIdentity(user);
    if (!settings || !db?.prepare) throw new GitHubAppError('disconnected', 401);
    const row = await first('SELECT * FROM workbench_github_app_connections WHERE owner_id = ?', user.userId);
    if (!row || row.github_id !== user.githubId || row.expires_at <= stamp() || row.key_version !== settings.keyVersion || row.config_key !== await configKey()) throw new GitHubAppError('disconnected', 401);
    try {
      const envelope = JSON.parse(row.token_envelope);
      if (envelope.v !== 1 || Object.keys(envelope).sort().join(',') !== 'ciphertext,iv,v' || decoded(envelope.iv).byteLength !== 12) throw new Error('envelope');
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decoded(envelope.iv), additionalData: aad(user, row.config_key, row.expires_at), tagLength: 128 }, await vaultKey(), decoded(envelope.ciphertext));
      const token = new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
      if (!TOKEN.test(token)) throw new Error('envelope');
      return { token, row };
    } catch { throw new GitHubAppError('disconnected', 401); }
  }
  async function requestUser(request, mutation = false) {
    if (!settings || !db?.prepare || typeof getUser !== 'function' || new URL(request.url).origin !== settings.origin) throw new GitHubAppError('unavailable');
    const user = userIdentity(await getUser(request));
    if (mutation && (request.method !== 'POST' || request.headers.get('Origin') !== settings.origin || !SECRET.test(user.csrfToken ?? '') || request.headers.get('X-Workbench-CSRF') !== user.csrfToken)) throw new GitHubAppError('forbidden', 403);
    return user;
  }
  const safeFailure = error => reply({ error: error instanceof GitHubAppError ? error.message : 'Não foi possível confirmar a conexão GitHub.', code: error instanceof GitHubAppError ? error.code : 'unavailable' }, error instanceof GitHubAppError ? error.status : 503);

  return {
    enabled: settings !== null && typeof db?.prepare === 'function',
    async getConnection(user) {
      userIdentity(user);
      const common = { connect_path: '/api/auth/github-app/start', manage_url: 'https://github.com/settings/installations', installation_url: settings ? `https://github.com/apps/${settings.slug}/installations/new` : null };
      if (!settings) return { ...common, state: 'not_configured', connected: false, expires_at: null };
      let row;
      try {
        row = await first('SELECT * FROM workbench_github_app_connections WHERE owner_id = ?', user.userId);
        if (!row || row.github_id !== user.githubId) return { ...common, state: 'not_connected', connected: false, expires_at: null };
        if (row.expires_at <= stamp()) return { ...common, state: 'expired', connected: false, expires_at: new Date(row.expires_at * 1000).toISOString() };
        const credential = await readToken(user);
        // A decryptable envelope alone is not a connected integration. Confirm
        // the provider identity before reporting the connection as usable.
        const client = createGitHubAppClient({ accessToken: credential.token, expectedGitHubId: user.githubId, appId: settings.appId, fetcher, now });
        try { await client.getIdentity(); }
        catch (error) {
          if (error instanceof GitHubAppError && error.code === 'disconnected') {
            await write('DELETE FROM workbench_github_app_connections WHERE owner_id = ?', user.userId);
            return { ...common, state: row.expires_at <= stamp() ? 'expired' : 'revoked', connected: false, expires_at: null };
          }
          throw error;
        }
        return { ...common, state: 'connected', connected: true, expires_at: new Date(row.expires_at * 1000).toISOString(), validated_at: new Date(now()).toISOString() };
      } catch (error) {
        if (error instanceof GitHubAppError && error.code === 'disconnected') return { ...common, state: 'not_connected', connected: false, expires_at: null };
        if (error instanceof GitHubAppError) throw error;
        throw new GitHubAppError('unavailable');
      }
    },
    async getClient(user, { signal } = {}) {
      try {
        const { token } = await readToken(user);
        return createGitHubAppClient({ accessToken: token, expectedGitHubId: user.githubId, appId: settings.appId, fetcher, now, signal });
      } catch (error) { if (error instanceof GitHubAppError) throw error; throw new GitHubAppError('unavailable'); }
    },
    createExecutionContext(user, { signal, jobId, leaseToken } = {}) {
      // One context belongs to one consumer attempt. It does not outlive that
      // attempt or share positive access grants across requests or identities.
      const identity = { ...userIdentity(user) };
      let client, credential, proof;
      return { persistenceProof() {
        if (!proof || typeof jobId !== 'string' || !jobId || typeof leaseToken !== 'string' || !leaseToken) throw new GitHubAppError('disconnected',401);
        return proof;
      }, async getClient() {
        try {
          const current = await readToken(identity);
          const binding = JSON.stringify([current.token, current.row.token_envelope, current.row.expires_at, current.row.key_version, current.row.config_key, current.row.created_at, current.row.updated_at]);
          if (client && binding !== credential) throw new GitHubAppError('disconnected', 401);
          if (!client) {
            credential = binding;
            client = createGitHubAppClient({accessToken:current.token,expectedGitHubId:identity.githubId,appId:settings.appId,fetcher,now,signal});
            proof=Object.freeze({});
            executionProofs.set(proof,{ownerId:identity.userId,githubId:identity.githubId,jobId,leaseToken,
              envelope:current.row.token_envelope,keyVersion:current.row.key_version,configKey:current.row.config_key,
              expiresAt:current.row.expires_at,expiresAtMs:current.row.expires_at*1000,createdAt:current.row.created_at,updatedAt:current.row.updated_at});
          }
          return client;
        } catch (error) { if (error instanceof GitHubAppError) throw error; throw new GitHubAppError('unavailable'); }
      }};
    },
    async start(request) {
      try {
        const user = await requestUser(request, true);
        const state = randomSecret(), binding = browserCookie(request) || randomSecret(), verifier = randomSecret();
        const current = stamp(), stateHash = await digest(state), browserHash = await digest(binding), key = await configKey();
        await write('DELETE FROM workbench_github_app_flows WHERE expires_at <= ?', current);
        const refreshed = await write('UPDATE workbench_github_app_flows SET state_hash = ?, github_id = ?, verifier = ?, config_key = ?, expires_at = ?, created_at = ? WHERE owner_id = ? AND browser_hash = ?', stateHash, user.githubId, verifier, key, current + 600, current, user.userId, browserHash);
        if (![0, 1].includes(refreshed.meta?.changes)) throw new GitHubAppError('unavailable');
        const admitted = refreshed.meta.changes === 1 ? refreshed : await write('INSERT INTO workbench_github_app_flows (state_hash, browser_hash, owner_id, github_id, verifier, config_key, expires_at, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM workbench_github_app_flows WHERE expires_at > ?) < 40 AND (SELECT count(*) FROM workbench_github_app_flows WHERE owner_id = ? AND expires_at > ?) < 4', stateHash, browserHash, user.userId, user.githubId, verifier, key, current + 600, current, current, user.userId, current);
        if (admitted.meta?.changes !== 1) return reply({ error: 'Há conexões pendentes demais. Aguarde dez minutos.', code: 'rate_limited' }, 429);
        const url = new URL('https://github.com/login/oauth/authorize');
        url.search = new URLSearchParams({ client_id: settings.clientId, redirect_uri: `${settings.origin}/api/auth/github-app/callback`, state, code_challenge: await digest(verifier), code_challenge_method: 'S256', scope: 'offline_access', allow_signup: 'false', prompt: 'select_account' }).toString();
        return reply({ authorization_url: url.toString() }, 200, cookie(binding, 600));
      } catch (error) { return safeFailure(error); }
    },
    async callback(request) {
      let transport;
      try {
        if (request.method !== 'GET') return reply({ error: 'Método não permitido.' }, 405);
        const user = await requestUser(request);
        const url = new URL(request.url), binding = browserCookie(request);
        if (['code', 'state', 'error'].some(name => url.searchParams.getAll(name).length > 1)) return callbackResult('invalid');
        const state = url.searchParams.get('state');
        if (!SECRET.test(state ?? '') || !binding) return callbackResult('invalid');
        const current = stamp(), stateHash = await digest(state), browserHash = await digest(binding), key = await configKey();
        const flow = await first('SELECT * FROM workbench_github_app_flows WHERE state_hash = ? AND browser_hash = ? AND owner_id = ? AND github_id = ? AND config_key = ? AND expires_at > ?', stateHash, browserHash, user.userId, user.githubId, key, current);
        if (!flow || !SECRET.test(flow.verifier)) return callbackResult('invalid');
        // Keep a consumed marker until commit. Disconnect deletes it, making
        // the later INSERT...SELECT fail closed even during provider I/O.
        const consumed = await write("UPDATE workbench_github_app_flows SET verifier = '' WHERE state_hash = ? AND owner_id = ? AND github_id = ? AND verifier = ? AND expires_at > ?", stateHash, user.userId, user.githubId, flow.verifier, current);
        if (consumed.meta?.changes !== 1) return callbackResult('invalid');
        if (url.searchParams.has('error')) return callbackResult(url.searchParams.get('error') === 'access_denied' ? 'denied' : 'invalid');
        const code = url.searchParams.get('code');
        if (!/^[A-Za-z0-9_-]{1,512}$/.test(code ?? '')) return callbackResult('invalid');
        transport = deadline();
        const token = await providerRequest(fetcher, 'https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: settings.clientId, client_secret: settings.clientSecret, code, code_verifier: flow.verifier, redirect_uri: `${settings.origin}/api/auth/github-app/callback` }).toString() }, transport);
        if (!TOKEN.test(token.access_token ?? '') || token.token_type !== 'bearer' || token.scope !== '' || token.error || !Number.isInteger(token.expires_in) || token.expires_in < 1 || token.expires_in > 28800) return callbackResult('unavailable');
        const identity = await providerRequest(fetcher, 'https://api.github.com/user', { method: 'GET', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token}`, 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'security-workbench-github-app' } }, transport);
        if (!Number.isSafeInteger(identity.id) || String(identity.id) !== user.githubId) return callbackResult('forbidden');
        // Re-check session after provider I/O: logout/revocation cannot finish a new connection.
        const active = await requestUser(request);
        if (active.userId !== user.userId || active.githubId !== user.githubId) return callbackResult('invalid');
        const expires = current + token.expires_in, iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(user, key, expires), tagLength: 128 }, await vaultKey(), encoder.encode(token.access_token));
        const envelope = JSON.stringify({ v: 1, iv: base64url(iv), ciphertext: base64url(new Uint8Array(encrypted)) });
        // Never store a refresh token, provider response, secret key or plaintext access token.
        const saved = await write("INSERT INTO workbench_github_app_connections (owner_id, github_id, token_envelope, key_version, config_key, expires_at, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM workbench_github_app_flows WHERE state_hash = ? AND owner_id = ? AND github_id = ? AND verifier = '' AND expires_at > ?) ON CONFLICT (owner_id) DO UPDATE SET github_id = excluded.github_id, token_envelope = excluded.token_envelope, key_version = excluded.key_version, config_key = excluded.config_key, expires_at = excluded.expires_at, updated_at = excluded.updated_at", user.userId, user.githubId, envelope, settings.keyVersion, key, expires, current, current, stateHash, user.userId, user.githubId, stamp());
        if (saved.meta?.changes !== 1) return callbackResult('invalid');
        await write('DELETE FROM workbench_github_app_flows WHERE state_hash = ? AND owner_id = ?', stateHash, user.userId);
        return callbackResult('connected');
      } catch { return callbackResult('unavailable'); }
      finally { transport?.close(); }
    },
    async disconnectRequest(request) {
      try {
        const user = await requestUser(request, true);
        let credential;
        try { credential = await readToken(user); } catch (error) { if (!(error instanceof GitHubAppError) || error.code !== 'disconnected') throw error; }
        // Local revocation is authoritative even if the provider is unavailable.
        // Invalidate in-flight callback markers first. If a subsequent delete
        // fails, return 503; no pending callback can recreate a credential.
        await write('DELETE FROM workbench_github_app_flows WHERE owner_id = ?', user.userId);
        await write('DELETE FROM workbench_github_app_connections WHERE owner_id = ?', user.userId);
        let providerRevoked = false;
        if (credential) {
          const transport = deadline();
          try {
            await providerRequest(fetcher, `https://api.github.com/applications/${encodeURIComponent(settings.clientId)}/token`, {
              method: 'DELETE', headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', Authorization: `Basic ${btoa(`${settings.clientId}:${settings.clientSecret}`)}`, 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'security-workbench-github-app' }, body: JSON.stringify({ access_token: credential.token }),
            }, transport, false);
            providerRevoked = true;
          } catch { /* report remote revocation as unconfirmed */ }
          finally { transport.close(); }
        }
        return reply({ ok: true, provider_revoked: providerRevoked }, 200, cookie('', 0));
      } catch (error) { return safeFailure(error); }
    },
  };
}
