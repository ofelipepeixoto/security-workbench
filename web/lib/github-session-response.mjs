/**
 * @typedef {{state:'authenticated',provider:'github',displayName:string,expiresAt:number,verifiedAt:number,sessionKey:string}|{state:'anonymous'|'unavailable'}} GitHubSessionSnapshot
 */
/** Public, read-only projection of the existing server-validated login.
 * @returns {GitHubSessionSnapshot}
 */
export function publicGitHubSession(user, verifiedAt = Date.now(), unavailable = false) {
  if (unavailable) return { state: 'unavailable' };
  if (!user || user.provider !== 'github' || typeof user.displayName !== 'string' || !user.displayName || user.displayName.length > 100 || !Number.isSafeInteger(user.expiresAt) || user.expiresAt <= verifiedAt || !/^[A-Za-z0-9_-]{43}$/.test(user.sessionKey || '')) return { state: 'anonymous' };
  return { state: 'authenticated', provider: 'github', displayName: user.displayName, expiresAt: user.expiresAt, verifiedAt, sessionKey: user.sessionKey };
}

export async function handleGitHubSessionRequest(request, getAccess) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' };
  if (request.method !== 'GET') return new Response(JSON.stringify({ error: 'Método não permitido.' }), { status: 405, headers: { ...headers, Allow: 'GET' } });
  try {
    const access = await getAccess(request);
    const snapshot = access.session;
    if (!snapshot || !['authenticated', 'anonymous', 'unavailable'].includes(snapshot.state)) throw new Error('session_unavailable');
    // Whitelist again at the HTTP boundary; extra internal access fields cannot
    // become a response even if a server adapter later adds them.
    const session = snapshot.state === 'authenticated' ? publicGitHubSession(snapshot, snapshot.verifiedAt) : { state: snapshot.state };
    return new Response(JSON.stringify({ session }), { status: session.state === 'unavailable' ? 503 : 200, headers });
  } catch {
    return new Response(JSON.stringify({ session: { state: 'unavailable' } }), { status: 503, headers });
  }
}
