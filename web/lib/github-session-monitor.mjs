/**
 * Read-only UI liveness for the Workbench's GitHub-authenticated session.
 * It does not describe github.com's global login or GitHub App permissions.
 * There is no persisted client credential or optimistic account switching.
 */
export const GITHUB_SESSION_FRESHNESS_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

function validSnapshot(value, now) {
  return Boolean(value && value.state === 'authenticated' && value.provider === 'github' && typeof value.displayName === 'string' && value.displayName.length > 0 && value.displayName.length <= 100 && /^[A-Za-z0-9_-]{43}$/.test(value.sessionKey || '') && Number.isSafeInteger(value.verifiedAt) && Number.isSafeInteger(value.expiresAt) && value.verifiedAt <= now + 5000 && value.verifiedAt > now - GITHUB_SESSION_FRESHNESS_MS && value.expiresAt > now && value.expiresAt > value.verifiedAt);
}

export function initialGitHubSessionState(snapshot, now = Date.now()) {
  if (validSnapshot(snapshot, now)) return { state: 'authenticated', session: snapshot };
  if (snapshot?.state === 'authenticated') return { state: snapshot.expiresAt <= now ? 'expired' : 'checking' };
  return { state: snapshot?.state === 'unavailable' ? 'unavailable' : 'anonymous' };
}

export function createGitHubSessionMonitor({ initialSession, fetcher = globalThis.fetch, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, onSessionLost = () => {} }) {
  const initial = initialGitHubSessionState(initialSession, now());
  let state = initial, started = false, visible = true, serial = 0, timer, inflight, controller, lost = false, onLost = onSessionLost;
  const listeners = new Set();
  const emit = next => { state = next; for (const listener of listeners) listener(); };
  const clear = () => { if (timer !== undefined) clearTimer(timer); timer = undefined; };
  const invalidate = () => {
    if (lost) return;
    lost = true;
    try { onLost(); } catch { /* UI cleanup cannot restore validity. */ }
  };
  const terminal = next => { clear(); emit({ state: next }); if (initialSession?.state === 'authenticated' || next === 'changed' || next === 'signing_out') invalidate(); };
  const schedule = () => {
    clear();
    if (!started || !visible || state.state !== 'authenticated') return;
    const due = Math.min(state.session.expiresAt, state.session.verifiedAt + GITHUB_SESSION_FRESHNESS_MS);
    timer = setTimer(() => {
      timer = undefined;
      if (state.state === 'authenticated' && state.session.expiresAt <= now()) terminal('expired');
      else void refresh();
    }, Math.max(1, due - now()));
  };
  async function refresh() {
    if (!started || !visible || lost) return;
    if (inflight) return inflight;
    const attempt = ++serial;
    controller = new AbortController();
    const requestController = controller;
    clear(); emit({ state: 'checking' });
    inflight = (async () => {
      let deadline;
      try {
        const abort = new Promise((_, reject) => { deadline = setTimer(() => { requestController.abort(); reject(new Error('session_unavailable')); }, REQUEST_TIMEOUT_MS); });
        const body = await Promise.race([(async () => {
          const response = await fetcher('/api/auth/github/session', { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' }, signal: requestController.signal });
          if (!response.ok) throw new Error('session_unavailable');
          return response.json();
        })(), abort]);
        if (!started || !visible || attempt !== serial) return;
        if (body?.session?.state === 'anonymous') { terminal('anonymous'); return; }
        if (!validSnapshot(body?.session, now())) { terminal(body?.session?.state === 'authenticated' && body.session.expiresAt <= now() ? 'expired' : 'unavailable'); return; }
        // Even a new session for the same account needs a document reload: its
        // CSRF token and any in-flight private data belong to the old session.
        if (initialSession?.state !== 'authenticated' || body.session.sessionKey !== initialSession.sessionKey) { terminal('changed'); return; }
        emit({ state: 'authenticated', session: body.session }); schedule();
      } catch {
        if (started && visible && attempt === serial) terminal('unavailable');
      } finally { if (deadline !== undefined) clearTimer(deadline); if (attempt === serial) { inflight = undefined; controller = undefined; } }
    })();
    return inflight;
  }
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => initial,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setOnSessionLost(callback) { onLost = callback; },
    start() { started = true; void refresh(); },
    refresh,
    setVisible(value) {
      visible = value; clear();
      if (!value) { ++serial; controller?.abort(); controller = undefined; inflight = undefined; if (!lost) emit({ state: 'checking' }); }
      else void refresh();
    },
    async logout(csrfToken) {
      ++serial; controller?.abort(); controller = undefined; inflight = undefined;
      terminal('signing_out');
      const logoutController = new AbortController();
      let deadline;
      try {
        const abort = new Promise((_, reject) => { deadline = setTimer(() => { logoutController.abort(); reject(new Error('logout_unavailable')); }, REQUEST_TIMEOUT_MS); });
        const response = await Promise.race([fetcher('/api/auth/github/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { 'X-Workbench-CSRF': csrfToken }, signal: logoutController.signal }), abort]);
        if (!response.ok && response.status !== 401) throw new Error('logout_unavailable');
        emit({ state: 'anonymous' }); return true;
      } catch { emit({ state: 'logout_error' }); return false; }
      finally { if (deadline !== undefined) clearTimer(deadline); }
    },
    stop() { started = false; ++serial; clear(); controller?.abort(); controller = undefined; inflight = undefined; },
  };
}
