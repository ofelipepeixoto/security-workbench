import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { buildReviewGuidance } from '../lib/review-advisor.mjs';

// Rendering contracts only: no browser, provider, analysis or model invocation.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(join(root, '.guidance-render-'));
let AutomaticGuidance;
try {
  const source = await readFile(join(root, 'components/automatic-guidance.tsx'), 'utf8');
  const target = join(output, 'automatic-guidance.mjs');
  await writeFile(target, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText);
  ({ AutomaticGuidance } = await import(pathToFileURL(target).href));
} finally { await rm(output, { recursive: true, force: true }); }

function guidance(overrides = {}) {
  return {
    schema: 'security-workbench.review-advisor/v1', policy_version: 'static-guidance/1.0', method: 'deterministic-rules', generation: 'automatic', state: 'ready',
    context: { source: 'github-app', revision: 'c'.repeat(40), revision_state: 'verified', coverage: 'partial', source_content: 'not_available' },
    summary: { supported: 1, insufficient_context: 0, unsupported: 0, omitted: 0 }, limits: { findings: 100 },
    items: [{ finding_id: 'a'.repeat(20), evidence_refs: ['src/fixture.js:4'], rule_id: 'SWB-TEXT-001/1', advisor_rule: 'STATIC-TEXT-001/1', state: 'supported', priority: 'triage-first', priority_reason: 'Conferir se o marcador é apenas sintético.', summary: 'Verifique o contexto da possível credencial.', decision_status: 'candidate', false_positive_checks: ['Conferir se o marcador é uma fixture inerte.'], actions: ['Revisar o contexto autorizado sem copiar valores.'], verification: [{ instruction: 'Propor uma regressão para a redação.', expected: 'Nenhum segredo aparece no relatório.', status: 'not_executed' }], uncertainty: ['O conteúdo completo do arquivo não está disponível.'] }],
    ...overrides,
  };
}
const render = (value, findingId) => renderToStaticMarkup(React.createElement(AutomaticGuidance, { guidance: value, findingId }));

test('automatic guidance needs no generation action and distinguishes rules, evidence, model and unexecuted checks', () => {
  const html = render(guidance());
  assert.match(html, /Orientação automática/);
  assert.match(html, /gerado sem revisão humana prévia/);
  assert.match(html, /Por regras · sem IA/);
  assert.match(html, /Nenhum modelo de IA foi chamado/);
  assert.match(html, /não aplica correções nem altera decisões humanas/);
  assert.match(html, /Revisão contextual por modelo: não executada/);
  assert.match(html, /não recebeu|Não recebeu/);
  assert.match(html, /static-guidance\/1\.0/);
  assert.match(html, /SWB-TEXT-001\/1/);
  assert.match(html, /src\/fixture\.js:4/);
  assert.match(html, /Verificações sugeridas · não executadas/);
  assert.match(html, /Resultado esperado: Nenhum segredo/);
  assert.match(html, new RegExp('href="#' + 'a'.repeat(20) + '"'));
  assert.doesNotMatch(html, /<button|<form|Testes aprovados|Correção aplicada|Aprovar geração/);
});

test('source identity, declared revision and partial coverage remain explicit', () => {
  const value = guidance(); value.context = { ...value.context, source: 'rea-import', revision_state: 'declared' };
  const html = render(value);
  assert.match(html, /REA local importado/);
  assert.match(html, new RegExp('c'.repeat(40)));
  assert.match(html, /Declarado · vínculo não verificado/);
  assert.doesNotMatch(html, /Vínculo verificado na aquisição/);
  assert.match(html, /<dt>Cobertura<\/dt><dd>Parcial/);
});

test('insufficient and unsupported context cannot become a clean or contextual model result', () => {
  const value = guidance({ state: 'insufficient_context' });
  value.items[0] = { ...value.items[0], state: 'insufficient_context', advisor_rule: null, priority: 'unavailable', actions: [], verification: [] };
  const html = render(value);
  assert.match(html, /Falta contexto para recomendar uma mudança específica/);
  assert.match(html, /Contexto insuficiente para uma mudança específica/);
  assert.match(html, /Prioridade não determinada/);
  assert.match(html, /O conteúdo completo do arquivo não está disponível/);
  assert.doesNotMatch(html, /Resultado limpo|Código seguro|Revisão contextual concluída|Próximos passos sugeridos|Como verificar uma proposta/);
  value.items[0].state = 'unsupported';
  assert.match(render(value), /Sem regra de orientação para este candidato/);
});

test('empty, unavailable and legacy records do not invent candidates or a completed analysis', () => {
  const empty = render(guidance({ state: 'empty', items: [], summary: { supported: 0, insufficient_context: 0, unsupported: 0, omitted: 0 } }));
  assert.match(empty, /Nenhum candidato disponível para orientar/);
  assert.match(empty, /ausência de candidatos não comprova segurança/);
  assert.doesNotMatch(empty, /Conferir orientações, evidências e limites por candidato|src\/fixture/);
  for (const value of [undefined, null, guidance({ state: 'unavailable', items: [] })]) {
    const html = render(value);
    assert.match(html, /orientação não está disponível para este registro/);
    assert.doesNotMatch(html, /Gerando|Análise concluída|Código seguro|src\/fixture/);
  }
});

test('a finding block only includes its associated evidence and preserves an existing human decision', () => {
  const value = guidance(); value.items[0].decision_status = 'accepted_risk';
  value.items.push({ ...value.items[0], finding_id: 'b'.repeat(20), evidence_refs: ['other/fixture.js:90'], summary: 'Other candidate' });
  const html = render(value, 'a'.repeat(20));
  assert.match(html, /Risco aceito/);
  assert.match(html, /src\/fixture\.js:4/);
  assert.doesNotMatch(html, /other\/fixture|Other candidate|id="analysis-guidance"/);
  const missing = render(value, 'missing');
  assert.match(missing, /Não há orientação vinculada a este candidato/);
  assert.doesNotMatch(missing, /src\/fixture|other\/fixture/);
});

test('guidance data stays escaped text rather than source HTML or executable evidence links', () => {
  const value = guidance();
  const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  value.items[0] = { ...value.items[0], summary: hostile, evidence_refs: ['javascript:alert(3)'], false_positive_checks: [hostile], actions: [hostile], uncertainty: [hostile] };
  const html = render(value);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<img|<script|href="javascript:/);
});

test('omitted candidates remain a visible coverage limit and do not disappear into zero counts', () => {
  const html = render(guidance({ summary: { supported: 1, insufficient_context: 2, unsupported: 3, omitted: 7 } }));
  assert.match(html, /1 com orientação por regra/);
  assert.match(html, /2 com contexto insuficiente/);
  assert.match(html, /3 sem regra de orientação/);
  assert.match(html, /7 candidatos não aparecem neste bloco por limite/);
  assert.match(html, /até 100 candidatos/);
  assert.match(html, /não significa ausência de outros problemas/);
});

test('the real deterministic advisor output renders without invented context or a new human decision', () => {
  const value = buildReviewGuidance({ status: 'complete', source: 'github-app', repository_id: 101, revision: 'd'.repeat(40), verified_revision: true, partial: true, findings: [{ fingerprint: 'e'.repeat(20), kind: 'possible-secret', rule_id: 'SWB-TEXT-001/1', path: 'src/fixture.js', line: 4, status: 'false_positive' }] });
  const html = render(value);
  assert.match(html, /Falso positivo/);
  assert.match(html, /Preservar o falso positivo registrado/);
  assert.match(html, /SWB-ADVISE-SECRET\/1/);
  assert.match(html, new RegExp('finding:' + 'e'.repeat(20)));
  assert.match(html, /1 com orientação por regra/);
  assert.match(html, /Revisão contextual por modelo: não executada/);
  assert.doesNotMatch(html, /<button|<form|Correção aplicada|Reclassificado/);
});
