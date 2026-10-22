import * as defaultScanner from './scanner.mjs';
import { parseReaEvidence } from './rea-import.mjs';

const MAX_BODY_BYTES = 8192;
const MAX_REA_BODY_BYTES = 2 * 1024 * 1024 + MAX_BODY_BYTES;
const BODY_TIMEOUT_MS = 10000;
const STALE_MS = 120000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/i;
const DECISIONS = new Set(['candidate', 'confirmed', 'false_positive', 'accepted_risk']);
const FINDING_RUN_LIMIT = 20;
const FINDING_ROW_LIMIT = 500;

export class WorkbenchError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function identifier(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new WorkbenchError('Identificador inválido.');
  return value.toLowerCase();
}

function response(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function parseBody(request, maxBytes = MAX_BODY_BYTES) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) throw new WorkbenchError('Origem da solicitação não permitida.', 403);
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new WorkbenchError('Envie os dados em JSON.', 415);
  const contentLength = request.headers.get('Content-Length');
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes)) throw new WorkbenchError('Solicitação maior que o limite permitido.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new WorkbenchError('Solicitação vazia.');
  let length = 0;
  const chunks = [];
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new WorkbenchError('Tempo de envio excedido. Tente novamente.', 408)), BODY_TIMEOUT_MS);
  });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new WorkbenchError('Solicitação maior que o limite permitido.', 413);
      chunks.push(value);
    }
  } catch (error) {
    // Cancellation is cleanup, not part of the response deadline. An untrusted
    // stream can leave its cancel promise pending forever or reject it.
    try { reader.cancel().catch(() => {}); } catch { /* best effort */ }
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let payload;
  try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new WorkbenchError('JSON inválido.'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new WorkbenchError('Solicitação inválida.');
  return payload;
}

function publicProject(row) {
  return { id: row.id, repo: row.repo, repository_id: row.repository_id, authorized_at: row.authorized_at,
    ...(row.has_runs === undefined ? {} : { has_runs: Boolean(row.has_runs) }) };
}

function validateMetadata(metadata, repo, expectedId) {
  if (metadata?.repo !== repo || metadata.private !== false || !Number.isSafeInteger(metadata.repository_id) || metadata.repository_id < 1 || (expectedId !== undefined && metadata.repository_id !== expectedId)) {
    throw new WorkbenchError('Não foi possível confirmar a identidade e o acesso público do repositório.', 409);
  }
  return metadata;
}

export function createWorkbenchService({ db, ownerId, scanner = defaultScanner, now = () => new Date(), uuid = () => crypto.randomUUID() }) {
  if (typeof ownerId !== 'string' || !ownerId) throw new WorkbenchError('Entre para acessar o Workbench.', 401);
  if (!db?.prepare) throw new WorkbenchError('O armazenamento está indisponível. Tente novamente mais tarde.', 503);
  const stamp = () => now().toISOString();
  const first = (query, ...args) => db.prepare(query).bind(...args).first();
  const all = async (query, ...args) => (await db.prepare(query).bind(...args).all()).results;
  const write = async (query, ...args) => {
    let saved;
    try { saved = await db.prepare(query).bind(...args).run(); }
    catch { throw new WorkbenchError('O armazenamento não confirmou a operação. Confira o histórico antes de tentar novamente.', 503); }
    if (saved?.success !== true) throw new WorkbenchError('O armazenamento não confirmou a operação. Confira o histórico antes de tentar novamente.', 503);
    return saved;
  };
  const project = async (id) => {
    const row = await first('SELECT * FROM workbench_projects WHERE owner_id = ? AND id = ?', ownerId, identifier(id));
    if (!row) throw new WorkbenchError('Projeto não encontrado.', 404);
    return row;
  };
  const runRow = async (id) => {
    const row = await first('SELECT * FROM workbench_runs WHERE owner_id = ? AND id = ?', ownerId, identifier(id));
    if (!row) throw new WorkbenchError('Análise não encontrada.', 404);
    return row;
  };
  const fullRun = async (row) => {
    const result = row.result_json ? JSON.parse(row.result_json) : null;
    const decisions = await all('SELECT fingerprint, decision FROM workbench_reviews WHERE owner_id = ? AND run_id = ?', ownerId, row.id);
    const byFingerprint = new Map(decisions.map(item => [item.fingerprint, item.decision]));
    return {
      ...(result ?? {}),
      id: row.id, project_id: row.project_id, repo: row.repo, repository_id: row.repository_id,
      status: row.status, revision: row.revision, created_at: row.created_at,
      digest: result?.snapshot_digest ?? null, snapshot_digest: result?.snapshot_digest ?? null,
      files_read: result?.files_read ?? null, bytes_read: result?.bytes_read ?? null,
      partial: result?.partial ?? null, omissions: result?.omissions ?? [],
      findings: (result?.findings ?? []).map(finding => {
        const decision = byFingerprint.get(finding.fingerprint) ?? 'candidate';
        return { ...finding, status: decision, decision };
      }),
      dependencies: result?.dependencies ?? [], failure_code: row.failure_code,
    };
  };
  const expire = async (projectId) => {
    const current = now();
    await write("UPDATE workbench_runs SET status = 'failed', failure_code = 'interrupted', updated_at = ? WHERE owner_id = ? AND project_id = ? AND status = 'running' AND updated_at <= ?", current.toISOString(), ownerId, projectId, new Date(current.valueOf() - STALE_MS).toISOString());
  };
  return {
    async list() {
      const projects = await all('SELECT p.*, EXISTS(SELECT 1 FROM workbench_runs r WHERE r.owner_id = p.owner_id AND r.project_id = p.id) AS has_runs FROM workbench_projects p WHERE p.owner_id = ? ORDER BY p.authorized_at DESC LIMIT 100', ownerId);
      const rows = await all('SELECT * FROM workbench_runs WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100', ownerId);
      return { projects: projects.map(publicProject), runs: rows.map(row => {
        const result = row.result_json ? JSON.parse(row.result_json) : null;
        return { id: row.id, project_id: row.project_id, repo: row.repo, status: row.status, revision: row.revision, files_read: result?.files_read ?? null, findings_count: result?.findings?.length ?? null, created_at: row.created_at, partial: result?.partial ?? null, failure_code: row.failure_code, source: result?.source ?? 'github-public' };
      }) };
    },
    async act(payload) {
      switch (payload.action) {
        case 'import-rea': {
          const scope = await project(payload.projectId);
          const requestId = identifier(payload.requestId);
          if (typeof payload.revision !== 'string' || !SHA.test(payload.revision)) throw new WorkbenchError('Informe o SHA completo do commit declarado.');
          if (typeof payload.evidence !== 'string') throw new WorkbenchError('Envie o arquivo JSON Evidence do REA.');
          let imported;
          try { imported = await parseReaEvidence(new TextEncoder().encode(payload.evidence)); }
          catch { throw new WorkbenchError('Evidence REA inválido ou fora dos limites de importação.'); }
          const revision = payload.revision.toLowerCase();
          const reuse = async previous => {
            const saved = previous.result_json ? JSON.parse(previous.result_json) : null;
            if (previous.project_id !== scope.id || previous.requested_revision !== revision || saved?.source !== 'rea-import' || saved?.provenance?.report_sha256 !== imported.provenance.report_sha256) {
              throw new WorkbenchError('Esta solicitação já foi usada para outro resultado.', 409);
            }
            return { run: await fullRun(previous) };
          };
          const previous = await first('SELECT * FROM workbench_runs WHERE owner_id = ? AND request_id = ?', ownerId, requestId);
          if (previous) return reuse(previous);
          const id = uuid(), created = stamp();
          // Only the validated projection is persisted; never the uploaded report.
          const stored = { ...imported, revision, repository_id: scope.repository_id,
            source: 'rea-import', verified_revision: false };
          try {
            await write("INSERT INTO workbench_runs (id, owner_id, project_id, repo, repository_id, request_id, requested_revision, revision, status, result_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'complete', ?, ?, ?)",
              id, ownerId, scope.id, scope.repo, scope.repository_id, requestId, revision, revision, JSON.stringify(stored), created, created);
          } catch (error) {
            // A concurrent retry may have committed first. Recheck the full
            // import identity before returning that run; unrelated writes and
            // conflicting content must never be reported as this import.
            let repeated;
            try { repeated = await first('SELECT * FROM workbench_runs WHERE owner_id = ? AND request_id = ?', ownerId, requestId); }
            catch { throw new WorkbenchError('Não foi possível confirmar a importação. Confira o histórico antes de tentar novamente.', 503); }
            if (repeated) return reuse(repeated);
            if (error instanceof WorkbenchError) throw error;
            throw new WorkbenchError('Não foi possível persistir a importação. Confira o histórico antes de tentar novamente.', 503);
          }
          return { run: await fullRun(await runRow(id)) };
        }
        case 'findings': {
          // A bounded historical view, not a count of unique vulnerabilities.
          // Every query remains scoped to the server-resolved owner.
          const rows = await all("SELECT * FROM workbench_runs WHERE owner_id = ? AND status = 'complete' ORDER BY created_at DESC, id DESC LIMIT ?", ownerId, FINDING_RUN_LIMIT + 1);
          const selected = rows.slice(0, FINDING_RUN_LIMIT);
          const findings = [];
          let total = 0;
          for (const row of selected) {
            const run = await fullRun(row);
            total += run.findings.length;
            for (const finding of run.findings) {
              if (findings.length >= FINDING_ROW_LIMIT) break;
              findings.push({ ...finding, run_id: row.id, project_id: row.project_id, repo: row.repo,
                revision: row.revision, created_at: row.created_at, source: run.source ?? 'github-public' });
            }
          }
          return { findings, runs_considered: selected.length,
            truncated: rows.length > FINDING_RUN_LIMIT || total > FINDING_ROW_LIMIT,
            limits: { runs: FINDING_RUN_LIMIT, findings: FINDING_ROW_LIMIT } };
        }
        case 'inspect': {
          let repo;
          try { repo = scanner.normalizeRepo(payload.repo); }
          catch { throw new WorkbenchError('Informe um repositório público da conta ofelipepeixoto.'); }
          let metadata;
          try { metadata = validateMetadata(await scanner.repositoryMetadata(repo), repo); }
          catch (error) {
            if (error?.name === 'GitHubRateLimitError') throw new WorkbenchError('A cota pública do GitHub foi atingida. Tente novamente mais tarde.', 429);
            throw new WorkbenchError('Não foi possível conferir o repositório público no GitHub. Tente novamente mais tarde.', 503);
          }
          return { repository: { repo, id: metadata.repository_id, branch: metadata.default_branch, html_url: `https://github.com/${repo}` } };
        }
        case 'authorize': {
          if (payload.confirmed !== true) throw new WorkbenchError('Confirme que o repositório está no seu escopo autorizado.');
          let repo;
          try { repo = scanner.normalizeRepo(payload.repo); }
          catch { throw new WorkbenchError('Informe um repositório público da conta ofelipepeixoto.'); }
          if (!Number.isSafeInteger(payload.repositoryId) || payload.repositoryId < 1) throw new WorkbenchError('Confira o repositório antes de autorizar.');
          const metadata = validateMetadata(await scanner.repositoryMetadata(repo), repo, payload.repositoryId);
          const existing = await first('SELECT * FROM workbench_projects WHERE owner_id = ? AND repo = ?', ownerId, repo);
          if (existing) {
            if (existing.repository_id !== metadata.repository_id) throw new WorkbenchError('O repositório mudou de identidade. O escopo anterior foi preservado.', 409);
            return { project: publicProject(existing) };
          }
          const entry = { id: uuid(), repo, repository_id: metadata.repository_id, authorized_at: stamp() };
          await write('INSERT INTO workbench_projects (id, owner_id, repo, repository_id, authorized_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (owner_id, repo) DO NOTHING', entry.id, ownerId, entry.repo, entry.repository_id, entry.authorized_at);
          const saved = await first('SELECT * FROM workbench_projects WHERE owner_id = ? AND repo = ?', ownerId, repo);
          if (!saved || saved.repository_id !== metadata.repository_id) throw new WorkbenchError('O escopo existente foi preservado. Confira a identidade do repositório.', 409);
          return { project: publicProject(saved) };
        }
        case 'scan': {
          const scope = await project(payload.projectId);
          const requestId = identifier(payload.requestId);
          const revision = payload.revision === undefined || payload.revision === null || payload.revision === '' ? null : payload.revision;
          if (revision !== null && (typeof revision !== 'string' || !SHA.test(revision))) throw new WorkbenchError('A revisão deve ser um SHA completo de 40 caracteres.');
          const requestedRevision = revision?.toLowerCase() ?? null;
          await expire(scope.id);
          const previous = await first('SELECT * FROM workbench_runs WHERE owner_id = ? AND request_id = ?', ownerId, requestId);
          if (previous) {
            const previousSource = previous.result_json ? JSON.parse(previous.result_json).source ?? 'github-public' : 'github-public';
            if (previous.project_id !== scope.id || previous.requested_revision !== requestedRevision || previousSource !== 'github-public') throw new WorkbenchError('Esta solicitação já foi usada para outra análise.', 409);
            return { run: await fullRun(previous) };
          }
          const id = uuid();
          const created = stamp();
          try {
            await write("INSERT INTO workbench_runs (id, owner_id, project_id, repo, repository_id, request_id, requested_revision, revision, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'running', ?, ?)", id, ownerId, scope.id, scope.repo, scope.repository_id, requestId, requestedRevision, created, created);
          } catch {
            const repeated = await first('SELECT * FROM workbench_runs WHERE owner_id = ? AND request_id = ?', ownerId, requestId);
            if (repeated) {
              const repeatedSource = repeated.result_json ? JSON.parse(repeated.result_json).source ?? 'github-public' : 'github-public';
              if (repeated.project_id === scope.id && repeated.requested_revision === requestedRevision && repeatedSource === 'github-public') return { run: await fullRun(repeated) };
              throw new WorkbenchError('Esta solicitação já foi usada para outra análise.', 409);
            }
            const active = await first("SELECT id FROM workbench_runs WHERE owner_id = ? AND project_id = ? AND status = 'running'", ownerId, scope.id);
            if (active) throw new WorkbenchError('Já existe uma análise em andamento para este projeto.', 409);
            throw new WorkbenchError('Não foi possível iniciar a análise.', 503);
          }
          let stored;
          try {
            const result = await scanner.inspectGitHub(scope.repo, scope.repository_id, requestedRevision);
            if (result.repository_id !== scope.repository_id || !SHA.test(result.revision) || (requestedRevision && result.revision !== requestedRevision)) throw new Error('identity');
            stored = {
              revision: result.revision, repository_id: result.repository_id, snapshot_digest: result.snapshot_digest,
              files_read: result.files_read, bytes_read: result.bytes_read, partial: result.partial,
              omissions: result.omissions, findings: result.findings, dependencies: result.dependencies,
              files_acquired: result.files_acquired, bytes_acquired: result.bytes_acquired, binary_skipped: result.binary_skipped,
              oversized_skipped: result.oversized_skipped, findings_total: result.findings_total, dependencies_total: result.dependencies_total,
              source: result.source, verified_revision: result.verified_revision, limits: result.limits,
            };
          } catch (error) {
            // Only trusted scanner error types select a public diagnostic.
            // Never persist provider messages, URLs, response bodies or causes.
            const failureCode = error instanceof defaultScanner.GitHubRateLimitError ? 'github_rate_limited' :
              error instanceof defaultScanner.GitHubAcquisitionTimeoutError ? 'acquisition_timeout' : 'acquisition_failed';
            await write("UPDATE workbench_runs SET status = 'failed', failure_code = ?, updated_at = ? WHERE owner_id = ? AND id = ? AND status = 'running'", failureCode, stamp(), ownerId, id);
            return { run: await fullRun(await runRow(id)) };
          }
          // Storage errors are not acquisition failures. If this write cannot
          // be confirmed, return its safe storage error and preserve the record.
          await write("UPDATE workbench_runs SET status = 'complete', revision = ?, result_json = ?, updated_at = ? WHERE owner_id = ? AND id = ? AND status = 'running'", stored.revision, JSON.stringify(stored), stamp(), ownerId, id);
          return { run: await fullRun(await runRow(id)) };
        }
        case 'run': return { run: await fullRun(await runRow(payload.runId)) };
        case 'review': {
          const row = await runRow(payload.runId);
          if (row.status !== 'complete') throw new WorkbenchError('A análise precisa estar concluída para revisar candidatos.', 409);
          if (!DECISIONS.has(payload.decision)) throw new WorkbenchError('Decisão de revisão inválida.');
          const result = JSON.parse(row.result_json);
          if (typeof payload.fingerprint !== 'string' || !result.findings.some(finding => finding.fingerprint === payload.fingerprint)) throw new WorkbenchError('Candidato não encontrado nesta análise.', 404);
          await write('INSERT INTO workbench_reviews (id, owner_id, run_id, fingerprint, decision, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (owner_id, run_id, fingerprint) DO UPDATE SET decision = excluded.decision, updated_at = excluded.updated_at', uuid(), ownerId, row.id, payload.fingerprint, payload.decision, stamp());
          return { run: await fullRun(row) };
        }
        case 'compare': {
          const before = await runRow(payload.before);
          const after = await runRow(payload.after);
          if (before.status !== 'complete' || after.status !== 'complete') throw new WorkbenchError('Compare apenas análises concluídas.', 409);
          if (before.project_id !== after.project_id || before.repo !== after.repo || before.repository_id !== after.repository_id) throw new WorkbenchError('Compare análises do mesmo projeto e identidade de repositório.');
          const left = JSON.parse(before.result_json);
          const right = JSON.parse(after.result_json);
          if ((left.source ?? 'github-public') !== (right.source ?? 'github-public')) throw new WorkbenchError('Compare análises produzidas pelo mesmo método.');
          const old = new Set(left.findings.map(finding => finding.fingerprint));
          const current = new Set(right.findings.map(finding => finding.fingerprint));
          return { comparison: { new: [...current].filter(item => !old.has(item)), no_longer_detected: [...old].filter(item => !current.has(item)), still_detected: [...current].filter(item => old.has(item)), partial: left.partial || right.partial } };
        }
        case 'report': {
          const run = await fullRun(await runRow(payload.runId));
          if (run.status !== 'complete') throw new WorkbenchError('A análise precisa estar concluída para gerar o relatório.', 409);
          return { filename: `security-workbench-${run.id}.md`, markdown: scanner.renderReport(run) };
        }
        default: throw new WorkbenchError('Ação não reconhecida.');
      }
    },
  };
}

export async function handleWorkbenchRequest(request, { getUser, getDb, authorizedOwnerId, scanner = defaultScanner, now = () => new Date(), uuid = () => crypto.randomUUID() }, { reaImportOnly = false } = {}) {
  try {
    const user = await getUser();
    if (!user?.userId) throw new WorkbenchError('Entre para acessar o Workbench.', 401);
    if (typeof authorizedOwnerId !== 'string' || !authorizedOwnerId.trim()) throw new WorkbenchError('Operação real indisponível: configuração do proprietário pendente.', 503);
    if (user.userId !== authorizedOwnerId) throw new WorkbenchError('Operação real restrita ao proprietário.', 403);
    if (request.method !== 'GET' && request.method !== 'POST') throw new WorkbenchError('Método não permitido.', 405);
    if (reaImportOnly && request.method !== 'POST') throw new WorkbenchError('Método não permitido.', 405);
    if (request.method === 'POST' && user.provider === 'github' &&
      (typeof user.csrfToken !== 'string' || request.headers.get('X-Workbench-CSRF') !== user.csrfToken)) {
      throw new WorkbenchError('A solicitação não corresponde à sessão atual. Recarregue a página.', 403);
    }
    const payload = request.method === 'POST' ? await parseBody(request, reaImportOnly ? MAX_REA_BODY_BYTES : MAX_BODY_BYTES) : null;
    if (reaImportOnly) {
      if (payload.action !== undefined && payload.action !== 'import-rea') throw new WorkbenchError('Ação não permitida nesta rota.');
      payload.action = 'import-rea';
    }
    const service = createWorkbenchService({ db: await getDb(), ownerId: user.userId, scanner, now, uuid });
    return response(request.method === 'GET' ? await service.list() : await service.act(payload));
  } catch (error) {
    return response({ error: error instanceof WorkbenchError ? error.message : 'Não foi possível concluir a solicitação. Tente novamente.' }, error instanceof WorkbenchError ? error.status : 500);
  }
}

export function handleReaImportRequest(request, dependencies) {
  return handleWorkbenchRequest(request, dependencies, { reaImportOnly: true });
}
