import {createContextualReviewer, createOpenAIContextualProvider, ContextualReviewError} from './contextual-review.mjs';
import {createContextualReviewStore} from './contextual-review-store.mjs';

/** Runtime configuration never enables a provider merely because a key exists.
 * The isolated QA flag, explicit approvals and a bounded D1 policy must agree.
 */
export function contextualRuntime(env = {}) {
  const enabled = env.WORKBENCH_QA_ENABLED === 'true' && env.WORKBENCH_CONTEXTUAL_ENABLED === 'true'
    && typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.trim().length > 0;
  return {
    config: {enabled, approvedModel: env.OPENAI_APPROVED_MODEL || '', approvedProjectId: env.OPENAI_PROJECT_ID || '',
      approvedOrganizationId: env.OPENAI_ORGANIZATION_ID || '', dataPolicy: env.WORKBENCH_CONTEXTUAL_DATA_POLICY || ''},
    ...(enabled ? {provider: createOpenAIContextualProvider({apiKey: env.OPENAI_API_KEY})} : {}),
  };
}

function signature(run) {
  return JSON.stringify([run.id, run.repository_id, run.revision, run.source, run.verified_revision, run.status,
    run.findings?.map(f => [f.fingerprint, f.status, f.rule_id, f.kind, f.path, f.line])]);
}
const remotePhases = new Set(['before_acquire','before_send','before_delivery','cache_delivery','failure_check','delete']);

/** No context or credentials come from the browser. Fresh session observations
 * run against the original request cookie, so logout and A→B cannot authorize
 * an already-running request using a captured identity.
 */
export function createWorkbenchContextualReview({db, ownerId, user, getFreshUser, loadRun, getClient, config = {enabled:false}, provider, now = Date.now, uuid}) {
  const deny = () => { throw new ContextualReviewError('not_found',404); };
  const authorize = async ({run, phase}) => {
    const fresh = await getFreshUser();
    if (!fresh || fresh.provider !== 'github' || fresh.userId !== ownerId || fresh.githubId !== user.githubId
      || fresh.csrfToken !== user.csrfToken || fresh.csrfToken === undefined) deny();
    const current = await loadRun(run.id);
    if (signature(current.run) !== signature(run) || current.project.source !== 'github-app'
      || current.project.repository_id !== run.repository_id || !current.project.installation_id) deny();
    if (remotePhases.has(phase)) {
      const client = await getClient();
      // The bound includes earlier access checks and every context acquisition
      // request. It only narrows the client; normal scanner limits are intact.
      if (typeof client.restrictRequestBudget !== 'function') throw new ContextualReviewError('acquisition_unavailable');
      client.restrictRequestBudget(16);
      const access = await client.checkRepositoryAccess({installationId:current.project.installation_id,repositoryId:run.repository_id});
      if (access?.repository?.id !== run.repository_id) deny();
    }
  };
  const acquireContext = async ({run, limits}) => {
    const current = await loadRun(run.id), client = await getClient();
    if (typeof client.readContextFile !== 'function') throw new ContextualReviewError('acquisition_unavailable');
    client.restrictRequestBudget(16);
    // v1 intentionally acquires ONE regular workflow file, never an entire
    // repository or a secret-candidate file. Multiple locations may share it.
    const candidates = run.findings.filter(f => f.kind === 'broad-workflow-permissions'
      && f.rule_id === 'SWB-WORKFLOW-001/1' && /^\.github\/workflows\/[A-Za-z0-9._-]{1,80}\.ya?ml$/.test(f.path)
      && !run.findings.some(s => s.kind === 'possible-secret' && s.path === f.path));
    const path = candidates[0]?.path;
    if (!path) return [];
    const file = await client.readContextFile({installationId:current.project.installation_id,repositoryId:run.repository_id,revision:run.revision,path,maxBytes:32768});
    if (file.revision !== run.revision || file.repository?.id !== run.repository_id || file.path !== path
      || !/^[a-f0-9]{40}$/.test(file.blob_sha ?? '') || typeof file.text !== 'string') throw new ContextualReviewError('invalid_excerpt',409);
    const lines = file.text.split('\n'), snippets = [];
    for (const finding of candidates.filter(f => f.path === path).slice(0,limits.snippets)) {
      if (finding.line > lines.length) continue;
      const start = Math.max(0,finding.line-4), end = Math.min(lines.length,start+limits.lines_per_snippet);
      const content = lines.slice(start,end).join('\n');
      if (!content || new TextEncoder().encode(content).byteLength > limits.snippet_bytes) continue;
      snippets.push({repository_id:run.repository_id,revision:run.revision,path,blob_sha:file.blob_sha,start_line:start+1,end_line:end,content});
    }
    return snippets;
  };
  // Off is usable on the existing QA schema: no lookup of the new tables and
  // no provider factory/call is required by this module in that state.
  return createContextualReviewer({store:config.enabled === true ? createContextualReviewStore(db) : undefined,
    config, provider, authorize, acquireContext, now, uuid});
}
