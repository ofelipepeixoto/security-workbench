import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Render the actual client components, without a browser, provider, D1, or network.
// Effects and browser interactions require the separate runtime/browser checks.
const webRoot = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(join(webRoot, '.ui-render-'));
const files = ['app/workbench.tsx', 'app/access-panel.tsx', 'components/operational-info.tsx', 'components/demo-workbench.ts'];
let Workbench, WorkbenchListState, RunMetadata, RunEvidenceDetails, RunOutcome, RunCoverage;
try {
  for (const file of files) {
    const source = await readFile(join(webRoot, file), 'utf8');
    const result = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      transformers: { after: [context => node => ts.visitNode(node, function visit(current) {
        if (ts.isImportDeclaration(current) && ts.isStringLiteral(current.moduleSpecifier) && current.moduleSpecifier.text.startsWith('.') && !current.moduleSpecifier.text.endsWith('.mjs')) {
          return ts.factory.updateImportDeclaration(current, current.modifiers, current.importClause, ts.factory.createStringLiteral(current.moduleSpecifier.text + '.mjs'), current.attributes);
        }
        return ts.visitEachChild(current, visit, context);
      })] },
    });
    const target = join(output, file.replace(/\.tsx?$/, '.mjs'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, result.outputText);
  }
  await mkdir(join(output, 'lib'), { recursive: true });
  await copyFile(join(webRoot, 'lib/rea-import-attempt.mjs'), join(output, 'lib/rea-import-attempt.mjs'));
  const components = await import(pathToFileURL(join(output, 'app/workbench.mjs')).href);
  Workbench = components.default; WorkbenchListState = components.WorkbenchListState; RunMetadata = components.RunMetadata; RunEvidenceDetails = components.RunEvidenceDetails; RunOutcome = components.RunOutcome; RunCoverage = components.RunCoverage;
} finally {
  await rm(output, { recursive: true, force: true });
}
const filters = { q: '', project: '', status: '', kind: '', from: '', to: '', before: '', after: '', run: '' };
function render(view, props = {}) {
  return renderToStaticMarkup(React.createElement(Workbench, { signedIn: false, name: 'Visitante', githubReady: false, initialView: view, initialFilters: filters, ...props }));
}

test('public journeys render their own heading and preserve explicit fictitious navigation', () => {
  for (const [view, title] of Object.entries({ dashboard: 'Visão geral', projects: 'Projetos', findings: 'Achados', runs: 'Análises', compare: 'Comparar análises', reports: 'Relatórios', profile: 'Perfil', account: 'Conta e acesso', help: 'Ajuda', onboarding: 'Do escopo à revisão' })) {
    const html = render(view);
    assert.match(html, new RegExp('<h1>' + title + '</h1>'));
    assert.match(html, /Dados fictícios/);
    const paths = [...html.matchAll(/href="(\/[^"]*)"/g)].map(match => match[1]);
    assert.ok(paths.length >= 9, view);
    for (const path of paths) if (!path.startsWith('/access')) assert.match(path, /[?&](?:amp;)?demo=1/, view + ': ' + path);
  }
});

test('anonymous deep link to a real-looking run cannot become an example result', () => {
  const html = render('detail', { initialRunId: '11111111-1111-4111-8111-111111111111' });
  assert.match(html, /Esta análise não faz parte do exemplo/);
  assert.match(html, /Entrar com GitHub/);
  assert.doesNotMatch(html, /src\/config\.ts/);
  assert.doesNotMatch(html, /Salvar revisão/);
});

test('detail and Markdown preview use the selected fictional analysis with explicit limits', () => {
  const detail = render('detail', { initialRunId: 'example-run' });
  assert.match(detail, /Cobertura parcial|Concluída · parcial/);
  assert.match(detail, /\[REDACTED\]/);
  assert.match(detail, /Salvar revisão/);
  assert.match(detail, /href="\/compare\?after=example-run&amp;before=example-before&amp;demo=1"/);
  const report = render('reports', { initialFilters: { ...filters, run: 'example-run' } });
  assert.match(report, /EXEMPLO FICTÍCIO/);
  assert.match(report, /Nenhum repositório foi analisado/);
  assert.match(report, /Baixar Markdown/);
});

test('filters actually limit findings and runs rather than only changing form labels', () => {
  const unknown = render('findings', { initialFilters: { ...filters, q: 'nonexistent-fixture-path' } });
  assert.match(unknown, /Nenhuma detecção nesta seleção/);
  assert.doesNotMatch(unknown, /Revisar evidência/);
  const kind = render('findings', { initialFilters: { ...filters, kind: 'possible-secret' } });
  assert.match(kind, /src\/config\.ts/);
  assert.doesNotMatch(kind, /\.github\/workflows\/ci\.yml/);
  const failed = render('runs', { initialFilters: { ...filters, status: 'failed' } });
  assert.match(failed, /Nenhuma análise nesta seleção/);
  const period = render('runs', { initialFilters: { ...filters, from: '2026-10-18' } });
  assert.match(period, /Nenhuma análise nesta seleção/);
});

test('registered projects and GitHub integration have separate, honest states', () => {
  const projects = render('projects');
  assert.match(projects, /não são importados automaticamente/);
  assert.match(projects, /Adicionar projeto/);
  assert.match(projects, /Importar REA local/);
  const account = render('account');
  assert.match(account, /Não integrada/);
  assert.match(account, /Não habilitado/);
  assert.doesNotMatch(account, /<button[^>]*>Instalar/);
  const profile = render('profile');
  assert.doesNotMatch(profile, /<input|<textarea/);
  assert.doesNotMatch(render('onboarding'), /type="tel"|type="email"|type="password"/);
});

test('owner loading state never falls back to fictional projects or a false zero review count', () => {
  const html = render('dashboard', { signedIn: true, name: 'Operador de teste' });
  assert.match(html, /Carregando projetos e histórico/);
  assert.doesNotMatch(html, /exemplo-autorizado/);
  assert.doesNotMatch(html, /Dados fictícios guardados/);
  assert.match(html, /Carregando decisões registradas/);
});

test('every operational route has a direct server entry point including the report path', async () => {
  for (const route of ['dashboard', 'projects', 'findings', 'runs', 'runs/[runId]', 'compare', 'reports', 'profile', 'account', 'help', 'onboarding', 'settings']) {
    const source = await readFile(join(webRoot, 'app', route, 'page.tsx'), 'utf8');
    assert.match(source, /WorkbenchPage/);
    assert.match(source, /force-dynamic/);
  }
});

// Regression: a failed initial GET used to become an empty project list after navigation.
test('a failed or pending list cannot render the successful empty state', () => {
  for (const state of [{ loading: true, unavailable: false }, { loading: false, unavailable: true }]) {
    const html = renderToStaticMarkup(React.createElement(WorkbenchListState, state, 'Nenhum projeto cadastrado'));
    assert.doesNotMatch(html, /Nenhum projeto/);
    assert.match(html, /Carregando lista|Não foi possível carregar a lista/);
  }
  const success = renderToStaticMarkup(React.createElement(WorkbenchListState, { loading: false, unavailable: false }, 'Nenhum projeto cadastrado'));
  assert.match(success, /Nenhum projeto cadastrado/);
});

test('REA statistics and commit remain declared rather than presented as acquired files', () => {
  const run = { id: 'import-fixture', source: 'rea-import', repo: 'fixture/example', project_id: 'fixture-project', status: 'complete', revision: 'a'.repeat(40), created_at: '2026-10-21T12:00:00Z', files_read: 1234, bytes_read: 3000000, partial: true, findings: [], digest: 'b'.repeat(64) };
  const meta = renderToStaticMarkup(React.createElement(RunMetadata, { run, demo: false }));
  assert.match(meta, /arquivos declarados/);
  assert.doesNotMatch(meta, /arquivos lidos/);
  const details = renderToStaticMarkup(React.createElement(RunEvidenceDetails, { run }));
  assert.match(details, /Commit declarado/);
  assert.match(details, /Digest declarado/);
  assert.match(details, /Bytes declarados/);
  assert.match(details, /JSON de até 1 MiB/);
  assert.doesNotMatch(details, /Até 20 arquivos/);
  assert.match(details, /não comprovam leitura/);
});

function importedRun(overrides = {}) {
  return { id: 'synthetic-import', source: 'rea-import', repo: 'fixture/example', project_id: 'synthetic-project', status: 'complete', revision: 'a'.repeat(40), created_at: '2026-10-22T00:00:00Z', files_read: 1, bytes_read: 342, partial: true, findings: [], digest: 'b'.repeat(64), ...overrides };
}
const component = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test('REA coverage separates received, imported and omitted counts with fixed reasons', () => {
  const run = importedRun({ provenance: { observations_seen: 7, observations_imported: 2, observations_omitted: 5, observations_omitted_by_reason: { unsupported_node_kind: 2, unsupported_location_kind: 3 }, native_findings_declared: 9 } });
  const html = component(RunCoverage, { run });
  assert.match(html, /<dt>Recebidas no artefato<\/dt><dd>7<\/dd>/);
  assert.match(html, /<dt>Importadas para revisão<\/dt><dd>2<\/dd>/);
  assert.match(html, /<dt>Não importadas<\/dt><dd>5<\/dd>/);
  assert.match(html, /Tipo de estrutura ainda não importado<\/span><b>2<\/b>/);
  assert.match(html, /Formato de localização ainda não importado<\/span><b>3<\/b>/);
  assert.match(html, /Recebidas não significa vulnerabilidades/);
  assert.doesNotMatch(html, /Limite de candidatos atingido/);
  const technical = component(RunEvidenceDetails, { run });
  assert.match(technical, /Achados declarados pelo REA<\/dt><dd>9/);
  assert.match(technical, /não equivale aos candidatos importados/);
});

test('legacy imports retain known counts without inventing imported totals or omission reasons', () => {
  const run = importedRun({ provenance: { observations_seen: 4, observations_omitted: 4 } });
  const html = component(RunCoverage, { run });
  assert.match(html, /Recebidas no artefato<\/dt><dd>4/);
  assert.match(html, /Não importadas<\/dt><dd>4/);
  assert.match(html, /Importadas para revisão<\/dt><dd><span class="not-recorded">Não registrado/);
  assert.match(html, /Motivos não registrados nesta importação/);
  assert.match(html, /não foram estimadas/);
  assert.doesNotMatch(html, /Tipo de estrutura ainda não importado|Observação repetida/);
  const outcome = component(RunOutcome, { run, demo: false });
  assert.match(outcome, /Nenhum candidato foi importado/);
  assert.match(outcome, /href="#analysis-coverage"/);
  assert.match(outcome, /ausência de candidatos não comprova segurança/);
});

test('the result prioritizes the first pending review and reflects existing human decisions', () => {
  const findings = ['false_positive', 'candidate', 'accepted_risk'].map((status, index) => ({ fingerprint: 'synthetic-' + index, status }));
  const run = importedRun({ findings });
  const html = component(RunOutcome, { run, demo: false, onExport: () => {}, compareHref: '/compare?before=one&after=two' });
  assert.match(html, /1 candidato aguarda sua revisão/);
  assert.match(html, /class="button primary" href="#synthetic-1"/);
  assert.match(html, /Revisar próximo candidato/);
  assert.match(html, /REA não foi executado na hospedagem/);
  const metadata = component(RunMetadata, { run, demo: false });
  assert.match(metadata, /1 a revisar · 2 revisados/);
  const reviewed = component(RunOutcome, { run: { ...run, findings: findings.map(finding => ({ ...finding, status: 'false_positive' })) }, demo: false, onExport: () => {} });
  assert.match(reviewed, /Revisões registradas para os candidatos/);
  assert.match(reviewed, /class="button primary"[^>]*>.*Baixar Markdown/);
  assert.doesNotMatch(reviewed, /Revisar próximo candidato/);
});

test('technical details are collapsed by default while preserving complete identity', () => {
  const run = importedRun({ provenance: { observations_seen: 0, observations_imported: 0, observations_omitted: 0, observations_omitted_by_reason: {} } });
  const html = component(RunEvidenceDetails, { run });
  assert.match(html, /<details><summary>Identidade e detalhes técnicos/);
  assert.doesNotMatch(html, /<details[^>]* open/);
  assert.match(html, new RegExp(run.revision));
  assert.match(html, new RegExp(run.digest));
  assert.match(component(RunCoverage, { run }), /Nenhuma omissão registrada nesta importação/);
});

test('review controls identify the candidate and local navigation leads to real sections', () => {
  const html = render('detail', { initialRunId: 'example-run' });
  for (const section of ['result', 'review', 'coverage', 'technical']) {
    assert.match(html, new RegExp('href="#analysis-' + section + '"'));
    assert.match(html, new RegExp('id="analysis-' + section + '"'));
  }
  for (const fingerprint of ['example-secret', 'example-workflow']) {
    assert.match(html, new RegExp('<label for="finding-decision-' + fingerprint + '"'));
    assert.match(html, new RegExp('<select id="finding-decision-' + fingerprint + '" aria-describedby="finding-help-' + fingerprint + '"'));
    assert.match(html, new RegExp('id="finding-help-' + fingerprint + '"'));
  }
});

test('unfinished analyses offer recovery without review or a completed result', () => {
  const run = importedRun({ status: 'running', findings: [], files_read: null });
  const html = component(RunOutcome, { run, demo: false, refreshHref: '/runs/synthetic-import', onExport: () => {} });
  assert.match(html, /A análise está em andamento/);
  assert.match(html, /Atualizar estado/);
  assert.doesNotMatch(html, /Revisar próximo candidato|Baixar Markdown|Nenhum candidato foi importado/);
  const metadata = component(RunMetadata, { run, demo: false });
  assert.match(metadata, /Ainda não disponível/);
  assert.doesNotMatch(metadata, /Nenhum candidato/);
});

test('missing findings are unavailable data rather than an empty successful result', () => {
  const run = importedRun({ findings: undefined });
  const html = component(RunOutcome, { run, demo: false, refreshHref: '/runs/synthetic-import' });
  assert.match(html, /Os candidatos não estão disponíveis neste registro/);
  assert.match(html, /Recarregar análise/);
  assert.doesNotMatch(html, /Nenhum candidato foi importado|ausência de candidatos/);
});
