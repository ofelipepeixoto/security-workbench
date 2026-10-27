import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { createContextualReviewRequestScope, loadContextualReview } from '../lib/contextual-review-request.mjs';

// SSR and synthetic transport/lifecycle contracts only. No browser or provider.
const webRoot = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(join(webRoot, '.contextual-ui-'));
let ContextualReview;
try {
  for (const file of ['lib/contextual-review-request.mjs', 'lib/workbench-request-scope.mjs']) {
    const target = join(output, file); await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(join(webRoot, file)));
  }
  const target = join(output, 'components/contextual-review.mjs'); await mkdir(dirname(target), { recursive: true });
  const source = await readFile(join(webRoot, 'components/contextual-review.tsx'), 'utf8');
  await writeFile(target, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText);
  ({ ContextualReview } = await import(pathToFileURL(target).href));
} finally { await rm(output, { recursive: true, force: true }); }

const revision = 'a'.repeat(40), findingId = 'b'.repeat(20);
const review = (state, changes = {}) => ({ schema: 'security-workbench.contextual-review/v1', method: 'model-contextual', state,
  generation: 'automatic', policy_version: 'contextual/1.0', revision, items: [], limitations: [], ...changes });
const render = (value, changes = {}) => renderToStaticMarkup(React.createElement(ContextualReview, { review: value, ...changes }));
const envelope = (value, generation_allowed = false) => ({ contextual_review: value, generation_allowed });
function scope() { const value = createContextualReviewRequestScope(); value.open(); return value; }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('disabled contextual UI states zero-budget default and never pretends portable prompt or rules invoked a model', () => {
  const html = render(review('disabled'));
  assert.match(html, /Revisão contextual com IA/);
  assert.match(html, /Camada separada do scanner e da orientação por regras/);
  assert.match(html, /IA contextual desligada neste ambiente/);
  assert.match(html, /orçamento zero e chamadas bloqueadas/);
  assert.match(html, /aprovação específica do projeto, modelo, dados e orçamento/);
  assert.doesNotMatch(html, /Orientação contextual disponível|<button|<form|Chave API|sk-/);
});

test('unknown contextual outcomes explain reservation and offer only state recovery', () => {
  const html = render(review('unknown'), { onRefresh() {} });
  assert.match(html, /Resultado da chamada ainda não confirmado/);
  assert.match(html, /pode ter consumido o orçamento reservado/);
  assert.match(html, /Não será repetida automaticamente/);
  assert.match(html, /Atualizar estado sem solicitar nova geração/);
  assert.doesNotMatch(html, /Gerar novamente|Tentar IA novamente|Correção aplicada|Falha sem custo/);
});

test('model guidance preserves decisions and displays traceable citations and unexecuted tests as escaped text', () => {
  const hostile = '<img src=x onerror="alert(1)"><script>steal()</script>';
  const html = render(review('ready', { model: 'approved-fixture-model', generated_at: '2026-10-26T12:00:00.000Z', expires_at: '2026-10-27T12:00:00.000Z',
    context_manifest: [{ excerpt_id: 'excerpt-1', path: 'src/synthetic-fixture.js', start_line: 4, end_line: 8, revision, finding_ids: [findingId], source_projection: 'redacted_excerpt', blob_sha: 'c'.repeat(40) }],
    items: [{ finding_id: findingId, decision_status: 'accepted_risk', hypothesis: hostile, counterpoint: 'A sintaxe pode representar fixture.', limitations: ['Contexto parcial.'], recommendations: ['Conferir o contexto autorizado.'], proposed_tests: ['Propor regressão para o caso.'], citations: [{ finding_id: findingId, excerpt_id: 'excerpt-1', revision }] }] }));
  assert.match(html, /Orientação contextual disponível/);
  assert.match(html, /Decisão humana preservada: <strong>Risco aceito/);
  assert.match(html, /Referências do contexto autorizado/);
  assert.match(html, /excerpt-1/);
  assert.match(html, /src\/synthetic-fixture\.js/);
  assert.match(html, /linhas 4–8/);
  assert.match(html, /Blob de referência/);
  assert.match(html, new RegExp(revision));
  assert.match(html, /Testes propostos · não executados pelo modelo/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img|<script|href="javascript:|Aplicar patch|Aprovar geração/);
  assert.match(html, /prazo acima limita a disponibilidade do texto no Workbench/);
  assert.match(html, /não comprova exclusão física imediata/);
});

test('insufficient, deleted and unavailable states cannot impersonate a clean completed repository', () => {
  for (const state of ['insufficient_context', 'deleted', 'unavailable']) {
    const html = render(review(state));
    assert.doesNotMatch(html, /Orientação contextual disponível|Código seguro|Nenhum problema encontrado|Correções verificadas/);
    assert.match(html, /Não|não/);
  }
});

test('an unavailable response is not presented as a confirmed disabled configuration or model result', () => {
  const html = render(undefined, { error: 'synthetic-private-error' });
  assert.match(html, /Revisão contextual indisponível/);
  assert.match(html, /Não foi possível confirmar o estado/);
  assert.doesNotMatch(html, /IA contextual desligada neste ambiente|Orientação contextual disponível|synthetic-private-error/);
});

test('a citation cannot display a location belonging to another finding or commit', () => {
  const value = review('ready', { context_manifest: [{ excerpt_id: 'excerpt-1', path: 'must-not-render.js', start_line: 4, end_line: 8, revision: 'c'.repeat(40), finding_ids: [findingId], source_projection: 'redacted_excerpt' }],
    items: [{ finding_id: findingId, decision_status: 'candidate', hypothesis: 'Conferir o contexto.', counterpoint: 'Pode ser fixture.', limitations: [], recommendations: [], proposed_tests: [], citations: [{ finding_id: findingId, excerpt_id: 'excerpt-1', revision }] }] });
  for (const change of ['revision', 'finding']) {
    if (change === 'finding') { value.context_manifest[0].revision = revision; value.context_manifest[0].finding_ids = ['d'.repeat(20)]; }
    const html = render(value);
    assert.doesNotMatch(html, /must-not-render\.js|linhas 4–8/);
    assert.match(html, /Localização não disponível neste registro/);
  }
});

test('automatic generation requires the server flag and not_started state; GET is otherwise read only', async () => {
  for (const [state, allowed] of [['disabled', false], ['not_started', false], ['pending', true], ['unknown', true], ['ready', true], ['unavailable', true]]) {
    const request = scope().begin(), applied = [], calls = [];
    await loadContextualReview(request, { read: async () => { calls.push('GET'); return envelope(review(state), allowed); },
      generate: async () => { calls.push('POST'); return envelope(review('ready')); }, claimGeneration: () => true,
      apply: value => applied.push(value.state), failure: cause => { throw cause; } });
    assert.deepEqual(calls, ['GET']); assert.deepEqual(applied, [state]); request.finish();
  }
});

test('an approved not_started generation issues a single automatic POST and does not require human approval', async () => {
  const holder = scope(), calls = [], applied = []; let claimed = false;
  const execute = request => loadContextualReview(request, { read: async () => { calls.push('GET'); return envelope(review('not_started'), true); },
    generate: async () => { calls.push('POST'); return envelope(review('ready')); },
    claimGeneration() { if (claimed) return false; claimed = true; return true; }, apply: value => applied.push(value.state), failure: cause => { throw cause; } });
  const first = holder.begin(); await execute(first); first.finish();
  const second = holder.begin(); await execute(second); second.finish();
  assert.deepEqual(calls, ['GET', 'POST', 'GET']);
  assert.deepEqual(applied, ['not_started', 'pending', 'ready', 'not_started', 'unknown']);
});

test('lost generation reply becomes unknown and cannot trigger a blind paid retry', async () => {
  const holder = scope(), calls = [], states = [], errors = []; let claimed = false;
  const execute = request => loadContextualReview(request, { read: async () => { calls.push('GET'); return envelope(review('not_started'), true); },
    generate: async () => { calls.push('POST'); throw new Error('synthetic transport timeout'); },
    claimGeneration() { if (claimed) return false; claimed = true; return true; }, apply: value => states.push(value.state), failure: cause => errors.push(cause) });
  const first = holder.begin(); await execute(first); first.finish();
  assert.deepEqual(states, ['not_started', 'pending', 'unknown']); assert.equal(errors.length, 1);
  const next = holder.begin(); await execute(next); next.finish();
  assert.deepEqual(calls, ['GET', 'POST', 'GET']);
});

test('logout and A/B access changes discard delayed contextual replies before rendering or generation', async () => {
  for (const stage of ['read', 'generate']) {
    let epoch = 0; const holder = createContextualReviewRequestScope(() => { const captured = epoch; return () => captured === epoch; }); holder.open();
    const request = holder.begin(), pending = deferred(), applied = [], calls = [];
    const execution = loadContextualReview(request, { read: async () => { calls.push('GET'); return stage === 'read' ? pending.promise : envelope(review('not_started'), true); },
      generate: async () => { calls.push('POST'); return pending.promise; }, claimGeneration: () => true, apply: value => applied.push(value.state), failure: cause => { throw cause; } });
    await Promise.resolve(); await Promise.resolve();
    epoch += 1; holder.invalidate(); // The transport deliberately ignores abort.
    const before = [...applied]; pending.resolve(envelope(review('ready', { model: 'synthetic-account-a-model' }), true));
    await execution;
    assert.deepEqual(applied, before);
    if (stage === 'read') assert.deepEqual(calls, ['GET']);
    assert.equal(request.isCurrent(), false); request.finish();
  }
});

test('an unverifiable access snapshot cannot read or apply contextual data', async () => {
  const holder = createContextualReviewRequestScope(() => { throw new Error('missing session'); }); holder.open();
  const request = holder.begin(), calls = [];
  await loadContextualReview(request, { read: async () => { calls.push('GET'); return envelope(review('ready')); }, generate: async () => {},
    claimGeneration: () => true, apply: () => calls.push('APPLY'), failure: () => calls.push('FAILURE') });
  assert.deepEqual(calls, []); request.finish();
});
