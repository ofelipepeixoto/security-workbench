const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const REPORT_DIGEST = /^[0-9a-f]{64}$/i;

function normalized(value, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error('Identidade da tentativa de importação inválida.');
  }
  return value.toLowerCase();
}

/**
 * Keeps one import attempt in component memory, never the report or its bytes.
 * Capture the context before asynchronous file reading/hashing. Invalidate it
 * whenever the project, commit, selected file or import form changes. A failed
 * request must not invalidate the attempt: a retry needs the same server key.
 */
export function newReaImportAttemptTracker({ createRequestId = () => globalThis.crypto.randomUUID() } = {}) {
  let contextVersion = 0;
  /** @type {{ projectId: string, commitSha: string, reportDigest: string, id: string } | null} */
  let current = null;

  function invalidate() {
    contextVersion += 1;
    current = null;
  }

  return Object.freeze({
    captureContext() {
      return contextVersion;
    },
    invalidate,
    /** @param {{ projectId: string, commitSha: string, reportDigest: string, contextVersion?: number }} identity */
    resolve({ projectId, commitSha, reportDigest, contextVersion: captured = contextVersion }) {
      // An old digest completion must not resurrect or replace a newer context.
      if (captured !== contextVersion) return null;

      projectId = normalized(projectId, UUID);
      commitSha = normalized(commitSha, COMMIT_SHA);
      reportDigest = normalized(reportDigest, REPORT_DIGEST);
      if (current?.projectId === projectId && current.commitSha === commitSha && current.reportDigest === reportDigest) {
        return current.id;
      }

      const id = normalized(createRequestId(), UUID);
      current = { projectId, commitSha, reportDigest, id };
      return id;
    },
    /** @param {{ id: string }} result */
    resetAfterSuccess({ id }) {
      // A delayed success for an old operation cannot clear the newer attempt.
      if (!current || current.id !== id) return false;
      invalidate();
      return true;
    },
  });
}
