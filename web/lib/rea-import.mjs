/** Offline projection of imported REA Evidence. Never runs REA or target code. */
export const MAX_REA_REPORT_BYTES = 1024 * 1024;
const MAX_VALUES = 25000, MAX_DEPTH = 32, MAX_STRING = 16384;
const SOURCE_COMMIT = '3e7c6302233ecbcb9b92e43ee5a60337738961bd';
const STRUCTURAL_KINDS = new Set(['endpoint', 'storage', 'worker', 'service-worker', 'context-bridge-api', 'ipc-handler', 'browser-window']);
const STATIC_AUTHORITIES = new Set(['ast-static-analysis', 'static-relationship-inference']);
const encoder = new TextEncoder();
const invalid = () => new Error('Evidence REA inválido ou fora dos limites de importação.');
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');

function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value;
}
function count(value, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw invalid();
  return value;
}
function digest(value, prefix = '') {
  if (typeof value !== 'string' || !value.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(value.slice(prefix.length))) throw invalid();
  return value;
}
function relativePath(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_./-]{1,240}$/.test(value) ||
      value.split('/').some(part => ['', '.', '..'].includes(part) || part.startsWith('.env')) || !/\.(?:js|mjs|cjs|jsx)$/i.test(value)) throw invalid();
  return value;
}

// A small strict JSON reader is needed: JSON.parse silently accepts duplicate
// keys. Containers and values are bounded before allocation; no eval/reviver.
function strictJson(data) {
  if (!(data instanceof Uint8Array) || !data.byteLength || data.byteLength > MAX_REA_REPORT_BYTES) throw invalid();
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
  let cursor = 0, visited = 0;
  const whitespace = () => { while (cursor < text.length && /[ \t\r\n]/.test(text[cursor])) cursor++; };
  function string() {
    const begin = cursor++;
    let escaped = false;
    while (cursor < text.length) {
      const char = text[cursor++];
      if (cursor - begin > 12 * MAX_STRING + 2) throw invalid();
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char !== '"') continue;
      const value = JSON.parse(text.slice(begin, cursor));
      let characters = 0;
      for (let i = 0; i < value.length; i++) {
        if (++characters > MAX_STRING) throw invalid();
        const code = value.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff) {
          const next = value.charCodeAt(++i);
          if (!(next >= 0xdc00 && next <= 0xdfff)) throw invalid();
        } else if (code >= 0xdc00 && code <= 0xdfff) throw invalid();
      }
      return value;
    }
    throw invalid();
  }
  function number() {
    const begin = cursor;
    if (text[cursor] === '-') cursor++;
    if (text[cursor] === '0') cursor++;
    else {
      if (!/[1-9]/.test(text[cursor] || '')) throw invalid();
      while (/[0-9]/.test(text[cursor] || '')) cursor++;
    }
    if (text[cursor] === '.') {
      cursor++;
      if (!/[0-9]/.test(text[cursor] || '')) throw invalid();
      while (/[0-9]/.test(text[cursor] || '')) cursor++;
    }
    if (text[cursor] === 'e' || text[cursor] === 'E') {
      cursor++;
      if (text[cursor] === '+' || text[cursor] === '-') cursor++;
      if (!/[0-9]/.test(text[cursor] || '')) throw invalid();
      while (/[0-9]/.test(text[cursor] || '')) cursor++;
    }
    const value = Number(text.slice(begin, cursor));
    if (!Number.isFinite(value)) throw invalid();
    return value;
  }
  function value(depth) {
    if (++visited > MAX_VALUES) throw invalid();
    whitespace();
    const char = text[cursor];
    if (char === '"') return string();
    if (char === '{' || char === '[') {
      if (depth >= MAX_DEPTH) throw invalid();
      cursor++;
      whitespace();
      if (char === '[') {
        const result = [];
        if (text[cursor] === ']') { cursor++; return result; }
        while (true) {
          result.push(value(depth + 1));
          whitespace();
          if (text[cursor] === ']') { cursor++; return result; }
          if (text[cursor++] !== ',') throw invalid();
        }
      }
      // Null-prototype dictionaries keep __proto__/constructor as inert data.
      const result = Object.create(null), keys = new Set();
      if (text[cursor] === '}') { cursor++; return result; }
      while (true) {
        whitespace();
        if (text[cursor] !== '"') throw invalid();
        const key = string();
        if ([...key].length > 100 || keys.has(key)) throw invalid();
        keys.add(key);
        whitespace();
        if (text[cursor++] !== ':') throw invalid();
        result[key] = value(depth + 1);
        whitespace();
        if (text[cursor] === '}') { cursor++; return result; }
        if (text[cursor++] !== ',') throw invalid();
      }
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(literal, cursor)) { cursor += literal.length; return result; }
    }
    return number();
  }
  const result = value(0);
  whitespace();
  if (cursor !== text.length) throw invalid();
  return object(result);
}

function coverage(raw) {
  const value = object(raw), { status, truncated, omitted_count: omitted, limits } = value;
  if (!['complete', 'partial', 'unknown', 'unavailable'].includes(status) || typeof truncated !== 'boolean') throw invalid();
  if (omitted !== null) count(omitted);
  if (status === 'complete' && (truncated || omitted !== 0)) throw invalid();
  if (['unknown', 'unavailable'].includes(status) && (truncated || omitted !== null)) throw invalid();
  if (truncated && (status !== 'partial' || omitted === 0)) throw invalid();
  if (!Array.isArray(limits) || limits.length > 32 || (truncated && !limits.length)) throw invalid();
  for (const rawLimit of limits) {
    const limit = object(rawLimit);
    if (typeof limit.name !== 'string' || !limit.name.length || limit.name.length > 100) throw invalid();
    count(limit.value);
    if (!['items', 'bytes', 'milliseconds', 'depth', 'characters', 'instructions', 'other'].includes(limit.unit)) throw invalid();
  }
  return { status, truncated, omitted_count: omitted, declared_limits_count: limits.length };
}

async function project(data) {
  const evidence = strictJson(data);
  if (evidence.operation !== 'analyze_javascript_application' || evidence.predicate_type !== 'rea.javascript-application-analysis') throw invalid();
  const provider = object(evidence.provider);
  if (provider.id !== 'rea-javascript-application' || provider.version !== '1' || evidence.authority !== 'shipped-artifact' || evidence.confidence !== 'derived') throw invalid();
  const evidenceId = digest(evidence.evidence_id, 'ev_'), result = object(evidence.normalized_result);
  const rootDigest = digest(result.root_artifact_sha256), subject = object(evidence.subject);
  if (object(subject.digest).sha256 !== rootDigest || subject.format !== result.format || !['directory', 'asar'].includes(result.format)) throw invalid();
  const statistics = object(result.statistics), files = count(statistics.relevant_files, 5000);
  const parsed = count(statistics.parsed_javascript_files, files), failures = count(statistics.parse_failures, files);
  const byteCount = count(statistics.text_bytes_read, 25 * 1024 * 1024);
  count(statistics.findings, 1000000);
  const graph = object(result.graph);
  if (graph.schema !== 'JavaScriptApplicationGraph') throw invalid();
  const declaredCoverage = coverage(graph.coverage), nodes = graph.nodes;
  if (!Array.isArray(nodes) || nodes.length < 1 || nodes.length > 1000) throw invalid();
  const findings = [], seen = new Set(), nodeIds = new Set();
  let observed = 0, omitted = 0;
  for (const rawNode of nodes) {
    const node = object(rawNode), nodeId = digest(node.node_id, 'jag_node_');
    if (nodeIds.has(nodeId) || typeof node.kind !== 'string') throw invalid();
    nodeIds.add(nodeId);
    if (!Array.isArray(node.observations) || !node.observations.length) throw invalid();
    observed += node.observations.length;
    if (observed > 2000) throw invalid();
    for (const rawObservation of node.observations) {
      const observation = object(rawObservation), kind = node.kind;
      if (!STRUCTURAL_KINDS.has(kind)) { omitted++; continue; }
      const fact = object(observation.evidence);
      if (typeof fact.authority !== 'string' || typeof fact.state !== 'string') throw invalid();
      if (!STATIC_AUTHORITIES.has(fact.authority) || !['observed', 'inferred'].includes(fact.state)) { omitted++; continue; }
      const observationId = digest(observation.observation_id, 'jag_observation_');
      const artifact = object(fact.artifact), location = object(fact.location);
      if (artifact.available !== true || location.available !== true) { omitted++; continue; }
      const artifactDigest = digest(artifact.sha256);
      if (artifact.artifact_id !== `art_${artifactDigest}`) throw invalid();
      const place = object(location.value);
      if (place.kind !== 'source-range') { omitted++; continue; }
      const path = relativePath(place.source), start = object(place.start), end = object(place.end);
      const line = count(start.line, 10000000), last = count(end.line, 10000000);
      const column = count(start.column, 10000000), lastColumn = count(end.column, 10000000);
      if (line < 1 || last < line || (last === line && lastColumn < column)) throw invalid();
      const identity = `rea-structural-${kind}\0${path}\0${observationId}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      if (findings.length >= 100) { omitted++; continue; }
      const token = (await hash(encoder.encode(identity))).slice(0, 20);
      findings.push({
        fingerprint: token, kind: `rea-structural-${kind}`, path, line, status: 'candidate', confidence: 'low',
        evidence: `Observação estrutural REA importada: ${kind} em ${path}:${line}; SHA-256 declarado do artefato ${artifactDigest}. Valores de código omitidos.`,
        impact: 'Superfície estrutural para revisão; presença estática não demonstra falha, exploração ou comportamento em execução.',
        recommendation: 'Conferir a origem e o contexto no artefato autorizado; somente a revisão humana pode confirmar um achado.',
      });
    }
  }
  if (!Array.isArray(graph.root_node_ids) || graph.root_node_ids.length < 1 || graph.root_node_ids.length > 32 || graph.root_node_ids.some(root => !nodeIds.has(root))) throw invalid();
  return {
    snapshot_digest: rootDigest, files_read: parsed, bytes_read: byteCount, partial: true, dependencies: [], findings,
    omissions: [
      'REA importado: execução, isolamento, origem e vínculo com o commit não foram comprovados pelo Workbench.',
      'Cobertura e hashes do artefato são declarados no JSON; assinaturas e digests internos do REA não foram autenticados.',
      `Projeção limitada: ${omitted} observações não importadas; ${failures} falhas de parse declaradas. Não avalia CVEs nem executa o alvo.`,
    ],
    provenance: {
      schema: 'security-workbench.rea-import/v1', report_sha256: await hash(data), evidence_id_declared: evidenceId,
      root_artifact_sha256_declared: rootDigest, contract_source_commit: SOURCE_COMMIT,
      contract_source_package_version: '6.4.0', provider_contract_version: '1', coverage_declared: declaredCoverage,
      relevant_files_declared: files, observations_seen: observed, observations_omitted: omitted,
      execution_verified: false, network_isolation_verified: false, artifact_bytes_verified: false,
    },
  };
}

export async function parseReaEvidence(data) {
  try {
    if (!(data instanceof Uint8Array) || !data.byteLength || data.byteLength > MAX_REA_REPORT_BYTES) throw invalid();
    // The caller cannot change parsed content while asynchronous hashing runs.
    return await project(new Uint8Array(data));
  }
  catch { throw invalid(); }
}
