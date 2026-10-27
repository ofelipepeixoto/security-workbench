/** D1 durable outbox. Only an explicitly configured trusted consumer runs work. */
import { GitHubRateLimitError, GitHubAcquisitionTimeoutError } from './scanner.mjs';
import { GitHubAppError } from './github-app-client.mjs';
import { connectionPersistenceFence } from './github-app-auth.mjs';

export const ANALYSIS_ENGINE_VERSION = 'workbench-static/1.1';
export const ANALYSIS_JOB_LIMITS = Object.freeze({ attempts: 2, runningGlobal: 2, activePerOwner: 1, leaseMs: 60000, timeoutMs: 45000, resultBytes: 1024 * 1024 });
const CONFIG_KEY = 'static-v1/files20/bytes2097152/file262144/findings100/dependencies500';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/i;
const MESSAGES = Object.freeze({
  invalid_request: 'Informe projeto, commit e confirmação válidos.', not_found: 'Job não encontrado.',
  conflict: 'Esta solicitação já pertence a outra análise.', busy: 'Já existe um job ativo neste workspace.',
  storage_unavailable: 'O armazenamento não confirmou a operação. Confira o histórico antes de tentar novamente.',
  worker_unavailable: 'O consumidor de análises não está configurado neste ambiente.',
  access_revoked: 'O acesso ao repositório não foi confirmado.', invalid_result: 'O motor não produziu um resultado válido.',
  cancelled: 'O job foi cancelado.',
  qa_closed: 'A janela de QA não está ativa. Novas análises e reenvios estão bloqueados.',
  qa_scope: 'Esta conta ou fixture não está no escopo selecionado do QA.',
  qa_quota: 'O limite conjunto de 50 jobs neste dia de QA foi atingido.',
  qa_consumption: 'O limite de aquisição desta tentativa de QA foi atingido.',
  acquisition_timeout: 'A análise ultrapassou o prazo permitido.', acquisition_failed: 'A aquisição não foi concluída.',
  github_rate_limited: 'A cota GitHub foi atingida. Aguarde o horário de nova tentativa.',
});
export class AnalysisJobError extends Error {
  constructor(code = 'storage_unavailable', status = 503) {
    super(MESSAGES[code] ?? MESSAGES.storage_unavailable);
    this.code = Object.hasOwn(MESSAGES, code) ? code : 'storage_unavailable';
    this.status = status;
  }
}
const invalid = () => new AnalysisJobError('invalid_request', 400);
const id = value => { if (typeof value !== 'string' || !UUID.test(value)) throw invalid(); return value.toLowerCase(); };
const publicJob = row => ({ id: row.id, run_id: row.run_id, project_id: row.project_id, status: row.status,
  available_at: row.available_at, retry_at: row.retry_at, failure_code: row.failure_code, attempts: row.attempts,
  created_at: row.created_at, updated_at: row.updated_at });
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));

function projection(result, job) {
  if (!result || result.repository_id !== job.repository_id || result.revision !== job.revision ||
      result.source !== 'github-app' || result.verified_revision !== true || result.engine_version !== job.engine_version ||
      !/^[a-f0-9]{64}$/.test(result.snapshot_digest ?? '') || typeof result.partial !== 'boolean' ||
      !Array.isArray(result.findings) || result.findings.length > 100 || !Array.isArray(result.dependencies) || result.dependencies.length > 500 ||
      !Array.isArray(result.omissions) || result.omissions.length > 50) throw new AnalysisJobError('invalid_result', 502);
  for (const field of ['files_read', 'bytes_read']) if (!Number.isSafeInteger(result[field]) || result[field] < 0) throw new AnalysisJobError('invalid_result', 502);
  const stored = pick(result, ['revision', 'repository_id', 'snapshot_digest', 'files_read', 'bytes_read', 'partial',
    'files_acquired', 'bytes_acquired', 'binary_skipped', 'oversized_skipped', 'findings_total', 'dependencies_total',
    'source', 'verified_revision', 'engine_version']);
  stored.findings = result.findings.map(finding => ({ ...pick(finding, ['fingerprint', 'kind', 'path', 'line', 'confidence',
    'evidence', 'impact', 'recommendation', 'tool', 'rule_id', 'severity', 'severity_reason']), status: 'candidate' }));
  stored.dependencies = result.dependencies.map(dependency => pick(dependency, ['name', 'version', 'source']));
  stored.omissions = result.omissions;
  stored.limits = pick(result.limits ?? {}, ['files', 'bytes', 'fileBytes', 'responseBytes', 'deadlineMs', 'findings', 'dependencies']);
  stored.coverage = pick(result.coverage ?? {}, ['policy', 'exclusions_by_reason', 'files_excluded', 'dependency_analysis', 'advisory_coverage']);
  if (result.coverage?.acquisition_budget) stored.coverage.acquisition_budget = pick(result.coverage.acquisition_budget,['requests_limit','requests_reserved','omitted_files']);
  const json = JSON.stringify(stored);
  if (new TextEncoder().encode(json).length > ANALYSIS_JOB_LIMITS.resultBytes) throw new AnalysisJobError('invalid_result', 502);
  return json;
}

export function createAnalysisJobs({ db, ownerId, githubId, now = () => new Date(), uuid = () => crypto.randomUUID(),
  authorize, analyze, qaGuard, observe, persistenceProof, random = Math.random, leaseMs = ANALYSIS_JOB_LIMITS.leaseMs, timeoutMs = ANALYSIS_JOB_LIMITS.timeoutMs } = {}) {
  if (!db?.prepare || !db?.batch) throw new AnalysisJobError();
  if (persistenceProof !== undefined && typeof persistenceProof !== 'function') throw invalid();
  if (typeof ownerId !== 'string' || !ownerId || ownerId.length > 200) throw invalid();
  if (!Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 90000 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 45000 || leaseMs <= timeoutMs) throw invalid();
  const current = () => { const value = new Date(now()).valueOf(); if (!Number.isFinite(value)) throw new AnalysisJobError(); return value; };
  const emit = event => { try { observe?.(event); } catch { /* optional sanitized diagnostics */ } };
  const first = async (sql, ...values) => { try { return await db.prepare(sql).bind(...values).first(); } catch { throw new AnalysisJobError(); } };
  const batch = async statements => {
    try { const results = await db.batch(statements); if (!Array.isArray(results) || results.some(result => result.success !== true)) throw Error(); return results; }
    catch { throw new AnalysisJobError(); }
  };
  const stmt = (sql, ...values) => db.prepare(sql).bind(...values);
  const row = async jobId => { const found = await first('SELECT * FROM workbench_analysis_jobs WHERE owner_id = ? AND id = ?', ownerId, id(jobId)); if (!found) throw new AnalysisJobError('not_found', 404); return found; };
  const get = async jobId => ({ job: publicJob(await row(jobId)) });
  const sameRequest = (previous, project, revision) => {
    if (previous.project_id !== project.id || previous.repository_id !== project.repository_id || previous.installation_id !== project.installation_id ||
        previous.revision !== revision || previous.engine_version !== ANALYSIS_ENGINE_VERSION || previous.config_key !== CONFIG_KEY || previous.github_id !== String(githubId)) throw new AnalysisJobError('conflict', 409);
    return { job: publicJob(previous) };
  };
  async function enqueue({ project, revision, requestId, confirmed } = {}) {
    if (confirmed !== true || typeof revision !== 'string' || !SHA.test(revision) || !/^[1-9][0-9]{0,23}$/.test(String(githubId ?? ''))) throw invalid();
    const projectId = id(project?.id), request = id(requestId), commit = revision.toLowerCase();
    const scope = await first('SELECT * FROM workbench_projects WHERE owner_id = ? AND id = ?', ownerId, projectId);
    if (!scope || scope.source !== 'github-app' || scope.revoked_at || !Number.isSafeInteger(scope.installation_id) || scope.installation_id < 1) throw new AnalysisJobError('not_found', 404);
    const previous = await first('SELECT * FROM workbench_analysis_jobs WHERE owner_id = ? AND request_id = ?', ownerId, request);
    if (previous) return sameRequest(previous, scope, commit);
    const created = new Date(current()).toISOString(), jobId = id(uuid()), runId = id(uuid());
    const reservation = qaGuard ? await qaGuard.reservation({jobId,ownerId,githubId,project:scope,revision:commit}) : null;
    try {
      await batch([
        ...(reservation ? [reservation] : []),
        stmt("INSERT INTO workbench_runs (id,owner_id,project_id,repo,repository_id,request_id,requested_revision,revision,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'running',?,?)", runId, ownerId, scope.id, scope.repo, scope.repository_id, request, commit, commit, created, created),
        stmt("INSERT INTO workbench_analysis_jobs (id,owner_id,github_id,project_id,run_id,repository_id,installation_id,repo,revision,request_id,engine_version,config_key,status,available_at,attempts,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'queued',?,0,?,?)", jobId, ownerId, String(githubId), scope.id, runId, scope.repository_id, scope.installation_id, scope.repo, commit, request, ANALYSIS_ENGINE_VERSION, CONFIG_KEY, created, created, created),
      ]);
    } catch (error) {
      const repeated = await first('SELECT * FROM workbench_analysis_jobs WHERE owner_id = ? AND request_id = ?', ownerId, request);
      if (repeated) return sameRequest(repeated, scope, commit);
      if (await first("SELECT id FROM workbench_analysis_jobs WHERE owner_id = ? AND status IN ('queued','running')", ownerId)) throw new AnalysisJobError('busy', 409);
      if (qaGuard) await qaGuard.capacity({ownerId,githubId,repositoryId:scope.repository_id,installationId:scope.installation_id,repo:scope.repo});
      throw error;
    }
    return get(jobId);
  }
  async function cancel(jobId) {
    const previous = await row(jobId), updated = new Date(current()).toISOString();
    await batch([
      // Keep a running cancellation's lease reserved until expiry: an old
      // consumer may still be unwinding, but its token can never commit data.
      stmt("UPDATE workbench_analysis_jobs SET status='cancelled',failure_code='cancelled',lease_token=NULL,retry_at=NULL,updated_at=? WHERE owner_id=? AND id=? AND status IN ('queued','running')", updated, ownerId, previous.id),
      stmt("UPDATE workbench_runs SET status='failed',failure_code='cancelled',updated_at=? WHERE owner_id=? AND id=? AND status='running' AND EXISTS (SELECT 1 FROM workbench_analysis_jobs j WHERE j.owner_id=? AND j.id=? AND j.status='cancelled')", updated, ownerId, previous.run_id, ownerId, previous.id),
    ]);
    return get(previous.id);
  }
  async function finish(job, status, failureCode, json = null, retryAt = null) {
    const updated = new Date(current()).toISOString();
    const at = current();
    // Advance the application's claim clock by elapsed DATABASE time as well.
    // Neither a stale pre-batch timestamp nor a frozen application clock can
    // extend the deadline, lease or QA window during a delayed result mutation.
    const leaseAt = 'CAST(round((julianday(j.lease_expires_at)-2440587.5)*86400000) AS INTEGER)';
    const elapsed = "max(0,CAST(round((julianday('now')-julianday(j.updated_at))*86400000) AS INTEGER))";
    const effectiveAt = `max(${at},${leaseAt}-${leaseMs}+${elapsed})`;
    const qaFence = qaGuard && status === 'complete' ? ` AND EXISTS (SELECT 1 FROM workbench_qa_active_window w JOIN workbench_qa_reservations r ON r.job_id=j.id WHERE w.id=1 AND w.closed_at IS NULL AND r.owner_id=j.owner_id AND r.github_id=j.github_id AND r.repository_id=j.repository_id AND r.installation_id=j.installation_id AND r.repo=j.repo AND r.revision=j.revision AND r.created_at>=w.starts_at AND r.created_at<w.ends_at AND w.starts_at<=${effectiveAt} AND w.ends_at>${effectiveAt})` : '';
    const scopeFence = status === 'complete' ? " AND EXISTS (SELECT 1 FROM workbench_projects p WHERE p.owner_id=j.owner_id AND p.id=j.project_id AND p.repo=j.repo AND p.repository_id=j.repository_id AND p.installation_id=j.installation_id AND p.source='github-app' AND p.revoked_at IS NULL)" : '';
    // The real App consumer supplies an opaque proof bound to this exact lease.
    // Generic local job tests may inject a trusted authorization adapter instead.
    // Encrypted credential-generation bindings stay private to this SQL call.
    const connection = status === 'complete' && persistenceProof !== undefined ? connectionPersistenceFence(persistenceProof(),job) : null;
    const connectionFence = connection ? ` AND ${connection.sql} AND ${effectiveAt}<${connection.expiresAtMs}` : '';
    const generationValues = connection?.values ?? [];
    // The result mutation itself checks elapsed database time. A delayed batch
    // must not turn an already expired acquisition into a persisted result.
    // updated_at is the database-clock claim stamp while this lease is running.
    const deadlineFence = status === 'complete' ? ` AND ${effectiveAt}<${leaseAt}-${leaseMs}+${timeoutMs} AND ${effectiveAt}<${leaseAt}` : '';
    const fence = "EXISTS (SELECT 1 FROM workbench_analysis_jobs j WHERE j.owner_id=? AND j.id=? AND j.status='running' AND j.lease_token=? AND j.lease_expires_at>?" + deadlineFence + qaFence + scopeFence + connectionFence + ')';
    const statements = retryAt ? [] : [stmt(`UPDATE workbench_runs SET status=?,failure_code=?,result_json=?,updated_at=? WHERE owner_id=? AND id=? AND status='running' AND ${fence}`, status === 'complete' ? 'complete' : 'failed', failureCode, json, updated, ownerId, job.run_id, ownerId, job.id, job.lease_token, updated,...generationValues)];
    // D1 batch statements are sequential in one SQL transaction. changes()
    // refers to the immediately preceding result UPDATE (excluding triggers),
    // so job completion cannot outpace a denied result or split the two states
    // when the deadline passes between the statements. Keep them adjacent.
    statements.push(stmt("UPDATE workbench_analysis_jobs SET status=?,failure_code=?,available_at=COALESCE(?,available_at),retry_at=?,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE owner_id=? AND id=? AND status='running' AND lease_token=? AND lease_expires_at>?" + (status === 'complete' ? ' AND changes()=1' : ''), status, failureCode, retryAt, retryAt, updated, ownerId, job.id, job.lease_token, updated));
    const results = await batch(statements);
    if (status === 'complete' && results[0].meta?.changes !== 1) {
      const active = await first(`SELECT j.*,CASE WHEN ${effectiveAt}<${leaseAt}-${leaseMs}+${timeoutMs} THEN 0 ELSE 1 END AS deadline_expired,CASE WHEN 1=1${qaFence} THEN 0 ELSE 1 END AS qa_expired,CASE WHEN 1=1${scopeFence}${connectionFence} THEN 0 ELSE 1 END AS access_revoked FROM workbench_analysis_jobs j WHERE j.owner_id=? AND j.id=?`,...generationValues,ownerId,job.id);
      if (active?.status === 'running' && active.lease_token === job.lease_token) {
        if (active.qa_expired === 1) throw new AnalysisJobError('qa_closed',403);
        if (active.deadline_expired === 1) throw new AnalysisJobError('acquisition_timeout',504);
        if (active.access_revoked === 1) throw new AnalysisJobError('access_revoked',403);
      }
    }
    const result = await get(job.id);
    emit({type:'finish',phase:'finished',status:result.job.status,code:result.job.failure_code});
    return result;
  }
  async function process(jobId) {
    if (typeof authorize !== 'function' || typeof analyze !== 'function') throw new AnalysisJobError('worker_unavailable', 503);
    const previous = await row(jobId);
    if (!['queued', 'running'].includes(previous.status)) return get(previous.id);
    if (previous.github_id !== String(githubId)) throw new AnalysisJobError('not_found', 404);
    if (qaGuard) await qaGuard.checkJob(previous);
    const startedMs = current(), started = new Date(startedMs).toISOString();
    if (previous.status === 'running' && previous.lease_expires_at <= started && previous.attempts >= 2) {
      await batch([
        stmt("UPDATE workbench_runs SET status='failed',failure_code='attempts_exhausted',updated_at=? WHERE owner_id=? AND id=? AND status='running' AND EXISTS (SELECT 1 FROM workbench_analysis_jobs WHERE owner_id=? AND id=? AND status='running' AND lease_expires_at<=? AND attempts>=2)", started, ownerId, previous.run_id, ownerId, previous.id, started),
        stmt("UPDATE workbench_analysis_jobs SET status='failed',failure_code='attempts_exhausted',lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE owner_id=? AND id=? AND status='running' AND lease_expires_at<=? AND attempts>=2", started, ownerId, previous.id, started),
      ]);
      return get(previous.id);
    }
    const lease = id(uuid()), expires = new Date(startedMs + leaseMs).toISOString();
    const claimed = await batch([stmt(`UPDATE workbench_analysis_jobs SET status='running',lease_token=?,lease_expires_at=?,attempts=attempts+1,retry_at=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE owner_id=? AND id=? AND attempts<2 AND ((status='queued' AND available_at<=?) OR (status='running' AND lease_expires_at<=?))
      AND (SELECT COUNT(*) FROM workbench_analysis_jobs WHERE status IN ('running','cancelled') AND lease_expires_at>?)<2
      AND NOT EXISTS (SELECT 1 FROM workbench_analysis_jobs WHERE owner_id=? AND id<>? AND status IN ('running','cancelled') AND lease_expires_at>?)`, lease, expires, ownerId, previous.id, started, started, started, ownerId, previous.id, started)]);
    if (claimed[0].meta?.changes !== 1) return get(previous.id);
    const job = await row(previous.id), controller = new AbortController();
    if (job.status !== 'running' || job.lease_token !== lease) return get(previous.id);
    // Only the holder of the persisted claim may report an admitted attempt.
    // Duplicate deliveries and early retries must not look like new analyses.
    emit({type:'attempt',attempt:job.attempts});
    let timer;
    const live = () => {
      if (controller.signal.aborted) throw controller.signal.reason instanceof GitHubAppError ? controller.signal.reason : new AnalysisJobError('acquisition_timeout',504);
    };
    const assertActive = async () => {
      live();
      // One query per gate, including QA shutdown. Do not double the D1 query
      // budget for each GitHub page merely to check the same singleton window.
      const active = qaGuard
        ? await first('SELECT j.*,w.starts_at AS qa_starts_at,w.ends_at AS qa_ends_at,w.closed_at AS qa_closed_at,w.mode AS qa_mode FROM workbench_analysis_jobs j LEFT JOIN workbench_qa_active_window w ON w.id=1 WHERE j.owner_id=? AND j.id=?',ownerId,job.id)
        : await row(job.id);
      live();
      if (!active || active.status !== 'running' || active.lease_token !== lease || Date.parse(active.lease_expires_at) <= current()) {
        controller.abort(new GitHubAppError('cancelled',409));
        throw controller.signal.reason;
      }
      const at = current();
      if (qaGuard && (active.qa_closed_at !== null || !Number.isSafeInteger(active.qa_starts_at) || !Number.isSafeInteger(active.qa_ends_at) || active.qa_ends_at-active.qa_starts_at !== (active.qa_mode==='canary'?900000:604800000) || at < active.qa_starts_at || at >= active.qa_ends_at)) {
        controller.abort(new GitHubAppError('qa_closed',403));
        throw controller.signal.reason;
      }
    };
    const verify = async () => {
      await assertActive();
      if (qaGuard) await qaGuard.checkJob(job);
      const scope = await first('SELECT * FROM workbench_projects WHERE owner_id=? AND id=?', ownerId, job.project_id);
      live();
      if (!scope || scope.revoked_at || scope.repo !== job.repo || scope.repository_id !== job.repository_id || scope.installation_id !== job.installation_id) throw new AnalysisJobError('access_revoked', 403);
      const allowed = await authorize(job, { signal: controller.signal, assertActive });
      live();
      if (allowed !== true) throw new AnalysisJobError('access_revoked', 403);
      await assertActive();
    };
    try {
      const result = await Promise.race([
        (async () => {
          await verify();
          const value = await analyze(job, { signal: controller.signal, assertActive });
          await verify();
          return projection(value, job);
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new AnalysisJobError('acquisition_timeout', 504)); }, timeoutMs); }),
      ]);
      live();
      return await finish(job, 'complete', null, result);
    } catch (error) {
      if (error instanceof AnalysisJobError && error.code === 'storage_unavailable') throw error;
      if (error instanceof GitHubAppError || error instanceof AnalysisJobError) emit({type:'error',code:error.code,status:error.status});
      const code = error instanceof GitHubAppError && ['qa_consumption','qa_closed','cancelled'].includes(error.code) ? error.code :
        error instanceof GitHubRateLimitError || (error instanceof GitHubAppError && error.code === 'rate_limited') ? 'github_rate_limited' :
        error instanceof GitHubAcquisitionTimeoutError || (error instanceof GitHubAppError && error.code === 'timeout') ? 'acquisition_timeout' :
        error instanceof GitHubAppError && ['forbidden', 'disconnected', 'suspended', 'insufficient_permission'].includes(error.code) ? 'access_revoked' :
        error instanceof AnalysisJobError ? error.code : 'acquisition_failed';
      const transient = ['github_rate_limited', 'acquisition_timeout', 'acquisition_failed'].includes(code);
      const at = current(), suggested = error instanceof GitHubAppError ? Date.parse(error.retryAt) : NaN;
      const backoff = at + 60000 + Math.floor(Math.max(0, Math.min(1, random())) * 1000);
      // Never retry before a valid provider Retry-After/reset, even beyond a
      // queue transport's delay limit; the durable row waits for recovery.
      const retryAt = transient && job.attempts < 2 ? new Date(Math.max(backoff, Number.isFinite(suggested) ? suggested : 0)).toISOString() : null;
      emit({type:retryAt?'retry':'failure',code,status:retryAt?'queued':'failed'});
      return finish(job, retryAt ? 'queued' : 'failed', code, null, retryAt);
    } finally { clearTimeout(timer); }
  }
  return { enqueue, get, cancel, process };
}

/** Trusted scheduler input, never a public cross-workspace listing. */
export async function recoverAnalysisJobs({ db, now = () => new Date(), limit = 20 } = {}) {
  if (!db?.prepare || !Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid();
  const current = new Date(now()).toISOString();
  try {
    const rows = (await db.prepare("SELECT id,owner_id,github_id FROM workbench_analysis_jobs WHERE (status='queued' AND available_at<=?) OR (status='running' AND lease_expires_at<=?) ORDER BY available_at,id LIMIT ?").bind(current, current, limit).all()).results;
    return rows.map(row => ({ id: row.id, ownerId: row.owner_id, githubId: row.github_id }));
  } catch { throw new AnalysisJobError(); }
}
