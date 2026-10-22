import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseReaEvidence, MAX_REA_REPORT_BYTES } from '../lib/rea-import.mjs';

const bytes = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
const sha = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const digest = sha('inert synthetic JavaScript artifact, never executed');
  const nodeId = 'jag_node_' + '1'.repeat(64);
  return {
    fixture_notice: 'SYNTHETIC: authored import-contract fixture, not a completed REA execution.',
    evidence_id: 'ev_' + '2'.repeat(64),
    provider: { id: 'rea-javascript-application', name: 'REA JavaScript application analyzer', version: '1' },
    operation: 'analyze_javascript_application', predicate_type: 'rea.javascript-application-analysis',
    authority: 'shipped-artifact', confidence: 'derived',
    subject: { digest: { sha256: digest }, format: 'directory', local_path: '/synthetic/private-input' },
    normalized_result: {
      input_path: '/synthetic/private-input', format: 'directory', root_artifact_sha256: digest,
      statistics: { relevant_files: 1, parsed_javascript_files: 1, parse_failures: 0, text_bytes_read: 64, findings: 1 },
      graph: {
        schema: 'JavaScriptApplicationGraph', root_node_ids: [nodeId],
        coverage: { status: 'complete', truncated: false, omitted_count: 0, limits: [] },
        nodes: [{
          node_id: nodeId, kind: 'endpoint',
          observations: [{
            observation_id: 'jag_observation_' + '3'.repeat(64),
            properties: { value: 'https://user:inert-secret@example.invalid/?token=inert-secret', status: 'confirmed' },
            evidence: {
              authority: 'ast-static-analysis', state: 'observed', confidence: 'exact',
              artifact: { available: true, artifact_id: 'art_' + digest, sha256: digest },
              location: { available: true, value: { kind: 'source-range', source: 'fixture.js', start: { line: 1, column: 0 }, end: { line: 1, column: 30 } } },
            },
          }],
        }],
      },
    },
  };
}
const genericFailure = /^Error: Evidence REA inválido ou fora dos limites de importação\.$/;

test('REA static projection keeps declared coverage, exact report byte hash and safe candidate semantics', async () => {
  const input = fixture();
  input.normalized_result.graph.nodes[0].observations[0].properties.code = 'globalThis.REA_SENTINEL = true; throw new Error("never execute")';
  const raw = bytes('\n  ' + JSON.stringify(input) + '\r\n');
  const result = await parseReaEvidence(raw);
  assert.equal(result.provenance.report_sha256, sha(raw));
  assert.equal(result.provenance.provider_contract_version, '1');
  assert.equal(result.provenance.contract_source_package_version, '6.4.0');
  assert.equal(result.provenance.native_findings_declared, 1);
  assert.equal(result.provenance.observations_imported, 1);
  assert.deepEqual(result.provenance.observations_omitted_by_reason, {});
  assert.equal(result.provenance.coverage_declared.status, 'complete');
  assert.equal(result.provenance.execution_verified, false);
  assert.equal(result.provenance.network_isolation_verified, false);
  assert.equal(result.partial, true);
  assert.equal(result.findings.length, 1);
  const finding = result.findings[0];
  assert.equal(finding.status, 'candidate');
  assert.equal(finding.confidence, 'low');
  assert.equal(finding.path, 'fixture.js');
  assert.equal(finding.fingerprint, sha('rea-structural-endpoint\0fixture.js\0jag_observation_' + '3'.repeat(64)).slice(0, 20));
  for (const value of ['inert-secret', 'example.invalid', '/synthetic/private-input', 'REA_SENTINEL']) assert.equal(JSON.stringify(result).includes(value), false);
  assert.equal(globalThis.REA_SENTINEL, undefined);
});

test('the byte commitment cannot change when a caller mutates its input during async projection', async () => {
  const raw = bytes(fixture()), expected = sha(raw);
  const pending = parseReaEvidence(raw);
  raw.fill(0);
  assert.equal((await pending).provenance.report_sha256, expected);
});

test('duplicate keys including escaped aliases are rejected instead of selecting an identity', async () => {
  const valid = JSON.stringify(fixture());
  const samples = [
    '{"a":1,"a":2}', '{"a":1,"\\u0061":2}',
    valid.replace('"version":"1"', '"version":"6.4.0","version":"1"'),
    valid.replace('"kind":"endpoint"', '"kind":"storage","kind":"endpoint"'),
    valid.replace('"status":"complete"', '"status":"unknown","status":"complete"'),
  ];
  for (const input of samples) await assert.rejects(parseReaEvidence(bytes(input)), genericFailure);
});

test('prototype keys remain inert unknown data and cannot pollute configuration or projection', async () => {
  const raw = JSON.stringify(fixture()).replace('{', '{"__proto__":{"reaPolluted":true},"constructor":{"prototype":{"reaPolluted":true}},');
  const result = await parseReaEvidence(bytes(raw));
  assert.equal({}.reaPolluted, undefined);
  assert.equal(result.reaPolluted, undefined);
  assert.equal(result.findings.length, 1);
  assert.equal(JSON.stringify(result).includes('reaPolluted'), false);
});

test('valid escaped surrogate pairs are Unicode characters while orphan surrogates stay invalid', async () => {
  const prefix = '{"ignored":"' + '\\ud83d\\ude00'.repeat(16384) + '",';
  const raw = prefix + JSON.stringify(fixture()).slice(1);
  assert.equal((await parseReaEvidence(bytes(raw))).findings.length, 1);
  const badKey = '{"\\ud800":true,' + JSON.stringify(fixture()).slice(1);
  await assert.rejects(parseReaEvidence(bytes(badKey)), genericFailure);
});

test('raw JSON is bounded before projection and all failures use a non-reflecting message', async () => {
  const samples = [
    new Uint8Array(MAX_REA_REPORT_BYTES + 1), new Uint8Array([255]),
    bytes(''), bytes('[]'), bytes('null'), bytes('{"private-token":"inert-secret",}'),
    bytes('{"x":NaN}'), bytes('{"x":1e999}'), bytes('{"x":"\\ud800"}'),
    bytes('{"x":"\\udc00"}'), bytes('{"x":01}'), bytes('{"x":1.}'),
    bytes('['.repeat(33) + '0' + ']'.repeat(33)),
    bytes(JSON.stringify({ x: 'x'.repeat(16385) })),
    bytes(JSON.stringify({ x: Array(25001).fill(null) })),
    bytes(JSON.stringify({ ['x'.repeat(101)]: 1 })),
    bytes('\ufeff' + JSON.stringify(fixture())),
  ];
  for (const input of samples) await assert.rejects(parseReaEvidence(input), genericFailure);
  await assert.rejects(parseReaEvidence(JSON.stringify(fixture())), genericFailure);
});

test('provider, artifact identity, coverage and safe source ranges fail closed', async () => {
  const mutations = [
    input => { input.provider.version = '6.4.0'; },
    input => { input.operation = 'capture_browser_scenario'; },
    input => { input.subject.digest.sha256 = '0'.repeat(64); },
    input => { input.normalized_result.statistics.relevant_files = true; },
    input => { input.normalized_result.graph.coverage.truncated = true; },
    input => { input.normalized_result.graph.root_node_ids = [{}]; },
    input => { input.normalized_result.graph.nodes[0].observations[0].evidence.artifact.artifact_id = 'art_' + '0'.repeat(64); },
    ...['../outside.js', '/private.js', 'https://example.invalid/app.js', 'folder\\app.js', 'folder/.env.js', 'app<script>.js'].map(path => input => { input.normalized_result.graph.nodes[0].observations[0].evidence.location.value.source = path; }),
    input => { input.normalized_result.graph.nodes[0].observations[0].evidence.location.value.end.line = 0; },
  ];
  for (const mutate of mutations) {
    const input = fixture(); mutate(input);
    await assert.rejects(parseReaEvidence(bytes(input)), genericFailure);
  }
});

test('benign or runtime/unknown observations do not become vulnerabilities or complete coverage', async () => {
  for (const authority of ['passive-cdp-runtime', 'unknown']) {
    const input = fixture();
    input.normalized_result.graph.nodes[0].observations[0].evidence.authority = authority;
    const result = await parseReaEvidence(bytes(input));
    assert.equal(result.findings.length, 0);
    assert.equal(result.partial, true);
    assert.equal(result.provenance.observations_omitted, 1);
  }
  const input = fixture(); input.normalized_result.graph.nodes[0].kind = 'javascript-asset';
  assert.equal((await parseReaEvidence(bytes(input))).findings.length, 0);
});

test('omission reasons account for every received observation without retaining external labels or values', async () => {
  const input = fixture(), graph = input.normalized_result.graph;
  const node = graph.nodes[0], original = structuredClone(node.observations[0]);
  node.observations.push(structuredClone(original)); // A duplicate is omitted, not imported twice.
  const add = mutate => {
    const item = structuredClone(original);
    item.observation_id = 'jag_observation_' + node.observations.length.toString(16).padStart(64, '0');
    mutate(item.evidence);
    node.observations.push(item);
  };
  add(fact => { fact.authority = 'private-authority-value'; });
  add(fact => { fact.state = 'private-state-value'; });
  add(fact => { fact.artifact.available = false; });
  add(fact => { fact.location.value.kind = 'private-location-value'; });
  graph.nodes.push({ node_id: 'jag_node_' + '4'.repeat(64), kind: 'private-kind-value', observations: [original] });
  const result = await parseReaEvidence(bytes(input)), p = result.provenance;
  assert.equal(p.native_findings_declared, 1);
  assert.equal(p.observations_seen, 7);
  assert.equal(p.observations_imported, 1);
  assert.equal(p.observations_omitted, 6);
  assert.deepEqual(p.observations_omitted_by_reason, {
    unsupported_node_kind: 1, unsupported_evidence_authority: 1, unsupported_evidence_state: 1,
    artifact_or_location_unavailable: 1, unsupported_location_kind: 1, duplicate_observation: 1,
  });
  assert.equal(Object.values(p.observations_omitted_by_reason).reduce((sum, amount) => sum + amount, 0), p.observations_omitted);
  assert.match(result.omissions.join('\n'), /Motivos de omissão: tipo de nó fora da projeção: 1/);
  for (const value of ['private-authority-value', 'private-state-value', 'private-location-value', 'private-kind-value', 'inert-secret']) {
    assert.equal(JSON.stringify(result).includes(value), false);
  }
});

test('native findings and graph observations remain distinct counts for inventory-only projections', async () => {
  const input = fixture(), node = input.normalized_result.graph.nodes[0];
  node.kind = 'javascript-asset';
  node.observations = Array.from({ length: 4 }, () => structuredClone(node.observations[0]));
  const result = await parseReaEvidence(bytes(input));
  assert.equal(result.provenance.native_findings_declared, 1);
  assert.equal(result.provenance.observations_seen, 4);
  assert.equal(result.provenance.observations_imported, 0);
  assert.equal(result.findings.length, 0);
  assert.equal(result.provenance.observations_omitted, 4);
  assert.deepEqual(result.provenance.observations_omitted_by_reason, { unsupported_node_kind: 4 });
});

test('node, total observation and candidate bounds stay explicit without silently dropping coverage', async () => {
  const input = fixture(), node = input.normalized_result.graph.nodes[0], original = structuredClone(node.observations[0]);
  for (let index = 1; index < 105; index++) node.observations.push({ ...original, observation_id: 'jag_observation_' + index.toString(16).padStart(64, '0') });
  const result = await parseReaEvidence(bytes(input));
  assert.equal(result.findings.length, 100);
  assert.equal(result.provenance.observations_omitted, 5);
  assert.equal(result.provenance.observations_imported, 100);
  assert.equal(result.provenance.observations_seen, 105);
  assert.deepEqual(result.provenance.observations_omitted_by_reason, { candidate_limit: 5 });
  assert.equal(result.partial, true);
  const tooMany = fixture();
  tooMany.normalized_result.graph.nodes = Array(1001).fill({});
  await assert.rejects(parseReaEvidence(bytes(tooMany)), genericFailure);
  const tooManyObservations = fixture();
  tooManyObservations.normalized_result.graph.nodes[0].observations = Array(2001).fill({});
  await assert.rejects(parseReaEvidence(bytes(tooManyObservations)), genericFailure);
});
