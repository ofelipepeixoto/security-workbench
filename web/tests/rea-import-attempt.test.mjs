import test from 'node:test';
import assert from 'node:assert/strict';
import { newReaImportAttemptTracker } from '../lib/rea-import-attempt.mjs';

const original = {
  projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  commitSha: 'b'.repeat(40),
  reportDigest: 'c'.repeat(64),
};

function tracker() {
  let generated = 0;
  const attempts = newReaImportAttemptTracker({
    createRequestId: () => `00000000-0000-4000-8000-${String(++generated).padStart(12, '0')}`,
  });
  return { attempts, generated: () => generated };
}

function deferred() {
  let complete;
  const promise = new Promise(resolve => { complete = resolve; });
  return { promise, complete };
}

test('a retry after a lost response keeps the same import key', () => {
  const { attempts, generated } = tracker();
  const sent = attempts.resolve(original);
  // The server may already have persisted this ID when the response is lost.
  // No reset happens on a transport failure or an ambiguous response.
  assert.equal(attempts.resolve({ ...original }), sent);
  assert.equal(generated(), 1);
});

test('project, commit and exact report byte digest each distinguish operations', () => {
  const { attempts, generated } = tracker();
  const identities = [
    original,
    { ...original, projectId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
    { ...original, commitSha: 'e'.repeat(40) },
    { ...original, reportDigest: 'f'.repeat(64) },
    original,
  ];
  const ids = identities.map(identity => attempts.resolve(identity));
  assert.equal(new Set(ids).size, identities.length);
  assert.equal(generated(), identities.length);
});

test('canonical hexadecimal casing keeps the same server identity', () => {
  const { attempts } = tracker();
  const id = attempts.resolve(original);
  assert.equal(attempts.resolve(Object.fromEntries(Object.entries(original).map(([key, value]) => [key, value.toUpperCase()]))), id);
});

test('simultaneous submissions finishing their digest in reverse order share one key', async () => {
  const { attempts, generated } = tracker();
  const contextVersion = attempts.captureContext();
  const first = deferred(), second = deferred();
  const resolveAfterDigest = async pending => attempts.resolve({
    ...original, reportDigest: await pending.promise, contextVersion,
  });
  const firstId = resolveAfterDigest(first), secondId = resolveAfterDigest(second);
  second.complete(original.reportDigest);
  const resolvedSecond = await secondId;
  first.complete(original.reportDigest);
  assert.equal(await firstId, resolvedSecond);
  assert.equal(generated(), 1);
});

test('a context change during hashing rejects the old completion without replacing the new attempt', async () => {
  const { attempts, generated } = tracker();
  const contextVersion = attempts.captureContext();
  const digest = deferred();
  const oldCompletion = digest.promise.then(reportDigest => attempts.resolve({ ...original, reportDigest, contextVersion }));
  attempts.invalidate();
  const changed = { ...original, reportDigest: 'd'.repeat(64) };
  const next = attempts.resolve({ ...changed, contextVersion: attempts.captureContext() });
  digest.complete(original.reportDigest);
  assert.equal(await oldCompletion, null);
  assert.equal(attempts.resolve(changed), next);
  assert.equal(generated(), 1);
});

test('closing or changing the form invalidates even a repeated previous context', () => {
  const { attempts } = tracker();
  const previousVersion = attempts.captureContext();
  const previous = attempts.resolve(original);
  attempts.invalidate();
  assert.equal(attempts.resolve({ ...original, contextVersion: previousVersion }), null);
  assert.notEqual(attempts.resolve(original), previous);
});

test('an old success cannot clear a newer operation and current success invalidates pending completions', () => {
  const { attempts } = tracker();
  const oldId = attempts.resolve(original);
  const changed = { ...original, reportDigest: 'd'.repeat(64) };
  const newId = attempts.resolve(changed);
  assert.equal(attempts.resetAfterSuccess({ id: oldId }), false);
  assert.equal(attempts.resolve(changed), newId);

  const pendingVersion = attempts.captureContext();
  assert.equal(attempts.resetAfterSuccess({ id: newId }), true);
  assert.equal(attempts.resetAfterSuccess({ id: newId }), false);
  assert.equal(attempts.resolve({ ...changed, contextVersion: pendingVersion }), null);
  assert.notEqual(attempts.resolve(changed), newId);
});

test('identity validation fails without reflecting invalid values or losing a valid pending attempt', () => {
  const { attempts, generated } = tracker();
  const validId = attempts.resolve(original);
  for (const field of Object.keys(original)) {
    assert.throws(() => attempts.resolve({ ...original, [field]: 'private-invalid-value' }), {
      message: 'Identidade da tentativa de importação inválida.',
    });
  }
  assert.equal(attempts.resolve(original), validId);
  assert.equal(generated(), 1);
});
