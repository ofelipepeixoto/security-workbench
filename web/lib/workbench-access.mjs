import { isGitHubLoginConfigured, isWorkbenchUserAllowed } from './github-auth.mjs';

/**
 * Resolve the operator exclusively from the server's validated GitHub session.
 * getGitHubSession is supplied by the server adapter, never by request data.
 * Native platform identity headers and other account providers grant no access.
 */
export async function resolveWorkbenchIdentity({ config, request, getGitHubSession } = {}) {
  if (!isGitHubLoginConfigured(config) || typeof getGitHubSession !== 'function') return null;
  try {
    if (new URL(request.url).origin !== config.origin) return null;
    const session = await getGitHubSession(request);
    if (!isWorkbenchUserAllowed(config, session)) return null;
    if (typeof session.displayName !== 'string' || !session.displayName || session.displayName.length > 100) return null;
    if (typeof session.csrfToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(session.csrfToken)) return null;
    // Project only the UI identity fields. Provider tokens, opaque session
    // secrets, and platform credentials cannot escape through extra properties.
    const metadata = session.expiresAt !== undefined || session.sessionKey !== undefined;
    if (metadata && (!Number.isSafeInteger(session.expiresAt) || session.expiresAt <= 0 || typeof session.sessionKey !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(session.sessionKey))) return null;
    return { userId: session.userId, githubId: session.githubId, role: session.role, displayName: session.displayName, provider: 'github', csrfToken: session.csrfToken, ...(metadata ? { expiresAt: session.expiresAt, sessionKey: session.sessionKey } : {}) };
  } catch {
    // Storage/provider failures are anonymous; never select another identity.
    return null;
  }
}
