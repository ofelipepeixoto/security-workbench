import { createWorkbenchRequestScope } from './workbench-request-scope.mjs';

/** The parent access epoch is checked synchronously, including responses whose
 * transport ignores AbortSignal. This module has no provider or credential. */
export function createContextualReviewRequestScope(captureAccess) {
  const scope = createWorkbenchRequestScope();
  return {
    open: () => scope.open(), close: () => scope.close(), invalidate: () => scope.invalidate(),
    begin() {
      const request = scope.begin();
      let external;
      try { external = captureAccess ? captureAccess() : () => true; } catch { external = () => false; }
      const isCurrent = () => {
        if (!request.isCurrent()) return false;
        try { return external() === true; } catch { return false; }
      };
      return { signal: request.signal, isCurrent, finish: request.finish,
        assertCurrent() { if (!isCurrent()) throw new DOMException('Contexto de acesso alterado.', 'AbortError'); } };
    },
  };
}

/** GET never authorizes generation itself. Only an explicit server flag with a
 * not_started state permits the one automatic POST for this run/access scope.
 * Unknown outcomes never trigger an automatic replay, including after timeout. */
export async function loadContextualReview(request, { read, generate, claimGeneration, apply, failure }) {
  let generating = false, prior;
  try {
    request.assertCurrent();
    const envelope = await read(request.signal);
    request.assertCurrent();
    if (!envelope || envelope.contextual_review?.schema !== 'security-workbench.contextual-review/v1') throw new Error('O estado da revisão contextual não pôde ser conferido.');
    apply(envelope.contextual_review);
    if (envelope.generation_allowed !== true || envelope.contextual_review.state !== 'not_started') return;
    if (!claimGeneration()) {
      apply({ ...envelope.contextual_review, state: 'unknown', items: [] });
      return;
    }
    request.assertCurrent();
    generating = true; prior = envelope.contextual_review;
    apply({ ...prior, state: "pending", items: [] });
    const result = await generate(request.signal);
    request.assertCurrent();
    if (result?.contextual_review?.schema !== 'security-workbench.contextual-review/v1') throw new Error('A geração não teve resposta confirmada. Consulte o estado antes de outra tentativa.');
    apply(result.contextual_review);
  } catch (cause) { if (request.isCurrent()) { if (generating) apply({ ...prior, state: "unknown", items: [] }); failure(cause); } }
}
