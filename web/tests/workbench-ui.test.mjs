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
const files = ['app/workbench.tsx', 'app/access-panel.tsx', 'components/operational-info.tsx', 'components/demo-workbench.ts', 'components/github-catalog.tsx', 'components/github-catalog-controller.tsx'];
let Workbench, WorkbenchListState, RunMetadata, RunEvidenceDetails, RunOutcome, RunCoverage, RunsTable, GitHubCatalog, CatalogJobStatus, filterCatalogRepositories, catalogFailureScope;
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
  RunsTable = components.RunsTable;
  const catalog = await import(pathToFileURL(join(output, 'components/github-catalog.mjs')).href);
  GitHubCatalog = catalog.GitHubCatalog; CatalogJobStatus = catalog.CatalogJobStatus; filterCatalogRepositories = catalog.filterCatalogRepositories;
  catalogFailureScope = (await import(pathToFileURL(join(output, 'components/github-catalog-controller.mjs')).href)).catalogFailureScope;
} finally {
  await rm(output, { recursive: true, force: true });
}
const filters = { q: '', project: '', status: '', kind: '', from: '', to: '', before: '', after: '', run: '' };
function render(view, props = {}) {
  return renderToStaticMarkup(React.createElement(Workbench, { signedIn: false, name: 'Visitante', githubReady: false, initialView: view, initialFilters: filters, ...props }));
}

test('public journeys render their own heading and preserve explicit fictitious navigation', () => {
  for (const [view, title] of Object.entries({ dashboard: 'Visão geral', projects: 'Projetos', repositories: 'Repositórios GitHub', findings: 'Achados', runs: 'Análises', compare: 'Comparar análises', reports: 'Relatórios', profile: 'Perfil', account: 'Conta e acesso', help: 'Ajuda', onboarding: 'Do escopo à revisão' })) {
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
  assert.match(account, /Consultar estado no catálogo/);
  assert.match(account, /Não habilitado/);
  assert.doesNotMatch(account, /<button[^>]*>Instalar/);
  const profile = render('profile');
  assert.doesNotMatch(profile, /<input|<textarea/);
  assert.doesNotMatch(render('onboarding'), /type="tel"|type="email"|type="password"/);
});

test('owner loading state never falls back to fictional projects or a false zero review count', () => {
  const html = render('dashboard', { signedIn: true, name: 'Operador de teste' });
  assert.match(html, /Carregando projetos e histórico da sua conta/);
  assert.doesNotMatch(html, /exemplo-autorizado/);
  assert.doesNotMatch(html, /Dados fictícios guardados/);
  assert.match(html, /Carregando decisões registradas/);
});

test('every operational route has a direct server entry point including the report path', async () => {
  for (const route of ['dashboard', 'projects', 'repositories', 'findings', 'runs', 'runs/[runId]', 'compare', 'reports', 'profile', 'account', 'help', 'onboarding', 'settings']) {
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

test('GitHub rate limiting explains the shared public quota and safe recovery', () => {
  const run = importedRun({ source: 'github-public', status: 'failed', failure_code: 'github_rate_limited', findings: [] });
  const html = component(RunOutcome, { run, demo: false, refreshHref: '/runs/synthetic-failed', onExport: () => {} });
  assert.match(html, /limite de consultas públicas do GitHub foi atingido/);
  assert.match(html, /cota é compartilhada por IP/);
  assert.match(html, /Aguarde e consulte o histórico antes de tentar novamente/);
  assert.doesNotMatch(html, /Nenhum candidato|Baixar Markdown|Revisar próximo candidato/);
});

test('acquisition timeout and generic failure never become a clean result or an invented cause', () => {
  const renderFailure = failure_code => component(RunOutcome, { run: importedRun({ source: 'github-public', status: 'failed', failure_code, findings: [] }), demo: false });
  const timeout = renderFailure('acquisition_timeout');
  assert.match(timeout, /cobertura não foi concluída/);
  assert.match(timeout, /não representa uma análise sem achados/);
  assert.doesNotMatch(timeout, /Nenhum candidato|cota é compartilhada/);
  const generic = renderFailure('acquisition_failed');
  assert.match(generic, /A causa não foi confirmada/);
  assert.match(generic, /Consulte o histórico antes de tentar novamente/);
  assert.doesNotMatch(generic, /Nenhum candidato|cota é compartilhada|ultrapassou o tempo limite/);
  // Legacy/unknown failure codes must not acquire a diagnosis retroactively.
  assert.doesNotMatch(renderFailure('acquisition'), /cota é compartilhada|ultrapassou o tempo limite/);
  assert.doesNotMatch(renderFailure('toString'), /cota é compartilhada|ultrapassou o tempo limite/);
});

const noCatalogActions = Object.fromEntries(['connect', 'disconnect', 'refresh', 'chooseInstallation', 'moreInstallations', 'moreRepositories', 'filter', 'select', 'revision', 'prepare', 'confirm', 'enqueue', 'clearSelection', 'refreshJob', 'cancelJob'].map(name => [name, () => {}]));
const catalogLimits = { files: 20, bytes: 2097152, fileBytes: 262144, deadlineMs: 45000 };
const syntheticRepository = { id: 101, name: 'fixture-private', full_name: 'synthetic-owner/fixture-private', owner: { login: 'synthetic-owner' }, private: true, default_branch: 'main', language: 'JavaScript', archived: false, installation_id: 11, permissions: { pull: true } };
function catalogModel(changes = {}) {
  return {
    demo: false, status: { enabled: true, connection: { state: 'connected' }, jobs_enabled: false, limits: catalogLimits }, statusLoading: false, error: '', busy: false,
    installations: { items: [{ id: 11, account: { login: 'synthetic-owner', type: 'User' }, suspended_at: null, repository_selection: 'selected' }], state: 'loaded', page: 1, nextPage: null, complete: true, syncedAt: '2026-10-22T12:00:00Z' },
    repositories: { items: [syntheticRepository], state: 'loaded', page: 1, nextPage: null, complete: true, syncedAt: '2026-10-22T12:00:00Z' },
    installationId: 11, filters: { q: '', visibility: '', archived: '', language: '' }, selection: null, job: null, pollingPaused: false, ...changes,
  };
}
const renderCatalog = model => component(GitHubCatalog, { model, actions: noCatalogActions });

test('the disabled pilot and public demo never expose a supplied private repository or operational controls', () => {
  const disabled = catalogModel(); disabled.status.enabled = false;
  for (const model of [disabled, catalogModel({ demo: true })]) {
    const html = renderCatalog(model);
    assert.doesNotMatch(html, /synthetic-owner|fixture-private|Conectar repositórios|Solicitar análise limitada|Desconectar repositórios/);
    assert.match(html, /ativação controlada|não é simulado na demonstração/);
  }
  assert.match(render('repositories'), /O catálogo real não é simulado/);
});

test('connection states are distinct and none treats OAuth login as repository authorization', () => {
  const expected = { not_connected: 'Conecte o acesso aos repositórios', expired: 'A conexão com os repositórios expirou', revoked: 'O acesso aos repositórios foi revogado', not_configured: 'GitHub App ainda não configurada' };
  for (const [state, title] of Object.entries(expected)) {
    const model = catalogModel(); model.status.connection.state = state;
    const html = renderCatalog(model);
    assert.match(html, new RegExp(title));
    assert.doesNotMatch(html, /fixture-private|Escolher repositório/);
    if (state === 'not_configured') assert.doesNotMatch(html, /Conectar repositórios/);
  }
  const suspended = catalogModel(); suspended.installations.items[0].suspended_at = '2026-10-22T12:00:00Z';
  assert.match(renderCatalog(suspended), /instalação está suspensa/);
  assert.doesNotMatch(renderCatalog(suspended), /Escolher repositório/);
});

test('catalog loading and failures never turn into a successful empty list', () => {
  for (const state of ['loading', 'error']) {
    const model = catalogModel(); model.repositories = { ...model.repositories, items: [], state };
    const html = renderCatalog(model);
    assert.match(html, /Carregando repositórios|consulta dos repositórios falhou/);
    assert.doesNotMatch(html, /Nenhum repositório autorizado retornado|Nenhum repositório nesta página/);
  }
  const empty = catalogModel(); empty.installations.items = []; empty.installationId = null;
  const html = renderCatalog(empty);
  assert.match(html, /Nenhuma instalação acessível foi retornada/);
  assert.match(html, /possíveis aprovações/);
  assert.doesNotMatch(html, /Conexão aguardando aprovação/);
});

test('catalog filters apply to loaded pages and pagination never claims a complete global search', () => {
  const model = catalogModel(); model.repositories.nextPage = 2; model.repositories.complete = false;
  model.repositories.items.push({ ...syntheticRepository, id: 102, full_name: 'synthetic-org/archived-public', private: false, archived: true, language: 'Python' });
  const filtered = filterCatalogRepositories(model.repositories.items, { q: 'synthetic-org', visibility: 'public', archived: 'yes', language: 'Python' });
  assert.deepEqual(filtered.map(repository => repository.id), [102]);
  const html = renderCatalog(model);
  assert.match(html, /Sincronização incompleta/);
  assert.match(html, /somente as páginas já carregadas/);
  assert.match(html, /Carregar próxima página/);
  assert.match(html, /Proprietário: synthetic-owner · ID 101 · branch padrão: main/);
  assert.match(html, /Privado · JavaScript/);
});

test('the selected repository and fixed commit need explicit confirmation with server limits', () => {
  const model = catalogModel();
  model.selection = { repository: syntheticRepository, revisionInput: '', confirmed: false, prepared: { project: { id: 'synthetic-project' }, repository: syntheticRepository, revision: 'c'.repeat(40), limits: catalogLimits } };
  const html = renderCatalog(model);
  assert.match(html, /Selecionar ou listar não inicia uma análise/);
  assert.match(html, new RegExp('<code>' + 'c'.repeat(40) + '</code>'));
  assert.match(html, /Até 20 arquivos, 2097152 bytes no total, 262144 bytes por arquivo e 45 segundos/);
  assert.match(html, /processamento por jobs está desativado/);
  assert.match(html, /<button class="button primary" disabled="">Solicitar análise limitada/);
  assert.doesNotMatch(html, /Análise iniciada|Análise concluída/);
});

test('job states offer bounded status recovery and only a completed job links to a result', () => {
  const job = { id: 'synthetic-job', run_id: 'synthetic-run', status: 'queued' };
  const queued = component(CatalogJobStatus, { job, busy: false, paused: true, actions: noCatalogActions });
  assert.match(queued, /Na fila/);
  assert.match(queued, /atualização automática desta tela foi pausada/);
  assert.match(queued, /Cancelar solicitação/);
  assert.doesNotMatch(queued, /Entender resultado|[0-9]+%/);
  const cancelled = component(CatalogJobStatus, { job: { ...job, status: 'cancel_requested' }, busy: false, paused: false, actions: noCatalogActions });
  assert.match(cancelled, /ainda não significa que o processamento parou/);
  assert.doesNotMatch(cancelled, /Cancelar solicitação/);
  const completed = component(CatalogJobStatus, { job: { ...job, status: 'complete' }, busy: false, paused: false, actions: noCatalogActions });
  assert.match(completed, /href="\/runs\/synthetic-run"/);
  assert.match(completed, /Entender resultado/);
});

test('GitHub App results do not acquire a public label or unproven commit verification', () => {
  const run = importedRun({ source: 'github-app', verified_revision: true });
  const html = component(RunMetadata, { run, demo: false });
  assert.match(html, /GitHub App/);
  assert.match(html, /Vínculo verificado na aquisição/);
  assert.doesNotMatch(html, /GitHub público|Commit declarado/);
  const pending = component(RunMetadata, { run: { ...run, verified_revision: false }, demo: false });
  assert.doesNotMatch(pending, /Vínculo verificado na aquisição/);
});

test('access-restricted history preserves accessible rows without claiming a successful empty history', () => {
  const empty = component(RunsTable, { items: [], restricted: true, href: path => path });
  assert.match(empty, /Histórico com acesso restrito/);
  assert.match(empty, /não comprova ausência de análises ou achados/);
  assert.doesNotMatch(empty, /Nenhuma análise nesta seleção/);
  const visible = component(RunsTable, { items: [importedRun({ repo: 'synthetic-owner/visible-history', source: 'github-app' })], restricted: true, href: path => path });
  assert.match(visible, /visible-history/);
  assert.match(visible, /GitHub App/);
});

test('permission management links never forward a destination outside GitHub', () => {
  const unsafe = catalogModel(); unsafe.status.connect_url = 'https://attacker.invalid/collect';
  const html = renderCatalog(unsafe);
  assert.doesNotMatch(html, /attacker\.invalid|Gerenciar permissões no GitHub/);
  const safe = catalogModel(); safe.status.connect_url = 'https://github.com/settings/installations';
  assert.match(renderCatalog(safe), /href="https:\/\/github.com\/settings\/installations"/);
});

test('repository credential failures do not invalidate the independent login session', () => {
  for (const code of ['disconnected', 'not_connected', 'expired', 'revoked']) assert.equal(catalogFailureScope(401, code), 'app_connection');
  assert.equal(catalogFailureScope(401), 'login_session');
  assert.equal(catalogFailureScope(403, 'forbidden'), 'object_access');
  assert.equal(catalogFailureScope(503, 'rate_limited'), 'other');
});
