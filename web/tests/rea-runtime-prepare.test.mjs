import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/rea-prepare-runtime.sh', import.meta.url));
const BASH = '/bin/bash';

// These tests cover refusal paths, preservation and a simulated phase failure. They never
// execute REA, a compiler, an installer, bwrap or systemd, and cannot prove
// network/filesystem isolation in the operator's environment.
function temporary(t) {
  const root = mkdtempSync(join(tmpdir(), 'workbench-rea-prepare-test-'));
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
    cwd: paths.cwd,
    env: { HOME: paths.home, PATH: path, LANG: 'C', LC_ALL: 'C' },
    encoding: 'utf8', timeout: 4000, maxBuffer: 64 * 1024,
  });
}

function refused(result) {
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.notEqual(result.status, 0);
}

test('REA preparation shell script has valid Bash syntax without executing it', () => {
  const result = spawnSync(BASH, ['-n', script], { encoding: 'utf8', timeout: 4000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('arguments are rejected before external commands or any filesystem writes', t => {
  const paths = temporary(t), bin = join(paths.root, 'mock-bin');
  mkdirSync(bin);
  for (const command of ['uname', 'id', 'realpath', 'readlink', 'dirname', 'git', 'node', 'npm', 'bwrap', 'systemd-run', 'systemctl', 'sha256sum', 'mkdir', 'touch', 'tee', 'cp', 'mv', 'rm', 'timeout', 'prlimit']) {
    writeFileSync(join(bin, command), '#!/bin/sh\nprintf "UNEXPECTED_TEST_COMMAND\\n" >&2\nexit 93\n', { mode: 0o700 });
  }
  const before = tree(paths.root);
  for (const args of [['--help'], ['--prepare'], ['unexpected', 'argument']]) {
    const result = run(paths, args, bin);
    refused(result);
    assert.doesNotMatch(result.stdout + result.stderr, /UNEXPECTED_TEST_COMMAND/);
    assert.deepEqual(tree(paths.root), before);
  }
});

test('zero arguments with an empty temporary HOME fail before creating preparation files', t => {
  const paths = temporary(t), before = tree(paths.root);
  const result = run(paths);
  refused(result);
  assert.match(result.stderr, /codigo=node_ausente/);
  assert.deepEqual(tree(paths.root), before);
});

test('preservation and real phase failure gates retain prior dist, record status and stop before bundle', t => {
  const paths = temporary(t), tool = join(paths.root, 'tool');
  mkdirSync(tool); mkdirSync(join(tool, 'dist'));
  writeFileSync(join(tool, 'dist', 'prior-output.txt'), 'owned prior runtime');
  const source = readFileSync(script, 'utf8');
  const functionsStart = source.indexOf('\nrun_phase() {\n');
  const flowStart = source.indexOf('\nrun_phase emit || fail emissao_falhou\n', functionsStart);
  assert.ok(functionsStart >= 0 && flowStart > functionsStart, 'phase functions and guarded emit entry must remain identifiable');
  const failDefinition = source.split('\n').find(line => line.startsWith('fail() {'));
  assert.match(failDefinition ?? '', /exit 1;/);
  const preparationStart = source.indexOf('\nrecord=$(mktemp -d ');
  const preparationEnd = source.indexOf('\ncat > "$record/phase.sh"', preparationStart);
  assert.ok(preparationStart >= 0 && preparationEnd > preparationStart);
  // Execute the actual function definitions and downstream gates, without the
  // toolchain preflight. A shell function intercepts the `env`
  // launch, so systemd, bwrap, REA and the compiler cannot be invoked here.
  const harness = join(paths.root, 'phase-harness.sh');
  writeFileSync(harness, [
    '#!/usr/bin/env bash', 'set -euo pipefail', 'umask 077', failDefinition,
    'base=$1; tool=$2; bwrap=unused; node=unused; source_sha=fixture-commit',
    'env() { return 23; }',
    'pins_clean() { printf "UNEXPECTED_PIN_GATE\\n" >&2; return 1; }',
    source.slice(preparationStart, preparationEnd),
    source.slice(functionsStart, flowStart), source.slice(flowStart),
  ].join('\n'));
  const result = spawnSync(BASH, [harness, paths.root, tool], {
    cwd: paths.cwd, env: { HOME: paths.home, PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
    encoding: 'utf8', timeout: 4000, maxBuffer: 64 * 1024,
  });
  refused(result);
  assert.equal(result.status, 1);
  const recordName = /^registro_local=(rea-runtime-prepare\.[A-Za-z0-9]+)$/m.exec(result.stdout)?.[1];
  assert.ok(recordName);
  const record = join(paths.root, recordName);
  assert.match(result.stdout, /\nFASE_INICIO fase=emit\nFASE fase=emit status=23 segundos=\d+\n$/);
  assert.match(result.stderr, /^terminacao_unidade=nao_confirmada ready_for_rea=false\nPREPARACAO_BLOQUEADA codigo=emissao_falhou typecheck_complete=false ready_for_rea=false\n$/);
  assert.match(readFileSync(join(record, 'phases.tsv'), 'utf8'), /^phase\texit_code\telapsed_seconds\nemit\t23\t\d+\n$/);
  assert.equal(readdirSync(record).some(name => name.startsWith('bundle')), false);
  assert.equal(existsSync(join(record, 'result.json')), false);
  assert.equal(readFileSync(join(record, 'dist.previous', 'prior-output.txt'), 'utf8'), 'owned prior runtime');
  assert.deepEqual(readdirSync(join(tool, 'dist')), []);
});
