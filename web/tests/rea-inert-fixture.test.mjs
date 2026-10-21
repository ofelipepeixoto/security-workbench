import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/rea-run-inert-fixture.sh', import.meta.url));
const BASH = '/bin/bash';
const fixtureSha = 'd99e67189229b7c47492d92fa3995ad9ae4110490ffeeb16483efeb420c3b29e';
const startedAt = '2026-10-21T17:00:00Z', finishedAt = '2026-10-21T17:00:01Z';
const privateValue = '/private/rea-inert-test-value-never-echo';

// Only refusal paths, trusted embedded text and the trusted JSON validator run
// here. Synthetic evidence does not establish REA execution or OS isolation.
function temporary(t) {
  const root = mkdtempSync(join(tmpdir(), 'workbench-rea-inert-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home'), cwd = join(root, 'cwd');
  mkdirSync(home); mkdirSync(cwd);
  return { root, home, cwd };
}

function tree(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .map(entry => ({ name: entry.name, directory: entry.isDirectory(),
      ...(entry.isDirectory() ? { entries: tree(join(directory, entry.name)) } : { content: readFileSync(join(directory, entry.name), 'utf8') }),
    }));
}

function run(paths, args = [], path = '/usr/bin:/bin') {
  return spawnSync(BASH, [script, ...args], {
    cwd: paths.cwd, env: { HOME: paths.home, PATH: path, LANG: 'C', LC_ALL: 'C' },
    encoding: 'utf8', timeout: 4000, maxBuffer: 64 * 1024,
  });
}

function refused(result, label) {
  assert.ifError(result.error);
  assert.equal(result.signal, null, label);
  assert.notEqual(result.status, 0, label);
}

function heredoc(name) {
  const source = readFileSync(script, 'utf8'), marker = `<<'${name}'\n`;
  const markerStart = source.indexOf(marker), start = markerStart + marker.length;
  const end = source.indexOf(`\n${name}\n`, start);
  assert.ok(markerStart >= 0 && end > start, `trusted ${name} heredoc must remain identifiable`);
  return source.slice(start, end + 1);
}

function nativeEvidence() {
  const root = '1'.repeat(64), coverage = { status: 'complete', truncated: false, omitted_count: 0 };
  const graphId = 'jag_' + '3'.repeat(64), graphNode = 'jag_node_' + '4'.repeat(64);
  const semanticId = 'jsrg_' + '5'.repeat(64), semanticNode = 'jsrg_node_' + '6'.repeat(64);
  const families = ['boundary', 'call-flow', 'child-process', 'closure', 'configuration', 'data-flow', 'event', 'object-flow', 'promise-ownership', 'request', 'resource-lifecycle', 'timer'];
  return {
    evidence_id: 'ev_' + '2'.repeat(64),
    operation: 'analyze_javascript_application', predicate_type: 'rea.javascript-application-analysis',
    provider: { id: 'rea-javascript-application', version: '1' },
    authority: 'shipped-artifact', confidence: 'derived',
    subject: { format: 'directory', digest: { sha256: root }, path: privateValue },
    normalized_result: {
      format: 'directory', input_path: '/input', root_artifact_sha256: root,
      source_selection: { requested_paths: ['inert-app.js'], unselected_files: 0 },
      statistics: { relevant_files: 1, parsed_javascript_files: 1, parse_failures: 0, text_bytes_read: 342, findings: 2 },
      integrity_contradictions: [], limitations: [privateValue],
      graph: { schema: 'JavaScriptApplicationGraph', graph_id: graphId, root_node_ids: [graphNode],
        nodes: [{ node_id: graphNode, label: privateValue }], edges: [], coverage: { ...coverage },
      },
      semantic_graph: {
        schema: 'JavaScriptSemanticRelationGraph', graph_id: semanticId,
        application_graph_id: graphId, root_artifact_sha256: root, root_node_ids: [semanticNode],
        nodes: [{ node_id: semanticNode, label: privateValue }], relations: [], unknowns: [],
        coverage: { status: 'unknown', truncated: false, omitted_nodes: 0, omitted_relations: 0, limits: [],
          families: families.map(family => ({ family, status: 'unknown', retained_relations: 0, omitted_relations: 0, unknown_ids: [] })),
        },
      },
    },
  };
}

function summaryHarness(paths) {
  const check = join(paths.root, 'check.mjs');
  writeFileSync(check, heredoc('CHECK_MJS'));
  return bytes => {
    const evidence = join(paths.root, 'evidence.json');
    writeFileSync(evidence, bytes);
    return spawnSync(process.execPath, [check, 'summary', evidence, startedAt, finishedAt], {
      cwd: paths.cwd, env: { HOME: paths.home, PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
      encoding: 'utf8', timeout: 4000, maxBuffer: 8192,
    });
  };
}

test('inert fixture runner has valid Bash syntax without executing it', () => {
  const result = spawnSync(BASH, ['-n', script], { encoding: 'utf8', timeout: 4000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('arguments are rejected before external commands and filesystem writes', t => {
  const paths = temporary(t), bin = join(paths.root, 'mock-bin');
  mkdirSync(bin);
  for (const command of ['uname', 'id', 'realpath', 'git', 'node', 'npm', 'bwrap', 'systemd-run', 'systemctl', 'sha256sum', 'mkdir', 'mktemp', 'touch', 'tee', 'cat', 'cp', 'mv', 'rm', 'timeout', 'prlimit']) {
    writeFileSync(join(bin, command), '#!/bin/sh\nprintf "UNEXPECTED_TEST_COMMAND\\n" >&2\nexit 93\n', { mode: 0o700 });
  }
  const before = tree(paths.root);
  for (const args of [['--help'], ['--run'], ['unexpected', 'argument']]) {
    const result = run(paths, args, bin);
    refused(result);
    assert.match(result.stderr, /codigo=argumentos_nao_suportados/);
    assert.doesNotMatch(result.stdout + result.stderr, /UNEXPECTED_TEST_COMMAND/);
    assert.deepEqual(tree(paths.root), before);
  }
});

test('empty temporary HOME fails at the missing Node gate without creating files', t => {
  const paths = temporary(t), before = tree(paths.root);
  const result = run(paths);
  refused(result);
  assert.match(result.stderr, /codigo=node_ausente/);
  assert.deepEqual(tree(paths.root), before);
});

test('embedded inert fixture retains the reviewed 342 bytes and SHA-256 without executing it', () => {
  const bytes = Buffer.from(heredoc('FIXTURE_JS'), 'utf8');
  assert.equal(bytes.length, 342);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), fixtureSha);
});

test('the real summary validator projects bounded metadata from synthetic native evidence', t => {
  const paths = temporary(t), summarize = summaryHarness(paths);
  const bytes = Buffer.from(JSON.stringify(nativeEvidence())), result = summarize(bytes);
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.ok(Buffer.byteLength(result.stdout) <= 4096);
  assert.doesNotMatch(result.stdout, new RegExp(privateValue));
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.native_fixture_completed, true);
  for (const key of ['typecheck_complete', 'ready_for_untrusted_targets', 'workbench_import_verified', 'loopback_control_repeated']) assert.equal(summary[key], false);
  assert.equal(summary.fixture_repository, 'ofelipepeixoto/security-workbench');
  assert.equal(summary.fixture_repository_id, 1419403320);
  assert.equal(summary.fixture_commit, '1b0c93114d7a215aa73844e5a7edd62620dd25eb');
  assert.equal(summary.engine_source_commit, '3e7c6302233ecbcb9b92e43ee5a60337738961bd');
  assert.deepEqual([summary.package_version, summary.provider_contract_version], ['6.4.0', '1']);
  // These are declared limits in the projection, not an enforcement test.
  assert.equal(summary.limits_requested.family_memory_bytes, 1073741824);
  assert.equal(summary.limits_requested.tasks, 64);
  assert.equal(summary.limits_requested.global_timeout_s, 30);
  assert.equal(summary.limits_requested.worker_old_space_mib, 128);
  assert.equal(summary.limits_requested.output_file_max_bytes, 1048576);
  assert.equal(summary.evidence_sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(summary.evidence_bytes, bytes.length);
  assert.equal(summary.fixture_sha256, fixtureSha);
  assert.equal(summary.fixture_bytes, 342);
  assert.deepEqual([summary.graph_coverage, summary.semantic_coverage], ['complete', 'unknown']);
  assert.deepEqual([summary.relevant_files, summary.parsed_javascript_files, summary.parse_failures, summary.text_bytes_read], [1, 1, 0, 342]);
  assert.deepEqual([summary.graph_nodes, summary.graph_edges, summary.findings_count, summary.limitations_count], [1, 0, 2, 1]);
  assert.deepEqual([summary.started_at, summary.finished_at], [startedAt, finishedAt]);
});

test('the real summary validator refuses malformed, partial or mismatched synthetic results without echoing values', t => {
  const paths = temporary(t), summarize = summaryHarness(paths);
  const altered = mutate => { const value = nativeEvidence(); mutate(value); return Buffer.from(JSON.stringify(value)); };
  const cases = [
    ['invalid JSON', Buffer.from('{"private":"' + privateValue + '"')],
    ['invalid UTF-8', Buffer.from([0xc3, 0x28])],
    ['empty output', Buffer.alloc(0)],
    ['over one MiB', Buffer.alloc(1048577, 0x20)],
    ['native error', altered(value => { value.error = { message: privateValue }; })],
    ['partial graph', altered(value => { value.normalized_result.graph.coverage.status = 'partial'; })],
    ['partial semantics', altered(value => { value.normalized_result.semantic_graph.coverage.status = 'partial'; })],
    ['truncated semantics', altered(value => { value.normalized_result.semantic_graph.coverage.truncated = true; })],
    ['parse failure', altered(value => { value.normalized_result.statistics.parse_failures = 1; })],
    ['digest mismatch', altered(value => { value.subject.digest.sha256 = '3'.repeat(64); })],
    ['semantic graph mismatch', altered(value => { value.normalized_result.semantic_graph.application_graph_id = 'jag_' + '7'.repeat(64); })],
    ['unselected source', altered(value => { value.normalized_result.source_selection.unselected_files = 1; })],
    ['incorrect input path', altered(value => { value.normalized_result.input_path = privateValue; })],
    ['incorrect text byte count', altered(value => { value.normalized_result.statistics.text_bytes_read = 343; })],
    ['non-array graph nodes', altered(value => { value.normalized_result.graph.nodes = 'node'; })],
    ['non-array graph edges', altered(value => { value.normalized_result.graph.edges = 'edge'; })],
    ['non-array semantic nodes', altered(value => { value.normalized_result.semantic_graph.nodes = 'node'; })],
    ['non-array semantic relations', altered(value => { value.normalized_result.semantic_graph.relations = 'relation'; })],
    ['non-array semantic unknowns', altered(value => { value.normalized_result.semantic_graph.unknowns = 'unknown'; })],
    ['non-array semantic limits', altered(value => { value.normalized_result.semantic_graph.coverage.limits = 'limit'; })],
    ['non-array semantic families', altered(value => { value.normalized_result.semantic_graph.coverage.families = 'family'; })],
  ];
  for (const [label, bytes] of cases) {
    const result = summarize(bytes);
    refused(result, label);
    assert.equal(result.status, 1, label);
    assert.equal(result.stderr, '', label);
    assert.ok(Buffer.byteLength(result.stdout) <= 4096, label);
    assert.equal(result.stdout.includes(privateValue), false, label);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.native_fixture_completed, false, label);
    for (const key of ['typecheck_complete', 'ready_for_untrusted_targets', 'workbench_import_verified', 'loopback_control_repeated']) assert.equal(summary[key], false, label);
  }
});
