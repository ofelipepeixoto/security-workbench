/** Server-only GitHub App user-token transport. No installation token is accepted. */
const API = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const PAGE_SIZE = 100;
const SHA = /^[0-9a-f]{40}$/i;
const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const TOKEN = /^ghu_[A-Za-z0-9_]{1,2048}$/;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

const MESSAGES = Object.freeze({
  invalid_request: 'Parâmetros de acesso GitHub inválidos.',
  disconnected: 'Conecte novamente o acesso aos repositórios no GitHub.',
  forbidden: 'O GitHub não autorizou este acesso. Confira a instalação, aprovação e SSO.',
  unavailable: 'Não foi possível carregar os repositórios no GitHub.',
  suspended: 'A instalação GitHub está suspensa.',
  insufficient_permission: 'A instalação não permite ler o conteúdo deste repositório.',
  incomplete: 'A sincronização atingiu o limite de páginas. O acesso não foi confirmado.',
  rate_limited: 'A cota GitHub foi atingida. Aguarde o horário de nova tentativa.',
  timeout: 'O GitHub não respondeu dentro do prazo permitido.',
});

export class GitHubAppError extends Error {
  constructor(code, status = 503, retryAt = null) {
    super(MESSAGES[code] ?? MESSAGES.unavailable);
    this.code = Object.hasOwn(MESSAGES, code) ? code : 'unavailable';
    this.status = status;
    this.retryAt = retryAt;
  }
}

function id(value) {
  if (typeof value === 'string' && /^[1-9][0-9]*$/.test(value)) value = Number(value);
  if (!Number.isSafeInteger(value) || value < 1) throw new GitHubAppError('invalid_request', 400);
  return value;
}

function pageNumber(value = 1) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10000) throw new GitHubAppError('invalid_request', 400);
  return value;
}

function cancel(stream) {
  try { stream?.cancel().catch(() => {}); } catch { /* bounded best effort */ }
}

function timestamp(now) {
  const current = new Date(now()).valueOf();
  if (!Number.isFinite(current)) throw new GitHubAppError('unavailable');
  return current;
}

function retryAt(headers, current, random) {
  const after = headers.get('retry-after');
  let at = current + 60000;
  if (after && /^\d+$/.test(after)) at = current + Number(after) * 1000;
  else if (after && Number.isFinite(Date.parse(after))) at = Date.parse(after);
  const reset = headers.get('x-ratelimit-reset');
  if (reset && /^\d+$/.test(reset)) at = Math.max(at, Number(reset) * 1000);
  // Jitter delays a manual retry; it never retries or changes identity itself.
  at = Math.max(current + 1000, at);
  if (!Number.isFinite(at) || at > 8640000000000000 - 1000) return null;
  return new Date(at + Math.floor(Math.max(0, Math.min(1, random())) * 1000)).toISOString();
}

function installation(row, expectedAppId) {
  if (!row || id(row.app_id) !== expectedAppId || !row.account || !LOGIN.test(row.account.login)) throw new GitHubAppError('unavailable');
  const accountId = id(row.account.id);
  if (!['User', 'Organization'].includes(row.account.type)) throw new GitHubAppError('unavailable');
  return {
    id: id(row.id), app_id: expectedAppId,
    account: { id: accountId, login: row.account.login, type: row.account.type },
    repository_selection: row.repository_selection === 'all' ? 'all' : 'selected',
    permissions: { metadata: row.permissions?.metadata ?? null, contents: row.permissions?.contents ?? null },
    suspended_at: typeof row.suspended_at === 'string' ? row.suspended_at.slice(0, 40) : null,
    state: row.suspended_at ? 'suspended' : 'active',
    manage_url: row.account.type === 'Organization'
      ? `https://github.com/organizations/${encodeURIComponent(row.account.login)}/settings/installations/${id(row.id)}`
      : `https://github.com/settings/installations/${id(row.id)}`,
  };
}

function repository(row, installationId) {
  if (!row?.owner || !LOGIN.test(row.owner.login) || typeof row.name !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(row.name) || row.full_name !== `${row.owner.login}/${row.name}` || typeof row.private !== 'boolean') throw new GitHubAppError('unavailable');
  const canRead = row.permissions?.pull === true || row.permissions?.admin === true || row.permissions?.push === true || row.permissions?.maintain === true || row.permissions?.triage === true;
  return {
    id: id(row.id), full_name: row.full_name, name: row.name,
    owner: { id: id(row.owner.id), login: row.owner.login, type: row.owner.type === 'Organization' ? 'Organization' : 'User' },
    private: row.private, visibility: row.visibility === 'internal' ? 'internal' : row.private ? 'private' : 'public',
    default_branch: typeof row.default_branch === 'string' && row.default_branch.length <= 255 ? row.default_branch : null,
    language: typeof row.language === 'string' ? row.language.slice(0, 80) : null,
    archived: row.archived === true, disabled: row.disabled === true,
    permissions: { pull: canRead }, permission_state: canRead ? 'read' : 'not_authorized', installation_id: installationId,
  };
}

function pagination(data, items, key, path, page, link, syncedAt) {
  if (!Number.isSafeInteger(data.total_count) || data.total_count < 0 || !Array.isArray(items) || items.length > PAGE_SIZE) throw new GitHubAppError('unavailable');
  let hasNext = data.total_count > page * PAGE_SIZE;
  if (link) {
    if (link.length > 8192) throw new GitHubAppError('unavailable');
    for (const part of link.split(',')) {
      if (!/;\s*rel="next"/.test(part)) continue;
      const target = /^\s*<([^>]+)>/.exec(part)?.[1];
      let url;
      try { url = new URL(target); } catch { throw new GitHubAppError('unavailable'); }
      if (url.origin !== API || url.pathname !== path || url.username || url.password || url.hash || url.searchParams.get('page') !== String(page + 1) || url.searchParams.get('per_page') !== String(PAGE_SIZE) || [...url.searchParams.keys()].some(name => !['page', 'per_page'].includes(name))) throw new GitHubAppError('unavailable');
      hasNext = true;
    }
  }
  return { [key]: items, total_count: data.total_count, page, next_page: hasNext ? page + 1 : null, complete: !hasNext, synced_at: syncedAt };
}

export function createGitHubAppClient({ accessToken, expectedGitHubId, appId, fetcher = fetch, now = () => new Date(), random = Math.random, maxPages = 10, signal } = {}) {
  if (!TOKEN.test(accessToken ?? '') || String(id(expectedGitHubId)) !== String(expectedGitHubId) || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new GitHubAppError('disconnected', 401);
  const expectedAppId = id(appId);
  const authorized = new Map();
  let identityChecked = false;
  let nextAllowedAt = null;
  const deadline = Date.now() + 45000;

  async function get(path) {
    if (nextAllowedAt && timestamp(now) < Date.parse(nextAllowedAt)) throw new GitHubAppError('rate_limited', 429, nextAllowedAt);
    const remaining = Math.min(10000, deadline - Date.now());
    if (remaining <= 0 || signal?.aborted) throw new GitHubAppError('timeout', 504);
    const controller = new AbortController();
    let timer;
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const stopped = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new GitHubAppError('timeout', 504)), { once: true }));
    timer = setTimeout(() => controller.abort(), remaining);
    try {
      const response = await Promise.race([fetcher(`${API}${path}`, {
        method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${accessToken}`, 'X-GitHub-Api-Version': API_VERSION, 'User-Agent': 'security-workbench-github-app' },
      }), stopped]);
      if (response.status !== 200) {
        cancel(response.body);
        if (response.status === 401) throw new GitHubAppError('disconnected', 401);
        if (response.status === 429 || (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))) {
          nextAllowedAt = retryAt(response.headers, timestamp(now), random);
          throw new GitHubAppError('rate_limited', 429, nextAllowedAt);
        }
        if ([403, 404].includes(response.status)) throw new GitHubAppError('forbidden', 403);
        throw new GitHubAppError('unavailable');
      }
      const declared = response.headers.get('content-length');
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) { cancel(response.body); throw new GitHubAppError('unavailable'); }
      const reader = response.body?.getReader();
      if (!reader) throw new GitHubAppError('unavailable');
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const part = await Promise.race([reader.read(), stopped]);
          if (part.done) break;
          size += part.value.byteLength;
          if (size > MAX_RESPONSE_BYTES) throw new GitHubAppError('unavailable');
          chunks.push(part.value);
        }
      } catch (error) { cancel(reader); throw error; }
      finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
      const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new GitHubAppError('unavailable');
      return { data, link: response.headers.get('link') };
    } catch (error) { if (error instanceof GitHubAppError) throw error; throw new GitHubAppError('unavailable'); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
  }

  async function getIdentity() {
    const { data } = await get('/user');
    if (String(id(data.id)) !== String(expectedGitHubId) || !LOGIN.test(data.login)) throw new GitHubAppError('disconnected', 401);
    identityChecked = true;
    return { id: data.id, login: data.login };
  }
  const ensureIdentity = async () => { if (!identityChecked) await getIdentity(); };

  async function listInstallations({ page = 1 } = {}) {
    page = pageNumber(page);
    await ensureIdentity();
    const path = '/user/installations';
    const { data, link } = await get(`${path}?per_page=${PAGE_SIZE}&page=${page}`);
    if (!Array.isArray(data.installations)) throw new GitHubAppError('unavailable');
    const rows = data.installations.map(row => installation(row, expectedAppId));
    return pagination(data, rows, 'installations', path, page, link, new Date(now()).toISOString());
  }

  async function allowedInstallation(installationId) {
    installationId = id(installationId);
    let page = 1;
    for (let index = 0; index < maxPages; index++) {
      const result = await listInstallations({ page });
      const found = result.installations.find(row => row.id === installationId);
      if (found) {
        if (found.state === 'suspended') throw new GitHubAppError('suspended', 403);
        if (!['read', 'write'].includes(found.permissions.contents)) throw new GitHubAppError('insufficient_permission', 403);
        return found;
      }
      if (!result.next_page) throw new GitHubAppError('forbidden', 403);
      page = result.next_page;
    }
    throw new GitHubAppError('incomplete', 409);
  }

  async function repositoryPage(installationId, page) {
    const path = `/user/installations/${id(installationId)}/repositories`;
    const { data, link } = await get(`${path}?per_page=${PAGE_SIZE}&page=${pageNumber(page)}`);
    if (!Array.isArray(data.repositories)) throw new GitHubAppError('unavailable');
    return pagination(data, data.repositories.map(row => repository(row, installationId)), 'repositories', path, page, link, new Date(now()).toISOString());
  }

  async function listRepositories({ installationId, page = 1 } = {}) {
    installationId = id(installationId); page = pageNumber(page);
    await allowedInstallation(installationId);
    return repositoryPage(installationId, page);
  }

  async function allowedRepository(installationId, repositoryId, refresh = false) {
    installationId = id(installationId); repositoryId = id(repositoryId);
    const cacheKey = `${installationId}:${repositoryId}`;
    if (!refresh && authorized.has(cacheKey)) return authorized.get(cacheKey);
    await allowedInstallation(installationId);
    let page = 1;
    for (let index = 0; index < maxPages; index++) {
      const result = await repositoryPage(installationId, page);
      const found = result.repositories.find(row => row.id === repositoryId);
      if (found) {
        if (!found.permissions.pull || found.disabled) throw new GitHubAppError('forbidden', 403);
        authorized.set(cacheKey, found);
        return found;
      }
      if (!result.next_page) throw new GitHubAppError('forbidden', 403);
      page = result.next_page;
    }
    throw new GitHubAppError('incomplete', 409);
  }

  async function resolveCommit({ installationId, repositoryId, revision, branch } = {}) {
    const repo = await allowedRepository(installationId, repositoryId);
    const ref = typeof revision === 'string' ? revision.toLowerCase() : branch || repo.default_branch;
    if (typeof ref !== 'string' || !ref || ref.length > 255 || /[\0\r\n]/.test(ref) || (revision && !SHA.test(revision))) throw new GitHubAppError('invalid_request', 400);
    const { data } = await get(`/repositories/${repo.id}/commits/${encodeURIComponent(ref)}`);
    if (!SHA.test(data.sha ?? '') || !SHA.test(data.commit?.tree?.sha ?? '') || (revision && data.sha.toLowerCase() !== revision.toLowerCase())) throw new GitHubAppError('unavailable');
    return { repository: repo, revision: data.sha.toLowerCase(), tree_sha: data.commit.tree.sha.toLowerCase() };
  }

  return {
    getIdentity, listInstallations, listRepositories, resolveCommit,
    async authorizeRepository(options = {}) {
      await allowedRepository(options.installationId, options.repositoryId, true);
      return resolveCommit(options);
    },
    async readTree({ installationId, repositoryId, treeSha } = {}) {
      const repo = await allowedRepository(installationId, repositoryId);
      if (!SHA.test(treeSha ?? '')) throw new GitHubAppError('invalid_request', 400);
      return (await get(`/repositories/${repo.id}/git/trees/${treeSha.toLowerCase()}?recursive=1`)).data;
    },
    async readBlob({ installationId, repositoryId, blobSha } = {}) {
      const repo = await allowedRepository(installationId, repositoryId);
      if (!SHA.test(blobSha ?? '')) throw new GitHubAppError('invalid_request', 400);
      return (await get(`/repositories/${repo.id}/git/blobs/${blobSha.toLowerCase()}`)).data;
    },
  };
}
