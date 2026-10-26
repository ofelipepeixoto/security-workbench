import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Exercise the pagination/context functions used by the controller and render
// the real catalog. These are local synthetic checks, not GitHub integration
// or browser/effect tests. No provider, credentials, network, or new dependency.
const webRoot = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(join(webRoot, '.catalog-experience-'));
let GitHubCatalog, createCatalogMetadataSelection, createCatalogRequestScope, emptyCatalogPage, validateCatalogPage, mergeCatalogPage, failedCatalogPage, catalogFailureScope;
try {
  for (const file of ['components/github-catalog.tsx', 'components/github-catalog-controller.tsx']) {
    const result = ts.transpileModule(await readFile(join(webRoot, file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      transformers: { after: [context => node => ts.visitNode(node, function visit(current) {
        if (ts.isImportDeclaration(current) && ts.isStringLiteral(current.moduleSpecifier) && current.moduleSpecifier.text.startsWith('.') && !current.moduleSpecifier.text.endsWith('.mjs')) {
          return ts.factory.updateImportDeclaration(current, current.modifiers, current.importClause, ts.factory.createStringLiteral(current.moduleSpecifier.text + '.mjs'), current.attributes);
        }
        return ts.visitEachChild(current, visit, context);
      })] },
    });
    const target = join(output, file.replace(/\.tsx$/, '.mjs'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, result.outputText);
  }
  ({ GitHubCatalog } = await import(pathToFileURL(join(output, 'components/github-catalog.mjs')).href));
  ({ createCatalogMetadataSelection, createCatalogRequestScope, emptyCatalogPage, validateCatalogPage, mergeCatalogPage, failedCatalogPage, catalogFailureScope } = await import(pathToFileURL(join(output, 'components/github-catalog-controller.mjs')).href));
} finally {
  await rm(output, { recursive: true, force: true });
}

const syncedAt = '2026-10-26T12:00:00.000Z';
function pageResponse(page, nextPage, totalCount) {
  return { page, next_page: nextPage, complete: nextPage === null, total_count: totalCount, synced_at: syncedAt };
}
function repository(id, installationId = 11, owner = 'synthetic-account-a') {
  return { id, name: 'fixture-' + id, full_name: owner + '/fixture-' + id, owner: { login: owner }, private: true,
    default_branch: 'main', language: 'JavaScript', archived: false, installation_id: installationId, permissions: { pull: true } };
}
const installation = (id, login) => ({ id, account: { login, type: 'User' }, suspended_at: null, repository_selection: 'selected' });
const limits = { files: 20, bytes: 2097152, fileBytes: 262144, deadlineMs: 45000 };
const actions = Object.fromEntries(['connect', 'disconnect', 'refresh', 'chooseInstallation', 'moreInstallations', 'moreRepositories', 'filter', 'select', 'revision', 'prepare', 'confirm', 'enqueue', 'clearSelection', 'refreshJob', 'cancelJob'].map(name => [name, () => {}]));
function model(changes = {}) {
  return {
    demo: false, status: { enabled: true, connection: { state: 'connected' }, jobs_enabled: false, limits }, statusLoading: false,
    error: '', notice: '', busy: false, installations: mergeCatalogPage(emptyCatalogPage(), [installation(11, 'synthetic-account-a')], pageResponse(1, null, 1)),
    repositories: mergeCatalogPage(emptyCatalogPage(), [repository(1)], pageResponse(1, null, 1)), installationId: 11,
    filters: { q: '', visibility: '', archived: '', language: '' }, selection: null, job: null, pollingPaused: false, ...changes,
  };
}
const renderCatalog = (value, embedded = false) => renderToStaticMarkup(React.createElement(GitHubCatalog, { model: value, actions, embedded }));

test('real installation and repository coverage contracts are validated separately', () => {
  const installationResponse = { ...pageResponse(1, null, 1), page_limit: 10, limit_reached: false,
    total_scope: 'user_app_installations', coverage: { scope: 'user_app_installations', global_complete: false } };
  assert.doesNotThrow(() => validateCatalogPage([installation(11, 'synthetic-account-a')], installationResponse, 1, 'installations'));
  assert.throws(() => validateCatalogPage([repository(1)], installationResponse, 1, 'repositories'), /página do catálogo/);
  const repositoryResponse = { ...pageResponse(1, null, 1), page_limit: 10, limit_reached: false,
    coverage: { scope: 'installation_user_intersection', repository_selection: 'selected', global_complete: false, contents_permission: false } };
  assert.doesNotThrow(() => validateCatalogPage([repository(1)], repositoryResponse, 1, 'repositories'));
  assert.throws(() => validateCatalogPage([installation(11, 'synthetic-account-a')], repositoryResponse, 1, 'installations'), /página do catálogo/);
  for (const patch of [{ global_complete: true }, { scope: 'all_user_repositories' }, { repository_selection: 'invented' }]) {
    assert.throws(() => validateCatalogPage([repository(1)], { ...repositoryResponse, coverage: { ...repositoryResponse.coverage, ...patch } }, 1, 'repositories'), /página do catálogo/);
  }
});

test('metadata discovery without code permission stays visible with a protected authorization path', () => {
  const item = { ...repository(7), fork: true, archived: true, visibility: 'internal', analysis_access: { state: 'contents_permission_required', can_analyze: false, manage_url: 'https://github.com/settings/installations/11' } };
  const repositories = mergeCatalogPage(emptyCatalogPage(), [item], { ...pageResponse(1, null, 1), coverage: { scope: 'installation_user_intersection', repository_selection: 'selected', global_complete: false, contents_permission: false } });
  const html = renderCatalog(model({ repositories }));
  assert.match(html, /synthetic-account-a\/fixture-7/);
  assert.match(html, /Interno · Fork/);
  assert.match(html, /Arquivado/);
  assert.match(html, /leitura do código ainda não autorizada à App/);
  assert.match(html, /<button class="button secondary">Escolher repositório/);
  assert.doesNotMatch(html, /<button[^>]*disabled[^>]*>Escolher repositório/);
  assert.match(html, /href="https:\/\/github.com\/settings\/installations\/11"/);
  assert.match(html, /Conferir autorização no GitHub/);
  assert.match(html, /Cobertura parcial da conta GitHub/);
  assert.match(html, /somente repositórios selecionados/);
  assert.doesNotMatch(html, /Preparar análise de|Solicitar análise limitada/);
});

test('all selection explains future repositories without claiming global user coverage or consent', () => {
  const repositories = mergeCatalogPage(emptyCatalogPage(), [repository(1)], { ...pageResponse(1, null, 1), coverage: { scope: 'installation_user_intersection', repository_selection: 'all', global_complete: false, contents_permission: true } });
  const html = renderCatalog(model({ repositories }));
  assert.match(html, /repositórios atuais e futuros dessa conta ou organização/);
  assert.match(html, /Outras instalações, organizações, colaborações ou exigências de SSO podem continuar fora/);
  assert.match(html, /Negar ou cancelar esse consentimento mantém a cobertura atual/);
  assert.match(html, /1 informados pelo GitHub nesta interseção/);
  assert.match(html, /não é um total global da conta GitHub/);
  assert.doesNotMatch(html, /Todos os repositórios da conta carregados|Acesso a futuros repositórios autorizado automaticamente/);
});

test('page caps remain partial and cannot make the next cursor actionable', () => {
  const response = { ...pageResponse(10, 11, 1100), page_limit: 10, limit_reached: true };
  validateCatalogPage([repository(1000)], response, 10, 'repositories');
  const repositories = mergeCatalogPage(emptyCatalogPage(), [repository(1000)], response);
  const html = renderCatalog(model({ repositories }));
  assert.match(html, /Limite desta consulta atingido/);
  assert.match(html, /Até 10 páginas são permitidas por instalação/);
  assert.match(html, /1100 informados pelo GitHub nesta interseção/);
  assert.match(html, /<button class="button secondary" disabled="">Carregar próxima página/);
  assert.match(html, /Sincronização incompleta/);
  assert.throws(() => validateCatalogPage([repository(1000)], { ...response, limit_reached: false }, 10, 'repositories'), /página do catálogo/);
});

test('internal visibility filters do not merge private and internal repositories', () => {
  const items = [repository(1), { ...repository(2), visibility: 'internal', archived: true, fork: true }, { ...repository(3), private: false, visibility: 'public' }];
  const value = model({ repositories: mergeCatalogPage(emptyCatalogPage(), items, pageResponse(1, null, 3)), filters: { q: '', visibility: 'internal', archived: '', language: '' } });
  const html = renderCatalog(value);
  assert.match(html, /1 de 3 repositórios carregados/);
  assert.match(html, /synthetic-account-a\/fixture-2/);
  assert.doesNotMatch(html, /synthetic-account-a\/fixture-[13]/);
});

test('metadata discovery never expands the QA fixture policy or suggests GitHub consent can bypass it', () => {
  const item = { ...repository(7), analysis_access: { state: 'available', can_analyze: true, qa_allowed: false, qa_reason: 'not_selected_fixture', manage_url: 'https://github.com/settings/installations/11' } };
  const value = model({ repositories: mergeCatalogPage(emptyCatalogPage(), [item], pageResponse(1, null, 1)) });
  value.status.analysis_policy = 'qa_selected_fixtures';
  const html = renderCatalog(value);
  assert.match(html, /somente fixtures previamente selecionadas podem ser analisadas/);
  assert.match(html, /análise bloqueada pela seleção exclusiva de fixtures do QA/);
  assert.match(html, /<button class="button secondary">Escolher repositório/);
  assert.doesNotMatch(html, /<button[^>]*disabled[^>]*>Escolher repositório/);
  assert.doesNotMatch(html, /Conferir autorização no GitHub/);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

test('all pages can be merged for 101 repositories and a second installation starts a separate catalog', () => {
  const firstItems = Array.from({ length: 100 }, (_, index) => repository(index + 1));
  const firstResponse = pageResponse(1, 2, 101);
  validateCatalogPage(firstItems, firstResponse, 1);
  const first = mergeCatalogPage(emptyCatalogPage(), firstItems, firstResponse);
  assert.equal(first.items.length, 100);
  assert.equal(first.complete, false);
  assert.equal(first.nextPage, 2);
  const failed = failedCatalogPage(first);
  assert.equal(failed.state, 'error');
  assert.deepEqual(failed.items, firstItems);
  assert.equal(failed.page, 1);
  assert.equal(failed.nextPage, 2);
  assert.equal(failed.complete, false);

  const secondItems = [{ ...repository(50), language: 'TypeScript' }, repository(101)];
  const secondResponse = pageResponse(2, null, 101);
  validateCatalogPage(secondItems, secondResponse, failed.nextPage);
  const complete = mergeCatalogPage(failed, secondItems, secondResponse);
  assert.equal(complete.state, 'loaded');
  assert.equal(complete.items.length, 101);
  assert.equal(complete.items.filter(item => item.id === 50).length, 1);
  assert.equal(complete.items.find(item => item.id === 50).language, 'TypeScript');
  assert.equal(complete.complete, true);
  assert.equal(complete.nextPage, null);

  // A repository ID may appear in several installations. Starting page1 in the
  // newly selected installation replaces the previous installation's cache.
  const otherItems = [repository(50, 22, 'synthetic-organization-b'), repository(201, 22, 'synthetic-organization-b')];
  const otherResponse = pageResponse(1, null, 2);
  validateCatalogPage(otherItems, otherResponse, 1);
  const other = mergeCatalogPage(complete, otherItems, otherResponse);
  assert.deepEqual(other.items.map(item => item.id), [50, 201]);
  assert.ok(other.items.every(item => item.installation_id === 22));
  assert.ok(other.items.every(item => item.owner.login === 'synthetic-organization-b'));
  assert.equal(other.page, 1);
});

test('installation pagination retains its cursor after failure without declaring the snapshot complete', () => {
  const initial = mergeCatalogPage(emptyCatalogPage(), [installation(11, 'synthetic-account-a')], pageResponse(1, 2, 2));
  const failed = failedCatalogPage(initial);
  assert.equal(failed.nextPage, 2);
  assert.equal(failed.syncedAt, syncedAt);
  assert.equal(failed.complete, false);
  const response = pageResponse(2, null, 2);
  const additional = [installation(22, 'synthetic-organization-b')];
  validateCatalogPage(additional, response, failed.nextPage);
  const complete = mergeCatalogPage(failed, additional, response);
  assert.deepEqual(complete.items.map(item => item.id), [11, 22]);
  assert.equal(complete.complete, true);
  assert.equal(complete.state, 'loaded');
});

test('invalid page, cursor, completeness, identities and timestamp cannot enter a successful page', () => {
  const valid = pageResponse(1, 2, 101);
  for (const patch of [
    { page: 2 }, { next_page: 1 }, { next_page: 3 }, { next_page: -1 },
    { next_page: null, complete: false }, { complete: true }, { total_count: -1 },
    { total_count: 1.5 }, { synced_at: 'not-a-confirmed-time' },
  ]) assert.throws(() => validateCatalogPage([repository(1)], { ...valid, ...patch }, 1), /página do catálogo/);
  for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1']) {
    assert.throws(() => validateCatalogPage([{ id }], valid, 1), /página do catálogo/);
  }
  assert.throws(() => validateCatalogPage([repository(1)], valid, 0), /página do catálogo/);
  assert.throws(() => validateCatalogPage(null, valid, 1), /página do catálogo/);
});

test('an old account response is ignored even when its transport completes after abort', async () => {
  const scope = createCatalogRequestScope();
  scope.open();
  const requestA = scope.begin(), responseA = deferred(), applied = [];
  const completionA = responseA.promise.then(value => { if (requestA.isCurrent()) applied.push(value); });
  scope.invalidate(); // Account/session/installation generation changed.
  const requestB = scope.begin(), responseB = deferred();
  const completionB = responseB.promise.then(value => { if (requestB.isCurrent()) applied.push(value); });
  assert.equal(requestA.signal.aborted, true);
  assert.equal(requestA.isCurrent(), false);
  responseB.resolve('confirmed-account-b');
  await completionB;
  responseA.resolve('stale-account-a'); // Deliberately ignore AbortSignal.
  await completionA;
  assert.deepEqual(applied, ['confirmed-account-b']);
  requestA.finish();
  assert.equal(requestB.isCurrent(), true);
  requestB.finish();
  assert.equal(requestB.isCurrent(), false);
});

test('an obsolete denial cannot erase the new account and closed scopes reject late work', async () => {
  const scope = createCatalogRequestScope();
  assert.equal(scope.begin().isCurrent(), false);
  scope.open();
  const old = scope.begin(), response = deferred(), errors = [];
  const completed = response.promise.catch(error => { if (old.isCurrent()) errors.push(error.message); });
  scope.close();
  assert.equal(old.signal.aborted, true);
  assert.equal(scope.begin().signal.aborted, true);
  scope.open();
  const current = scope.begin();
  response.reject(Object.assign(new Error('old account revoked'), { status: 403 }));
  await completed;
  assert.deepEqual(errors, []);
  assert.equal(current.isCurrent(), true);
  scope.close();
  assert.equal(current.signal.aborted, true);
  assert.equal(current.isCurrent(), false);
});

test('the parent access epoch blocks a resolved response before React effects can run', async () => {
  let epoch = 0, captures = 0;
  const captureAccess = () => { captures += 1; const captured = epoch; return () => captured === epoch; };
  const scope = createCatalogRequestScope(captureAccess);
  scope.open();
  const request = scope.begin(), response = deferred(), applied = [], callbacks = [];
  const completion = response.promise.then(job => {
    if (!request.isCurrent()) return;
    applied.push(job.id);
    callbacks.push('onJobCreated');
  });
  assert.equal(captures, 1);
  assert.equal(request.isCurrent(), true);
  response.resolve({ id: 'synthetic-old-account-job' });
  epoch += 1; // Synchronous monitor invalidation, before the promise continuation.
  assert.equal(request.signal.aborted, false); // No effect/abort was needed.
  await completion;
  assert.deepEqual(applied, []);
  assert.deepEqual(callbacks, []);
  assert.equal(request.isCurrent(), false);
  assert.equal(captures, 1); // Test the captured predicate, never recapture access.
  const current = scope.begin();
  assert.equal(current.isCurrent(), true);
  assert.equal(captures, 2);
  scope.close();
});

test('changing an external access provider invalidates old requests and uses the new snapshot', () => {
  const scope = createCatalogRequestScope(() => () => true);
  scope.open();
  const old = scope.begin();
  let allowed = false;
  const next = () => () => allowed;
  scope.setCaptureAccess(next);
  assert.equal(old.signal.aborted, true);
  assert.equal(old.isCurrent(), false);
  const denied = scope.begin();
  assert.equal(denied.signal.aborted, true);
  allowed = true;
  assert.equal(denied.isCurrent(), false); // A denied start cannot become active.
  const current = scope.begin();
  assert.equal(current.isCurrent(), true);
  scope.setCaptureAccess(next);
  assert.equal(current.isCurrent(), true); // Same provider does not reset work.
  scope.close();
});

test('unverifiable external access predicates fail closed without exposing a response', () => {
  for (const capture of [() => { throw Error('synthetic capture failure'); }, () => () => { throw Error('synthetic access failure'); }]) {
    const scope = createCatalogRequestScope(capture);
    scope.open();
    const request = scope.begin();
    assert.equal(request.isCurrent(), false);
    assert.equal(request.signal.aborted, true);
    scope.close();
  }
});

test('rate limiting stays a retryable failure while access failures invalidate the catalog scope', () => {
  assert.equal(catalogFailureScope(429, 'rate_limited'), 'other');
  assert.equal(catalogFailureScope(403, 'rate_limited'), 'other');
  assert.equal(catalogFailureScope(503), 'other');
  assert.equal(catalogFailureScope(401, 'expired'), 'app_connection');
  assert.equal(catalogFailureScope(401, 'revoked'), 'app_connection');
  assert.equal(catalogFailureScope(401), 'login_session');
  assert.equal(catalogFailureScope(403, 'forbidden'), 'object_access');
});

test('embedded catalog is a dialog subsection and distinguishes the GitHub catalog from registered projects', () => {
  const html = renderCatalog(model(), true);
  assert.match(html, /<h2>Escolha um repositório no GitHub<\/h2>/);
  assert.doesNotMatch(html, /<h1\b|class="page-heading"/);
  assert.match(html, /Esta lista é diferente dos projetos cadastrados no Workbench/);
  assert.match(html, /synthetic-account-a\/fixture-1/);
  assert.doesNotMatch(html, /Solicitar análise limitada|Commit fixado/);
  assert.match(renderCatalog(model()), /<h1>Repositórios GitHub<\/h1>/);
});

test('an empty installation page with further pages never claims that no installation is accessible', () => {
  const incomplete = model({ installations: mergeCatalogPage(emptyCatalogPage(), [], pageResponse(1, 2, 1)), installationId: null });
  const html = renderCatalog(incomplete, true);
  assert.match(html, /Nenhuma instalação nesta página/);
  assert.match(html, /consulta está incompleta/);
  assert.match(html, /Carregar mais instalações/);
  assert.doesNotMatch(html, /Nenhuma instalação acessível foi retornada/);
  const complete = model({ installations: mergeCatalogPage(emptyCatalogPage(), [], pageResponse(1, null, 0)), installationId: null });
  assert.match(renderCatalog(complete, true), /Nenhuma instalação acessível foi retornada/);
});

test('failed repository pagination retains a visible count and retry action but hides stale selection', () => {
  const items = Array.from({ length: 100 }, (_, index) => repository(index + 1));
  const previous = mergeCatalogPage(emptyCatalogPage(), items, pageResponse(1, 2, 101));
  const value = model({
    repositories: failedCatalogPage(previous), error: 'O GitHub limitou esta consulta. Próxima tentativa: 2026-10-26T12:01:00Z.',
    selection: { repository: items[0], revisionInput: '', confirmed: true, prepared: { project: { id: 'synthetic-project' }, repository: items[0], revision: 'c'.repeat(40), limits } },
  });
  const html = renderCatalog(value, true);
  assert.match(html, /role="alert"/);
  assert.match(html, /100 repositórios já carregados foram preservados/);
  assert.match(html, /seleção fica bloqueada/);
  assert.match(html, /Retomar consulta de repositórios/);
  assert.match(html, /Próxima tentativa: 2026-10-26T12:01:00Z/);
  assert.doesNotMatch(html, /Nenhum repositório autorizado retornado|Nenhum repositório nesta página|Escolher repositório/);
  assert.doesNotMatch(html, /Preparar análise de|Solicitar análise limitada|synthetic-account-a\/fixture-1/);
});

test('failed installation pagination reports preserved progress without exposing repository selection', () => {
  const installations = failedCatalogPage(mergeCatalogPage(emptyCatalogPage(), [installation(11, 'synthetic-account-a')], pageResponse(1, 2, 2)));
  const html = renderCatalog(model({ installations }), true);
  assert.match(html, /lista não está confirmada/);
  assert.match(html, /não significa ausência de acesso/);
  assert.match(html, /1 instalaç/);
  assert.match(html, /antes da falha/);
  assert.match(html, /Retomar consulta de instalações/);
  assert.doesNotMatch(html, /Escolher repositório|synthetic-account-a\/fixture-1/);
});

test('a full page and an embedded catalog have distinct labelled-section IDs', () => {
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(GitHubCatalog, { model: model(), actions }),
    React.createElement(GitHubCatalog, { model: model(), actions, embedded: true })));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.ok(ids.length >= 4);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of html.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(ids.includes(match[1]));
});


test('the embedded confirmation explains the move to job tracking before submission', () => {
  const selected = repository(1);
  const value = model({ selection: { repository: selected, revisionInput: '', confirmed: false,
    prepared: { project: { id: 'synthetic-project' }, repository: selected, revision: 'c'.repeat(40), limits } } });
  const html = renderCatalog(value, true);
  const explanation = html.indexOf('Ao solicitar, você abrirá o acompanhamento da solicitação.');
  const submit = html.indexOf('Solicitar análise limitada');
  assert.ok(explanation >= 0 && explanation < submit);
  assert.match(html, /resultado ficará disponível quando o processamento terminar/);
  assert.doesNotMatch(renderCatalog(value), /Ao solicitar, você abrirá o acompanhamento/);
});


test('zero filtered results offers a local reset without mistaking hidden authorized items for no access', () => {
  const value = model({ filters: { q: 'missing-fixture', visibility: '', archived: '', language: '' } });
  const html = renderCatalog(value, true);
  assert.match(html, /Nenhum repositório corresponde aos filtros/);
  assert.match(html, /Limpar filtros desta instalação/);
  assert.doesNotMatch(html, /Nenhum repositório autorizado retornado|Escolher repositório/);
  const empty = renderCatalog(model({ repositories: mergeCatalogPage(emptyCatalogPage(), [], pageResponse(1, null, 0)) }), true);
  assert.match(empty, /Nenhum repositório autorizado retornado/);
  assert.doesNotMatch(empty, /Limpar filtros desta instalação/);
});


test('authorized metadata can be selected while QA processing or Contents access stays blocked', () => {
  for (const analysis_access of [
    { state: 'available', can_analyze: true, qa_allowed: false, qa_reason: 'window_not_open' },
    { state: 'contents_permission_required', can_analyze: false, manage_url: 'https://github.com/settings/installations/11' },
  ]) {
    const item = { ...repository(9), analysis_access };
    const repositories = mergeCatalogPage(emptyCatalogPage(), [item], pageResponse(1, null, 1));
    const selected = createCatalogMetadataSelection(item, repositories, 11);
    assert.deepEqual(selected, { repository: item, revisionInput: '', confirmed: false, prepared: null });
    const html = renderCatalog(model({ repositories, selection: selected }), true);
    assert.match(html, /Repositório selecionado: synthetic-account-a\/fixture-9/);
    assert.match(html, /conserva somente os metadados já autorizados/);
    assert.match(html, /Preparar commit e solicitar análise continuam bloqueados/);
    assert.doesNotMatch(html, /<form|Preparar análise e fixar commit|Solicitar análise limitada|Commit fixado/);
    if (analysis_access.qa_allowed === false) assert.doesNotMatch(html, /Conferir autorização no GitHub/);
    else assert.match(html, /Conferir autorização no GitHub/);
  }
});

test('metadata selection accepts only a current successful page and its exact repository identity', () => {
  const item = repository(9), repositories = mergeCatalogPage(emptyCatalogPage(), [item], pageResponse(1, null, 1));
  assert.equal(createCatalogMetadataSelection(item, failedCatalogPage(repositories), 11), null);
  assert.equal(createCatalogMetadataSelection(item, { ...repositories, state: 'loading' }, 11), null);
  assert.equal(createCatalogMetadataSelection(item, repositories, 22), null);
  assert.equal(createCatalogMetadataSelection({ ...item, id: 10 }, repositories, 11), null);
  assert.equal(createCatalogMetadataSelection({ ...item, full_name: 'synthetic-account-b/fixture-9' }, repositories, 11), null);
  const html = renderCatalog(model({ repositories, selection: createCatalogMetadataSelection(item, repositories, 11), status: { enabled: true, connection: { state: 'revoked' }, jobs_enabled: false, limits } }), true);
  assert.doesNotMatch(html, /synthetic-account-a\/fixture-9|Preparar análise de|Repositório selecionado:/);
  assert.match(html, /acesso aos repositórios foi revogado/);
});
