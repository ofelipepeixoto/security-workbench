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
  qa_consumption: 'O limite de aquisição desta tentativa de QA foi atingido.',
  qa_closed: 'A janela de QA não está ativa. Novas leituras estão bloqueadas.',
  cancelled: 'O job foi cancelado.',
  budget_exceeded: 'O limite de consultas desta revisão contextual foi atingido. O contexto não foi completado.',
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
    archived: row.archived === true, fork: row.fork === true, disabled: row.disabled === true,
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
  // At most two workflow files share these immutable, request-local metadata
  // objects. Access is freshly checked for every file; content is not cached.
  const contextCommits = new Map(), contextTrees = new Map(), contextFiles = new Set();
  // Tickets are private capabilities of this client, never serialized grants.
  const acquisitionTickets = new WeakMap();
  let authorizationEpoch = 0, requestCount = 0, authorizationCost = 0, requestLimit = Infinity, responseBytes = 0, responseLimit = Infinity;
  let identityChecked = false;
  let nextAllowedAt = null;
  const deadline = Date.now() + 45000;

  async function get(path, maxResponseBytes = MAX_RESPONSE_BYTES) {
    if (requestCount >= requestLimit || responseBytes >= responseLimit) {
      authorizationEpoch++; authorized.clear(); identityChecked=false;
      throw new GitHubAppError('budget_exceeded',409);
    }
    if (nextAllowedAt && timestamp(now) < Date.parse(nextAllowedAt)) throw new GitHubAppError('rate_limited', 429, nextAllowedAt);
    const remaining = Math.min(10000, deadline - Date.now());
    if (signal?.aborted && signal.reason instanceof GitHubAppError) throw signal.reason;
    if (remaining <= 0 || signal?.aborted) throw new GitHubAppError('timeout', 504);
    const controller = new AbortController();
    let timer;
    const onAbort = () => controller.abort(signal.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    const stopped = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason instanceof GitHubAppError ? controller.signal.reason : new GitHubAppError('timeout', 504)), { once: true }));
    timer = setTimeout(() => controller.abort(), remaining);
    try {
      requestCount++;
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
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxResponseBytes || Number(declared) > responseLimit-responseBytes)) {
        cancel(response.body);
        throw new GitHubAppError(/^\d+$/.test(declared) && Number(declared)>responseLimit-responseBytes?'budget_exceeded':'unavailable', /^\d+$/.test(declared) && Number(declared)>responseLimit-responseBytes?409:503);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new GitHubAppError('unavailable');
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const part = await Promise.race([reader.read(), stopped]);
          if (part.done) break;
          size += part.value.byteLength;
          responseBytes += part.value.byteLength;
          if (responseBytes > responseLimit) throw new GitHubAppError('budget_exceeded',409);
          if (size > maxResponseBytes) throw new GitHubAppError('unavailable');
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
    } catch (error) {
      // A failed fresh provider observation cannot leave an earlier positive
      // acquisition capability usable on this client. This map is request-local.
      authorizationEpoch++; authorized.clear(); identityChecked = false;
      if (signal?.aborted && signal.reason instanceof GitHubAppError) throw signal.reason;
      if (error instanceof GitHubAppError) throw error;
      throw new GitHubAppError('unavailable');
    }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
  }

  async function getIdentity() {
    identityChecked = false; authorizationEpoch++; authorized.clear();
    const { data } = await get('/user');
    if (String(id(data.id)) !== String(expectedGitHubId) || !LOGIN.test(data.login)) throw new GitHubAppError('disconnected', 401);
    identityChecked = true;
    return { id: data.id, login: data.login };
  }
  const ensureIdentity = async () => { if (!identityChecked) await getIdentity(); };

  async function listInstallations({ page = 1 } = {}) {
    page = pageNumber(page);
    if (page > maxPages) throw new GitHubAppError('incomplete', 409);
    await ensureIdentity();
    const path = '/user/installations';
    const { data, link } = await get(`${path}?per_page=${PAGE_SIZE}&page=${page}`);
    if (!Array.isArray(data.installations) || data.installations.length > PAGE_SIZE) throw new GitHubAppError('unavailable');
    const rows = data.installations.map(row => installation(row, expectedAppId));
    const result = pagination(data, [...new Map(rows.map(row => [row.id, row])).values()], 'installations', path, page, link, new Date(now()).toISOString());
    return { ...result, page_limit: maxPages, limit_reached: Boolean(result.next_page && page >= maxPages),
      total_scope: 'user_app_installations', coverage: { scope: 'user_app_installations', global_complete: false } };
  }

  async function allowedInstallation(installationId, { contents = true } = {}) {
    installationId = id(installationId);
    let page = 1;
    for (let index = 0; index < maxPages; index++) {
      const result = await listInstallations({ page });
      const found = result.installations.find(row => row.id === installationId);
      if (found) {
        if (found.state === 'suspended') throw new GitHubAppError('suspended', 403);
        if (contents && !['read', 'write'].includes(found.permissions.contents)) throw new GitHubAppError('insufficient_permission', 403);
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
    if (page > maxPages) throw new GitHubAppError('incomplete', 409);
    // Discovering metadata is not authority to acquire source. Only this user
    // token's installation intersection is listed; neither /user/repos nor a
    // broad PAT can widen that intersection by changing an endpoint alone.
    authorizationEpoch++; authorized.clear();
    const installation = await allowedInstallation(installationId, { contents: false });
    const result = await repositoryPage(installationId, page);
    const contents = ['read', 'write'].includes(installation.permissions.contents);
    const rows = [...new Map(result.repositories.map(row => [row.id, row])).values()].map(row => ({
      ...row,
      analysis_access: {
        state: row.disabled ? 'disabled' : !contents ? 'contents_permission_required' : !row.permissions.pull ? 'repository_read_required' : 'available',
        can_analyze: !row.disabled && contents && row.permissions.pull,
        manage_url: installation.manage_url,
      },
    }));
    return { ...result, repositories: rows, page_limit: maxPages, limit_reached: Boolean(result.next_page && page >= maxPages),
      total_scope: 'installation_user_intersection', coverage: {
        scope: 'installation_user_intersection', repository_selection: installation.repository_selection,
        global_complete: false, contents_permission: contents, manage_url: installation.manage_url,
      } };
  }

  /** Fresh access-only snapshot for one operation, never shared across users or
   * requests. Each installation/repository page is fetched at most once here.
   * No commit is needed to decide whether stored history can be disclosed.
   */
  async function checkRepositoriesAccess(scopes) {
    if (!Array.isArray(scopes) || scopes.length > 100) throw new GitHubAppError('invalid_request', 400);
    const wanted = scopes.map(scope => ({ installationId: id(scope?.installationId), repositoryId: id(scope?.repositoryId) }));
    if (!wanted.length) return [];
    authorizationEpoch++;
    const groups = new Map();
    for (const scope of wanted) {
      if (!groups.has(scope.installationId)) groups.set(scope.installationId, new Set());
      groups.get(scope.installationId).add(scope.repositoryId);
      // Never leave a previous positive grant usable after a denied refresh.
      authorized.delete(`${scope.installationId}:${scope.repositoryId}`);
    }
    const installations = new Map();
    let page = 1, complete = false;
    for (let index = 0; index < maxPages; index++) {
      const result = await listInstallations({ page });
      for (const row of result.installations) if (groups.has(row.id)) {
        if (installations.has(row.id)) throw new GitHubAppError('unavailable');
        installations.set(row.id, row);
      }
      if (!result.next_page) { complete = true; break; }
      if ([...groups.keys()].every(key => installations.has(key))) break;
      page = result.next_page;
    }
    if (!complete && [...groups.keys()].some(key => !installations.has(key))) throw new GitHubAppError('incomplete', 409);
    const grants = new Map();
    for (const [installationId, targets] of groups) {
      const installation = installations.get(installationId);
      if (!installation || installation.state === 'suspended' || !['read', 'write'].includes(installation.permissions.contents)) continue;
      let page = 1, complete = false;
      const found = new Set();
      for (let index = 0; index < maxPages; index++) {
        const result = await repositoryPage(installationId, page);
        for (const row of result.repositories) if (targets.has(row.id)) {
          if (found.has(row.id)) throw new GitHubAppError('unavailable');
          found.add(row.id);
          if (row.permissions.pull && !row.disabled) grants.set(`${installationId}:${row.id}`, row);
        }
        if (!result.next_page) { complete = true; break; }
        if ([...targets].every(key => found.has(key))) break;
        page = result.next_page;
      }
      if (!complete && [...targets].some(key => !found.has(key))) throw new GitHubAppError('incomplete', 409);
    }
    // Errors/quota on any required page abort the whole operation. No partial
    // inventory can be mistaken for denial or an empty successful history.
    return wanted.map(scope => ({ ...scope, repository: grants.get(`${scope.installationId}:${scope.repositoryId}`) ?? null }));
  }

  async function checkRepositoryAccess(options = {}) {
    const [access] = await checkRepositoriesAccess([options]);
    if (!access.repository) throw new GitHubAppError('forbidden', 403);
    return { repository: access.repository };
  }

  async function allowedRepository(installationId, repositoryId, refresh = false) {
    installationId = id(installationId); repositoryId = id(repositoryId);
    const cacheKey = `${installationId}:${repositoryId}`;
    if (!refresh && authorized.has(cacheKey)) return authorized.get(cacheKey);
    if (refresh) { authorizationEpoch++; authorized.delete(cacheKey); }
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

  async function authorizeRepository(options = {}) {
    const before = requestCount, hadIdentity = identityChecked;
    await allowedRepository(options.installationId, options.repositoryId, true);
    const access = await resolveCommit(options);
    authorizationCost = requestCount - before - (hadIdentity ? 0 : 1);
    return access;
  }

  async function readContextFile({ installationId, repositoryId, revision, path, maxBytes = 32768 } = {}) {
    // Context acquisition is deliberately narrower than the scanner: two known
    // workflow files at an already-verified commit. Walk only the three exact
    // path segments, never a recursive tree, moving branch, URL or repository
    // archive. Modes prove this is a regular blob, not a symlink/submodule.
    if (!SHA.test(revision ?? '') || typeof path !== 'string' || !/^\.github\/workflows\/[A-Za-z0-9_.-]{1,180}\.(?:yml|yaml)$/.test(path) || path.includes('..') ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 32768) throw new GitHubAppError('invalid_request', 400);
    const pinned = revision.toLowerCase();
    id(installationId);
    const fileKey = `${id(repositoryId)}:${pinned}:${path}`;
    if (!contextFiles.has(fileKey) && contextFiles.size >= 2) throw new GitHubAppError('incomplete', 409);
    const { repository: repo } = await checkRepositoryAccess({installationId, repositoryId});
    contextFiles.add(fileKey);
    const commitKey = `${repo.id}:${pinned}`;
    let treeSha = contextCommits.get(commitKey);
    if (!treeSha) {
      // This reads the exact existing commit object; it does not resolve a
      // current version or call resolveCommit during metadata discovery.
      const {data:commit} = await get(`/repositories/${repo.id}/git/commits/${pinned}`, 65536);
      if (commit.sha?.toLowerCase() !== pinned || !SHA.test(commit.tree?.sha ?? '')) throw new GitHubAppError('unavailable');
      treeSha = commit.tree.sha.toLowerCase(); contextCommits.set(commitKey,treeSha);
    }
    let entry;
    const segments = path.split('/');
    for (let index=0;index<segments.length;index++) {
      const treeKey = `${repo.id}:${treeSha}`;
      let tree = contextTrees.get(treeKey);
      if (!tree) {
        const {data} = await get(`/repositories/${repo.id}/git/trees/${treeSha}`, 1024 * 1024);
        if (data.sha?.toLowerCase() !== treeSha || data.truncated !== false || !Array.isArray(data.tree) || data.tree.length > 10000) throw new GitHubAppError('incomplete', 409);
        tree = data.tree; contextTrees.set(treeKey,tree);
      }
      const matches = tree.filter(item=>item?.path === segments[index]);
      if (matches.length !== 1 || !SHA.test(matches[0].sha ?? '')) throw new GitHubAppError('unavailable');
      entry = matches[0];
      if (index < segments.length - 1) {
        if (entry.type !== 'tree' || entry.mode !== '040000') throw new GitHubAppError('forbidden',403);
        treeSha = entry.sha.toLowerCase();
      } else if (entry.type !== 'blob' || !['100644','100755'].includes(entry.mode) || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > maxBytes) throw new GitHubAppError('forbidden',403);
    }
    const { data } = await get(`/repositories/${repo.id}/git/blobs/${entry.sha.toLowerCase()}`, Math.ceil(maxBytes / 3) * 4 + 8192);
    if (data.encoding !== 'base64' || data.sha?.toLowerCase() !== entry.sha.toLowerCase() || data.size !== entry.size ||
      typeof data.content !== 'string' || data.content.length > maxBytes * 2 + 1024) throw new GitHubAppError('unavailable');
    try {
      const encoded = data.content.replace(/\r?\n/g, '');
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error();
      const binary = atob(encoded);
      if (binary.length !== data.size || binary.length > maxBytes || btoa(binary) !== encoded) throw new Error();
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const prefix = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
      const object = new Uint8Array(prefix.byteLength + bytes.byteLength);
      object.set(prefix); object.set(bytes,prefix.byteLength);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-1',object));
      const blobHash = [...digest].map(value=>value.toString(16).padStart(2,'0')).join('');
      if (blobHash !== data.sha.toLowerCase()) throw new Error();
      const text = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
      if (text.includes('\0')) throw new Error();
      return {repository:repo, revision:pinned, path, blob_sha:data.sha.toLowerCase(), bytes:bytes.byteLength, text};
    } catch { throw new GitHubAppError('unavailable'); }
  }

  return {
    getIdentity, listInstallations, listRepositories, resolveCommit, checkRepositoriesAccess, checkRepositoryAccess,
    authorizeRepository, readContextFile,
    restrictRequestBudget(limit) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 16) throw new GitHubAppError('invalid_request',400);
      requestLimit = Math.min(requestLimit,limit);
      responseLimit = Math.min(responseLimit,2 * 1024 * 1024);
      return {requests:requestCount,limit:requestLimit,response_bytes:responseBytes,response_limit:responseLimit};
    },
    requestMetrics: () => ({requests:requestCount,limit:Number.isFinite(requestLimit)?requestLimit:null,response_bytes:responseBytes,response_limit:Number.isFinite(responseLimit)?responseLimit:null}),
    authorizationRequestCost: () => authorizationCost,
    async authorizeForAcquisition(options = {}) {
      const access = await authorizeRepository(options), ticket = Object.freeze({});
      acquisitionTickets.set(ticket, { access, epoch: authorizationEpoch, installationId: id(options.installationId), repositoryId: id(options.repositoryId), revision: options.revision?.toLowerCase() });
      return { access, ticket };
    },
    consumeAcquisitionAuthorization(ticket, options = {}) {
      const grant = acquisitionTickets.get(ticket);
      acquisitionTickets.delete(ticket);
      if (!grant || grant.epoch !== authorizationEpoch || grant.installationId !== id(options.installationId) || grant.repositoryId !== id(options.repositoryId) || grant.revision !== options.revision?.toLowerCase()) throw new GitHubAppError('forbidden', 403);
      return grant.access;
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
