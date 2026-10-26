/** Owner-only GitHub sign-in. Provider tokens never enter storage or responses. */
const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const FLOW_COOKIE = '__Host-workbench_github_flow';
const SESSION_COOKIE = '__Host-workbench_github_session';
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const FLOW_SECONDS = 600;
const MAX_PENDING_FLOWS = 20;
const SESSION_SECONDS = 43200;
const RESPONSE_HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const encoder = new TextEncoder();

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const randomSecret = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
async function digest(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
function cookie(name, value, seconds) {
  return `${name}=${value}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Lax`;
}
function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  if (header.length > 8192) return null;
  const matches = header.split(';').map(item => item.trim()).filter(item => item.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return SECRET.test(value) ? value : null;
}
function reply(body, status = 200, cookies = []) {
  const headers = new Headers({ ...RESPONSE_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
  for (const item of cookies) headers.append('Set-Cookie', item);
  return new Response(JSON.stringify(body), { status, headers });
}
function redirect(location, status, cookies = []) {
  const headers = new Headers({ ...RESPONSE_HEADERS, Location: location });
  for (const item of cookies) headers.append('Set-Cookie', item);
  return new Response(null, { status, headers });
}
function trustedOrigin(value) {
  try {
    const origin = new URL(value);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || origin.origin !== value) return null;
    return origin.origin;
  } catch { return null; }
}
function githubId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const id = String(value);
  return /^[1-9][0-9]*$/.test(id) && Number.isSafeInteger(Number(id)) ? id : null;
}
function workspacePolicy(input) {
  try {
    const owner = githubId(input?.githubOwnerId), ownerId = input?.workbenchOwnerId;
    if (!owner || typeof ownerId !== 'string' || !ownerId || ownerId.trim() !== ownerId || ownerId.length > 200) return null;
    if (input.multiUserEnabled !== undefined && typeof input.multiUserEnabled !== 'boolean') return null;
    const allowed = input.allowedGitHubIds ?? [];
    if (!Array.isArray(allowed) || allowed.length > 100 || allowed.some(id => typeof id !== 'string' || githubId(id) !== id) || new Set(allowed).size !== allowed.length) return null;
    if (allowed.some(id => id !== owner && `github:${id}` === ownerId)) return null;
    return { githubOwnerId: owner, workbenchOwnerId: ownerId, multiUserEnabled: input.multiUserEnabled === true, allowedGitHubIds: [...allowed].sort() };
  } catch { return null; }
}

/** Server policy only. No email, login, browser owner or first-user election. */
export function resolveWorkspacePrincipal(config, numericGitHubId) {
  const policy = workspacePolicy(config), id = githubId(numericGitHubId);
  if (!policy || !id) return null;
  if (id === policy.githubOwnerId) return { userId: policy.workbenchOwnerId, githubId: id, role: 'admin' };
  if (!policy.multiUserEnabled || !policy.allowedGitHubIds.includes(id)) return null;
  return { userId: `github:${id}`, githubId: id, role: 'member' };
}

export function isWorkbenchUserAllowed(config, user) {
  if (!user || user.provider !== 'github' || typeof user.githubId !== 'string') return false;
  const principal = resolveWorkspacePrincipal(config, user.githubId);
  return Boolean(principal && user.userId === principal.userId && user.role === principal.role);
}

function configuration(input) {
  if (input?.enabled !== true) return null;
  try {
    const origin = trustedOrigin(input.origin);
    if (!origin) return null;
    if (typeof input.clientId !== 'string' || !/^[A-Za-z0-9_.-]{1,200}$/.test(input.clientId)) return null;
    if (typeof input.clientSecret !== 'string' || !input.clientSecret || input.clientSecret.length > 4096) return null;
    const policy = workspacePolicy(input);
    if (!policy) return null;
    const sessionVersion = input.sessionVersion === undefined ? '1' : input.sessionVersion;
    if (typeof sessionVersion !== 'string' || !/^[1-9][0-9]{0,11}$/.test(sessionVersion)) return null;
    return { ...input, ...policy, origin, sessionVersion };
  } catch { return null; }
}

export function isGitHubLoginConfigured(config) {
  return configuration(config) !== null;
}

function cancelStream(stream) {
  // An untrusted stream may never settle its cancel promise. Cleanup must not
  // extend the callback deadline, and rejected cleanup must stay handled.
  try { stream?.cancel().catch(() => {}); } catch { /* best effort */ }
}

// Both body streaming and network requests share one finite callback deadline.
async function boundedJson(url, options, maxBytes, transport) {
  const result = await Promise.race([transport.fetcher(url, {
    ...options, redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: transport.controller.signal,
  }), transport.abort]);
  if (result.status !== 200) {
    cancelStream(result.body);
    throw new Error('provider');
  }
  const size = result.headers.get('content-length');
  if (size && (!/^\d+$/.test(size) || Number(size) > maxBytes)) {
    cancelStream(result.body);
    throw new Error('provider');
  }
  if (!result.body?.getReader) throw new Error('provider');
  const reader = result.body.getReader();
  let bytes = 0;
  const chunks = [];
  try {
    while (true) {
      const part = await Promise.race([reader.read(), transport.abort]);
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) throw new Error('provider');
      chunks.push(part.value);
    }
  } catch (error) {
    cancelStream(reader);
    throw error;
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const part of chunks) { body.set(part, offset); offset += part.byteLength; }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('provider');
  return value;
}

export function createGitHubAuth({ config, db, fetcher = fetch, now = () => new Date() }) {
  const settings = configuration(config);
  const timestamp = () => Math.floor(new Date(now()).valueOf() / 1000);
  const usable = request => settings && new URL(request.url).origin === settings.origin && db?.prepare;
  const key = () => digest(JSON.stringify([
    settings.origin, settings.clientId, settings.githubOwnerId, settings.workbenchOwnerId, settings.sessionVersion,
    ...(settings.multiUserEnabled ? ['workbench-pilot-v1', settings.allowedGitHubIds] : []),
  ]));
  const first = (sql, ...values) => db.prepare(sql).bind(...values).first();
  const write = async (sql, ...values) => {
    const result = await db.prepare(sql).bind(...values).run();
    if (result?.success !== true) throw new Error('storage');
    return result;
  };
  const invalidCallback = status => redirect(`/access?auth=${status}`, 303, [cookie(FLOW_COOKIE, '', 0)]);

  async function getSession(request, { throwOnUnavailable = false } = {}) {
    if (!usable(request)) return null;
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) return null;
    try {
      const row = await first('SELECT * FROM workbench_github_sessions WHERE token_hash = ? AND expires_at > ?', await digest(token), timestamp());
      const principal = row && resolveWorkspacePrincipal(settings, row.github_id);
      if (!principal || row.config_key !== await key() || row.owner_id !== principal.userId) return null;
      const csrfToken = await digest(`workbench-csrf\0${token}`);
      if (row.csrf_hash !== await digest(csrfToken)) return null;
      // A UI-only marker detects account/session changes without exposing the
      // cookie, its stored hash, the CSRF value or a stable account identifier.
      // This domain-separated digest is never accepted as a credential.
      const sessionKey = await digest(`workbench-session-ui\0${token}`);
      return { ...principal, displayName: row.display_name, provider: 'github', csrfToken, expiresAt: row.expires_at * 1000, sessionKey };
    } catch {
      if (throwOnUnavailable) throw new Error('session_unavailable');
      return null;
    }
  }

  return {
    getSession,
    async start(request) {
      if (!usable(request)) return reply({ error: 'Login GitHub indisponível. Confira a configuração do servidor.' }, 503);
      if (request.method !== 'GET') return reply({ error: 'Método não permitido.' }, 405);
      try {
        const current = timestamp();
        const state = randomSecret(), binding = readCookie(request, FLOW_COOKIE) || randomSecret(), verifier = randomSecret();
        const browserHash = await digest(binding), stateHash = await digest(state), configKey = await key();
        await write('DELETE FROM workbench_oauth_flows WHERE expires_at <= ?', current);
        await write('DELETE FROM workbench_github_sessions WHERE expires_at <= ?', current);
        // Replace in place so a concurrent anonymous start cannot take this
        // cookie's existing slot between deletion and insertion. This prevents
        // orphaned retries, not anonymous cookie resets.
        const refreshed = await write('UPDATE workbench_oauth_flows SET state_hash = ?, verifier = ?, config_key = ?, expires_at = ?, created_at = ? WHERE browser_hash = ?', stateHash, verifier, configKey, current + FLOW_SECONDS, current, browserHash);
        if (![0, 1].includes(refreshed.meta?.changes)) throw new Error('storage');
        const admitted = refreshed.meta.changes === 1 ? refreshed : await write('INSERT INTO workbench_oauth_flows (state_hash, browser_hash, verifier, config_key, expires_at, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM workbench_oauth_flows WHERE expires_at > ?) < ? AND NOT EXISTS (SELECT 1 FROM workbench_oauth_flows WHERE browser_hash = ?)', stateHash, browserHash, verifier, configKey, current + FLOW_SECONDS, current, current, MAX_PENDING_FLOWS, browserHash);
        if (admitted.meta?.changes !== 1) {
          const next = await first('SELECT MIN(expires_at) AS expires_at FROM workbench_oauth_flows WHERE expires_at > ?', current);
          const retry = Number.isSafeInteger(next?.expires_at) ? Math.max(1, Math.min(FLOW_SECONDS, next.expires_at - current)) : FLOW_SECONDS;
          const limited = reply({ error: 'Muitas tentativas de login. Tente novamente mais tarde.' }, 429);
          limited.headers.set('Retry-After', String(retry));
          return limited;
        }
        const url = new URL(AUTHORIZE_URL);
        url.search = new URLSearchParams({ client_id: settings.clientId, redirect_uri: `${settings.origin}/api/auth/github/callback`, state, code_challenge: await digest(verifier), code_challenge_method: 'S256', scope: '', allow_signup: 'false', prompt: 'select_account' }).toString();
        return redirect(url.toString(), 302, [cookie(FLOW_COOKIE, binding, FLOW_SECONDS)]);
      } catch { return reply({ error: 'Login GitHub temporariamente indisponível.' }, 503); }
    },
    async callback(request) {
      if (!usable(request)) return invalidCallback('unavailable');
      if (request.method !== 'GET') return reply({ error: 'Método não permitido.' }, 405);
      const url = new URL(request.url);
      if (['state', 'code', 'error'].some(name => url.searchParams.getAll(name).length > 1)) return invalidCallback('invalid');
      const state = url.searchParams.get('state'), binding = readCookie(request, FLOW_COOKIE);
      if (!state || !SECRET.test(state) || !binding) return invalidCallback('invalid');
      let timer;
      try {
        const current = timestamp(), stateHash = await digest(state), browserHash = await digest(binding), configKey = await key();
        const flow = await first('SELECT * FROM workbench_oauth_flows WHERE state_hash = ? AND browser_hash = ? AND config_key = ? AND expires_at > ?', stateHash, browserHash, configKey, current);
        if (!flow || !SECRET.test(flow.verifier)) return invalidCallback('invalid');
        // Atomic consume: concurrent or replayed callbacks never exchange twice.
        const consumed = await write('DELETE FROM workbench_oauth_flows WHERE state_hash = ? AND browser_hash = ? AND config_key = ? AND expires_at > ?', stateHash, browserHash, configKey, current);
        if (consumed.meta?.changes !== 1) return invalidCallback('invalid');
        if (url.searchParams.has('error')) return invalidCallback(url.searchParams.get('error') === 'access_denied' ? 'denied' : 'invalid');
        const code = url.searchParams.get('code');
        if (!code || !/^[A-Za-z0-9_-]{1,512}$/.test(code)) return invalidCallback('invalid');
        const controller = new AbortController();
        const abort = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('provider')), { once: true }));
        timer = setTimeout(() => controller.abort(), 10000);
        const transport = { fetcher, controller, abort };
        const token = await boundedJson(TOKEN_URL, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: settings.clientId, client_secret: settings.clientSecret, code, code_verifier: flow.verifier, redirect_uri: `${settings.origin}/api/auth/github/callback` }).toString() }, 16384, transport);
        if (typeof token.access_token !== 'string' || !/^[A-Za-z0-9_-]{1,2048}$/.test(token.access_token) || token.token_type !== 'bearer' || token.scope !== '' || token.error) return invalidCallback('unavailable');
        const user = await boundedJson(USER_URL, { method: 'GET', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token}`, 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'security-workbench-owner-login' } }, 32768, transport);
        if (!Number.isSafeInteger(user.id) || user.id <= 0) return invalidCallback('forbidden');
        const principal = resolveWorkspacePrincipal(settings, user.id);
        if (!principal) return invalidCallback('forbidden');
        if (typeof user.login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(user.login)) return invalidCallback('unavailable');
        const session = randomSecret(), csrfToken = await digest(`workbench-csrf\0${session}`);
        const old = readCookie(request, SESSION_COOKIE);
        if (old) await write('DELETE FROM workbench_github_sessions WHERE token_hash = ?', await digest(old));
        await write('INSERT INTO workbench_github_sessions (token_hash, csrf_hash, github_id, owner_id, display_name, config_key, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', await digest(session), await digest(csrfToken), principal.githubId, principal.userId, user.login, configKey, current + SESSION_SECONDS, current);
        return redirect('/', 303, [cookie(FLOW_COOKIE, '', 0), cookie(SESSION_COOKIE, session, SESSION_SECONDS)]);
      } catch { return invalidCallback('unavailable'); }
      finally { clearTimeout(timer); }
    },
    async logout(request) {
      if (request.method !== 'POST') return reply({ error: 'Método não permitido.' }, 405);
      // Logout must remain available when login is disabled or not configured.
      // A missing canonical origin is safe here only because this operation can
      // revoke access, and still requires the browser's exact HTTPS origin.
      const origin = trustedOrigin(config?.origin) || trustedOrigin(new URL(request.url).origin);
      if (!origin || new URL(request.url).origin !== origin || request.headers.get('origin') !== origin) return reply({ error: 'Origem não autorizada.' }, 403);
      const clear = [cookie(SESSION_COOKIE, '', 0)];
      const hasCookie = (request.headers.get('cookie') || '').split(';').some(item => item.trim().startsWith(`${SESSION_COOKIE}=`));
      if (!hasCookie) return reply({ ok: true }, 200, clear);
      const token = readCookie(request, SESSION_COOKIE);
      // Ambiguous cookies must never hide an active token while claiming logout.
      if (!token) return reply({ error: 'Não foi possível identificar a sessão GitHub.' }, 400);
      try {
        // Do not use getSession: its read-only fallback deliberately returns null
        // on D1 failure, which cannot be treated as successful revocation here.
        const tokenHash = await digest(token);
        const row = await first('SELECT * FROM workbench_github_sessions WHERE token_hash = ?', tokenHash);
        const csrfToken = await digest(`workbench-csrf\0${token}`);
        const principal = row && settings && resolveWorkspacePrincipal(settings, row.github_id);
        const active = principal && row.expires_at > timestamp() && row.config_key === await key() && row.owner_id === principal.userId && row.csrf_hash === await digest(csrfToken);
        if (active) {
          const csrf = request.headers.get('X-Workbench-CSRF');
          if (!csrf || !SECRET.test(csrf) || csrf !== csrfToken) return reply({ error: 'Confirme a sessão antes de sair.' }, 403);
        }
        // Expired/disabled/config-mismatched sessions are revoked too, so turning
        // login back on cannot revive an old browser cookie after sign-out.
        await write('DELETE FROM workbench_github_sessions WHERE token_hash = ?', tokenHash);
        return active ? reply({ ok: true }, 200, clear) : reply({ error: 'Sessão expirada.' }, 401, clear);
      } catch { return reply({ error: 'Não foi possível encerrar a sessão. Tente novamente.' }, 503); }
    },
  };
}
