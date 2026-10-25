/** Bounded, public GitHub acquisition. Rules/texts ported from Workbench PR #6. */
import {GitHubAppError} from './github-app-client.mjs';
const OWNER = "ofelipepeixoto";
const API = "https://api.github.com";
export const SCANNER_VERSION = "workbench-static/1.1";
export const COVERAGE_POLICY = "workbench-files/1.1";
export const SCANNER_LIMITS = Object.freeze({files: 20, bytes: 2 * 1024 * 1024, fileBytes: 256 * 1024, responseBytes: 4 * 1024 * 1024, deadlineMs: 45000, findings: 100, dependencies: 500});
const SHA = /^[0-9a-fA-F]{40}$/;
const SKIP_DIRS = new Set([".git", ".data", ".venv", "venv", "node_modules", "dist", "build", "__pycache__"]);
const TEXT_EXTENSIONS = new Set([".py", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".json", ".yml", ".yaml", ".txt", ".toml", ".ini", ".cfg"]);
const ASSIGNMENT = /\b(api[_-]?key|access[_-]?token|secret|password|private[_-]?key)\b\s*[:=]\s*['"]([^'"\r\n]{8,})['"]/i;
const PLACEHOLDER = /^(?:\$\{|<|your[_-]|changeme|example|placeholder|dummy|test[_-])/i;
const SAFE_VERSION = /^(?:[A-Za-z0-9][A-Za-z0-9._+-]*|[0-9vVxX*^~<>=][0-9A-Za-z.*+^~<>=| -]*)$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", {fatal: false});

export class GitHubRateLimitError extends Error {
  constructor() { super('A cota pública do GitHub foi atingida. Tente novamente mais tarde.'); this.name = 'GitHubRateLimitError'; }
}

export class GitHubAcquisitionTimeoutError extends Error {
  constructor() { super('A leitura ultrapassou 45 segundos. Confira o histórico antes de tentar novamente.'); this.name = 'GitHubAcquisitionTimeoutError'; }
}

export function normalizeRepo(input) {
  if (typeof input !== "string" || input.length > 250) throw new Error("Informe o nome ou endereço do seu repositório GitHub.");
  let repo = input.trim();
  if (/[\x00-\x1f\x7f\\]/.test(repo) || repo.split("/").includes("..")) throw new Error("Endereço ou nome de repositório inválido.");
  if (/^https:\/\//i.test(repo)) {
    let url;
    try {url = new URL(repo);} catch {throw new Error("Endereço GitHub inválido.");}
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash || /[?%#\\]/.test(repo)) throw new Error("Use um endereço HTTPS do GitHub, sem parâmetros ou credenciais.");
    repo = url.pathname.replace(/^\//, "").replace(/\/$/, "");
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || repo.includes("..") || repo.startsWith(".") || repo.split("/")[1].startsWith(".")) throw new Error("Informe owner/repositório ou seu endereço HTTPS no GitHub.");
  repo = repo.toLowerCase();
  if (repo.split("/")[0] !== OWNER) throw new Error("Este piloto aceita apenas repositórios de ofelipepeixoto.");
  return repo;
}

function repositoryId(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("ID de repositório inválido.");
  return value;
}
function sha(value) {
  if (typeof value !== "string" || !SHA.test(value)) throw new Error("SHA Git inválido na resposta.");
  return value.toLowerCase();
}
function branch(value) {
  if (typeof value !== "string" || value.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) || value.includes("..") || value.includes("//") || value.endsWith("/") || value.endsWith(".") || value.endsWith(".lock")) throw new Error("Branch padrão inválida na resposta do GitHub.");
  return value;
}
function validateMetadata(value, repo) {
  if (value.private !== false) throw new Error("Este piloto web aceita apenas repositórios públicos; os privados continuam no aplicativo local.");
  if (typeof value.full_name !== "string" || value.full_name.toLowerCase() !== repo || normalizeRepo(value.full_name) !== repo) throw new Error("Identidade do repositório divergente.");
  return {repo, repository_id: repositoryId(value.id), default_branch: branch(value.default_branch), private: false};
}

function cancelStream(stream) {
  // Cleanup must not extend the request deadline or replace the safe failure.
  // A transport can reject, throw, or leave its cancellation promise pending.
  try {stream?.cancel().catch(() => {});} catch { /* best effort */ }
}

async function withTransport(fetcher, work) {
  const controller = new AbortController();
  const timeoutError = new GitHubAcquisitionTimeoutError();
  const timer = setTimeout(() => controller.abort(timeoutError), SCANNER_LIMITS.deadlineMs);
  const abort = new Promise((_, reject) => controller.signal.addEventListener("abort", () => reject(timeoutError), {once: true}));
  async function get(path) {
    if (controller.signal.aborted) throw timeoutError;
    // Paths are authored here, never accepted as arbitrary URLs from an API response.
    if (!path.startsWith("/repos/ofelipepeixoto/") || path.includes("#") || path.includes("\\")) throw new Error("Caminho de API inválido.");
    let response;
    try {
      // Workers does not implement redirect:error. Manual mode never follows a
      // Location header; the non-200 guard below rejects every redirect.
      response = await Promise.race([fetcher(API + path, {method: "GET", redirect: "manual", credentials: "omit", cache: "no-store", headers: {Accept: "application/vnd.github+json", "User-Agent": "security-workbench-public-pilot"}, signal: controller.signal}), abort]);
    } catch (error) {
      if (controller.signal.aborted) throw timeoutError;
      throw new Error("Não foi possível consultar a API pública do GitHub; redirecionamentos são recusados.", {cause: error});
    }
    if (response.status !== 200) {
      const rateLimited = (response.status === 403 || response.status === 429) && response.headers?.get('x-ratelimit-remaining') === '0';
      cancelStream(response.body);
      if (rateLimited) throw new GitHubRateLimitError();
      throw new Error(`GitHub retornou HTTP ${Number(response.status) || 0}; confira acesso público e limite da API.`);
    }
    const contentLength = response.headers?.get("content-length");
    if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > SCANNER_LIMITS.responseBytes)) {
      cancelStream(response.body);
      throw new Error("Resposta do GitHub excede o limite de 4 MiB.");
    }
    if (!response.body?.getReader) throw new Error("Resposta da API sem fluxo de leitura válido.");
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        const {done, value} = await Promise.race([reader.read(), abort]);
        if (done) break;
        length += value.byteLength;
        if (length > SCANNER_LIMITS.responseBytes) throw new Error("Resposta do GitHub excede o limite de 4 MiB.");
        chunks.push(value);
      }
    } catch (error) {
      cancelStream(reader);
      if (controller.signal.aborted) throw timeoutError;
      throw error;
    } finally {reader.releaseLock();}
    let value;
    try {value = JSON.parse(decoder.decode(concat(chunks)));} catch {throw new Error("Resposta JSON inválida do GitHub.");}
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Resposta inválida da API.");
    return value;
  }
  try {return await work(get);} finally {clearTimeout(timer);}
}

export async function repositoryMetadata(repo, {fetcher = fetch} = {}) {
  repo = normalizeRepo(repo);
  return withTransport(fetcher, async (get) => validateMetadata(await get(`/repos/${repo}`), repo));
}
function concat(chunks) {
  const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {result.set(chunk, offset); offset += chunk.byteLength;}
  return result;
}
async function hash(algorithm, data) {return new Uint8Array(await crypto.subtle.digest(algorithm, data));}
function hex(bytes) {return [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");}
function utf8Order(a, b) {
  const left = encoder.encode(a), right = encoder.encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {if (left[i] !== right[i]) return left[i] - right[i];}
  return left.length - right.length;
}
function eligible(path) {
  if (typeof path !== "string" || !path || path.length > 1024 || /[\\\x00-\x1f\x7f-\x9f\uD800-\uDFFF]/u.test(path)) return "invalid_path";
  const parts = path.split("/");
  if (parts.some((p) => !p || p === "." || p === "..")) return "invalid_path";
  if (parts.slice(0, -1).some((p) => SKIP_DIRS.has(p))) return "excluded_directory";
  const name = parts.at(-1);
  if (name.startsWith(".env")) return "excluded_environment";
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot).toLowerCase() : "";
  return TEXT_EXTENSIONS.has(extension) || name === "requirements.txt" || name === "Dockerfile" ? null : "unsupported_extension";
}
async function finding(kind, path, line, detail, evidence, impact, recommendation, confidence) {
  return {fingerprint: hex(await hash("SHA-256", encoder.encode(`${kind}\0${path}\0${detail}`))).slice(0, 20), kind, path, line, status: "candidate", confidence, evidence, impact, recommendation,
    tool: SCANNER_VERSION, rule_id: kind === "possible-secret" ? "SWB-TEXT-001/1" : "SWB-WORKFLOW-001/1", severity: "medium",
    severity_reason: kind === "possible-secret" ? "Impacto potencial se o valor for uma credencial válida; validade e alcance não verificados." : "Permissão ampla pode aumentar o impacto de um workflow comprometido; gatilho e contexto exigem revisão."};
}
async function inspectText(path, text, remainingFindings, remainingDependencies) {
  const findings = [], dependencies = [];
  let findingsTotal = 0, dependenciesTotal = 0;
  function addDependency(item) {dependenciesTotal++; if (dependencies.length < remainingDependencies) dependencies.push(item);}
  const lines = text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/);
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(ASSIGNMENT), number = i + 1;
    if (match && !PLACEHOLDER.test(match[2].trim())) {
      const key = match[1].toLowerCase();
      findingsTotal++;
      if (findings.length < remainingFindings) findings.push(await finding("possible-secret", path, number, key, `Atribuição a ${key} com valor [REDACTED] em ${path}:${number}.`, "Uma credencial real exposta pode permitir acesso indevido; a validade não foi verificada.", "Revisar o valor fora do relatório; se for real, revogá-lo e removê-lo do histórico com procedimento controlado.", `/${path}`.includes("/test") || path.includes("fixture") ? "low" : "medium"));
    }
    if (path.startsWith(".github/workflows/") && /^\s*permissions\s*:\s*write-all\s*(?:#.*)?$/.test(lines[i])) {findingsTotal++; if (findings.length < remainingFindings) findings.push(await finding("broad-workflow-permissions", path, number, "write-all", `Declaração permissions: write-all em ${path}:${number}.`, "Um workflow comprometido pode obter permissões amplas, conforme seu gatilho e contexto.", "Revisar o gatilho e conceder apenas permissões específicas necessárias.", "high"));}
  }
  if (path === "requirements.txt") {
    for (const line of lines) {const match = line.match(/^\s*([A-Za-z0-9_.-]+)==([A-Za-z0-9_.!+~-]+)\s*$/); if (match) addDependency({name: match[1], version: match[2], source: path});}
  }
  if (path === "package.json") {
    try {
      const packageValue = JSON.parse(text);
      for (const group of ["dependencies", "devDependencies"]) {
        const values = packageValue?.[group];
        if (values && typeof values === "object" && !Array.isArray(values)) for (const [name, version] of Object.entries(values)) if (typeof version === "string") addDependency({name, version: SAFE_VERSION.test(version) ? version : "[REDACTED]", source: `${path}:${group}`});
      }
    } catch { /* Unsupported manifest contents are not dependency evidence. */ }
  }
  return {findings, dependencies, findingsTotal, dependenciesTotal};
}
function decodeBase64(content) {
  if (typeof content !== "string" || content.length > Math.ceil(SCANNER_LIMITS.fileBytes / 3) * 4 + 20000) throw new Error("Conteúdo de blob inválido.");
  const value = content.replace(/[\r\n\t ]/g, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("Conteúdo de blob inválido.");
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function inspectGitHub(repo, boundRepositoryId, revision = null, {fetcher = fetch} = {}) {
  repo = normalizeRepo(repo);
  boundRepositoryId = repositoryId(boundRepositoryId);
  if (revision !== null) revision = sha(revision);
  return withTransport(fetcher, async (get) => {
    const metadata = validateMetadata(await get(`/repos/${repo}`), repo);
    if (metadata.repository_id !== boundRepositoryId) throw new Error("Identidade do repositório divergente do escopo autorizado.");
    const pinned = revision ?? sha((await get(`/repos/${repo}/commits/${encodeURIComponent(metadata.default_branch)}`)).sha);
    return acquirePinned(repo, boundRepositoryId, pinned, get, "github-public");
  });
}

async function acquirePinned(repo, boundRepositoryId, revision, get, source, acquisitionBudget) {
  const prefix = `/repos/${repo}`;
    const commit = await get(`${prefix}/git/commits/${revision}`);
    if (sha(commit.sha) !== revision) throw new Error("Commit divergente do solicitado.");
    const treeSha = sha(commit.tree?.sha);
    const listing = await get(`${prefix}/git/trees/${treeSha}?recursive=1`);
    if (sha(listing.sha) !== treeSha || !Array.isArray(listing.tree)) throw new Error("Árvore divergente ou inválida.");
    if (listing.truncated !== true && listing.truncated !== false) throw new Error("Cobertura da árvore desconhecida.");
    if (listing.tree.some((item) => !item || typeof item !== "object" || Array.isArray(item) || typeof item.path !== "string")) throw new Error("Entrada inválida na árvore GitHub.");
    const omissions = [], findings = [], dependencies = [], digestParts = [], seen = new Set();
    const exclusions = {};
    for (const item of listing.tree) {
      if (item.type === "tree") continue;
      const excluded = eligible(item.path);
      if (excluded) exclusions[excluded] = (exclusions[excluded] ?? 0) + 1;
    }
    let filesRead = 0, bytesRead = 0, filesAcquired = 0, bytesAcquired = 0, binarySkipped = 0, overSizeSkipped = 0;
    let findingsTotal = 0, dependenciesTotal = 0;
    if (listing.truncated) omissions.push("Árvore GitHub truncada; cobertura parcial.");
    const entries = [...listing.tree].sort((a, b) => utf8Order(a.path, b.path));
    let budgetOmitted = 0;
    for (const [index, item] of entries.entries()) {
      const path = item.path;
      if (item.type === "tree") continue;
      const excluded = eligible(path);
      if (excluded) continue;
      if (seen.has(path)) throw new Error("Caminho duplicado na árvore.");
      seen.add(path);
      if (item.type !== "blob" || !["100644", "100755"].includes(item.mode)) {omissions.push(`${path}: tipo não regular`); continue;}
      const size = item.size;
      if (!Number.isSafeInteger(size) || size < 0 || size > SCANNER_LIMITS.fileBytes) {omissions.push(`${path}: tamanho ausente ou acima de 256 KiB`); overSizeSkipped++; continue;}
      if (filesAcquired >= SCANNER_LIMITS.files || bytesAcquired + size > SCANNER_LIMITS.bytes) {omissions.push("Limite web de 20 arquivos ou 2 MiB atingido; cobertura parcial."); break;}
      if (acquisitionBudget && !acquisitionBudget.canAcquire()) {
        budgetOmitted = entries.slice(index).filter(entry => entry.type === 'blob' && ['100644','100755'].includes(entry.mode) && !eligible(entry.path) && Number.isSafeInteger(entry.size) && entry.size >= 0 && entry.size <= SCANNER_LIMITS.fileBytes).length;
        omissions.push(`${budgetOmitted} entradas elegíveis não adquiridas: orçamento QA reservado para as revalidações finais. Cobertura parcial; limite de 16 requisições por tentativa.`);
        break;
      }
      const blobSha = sha(item.sha), blob = await get(`${prefix}/git/blobs/${blobSha}`);
      if (sha(blob.sha) !== blobSha || blob.encoding !== "base64" || blob.size !== size) throw new Error(`Blob divergente: ${path}`);
      const data = decodeBase64(blob.content);
      if (data.byteLength !== size || data.byteLength > SCANNER_LIMITS.fileBytes || hex(await hash("SHA-1", concat([encoder.encode(`blob ${data.byteLength}\0`), data]))) !== blobSha) throw new Error(`Conteúdo ou hash divergente: ${path}`);
      filesAcquired++; bytesAcquired += data.byteLength;
      if (data.includes(0)) {omissions.push(`${path}: binário`); binarySkipped++; continue;}
      filesRead++; bytesRead += data.byteLength;
      digestParts.push(encoder.encode(`${path}\0`), await hash("SHA-256", data));
      const inspected = await inspectText(path, decoder.decode(data), Math.max(0, SCANNER_LIMITS.findings - findings.length), Math.max(0, SCANNER_LIMITS.dependencies - dependencies.length));
      findingsTotal += inspected.findingsTotal;
      dependenciesTotal += inspected.dependenciesTotal;
      findings.push(...inspected.findings);
      dependencies.push(...inspected.dependencies);
    }
    if ((filesAcquired >= SCANNER_LIMITS.files || bytesAcquired >= SCANNER_LIMITS.bytes) && !omissions.some((x) => x.startsWith("Limite web"))) omissions.push("Limite web de 20 arquivos ou 2 MiB atingido; cobertura parcial.");
    const excludedCount = Object.values(exclusions).reduce((a, b) => a + b, 0);
    if (excludedCount) omissions.push(`${excludedCount} arquivos fora da política de cobertura; contagens por motivo disponíveis nos detalhes.`);
    if (findingsTotal > findings.length) omissions.push("Limite de 100 candidatos no piloto web; cobertura parcial de achados.");
    if (dependenciesTotal > dependencies.length) omissions.push("Limite de 500 dependências no piloto web; inventário parcial.");
    return {revision, repository_id: boundRepositoryId, snapshot_digest: hex(await hash("SHA-256", concat(digestParts))), files_read: filesRead, bytes_read: bytesRead, files_acquired: filesAcquired, bytes_acquired: bytesAcquired, binary_skipped: binarySkipped, oversized_skipped: overSizeSkipped, findings_total: findingsTotal, dependencies_total: dependenciesTotal, partial: omissions.length > 0, omissions: omissions.slice(0, 50), findings, dependencies, source, verified_revision: true, limits: SCANNER_LIMITS, engine_version: SCANNER_VERSION, coverage: {policy: COVERAGE_POLICY, exclusions_by_reason: exclusions, files_excluded: excludedCount, dependency_analysis: "inventory_only", advisory_coverage: "unavailable", ...(acquisitionBudget?{acquisition_budget:{requests_limit:16,requests_reserved:acquisitionBudget.reserved,omitted_files:budgetOmitted}}:{})}};
 }

/** Server-only App adapter: identity/permission is revalidated through the user
 * access token. No target scripts, package installation or raw URLs are used. */
export async function inspectGitHubApp({client, installationId, repositoryId: expectedId, revision, initialAuthorization, revalidateConnection, acquisitionBudget, checkpoint, observe}) {
  expectedId = repositoryId(expectedId);
  revision = sha(revision);
  if (!client?.authorizeRepository || !client?.readTree || !client?.readBlob) throw new Error("Transporte autorizado indisponível.");
  const emit=event=>{try{observe?.(event);}catch{/* optional diagnostics cannot change the result */}};
  let timer, closed = false;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { closed = true; reject(new GitHubAcquisitionTimeoutError()); }, SCANNER_LIMITS.deadlineMs); });
  const work = async () => {
    emit({type:'phase',phase:'scanner_initial'});
    await checkpoint?.();
    if (revalidateConnection && await revalidateConnection() !== client) throw new GitHubAppError('disconnected',401);
    // Only the same client's opaque, single-use capability may bridge the
    // adjacent job precheck and scanner entry. Serialized browser data cannot.
    const authorized = initialAuthorization === undefined
      ? await client.authorizeRepository({installationId, repositoryId: expectedId, revision})
      : client.consumeAcquisitionAuthorization(initialAuthorization,{installationId,repositoryId:expectedId,revision});
    const repo = authorized.repository?.full_name;
    if (authorized.repository?.id !== expectedId || authorized.revision !== revision || typeof repo !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || repo.includes("..")) throw new Error("Identidade autorizada divergente.");
    const treeSha = sha(authorized.tree_sha), prefix = `/repos/${repo}`;
    const get = async (path) => {
      if (closed) throw new GitHubAcquisitionTimeoutError();
      if (path === `${prefix}/git/commits/${revision}`) {await checkpoint?.();return {sha: revision, tree: {sha: treeSha}};}
      // Remote tree/blob reads are gated immediately before dispatch by the
      // same shared transport, including every paginated authorization request.
      if (path === `${prefix}/git/trees/${treeSha}?recursive=1`) return client.readTree({installationId, repositoryId: expectedId, treeSha});
      const blobPrefix = `${prefix}/git/blobs/`;
      if (path.startsWith(blobPrefix) && SHA.test(path.slice(blobPrefix.length))) return client.readBlob({installationId, repositoryId: expectedId, blobSha: path.slice(blobPrefix.length)});
      throw new Error("Recurso fora do transporte autorizado.");
    };
    emit({type:'phase',phase:'acquisition'});
    const result = await acquirePinned(repo, expectedId, revision, get, "github-app", acquisitionBudget);
    if (closed) throw new GitHubAcquisitionTimeoutError();
    // Permissions, rename, transfer and visibility can change during acquisition.
    emit({type:'phase',phase:'authorization_after_acquisition'});
    await checkpoint?.();
    if (revalidateConnection && await revalidateConnection() !== client) throw new GitHubAppError('disconnected',401);
    const current = await client.authorizeRepository({installationId, repositoryId: expectedId, revision});
    if (current.repository?.full_name !== repo || current.repository?.private !== authorized.repository.private || current.repository?.visibility !== authorized.repository.visibility || current.revision !== revision || current.tree_sha !== authorized.tree_sha) throw new GitHubAppError('forbidden',403);
    return result;
  };
  try {return await Promise.race([work(), timeout]);} finally {closed = true; clearTimeout(timer);}
}

// Escape Markdown syntax and HTML in all untrusted fields, including backticks,
// link brackets, line breaks and autolink punctuation. Reports contain no raw HTML.
function markdown(value) {return String(value ?? "").replace(/\r\n|[\r\n\x00-\x1f\x7f]/g, " ").replace(/[\\`*_{}\[\]()#+.!|><:&~=-]/g, (c) => `&#${c.charCodeAt(0)};`);}
export function renderReport(run) {
  const verified = run.verified_revision === true && Number.isSafeInteger(run.repository_id) && run.repository_id > 0;
  const imported = run.source === 'rea-import';
  const lines = [`# Security Workbench — ${markdown(run.repo)}`, "", `Análise: ${markdown(run.id)} · revisão ${verified ? "verificada" : "declarada"}: ${markdown(run.revision)}`, `Repository ID: ${markdown(run.repository_id)}`, `Origem: ${markdown(run.source || "github-public")} · digest ${imported ? 'declarado do artefato' : 'dos arquivos lidos'}: ${markdown(run.snapshot_digest || run.digest)}`, `Cobertura: **${run.partial ? "PARCIAL" : "Limitada aos arquivos suportados"}** · ${markdown(run.files_read)} arquivos / ${markdown(run.bytes_read)} bytes${imported ? ' (contagens declaradas)' : ''}`, "", (verified ? "Identidade, commit e hashes dos arquivos lidos foram conferidos via API do GitHub. " : "A revisão declarada não foi confrontada com o GitHub. ") + "Ausência de achados não comprova segurança.", ""];
  if (imported) lines.push("## Proveniência da importação REA", "",
    `SHA-256 observado do arquivo Evidence recebido: ${markdown(run.provenance?.report_sha256)}`,
    `Contrato de importação: ${markdown(run.provenance?.schema)}`,
    `Commit de referência do contrato REA: ${markdown(run.provenance?.contract_source_commit)}`, "",
    "A importação valida uma projeção estática do JSON fornecido pelo operador. O Workbench não executou o REA, não autenticou seu produtor e não comprovou o isolamento, os bytes dos artefatos ou o vínculo com o commit. Observações estruturais não são vulnerabilidades confirmadas.", "");
  else lines.push(run.source === "github-app" ? "Aquisição GitHub App: interseção entre acesso do usuário e da instalação; até 20 arquivos, 2 MiB e 256 KiB por arquivo. Não executa código do alvo." : "Piloto web: apenas repositórios públicos de ofelipepeixoto; até 20 arquivos, 2 MiB no total e 256 KiB por arquivo. Não executa código do alvo.", "");
  if (run.engine_version) lines.push(`Motor: ${markdown(run.engine_version)} · política: ${markdown(run.coverage?.policy)}`, "Cobertura de advisories/CVEs: indisponível; inventário não é correlação de vulnerabilidades.", "");
  lines.push("## Achados", "");
  if (!run.findings?.length) lines.push("Nenhum candidato nos arquivos lidos.");
  for (const item of run.findings || []) lines.push(`### ${markdown(item.kind)} · ${markdown(item.fingerprint)}`, "", `Local: ${markdown(item.path)}:${markdown(item.line)} · estado: ${markdown(item.status)} · confiança: ${markdown(item.confidence)}`, "", `Regra: ${markdown(item.rule_id || "não registrada")} · severidade potencial: ${markdown(item.severity || "não registrada")}`, `Justificativa: ${markdown(item.severity_reason || "não registrada")}`, "", `Evidência: ${markdown(item.evidence)}`, "", `Impacto possível: ${markdown(item.impact)}`, "", `Recomendação: ${markdown(item.recommendation)}`, "");
  lines.push("## Inventário de dependências (sem análise de CVEs)", "");
  if (!run.dependencies?.length) lines.push("Nenhuma dependência reconhecida nos manifestos suportados.");
  for (const item of run.dependencies || []) lines.push(`- ${markdown(item.name)} ${markdown(item.version)} (${markdown(item.source)})`);
  if (run.omissions?.length) {lines.push("", "## Limitações de leitura", ""); for (const item of run.omissions) lines.push(`- ${markdown(item)}`);}
  return lines.join("\n") + "\n";
}
