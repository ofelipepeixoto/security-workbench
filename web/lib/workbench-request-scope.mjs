/** UI effects belong to the session/access generation that initiated them.
 * Abort is best effort; the synchronous epoch is the authority for applying a
 * response, even when a transport or body reader ignores its AbortSignal.
 */
export function createWorkbenchRequestScope({ expiresAt = Infinity, now = Date.now } = {}) {
  let epoch = 0, closed = false;
  const pending = new Set();
  const allowed = () => !closed && now() < expiresAt;
  function invalidate() { ++epoch; for (const controller of pending) controller.abort(); pending.clear(); }
  return {
    open() { invalidate(); closed = false; },
    invalidate,
    close() { closed = true; invalidate(); },
    isOpen: allowed,
    capture() { const version = epoch; return () => allowed() && epoch === version; },
    begin(externalSignal) {
      const current = this.capture(), controller = new AbortController();
      const abort = () => controller.abort();
      if (!current() || externalSignal?.aborted) controller.abort();
      else { pending.add(controller); externalSignal?.addEventListener('abort', abort, { once: true }); }
      const isCurrent = () => current() && !controller.signal.aborted;
      const finish = () => { controller.abort(); pending.delete(controller); externalSignal?.removeEventListener('abort', abort); };
      return { signal: controller.signal, isCurrent, assertCurrent() { if (!isCurrent()) throw new DOMException('Contexto de acesso alterado.', 'AbortError'); }, finish };
    },
  };
}

/** @typedef {ReturnType<ReturnType<typeof createWorkbenchRequestScope>['begin']>} WorkbenchRequest */
/** @template T
 * @param {WorkbenchRequest} request
 * @param {(request:WorkbenchRequest)=>Promise<T>|T} load
 * @param {{success:(value:T)=>void,failure:(cause:unknown)=>void,settled?:()=>void}} effects
 */
export async function applyWorkbenchRequest(request, load, effects) {
  try {
    request.assertCurrent();
    const value = await load(request);
    request.assertCurrent();
    effects.success(value);
  } catch (cause) { if (request.isCurrent()) effects.failure(cause); }
  finally { const current = request.isCurrent(); request.finish(); if (current) effects.settled?.(); }
}

/** The same export path is used by the detail page and tested with a deferred
 * HTTP 200. No download, notice or navigation can apply after invalidation.
 * @param {WorkbenchRequest} request
 * @param {(request:WorkbenchRequest)=>Promise<{filename:string,markdown:string}>|{filename:string,markdown:string}} load
 * @param {{download:(markdown:string,filename:string)=>void,notice:()=>void,failure:(cause:unknown)=>void,settled:()=>void}} effects
 */
export function exportWorkbenchReport(request, load, effects) {
  return applyWorkbenchRequest(request, load, {
    success(result) { effects.download(result.markdown, result.filename); if (request.isCurrent()) effects.notice(); },
    failure: effects.failure, settled: effects.settled,
  });
}

export function workbenchFailureScope(cause) {
  if (cause?.status === 429 || cause?.code === 'rate_limited') return 'other';
  if ([401, 403, 404].includes(cause?.status) && ['disconnected', 'not_connected', 'expired', 'revoked', 'access_revoked', 'forbidden', 'suspended', 'insufficient_permission', 'not_found'].includes(cause?.code)) return 'repository_access';
  return [401, 403].includes(cause?.status) ? 'login_session' : 'other';
}

/** Shared by the real login-loss/revocation handler and regression tests. */
export function invalidateWorkbenchAccess(requests, cause, catalogRecovery) {
  const scope = workbenchFailureScope(cause);
  if (scope === 'repository_access') requests.invalidate();
  if (scope === 'login_session') requests.close();
  if (scope !== 'other') catalogRecovery?.block();
  return scope;
}

/** A denied deep link or persistent App revocation must stop automatic catalog
 * reads. Only an explicit user recovery action opens another bounded attempt. */
export function createWorkbenchCatalogRecovery() {
  let blocked = false;
  return {
    block() { blocked = true; },
    resume() { blocked = false; },
    isBlocked: () => blocked,
    assertAllowed() { if (blocked) throw new DOMException('Revalide o acesso ao catálogo.', 'AbortError'); },
  };
}

/** @template T
 * @param {WorkbenchRequest} request
 * @param {ReturnType<typeof createWorkbenchCatalogRecovery>} recovery
 * @param {(request:WorkbenchRequest)=>Promise<T>} load
 * @param {(cause:unknown)=>void} onFailure
 * @param {(value:T)=>void} [onSuccess]
 */
export async function callWorkbenchCatalog(request, recovery, load, onFailure, onSuccess) {
  try {
    request.assertCurrent(); recovery.assertAllowed();
    const value = await load(request);
    request.assertCurrent(); recovery.assertAllowed();
    onSuccess?.(value);
    return value;
  } catch (cause) { request.assertCurrent(); onFailure(cause); throw cause; }
  finally { request.finish(); }
}

/** Actual browser export adapter, kept separate so local regression tests can
 * prove that stale responses never create a Blob or click a download anchor. */
export function downloadWorkbenchMarkdown(content, filename, { document = globalThis.document, url = URL, setTimer = setTimeout } = {}) {
  const objectUrl = url.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimer(() => url.revokeObjectURL(objectUrl), 1000);
}
