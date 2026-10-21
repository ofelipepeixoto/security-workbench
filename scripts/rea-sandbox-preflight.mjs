/** Own benign fixture only. Never installs, starts REA or accepts target code. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, readlink, realpath, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import net from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const CHECKS = ['linux', 'loopback_control', 'sandbox_process', 'network_namespace', 'loopback_blocked', 'only_loopback', 'fixture_readable', 'input_read_only', 'input_unchanged', 'private_paths_absent', 'environment_minimal', 'cleanup'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cleanEnv = { PATH: '/usr/bin:/bin', TMPDIR: '/tmp' };
const report = () => ({ schema: 'security-workbench.rea-sandbox-preflight/v1', passed: false, code: 'blocked', checks: Object.fromEntries(CHECKS.map(key => [key, false])), memory_enforced: false, ready_for_rea: false });

/** Bounded transport; never retain stderr or failed-process output. */
export function boundedProcess(command, args, { spawnImpl = spawn, timeoutMs = 10000, killAfterMs = 2000, maxBytes = 16384 } = {}) {
  return new Promise(resolveResult => {
    let child, timer, killer, finalizer, settled = false, spawned = false, bytes = 0, output = '', reason = null;
    const finish = (code, closed) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(killer); clearTimeout(finalizer);
      child?.stdout?.destroy(); child?.stderr?.destroy();
      if (!closed) child?.unref();
      resolveResult({ code, closed, output: code === 'ok' ? output : '' });
    };
    const stop = code => {
      if (settled || reason) return;
      reason = code;
      if (child?.exitCode === null && child?.signalCode === null) child.kill('SIGTERM');
      killer = setTimeout(() => {
        if (child?.exitCode === null && child?.signalCode === null) child.kill('SIGKILL');
        if (settled) return;
        finalizer = setTimeout(() => finish('termination_unconfirmed', false), 250);
      }, killAfterMs);
    };
    try {
      child = spawnImpl(command, args, { env: cleanEnv, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      child.once('spawn', () => { spawned = true; });
      child.on('error', () => { if (!spawned) finish('unavailable', true); else stop('process_error'); });
      child.once('close', code => finish(reason || (code === 0 ? 'ok' : 'sandbox_failed'), true));
      const consume = (chunk, keep) => {
        bytes += chunk.length;
        if (bytes > maxBytes) { stop('output_limit'); return; }
        if (keep) output += chunk.toString('utf8');
      };
      child.stdout?.on('data', chunk => consume(chunk, true));
      child.stderr?.on('data', chunk => consume(chunk, false));
      timer = setTimeout(() => stop('timeout'), timeoutMs);
    } catch { finish('unavailable', true); }
  });
}

async function connectOwn(port, expected) {
  return new Promise(resolveResult => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let content = '', done = false;
    const finish = result => { if (!done) { done = true; socket.destroy(); resolveResult(result); } };
    socket.setTimeout(1000, () => finish(false));
    socket.on('data', chunk => { content += chunk.toString(); if (content.length > 128) finish(false); });
    socket.once('end', () => finish(content === expected));
    socket.once('error', () => finish(false));
  });
}

// Serialized from this trusted function, never from a downloaded input.
async function sandboxProbe({ port, parentNamespace, fixtureHash }) {
  const fs = await import('node:fs/promises'), net = await import('node:net'), crypto = await import('node:crypto');
  const result = {};
  result.network_namespace = (await fs.readlink('/proc/self/ns/net')) !== parentNamespace;
  const interfaces = (await fs.readFile('/proc/net/dev', 'utf8')).split('\n').slice(2).filter(line => line.includes(':')).map(line => line.split(':')[0].trim());
  result.only_loopback = interfaces.length === 1 && interfaces[0] === 'lo';
  result.loopback_blocked = await new Promise(resolveResult => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let done = false;
    const finish = value => { if (!done) { done = true; socket.destroy(); resolveResult(value); } };
    socket.setTimeout(1000, () => finish(false));
    socket.once('connect', () => finish(false));
    socket.once('error', error => finish(['ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH'].includes(error.code)));
  });
  const fixture = await fs.readFile('/input/fixture.js');
  result.fixture_readable = crypto.createHash('sha256').update(fixture).digest('hex') === fixtureHash;
  result.input_read_only = false;
  try { await fs.writeFile('/input/fixture.js', 'changed'); }
  catch (error) { result.input_read_only = error.code === 'EROFS'; }
  result.private_paths_absent = true;
  for (const path of ['/home', '/root', '/mnt', '/run']) {
    try { await fs.lstat(path); result.private_paths_absent = false; }
    catch (error) { if (error.code !== 'ENOENT') result.private_paths_absent = false; }
  }
  result.environment_minimal = process.env.PATH === '/usr/bin:/bin' && process.env.TMPDIR === '/tmp' && (!process.env.PWD || process.env.PWD === '/tmp') &&
    Object.keys(process.env).every(key => ['PATH', 'TMPDIR', 'PWD'].includes(key));
  process.stdout.write(JSON.stringify(result));
}

/** Test hooks are trusted module callers only; the CLI exposes no options. */
export async function runPreflight({ platform = process.platform, spawnImpl = spawn, checkAvailable = () => access('/usr/bin/bwrap', constants.X_OK), mkdtempImpl = mkdtemp, timeoutMs = 10000, killAfterMs = 2000 } = {}) {
  const result = report();
  if (platform !== 'linux') { result.code = 'unsupported_platform'; return result; }
  result.checks.linux = true;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000 || !Number.isInteger(killAfterMs) || killAfterMs < 1 || killAfterMs > 2000) {
    result.code = 'invalid_limits'; return result;
  }
  let directory, server;
  const sockets = new Set();
  try {
    await checkAvailable();
    const runtimeExecutable = await realpath(process.execPath);
    const parentNamespace = await readlink('/proc/self/ns/net');
    directory = await mkdtempImpl(join(tmpdir(), 'workbench-rea-preflight-'));
    await mkdir(join(directory, 'input'), { mode: 0o700 });
    const fixture = Buffer.from('/* own inert fixture: never executed */\nexport const inert = true;\n');
    const input = join(directory, 'input', 'fixture.js'), probe = join(directory, 'probe.mjs');
    await writeFile(input, fixture, { mode: 0o600, flag: 'wx' });
    const marker = 'own-loopback-control';
    server = net.createServer(socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.end(marker); });
    await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
    const port = server.address().port;
    result.checks.loopback_control = await connectOwn(port, marker);
    if (!result.checks.loopback_control) { result.code = 'loopback_unavailable'; return result; }
    const source = '(' + sandboxProbe.toString() + ')(' + JSON.stringify({ port, parentNamespace, fixtureHash: hash(fixture) }) + ').catch(()=>{process.exitCode=1})';
    await writeFile(probe, source, { mode: 0o600, flag: 'wx' });
    const args = [
      '--unshare-user', '--unshare-net', '--unshare-pid', '--unshare-ipc', '--unshare-uts',
      '--die-with-parent', '--new-session', '--cap-drop', 'ALL', '--clearenv',
      '--ro-bind', '/usr', '/usr', '--symlink', 'usr/bin', '/bin',
      '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64',
      '--dir', '/runtime', '--ro-bind', runtimeExecutable, '/runtime/node', '--ro-bind', join(directory, 'input'), '/input',
      '--ro-bind', probe, '/probe.mjs', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
      '--setenv', 'PATH', cleanEnv.PATH, '--setenv', 'TMPDIR', cleanEnv.TMPDIR, '--chdir', '/tmp',
      '--', '/runtime/node', '/probe.mjs',
    ];
    const child = await boundedProcess('/usr/bin/bwrap', args, { spawnImpl, timeoutMs, killAfterMs });
    result.code = child.code;
    result.checks.sandbox_process = child.code === 'ok' && child.closed;
    if (result.checks.sandbox_process) {
      let checks;
      try { checks = JSON.parse(child.output); } catch { checks = {}; }
      for (const key of CHECKS.filter(key => !['linux', 'loopback_control', 'sandbox_process', 'input_unchanged', 'cleanup'].includes(key))) result.checks[key] = checks?.[key] === true;
      result.code = 'checks_failed';
    }
    result.checks.input_unchanged = hash(await readFile(input)) === hash(fixture);
  } catch { result.code = 'unavailable'; }
  finally {
    for (const socket of sockets) socket.destroy();
    if (server?.listening) await new Promise(resolveClose => server.close(resolveClose));
    if (directory) {
      try { await rm(directory, { recursive: true, force: true, maxRetries: 0 }); result.checks.cleanup = true; }
      catch { result.code = 'cleanup_failed'; }
    }
  }
  result.passed = CHECKS.every(key => result.checks[key]);
  if (result.passed) result.code = 'passed_memory_gate_pending';
  return result;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = process.argv.length === 2 ? await runPreflight() : { ...report(), code: 'unsupported_arguments' };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.passed ? 0 : 2;
}
