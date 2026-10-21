import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { access, mkdtemp, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { boundedProcess, runPreflight } from '../../scripts/rea-sandbox-preflight.mjs';

const safe = result => {
  assert.equal(result.memory_enforced, false);
  assert.equal(result.ready_for_rea, false);
  assert.equal(Object.values(result.checks).every(value => typeof value === 'boolean'), true);
  for (const text of ['/private/', 'inert-secret', 'process.env', 'fixture.js']) assert.equal(JSON.stringify(result).includes(text), false);
};

test('Windows is rejected before filesystem availability or child execution', async () => {
  let created = false;
  const result = await runPreflight({ platform: 'win32', checkAvailable() { throw new Error('must not inspect'); }, spawnImpl() { throw new Error('must not spawn'); }, mkdtempImpl() { created = true; throw new Error('must not create'); } });
  assert.equal(result.code, 'unsupported_platform');
  assert.equal(result.passed, false);
  assert.equal(created, false);
  safe(result);
});

test('missing sandbox fails closed without echoing diagnostics or creating fixtures', async () => {
  let created = false;
  const result = await runPreflight({ platform: 'linux', checkAvailable(executable) { assert.equal(executable, '/usr/bin/bwrap'); throw new Error('/private/inert-secret'); }, mkdtempImpl() { created = true; throw new Error('must not create'); } });
  assert.equal(result.code, 'unavailable');
  assert.equal(result.passed, false);
  assert.equal(created, false);
  safe(result);
});

test('invalid executable selection is rejected before availability, filesystem setup or spawning', async () => {
  for (const bwrapExecutable of [null, true, false, 1, {}, ['/usr/bin/bwrap'], '', 'bwrap', './bwrap', 'C:\\private\\bwrap.exe', 'file:///usr/bin/bwrap', '/private/inert-secret\0/bwrap']) {
    const called = { available: false, setup: false, spawn: false };
    const result = await runPreflight({
      platform: 'linux', bwrapExecutable,
      checkAvailable() { called.available = true; throw new Error('must not inspect'); },
      mkdtempImpl() { called.setup = true; throw new Error('must not create'); },
      spawnImpl() { called.spawn = true; throw new Error('must not spawn'); },
    });
    assert.equal(result.code, 'invalid_bwrap_executable');
    assert.equal(result.passed, false);
    assert.deepEqual(called, { available: false, setup: false, spawn: false });
    safe(result);
  }
});

test('an explicitly selected absent executable fails closed without falling back to the system sandbox', async () => {
  const bwrapExecutable = join(tmpdir(), 'workbench-bwrap-absent-' + randomUUID(), 'bwrap');
  const called = { setup: false, spawn: false };
  const result = await runPreflight({
    platform: 'linux', bwrapExecutable,
    mkdtempImpl() { called.setup = true; throw new Error('must not create'); },
    spawnImpl() { called.spawn = true; throw new Error('must not spawn'); },
  });
  assert.equal(result.code, 'unavailable');
  assert.equal(result.passed, false);
  assert.deepEqual(called, { setup: false, spawn: false });
  assert.equal(JSON.stringify(result).includes(bwrapExecutable), false);
  safe(result);
});

test('TERM escalates to KILL and kill errors never masquerade as confirmed termination', async () => {
  let child;
  const result = await boundedProcess(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'], {
    timeoutMs: 500, killAfterMs: 100,
    spawnImpl(command, args, options) { child = spawn(command, args, options); return child; },
  });
  assert.equal(result.code, 'timeout');
  assert.equal(result.closed, true);
  assert.equal(result.output, '');
  assert.equal(child.signalCode, 'SIGKILL');
  const fake = new EventEmitter(), signals = [];
  Object.assign(fake, { exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough(), unref() { this.unreferenced = true; }, kill(signal) { signals.push(signal); this.emit('error', new Error('/private/inert-secret')); return false; } });
  const unconfirmed = await boundedProcess('unused', [], { timeoutMs: 10, killAfterMs: 10, spawnImpl() { queueMicrotask(() => fake.emit('spawn')); return fake; } });
  assert.equal(unconfirmed.code, 'termination_unconfirmed');
  assert.equal(unconfirmed.closed, false);
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(fake.unreferenced, true);
  assert.equal(unconfirmed.output, '');
});

test('stdout plus stderr share a byte cap and private failure output never escapes', async () => {
  const result = await boundedProcess(process.execPath, ['-e', 'process.stderr.write("/private/inert-secret"+"x".repeat(32768));setInterval(()=>{},1000)'], {
    maxBytes: 128, timeoutMs: 1000, killAfterMs: 50,
  });
  assert.equal(result.code, 'output_limit');
  assert.equal(result.closed, true);
  assert.equal(result.output, '');
});

test('projected checks discard extra data, preserve failure and never open the REA gate', async () => {
  if (process.platform !== 'linux') return;
  const runtimeExecutable = await realpath(process.execPath);
  assert.equal((await stat(runtimeExecutable)).isFile(), true);
  for (const { namespaceMatches, bwrapExecutable } of [
    { namespaceMatches: true },
    { namespaceMatches: true, bwrapExecutable: '/private/workbench prefix/bin/bwrap' },
    { namespaceMatches: false, bwrapExecutable: '/private/workbench prefix/bin/bwrap' },
  ]) {
    const expectedExecutable = bwrapExecutable ?? '/usr/bin/bwrap';
    let inputDirectory, ownDirectory;
    let availabilityChecked = false;
    const childChecks = {
      network_namespace: namespaceMatches, only_loopback: true, loopback_blocked: true,
      fixture_readable: true, input_read_only: true, private_paths_absent: true, environment_minimal: true,
      secret: '/private/inert-secret', ready_for_rea: true, memory_enforced: true,
    };
    const result = await runPreflight({
      bwrapExecutable,
      checkAvailable: async executable => { assert.equal(executable, expectedExecutable); availabilityChecked = true; },
      async mkdtempImpl(prefix) { ownDirectory = await mkdtemp(prefix); return ownDirectory; },
      spawnImpl(command, args, options) {
        assert.equal(availabilityChecked, true);
        assert.equal(command, expectedExecutable);
        assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
        assert.deepEqual(Object.keys(options.env).sort(), ['PATH', 'TMPDIR']);
        assert.equal(options.shell, false);
        for (const flag of ['--unshare-user', '--unshare-net', '--unshare-pid', '--unshare-ipc', '--unshare-uts', '--clearenv', '--die-with-parent']) assert.ok(args.includes(flag));
        assert.equal(args.includes('--share-net'), false);
        assert.equal(args.includes('/home'), false);
        assert.equal(args.includes('/mnt'), false);
        const runtimeIndex = args.indexOf('/runtime/node');
        assert.equal(args[runtimeIndex - 2], '--ro-bind');
        assert.equal(args[runtimeIndex - 1], runtimeExecutable);
        assert.equal(args.includes('/runtime'), true);
        assert.equal(args[args.indexOf('/runtime') - 1], '--dir');
        inputDirectory = args[args.indexOf('/input') - 1];
        return spawn(process.execPath, ['-e', 'process.stdout.write(' + JSON.stringify(JSON.stringify(childChecks)) + ')'], options);
      },
    });
    assert.equal(availabilityChecked, true);
    assert.equal(result.passed, namespaceMatches);
    assert.equal(result.checks.network_namespace, namespaceMatches);
    assert.equal(result.checks.cleanup, true);
    await assert.rejects(access(inputDirectory));
    await assert.rejects(access(ownDirectory));
    safe(result);
  }
});

test('CLI rejects arguments before sandbox execution and transport spawn failure is closed', async () => {
  const unavailable = await boundedProcess('unused', [], { spawnImpl() { throw new Error('/private/inert-secret'); } });
  assert.deepEqual(unavailable, { code: 'unavailable', closed: true, output: '' });
  const script = fileURLToPath(new URL('../../scripts/rea-sandbox-preflight.mjs', import.meta.url));
  const child = await boundedProcess(process.execPath, [script, '--unsupported'], {
    spawnImpl(command, args, options) {
      const cli = spawn(command, args, options);
      // Exit 2 is the CLI's documented blocked result; preserve its JSON for this assertion only.
      cli.on('close', code => assert.equal(code, 2));
      return cli;
    },
  });
  assert.equal(child.code, 'sandbox_failed');
  assert.equal(child.closed, true);
  assert.equal(child.output, '');
  const result = await new Promise((resolveResult, reject) => {
    const cli = spawn(process.execPath, [script, '--unsupported'], { env: {}, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let output = '';
    cli.stdout.on('data', bytes => { output += bytes; });
    cli.on('error', reject);
    cli.on('close', code => { assert.equal(code, 2); resolveResult(JSON.parse(output)); });
  });
  assert.equal(result.code, 'unsupported_arguments');
  assert.equal(result.passed, false);
  safe(result);
});
