"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { GitHubCatalog, catalogRepositoryCanAnalyze, isCatalogJobActive } from "./github-catalog";
import type { CatalogCoverage, CatalogInstallationCoverage, CatalogFilters, CatalogInstallation, CatalogJob, CatalogPage, CatalogRepository, CatalogSelection, CatalogStatus } from "./workbench-types";

export type CatalogCall = <T>(payload: object, signal?: AbortSignal, endpoint?: string) => Promise<T>;
export type CatalogPageResponse<T> = { total_count: number; page: number; next_page: number | null; complete: boolean; synced_at: string; coverage?: CatalogCoverage | CatalogInstallationCoverage; page_limit?: number; limit_reached?: boolean } & T;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/i;
const pollingDelays = [1500, 3000, 6000, 10000, 15000, 20000];
export function catalogFailureScope(status?: number, code?: string) {
  if (code === "rate_limited" || status === 429) return "other";
  if (status === 401) return ["disconnected", "not_connected", "expired", "revoked"].includes(code || "") ? "app_connection" : "login_session";
  return status === 403 ? "object_access" : "other";
}
export function emptyCatalogPage<T>(): CatalogPage<T> { return { items: [], state: "idle", page: 0, nextPage: null, complete: false, syncedAt: null, totalCount: null, coverage: null, pageLimit: null, limitReached: false }; }

/** Each account/refresh/installation change invalidates every earlier response,
 * including transports that finish after AbortSignal has been ignored. */
export function createCatalogRequestScope(captureAccess?: () => () => boolean) {
  let generation = 0, closed = true;
  const pending = new Set<AbortController>();
  function invalidate() { generation += 1; for (const controller of pending) controller.abort(); pending.clear(); }
  return {
    open() { invalidate(); closed = false; },
    invalidate,
    setCaptureAccess(next?: () => () => boolean) {
      if (captureAccess !== next) { invalidate(); captureAccess = next; }
    },
    close() { invalidate(); closed = true; },
    begin() {
      const version = generation, controller = new AbortController();
      // Capture the parent's access epoch at request start. It can be revoked
      // synchronously between promise resolution and this component's effects.
      let accessCurrent: () => boolean;
      try { accessCurrent = captureAccess ? captureAccess() : () => true; }
      catch { accessCurrent = () => false; }
      const isCurrent = () => {
        if (closed || version !== generation || controller.signal.aborted) return false;
        try { return accessCurrent() === true; } catch { return false; }
      };
      if (!isCurrent()) controller.abort(); else pending.add(controller);
      return { signal: controller.signal, isCurrent,
        finish: () => { controller.abort(); pending.delete(controller); } };
    },
  };
}
type CatalogRequest = ReturnType<ReturnType<typeof createCatalogRequestScope>["begin"]>;

export function validateCatalogPage<T extends { id: number }>(items: T[], response: CatalogPageResponse<object>, requestedPage: number, collection?: "installations" | "repositories") {
  if (!Array.isArray(items) || items.some(item => !Number.isSafeInteger(item?.id) || item.id < 1) ||
    response.page !== requestedPage || !Number.isSafeInteger(requestedPage) || requestedPage < 1 ||
    !Number.isSafeInteger(response.total_count) || response.total_count < 0 ||
    (response.next_page !== null && response.next_page !== requestedPage + 1) ||
    response.complete !== (response.next_page === null) || !Number.isFinite(Date.parse(response.synced_at)) ||
    (response.page_limit !== undefined && (!Number.isSafeInteger(response.page_limit) || response.page_limit < 1 || requestedPage > response.page_limit)) ||
    (response.limit_reached !== undefined && typeof response.limit_reached !== "boolean") ||
    (response.limit_reached === true && (response.next_page === null || response.complete)) ||
    (response.page_limit !== undefined && response.next_page !== null && requestedPage >= response.page_limit && response.limit_reached !== true) ||
    (response.coverage !== undefined && collection !== undefined && response.coverage.scope !== (collection === "installations" ? "user_app_installations" : "installation_user_intersection")) ||
    (response.coverage !== undefined && (response.coverage.global_complete !== false || (response.coverage.scope !== "user_app_installations" && (response.coverage.scope !== "installation_user_intersection" || !["all", "selected"].includes(response.coverage.repository_selection) || typeof response.coverage.contents_permission !== "boolean"))))) {
    throw new Error("A página do catálogo não pôde ser conferida. Retome a consulta; nenhuma análise foi solicitada.");
  }
}
export function mergeCatalogPage<T extends { id: number }>(previous: CatalogPage<T>, items: T[], response: CatalogPageResponse<object>): CatalogPage<T> {
  const unique = new Map((response.page > 1 ? previous.items : []).map(item => [item.id, item]));
  for (const item of items) unique.set(item.id, item);
  return { items: [...unique.values()], state: "loaded", page: response.page, nextPage: response.next_page, complete: response.complete, syncedAt: response.synced_at, totalCount: response.total_count, coverage: response.coverage ?? null, pageLimit: response.page_limit ?? null, limitReached: response.limit_reached ?? false };
}
export function failedCatalogPage<T>(previous: CatalogPage<T>): CatalogPage<T> { return { ...previous, state: "error", complete: false }; }

/** Selection is a local projection of an already-authorized metadata page.
 * It never resolves a commit or grants the independent execution capability. */
export function createCatalogMetadataSelection(repository: CatalogRepository, repositories: CatalogPage<CatalogRepository>, installationId: number | null): CatalogSelection | null {
  if (repositories.state !== "loaded" || !installationId) return null;
  const listed = repositories.items.find(item => item.id === repository.id && item.full_name === repository.full_name && item.installation_id === installationId);
  return listed ? { repository: listed, revisionInput: "", confirmed: false, prepared: null } : null;
}

type Props = { call: CatalogCall; demo: boolean; sessionUnavailable: boolean; initialJob?: string; onUnauthorized: (error: unknown) => void;
  embedded?: boolean; onJobCreated?: (job: CatalogJob) => void; onBusyChange?: (busy: boolean) => void; captureAccess?: () => () => boolean };
export function GitHubCatalogController({ call, demo, sessionUnavailable, initialJob = "", onUnauthorized, embedded = false, onJobCreated, onBusyChange, captureAccess }: Props) {
  const [status, setStatus] = useState<CatalogStatus | null>(null), [statusLoading, setStatusLoading] = useState(!demo && !sessionUnavailable);
  const [installations, setInstallations] = useState<CatalogPage<CatalogInstallation>>(emptyCatalogPage), [repositories, setRepositories] = useState<CatalogPage<CatalogRepository>>(emptyCatalogPage);
  const [installationId, setInstallationId] = useState<number | null>(null), [selection, setSelection] = useState<CatalogSelection | null>(null);
  const [filters, setFilters] = useState<CatalogFilters>({ q: "", visibility: "", archived: "", language: "" });
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [refreshKey, setRefreshKey] = useState(0);
  const [job, setJob] = useState<CatalogJob | null>(null), [polls, setPolls] = useState(0), [pollFailed, setPollFailed] = useState(false);
  const [dataContext, setDataContext] = useState({ call, demo, sessionUnavailable, captureAccess });
  const requests = useRef(createCatalogRequestScope(captureAccess)), selectionVersion = useRef(0), currentInstallation = useRef<number | null>(null), currentJob = useRef<string | null>(null);
  const operation = useRef<CatalogRequest | null>(null), requestAttempt = useRef<{ projectId: string; revision: string; id: string } | null>(null);
  const contextMatches = dataContext.call === call && dataContext.demo === demo && dataContext.sessionUnavailable === sessionUnavailable && dataContext.captureAccess === captureAccess;
  const invalidateSelection = useCallback(() => { selectionVersion.current += 1; requestAttempt.current = null; setSelection(null); }, []);
  const fail = useCallback((cause: unknown) => {
    if (cause instanceof Error && cause.name === "AbortError") return;
    const response = cause as { status?: number; message?: string; retryAt?: string; code?: string };
    const retry = response?.retryAt && !Number.isNaN(Date.parse(response.retryAt)) ? ` Próxima tentativa indicada pelo servidor: ${new Date(response.retryAt).toISOString()}.` : "";
    setError((cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "Não foi possível obter uma resposta confirmada. Consulte o histórico ou atualize o estado antes de tentar novamente.") + retry);
    if (response?.status === 404 && response.code === "not_found") { currentJob.current = null; setJob(null); }
    if (["login_session", "app_connection", "object_access"].includes(catalogFailureScope(response?.status, response?.code))) {
      requests.current.invalidate(); currentInstallation.current = null; currentJob.current = null;
      setInstallations({ ...emptyCatalogPage(), state: "error" }); setRepositories(emptyCatalogPage()); setInstallationId(null); setJob(null); invalidateSelection();
      if (response.status === 401) {
        if (catalogFailureScope(response.status, response.code) === "app_connection") {
          const state = response.code === "expired" ? "expired" : response.code === "revoked" ? "revoked" : "not_connected";
          setStatus(previous => previous ? { ...previous, connection: { ...previous.connection, state } } : null);
        } else { setStatus(null); onUnauthorized(cause); }
      }
    }
  }, [invalidateSelection, onUnauthorized]);

  const loadRepositories = useCallback(async (id: number, page: number, request: CatalogRequest) => {
    setRepositories(previous => ({ ...previous, state: "loading" }));
    try {
      const result = await call<CatalogPageResponse<{ repositories: CatalogRepository[] }>>({ action: "catalog-repositories", installationId: id, page }, request.signal);
      if (!request.isCurrent() || currentInstallation.current !== id) return;
      validateCatalogPage(result.repositories, result, page, "repositories");
      if (result.repositories.some(repository => repository.installation_id !== id)) throw new Error("A instalação dos repositórios retornados não foi confirmada. Atualize o catálogo.");
      setRepositories(previous => mergeCatalogPage(previous, result.repositories, result));
    } catch (cause) {
      if (!request.isCurrent() || currentInstallation.current !== id) return;
      invalidateSelection(); setRepositories(failedCatalogPage); fail(cause);
    }
  }, [call, fail, invalidateSelection]);

  useEffect(() => { requests.current.setCaptureAccess(captureAccess); }, [captureAccess]);
  useEffect(() => {
    requests.current.open(); operation.current = null;
    currentInstallation.current = null; currentJob.current = null;
    selectionVersion.current += 1; requestAttempt.current = null;
    const scope = requests.current, request = scope.begin();
    void (async () => {
      // The render already masks a changed account/call. Reset after the effect
      // checkpoint, before applying any response for the new context.
      await Promise.resolve();
      if (!request.isCurrent()) return;
      setDataContext({ call, demo, sessionUnavailable, captureAccess }); setSelection(null); setStatus(null); setInstallations(emptyCatalogPage()); setRepositories(emptyCatalogPage());
      setInstallationId(null); setFilters({ q: "", visibility: "", archived: "", language: "" }); setJob(null); setBusy(false); setPolls(0); setPollFailed(false); setError(""); setNotice("");
      setStatusLoading(!demo && !sessionUnavailable);
      if (demo || sessionUnavailable) { request.finish(); return; }
      try {
        const result = await call<{ catalog: CatalogStatus }>({ action: "catalog-status" }, request.signal);
        if (!request.isCurrent()) return;
        setStatus(result.catalog); setStatusLoading(false);
        if (!result.catalog.enabled || result.catalog.connection.state !== "connected") return;
        setInstallations(previous => ({ ...previous, state: "loading" }));
        try {
          const page = await call<CatalogPageResponse<{ installations: CatalogInstallation[] }>>({ action: "catalog-installations", page: 1 }, request.signal);
          if (!request.isCurrent()) return;
          validateCatalogPage(page.installations, page, 1, "installations");
          setInstallations(previous => mergeCatalogPage(previous, page.installations, page));
          const first = page.installations.find(installation => !installation.suspended_at) || page.installations[0];
          if (first) { currentInstallation.current = first.id; setInstallationId(first.id); if (!first.suspended_at) await loadRepositories(first.id, 1, request); }
        } catch (cause) {
          if (!request.isCurrent()) return;
          setInstallations(failedCatalogPage); fail(cause); return;
        }
        if (initialJob && request.isCurrent()) {
          if (!UUID.test(initialJob)) { setError("O identificador da solicitação na URL não é válido. Consulte seu histórico antes de solicitar outra análise."); return; }
          try {
            const found = await call<{ job: CatalogJob }>({ action: "job", jobId: initialJob }, request.signal);
            if (request.isCurrent()) { currentJob.current = found.job.id; setJob(found.job); }
          } catch (cause) { if (request.isCurrent()) fail(cause); }
        }
      } catch (cause) { if (request.isCurrent()) { setStatusLoading(false); fail(cause); } }
      finally { request.finish(); }
    })();
    return () => { scope.close(); request.finish(); };
  }, [call, demo, sessionUnavailable, refreshKey, initialJob, fail, invalidateSelection, loadRepositories, captureAccess]);

  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);

  const refreshJob = useCallback(async (request: CatalogRequest) => {
    const id = currentJob.current;
    if (!id) return;
    const result = await call<{ job: CatalogJob }>({ action: "job", jobId: id }, request.signal);
    if (request.isCurrent() && currentJob.current === id) setJob(result.job);
  }, [call]);
  useEffect(() => {
    if (demo || sessionUnavailable || busy || status?.jobs_enabled !== true || status.connection.state !== "connected" || !isCatalogJobActive(job) || polls >= pollingDelays.length || pollFailed) return;
    const request = requests.current.begin();
    const timer = window.setTimeout(() => {
      void refreshJob(request).then(() => { if (request.isCurrent()) setPolls(value => value + 1); }).catch(cause => { if (request.isCurrent()) { setPollFailed(true); fail(cause); } }).finally(request.finish);
    }, pollingDelays[polls]);
    return () => { window.clearTimeout(timer); request.finish(); };
  }, [demo, sessionUnavailable, busy, status?.jobs_enabled, status?.connection.state, job, polls, pollFailed, refreshJob, fail]);

  async function exclusive(action: (request: CatalogRequest) => Promise<void>) {
    if (operation.current || demo || sessionUnavailable || !contextMatches) return;
    const request = requests.current.begin();
    if (!request.isCurrent()) return;
    operation.current = request; setBusy(true); setError(""); setNotice("");
    try { await action(request); } catch (cause) { if (request.isCurrent()) fail(cause); }
    finally { request.finish(); if (operation.current === request) { operation.current = null; setBusy(false); } }
  }
  function refresh() {
    if (operation.current) return;
    requests.current.invalidate(); invalidateSelection(); currentInstallation.current = null;
    setInstallations(emptyCatalogPage()); setRepositories(emptyCatalogPage()); setInstallationId(null); setStatusLoading(true); setError(""); setNotice(""); setRefreshKey(value => value + 1);
  }
  function chooseInstallation(id: number) {
    const selected = installations.items.find(installation => installation.id === id);
    if (!selected || operation.current || installations.state !== "loaded") return;
    requests.current.invalidate();
    invalidateSelection(); currentInstallation.current = id; setInstallationId(id); setRepositories(emptyCatalogPage()); setFilters({ q: "", visibility: "", archived: "", language: "" });
    if (!selected.suspended_at) void exclusive(request => loadRepositories(id, 1, request));
  }
  function select(repository: CatalogRepository) {
    if (operation.current || !contextMatches || status?.connection.state !== "connected" || installations.state !== "loaded" || repositories.state !== "loaded") return;
    const request = requests.current.begin();
    const accessCurrent = request.isCurrent(); request.finish();
    if (!accessCurrent) return;
    const selected = createCatalogMetadataSelection(repository, repositories, currentInstallation.current);
    if (!selected) return;
    selectionVersion.current += 1; requestAttempt.current = null;
    setSelection(selected);
  }
  function changeRevision(value: string) {
    selectionVersion.current += 1; requestAttempt.current = null;
    setSelection(previous => previous ? { ...previous, revisionInput: value, confirmed: false, prepared: null } : null);
  }
  const actions = {
    refresh, chooseInstallation, select, revision: changeRevision, filter: setFilters,
    clearSelection: invalidateSelection,
    confirm: (confirmed: boolean) => setSelection(previous => previous?.prepared ? { ...previous, confirmed } : previous),
    connect: () => void exclusive(async request => {
      const result = await call<{ authorization_url: string }>({}, request.signal, "/api/auth/github-app/start");
      if (!request.isCurrent()) return;
      const destination = new URL(result.authorization_url);
      if (destination.protocol !== "https:" || destination.hostname !== "github.com" || destination.pathname !== "/login/oauth/authorize" || destination.username || destination.password) throw new Error("O servidor não retornou um destino de autorização válido.");
      window.location.assign(destination.href);
    }),
    disconnect: () => void exclusive(async request => {
      const result = await call<{ ok: boolean; provider_revoked: boolean }>({}, request.signal, "/api/auth/github-app/disconnect");
      if (!request.isCurrent()) return;
      if (!result.ok) throw new Error("Não foi possível confirmar a desconexão. Confira o estado antes de repetir.");
      requests.current.invalidate(); currentInstallation.current = null; currentJob.current = null;
      invalidateSelection(); setInstallations(emptyCatalogPage()); setRepositories(emptyCatalogPage()); setInstallationId(null); setJob(null);
      setStatus(previous => previous ? { ...previous, connection: { state: "not_connected" } } : null);
      setNotice(result.provider_revoked ? "Conexão removida do Workbench; a revogação do token enviado ao GitHub foi confirmada. Isso não afirma revogação de todos os tokens nem exclusão do histórico." : "Conexão removida do Workbench. A revogação no GitHub não foi confirmada; gerencie a App no GitHub para revisar as permissões. Seu login e histórico não foram excluídos por esta ação.");
    }),
    moreInstallations: () => void exclusive(async request => {
      const page = installations.nextPage ?? (installations.page === 0 ? 1 : null);
      if (!page || installations.limitReached) return;
      setInstallations(previous => ({ ...previous, state: "loading" }));
      try {
        const result = await call<CatalogPageResponse<{ installations: CatalogInstallation[] }>>({ action: "catalog-installations", page }, request.signal);
        if (!request.isCurrent()) return;
        validateCatalogPage(result.installations, result, page, "installations");
        setInstallations(previous => mergeCatalogPage(previous, result.installations, result));
      } catch (cause) { if (request.isCurrent()) { invalidateSelection(); setInstallations(failedCatalogPage); throw cause; } }
    }),
    moreRepositories: () => {
      const page = repositories.nextPage ?? (repositories.page === 0 ? 1 : null);
      if (installationId && page && !repositories.limitReached) void exclusive(request => loadRepositories(installationId, page, request));
    },
    prepare: () => void exclusive(async request => {
      if (!selection || !installationId || selection.repository.installation_id !== installationId || repositories.state !== "loaded" || installations.state !== "loaded" || !catalogRepositoryCanAnalyze(selection.repository)) return;
      const version = selectionVersion.current, repositoryId = selection.repository.id;
      const revision = selection.revisionInput.trim();
      if (revision && !SHA.test(revision)) throw new Error("Informe o SHA completo de 40 caracteres ou deixe o campo vazio para fixar a branch padrão.");
      const result = await call<NonNullable<CatalogSelection["prepared"]>>({ action: "catalog-authorize", installationId, repositoryId, ...(revision ? { revision } : {}) }, request.signal);
      if (!request.isCurrent() || version !== selectionVersion.current || currentInstallation.current !== installationId) return;
      if (!SHA.test(result.revision) || result.repository.id !== repositoryId || result.repository.installation_id !== installationId || result.repository.full_name !== selection.repository.full_name || !UUID.test(result.project.id)) throw new Error("Não foi possível conferir a identidade e o commit retornados. Nenhuma análise foi solicitada.");
      if (requestAttempt.current && (requestAttempt.current.projectId !== result.project.id || requestAttempt.current.revision !== result.revision)) requestAttempt.current = null;
      setSelection(previous => previous ? { ...previous, prepared: result, confirmed: false } : null);
    }),
    enqueue: () => void exclusive(async request => {
      const prepared = selection?.prepared;
      if (!prepared || !selection?.confirmed || !status?.jobs_enabled || !catalogRepositoryCanAnalyze(selection.repository)) return;
      const { project, revision } = prepared;
      if (!requestAttempt.current || requestAttempt.current.projectId !== project.id || requestAttempt.current.revision !== revision) requestAttempt.current = { projectId: project.id, revision, id: crypto.randomUUID() };
      let result: { job: CatalogJob };
      try { result = await call<{ job: CatalogJob }>({ action: "enqueue-job", projectId: project.id, revision, requestId: requestAttempt.current.id, confirmed: true }, request.signal); }
      catch (cause) { if (request.isCurrent()) setNotice("Uma resposta perdida não garante que o servidor deixou de registrar a solicitação. Consulte seu histórico antes de mudar a seleção; repetir a mesma confirmação preserva o identificador desta tentativa."); throw cause; }
      if (!request.isCurrent()) return;
      if (!UUID.test(result.job.id)) throw new Error("Não foi possível confirmar o identificador da solicitação. Consulte o histórico antes de repetir.");
      currentJob.current = result.job.id; setJob(result.job); setPolls(0); setPollFailed(false);
      requestAttempt.current = null; setSelection(previous => previous ? { ...previous, confirmed: false } : null);
      if (onJobCreated) onJobCreated(result.job);
      else if (!embedded) { const url = new URL(window.location.href); url.searchParams.set("job", result.job.id); window.history.replaceState(null, "", url.pathname + url.search + url.hash); }
    }),
    refreshJob: () => void exclusive(async request => { await refreshJob(request); if (request.isCurrent()) { setPolls(0); setPollFailed(false); } }),
    cancelJob: () => void exclusive(async request => {
      const id = currentJob.current;
      if (!id) return;
      const result = await call<{ job: CatalogJob }>({ action: "cancel-job", jobId: id }, request.signal);
      if (request.isCurrent() && currentJob.current === id) { setJob(result.job); setPolls(0); setPollFailed(false); }
    }),
  };
  const visible = contextMatches && !sessionUnavailable;
  return <GitHubCatalog embedded={embedded} model={{ demo, status: visible ? status : null, statusLoading: !sessionUnavailable && (!contextMatches || statusLoading), error: visible ? error : "", notice: visible ? notice : "", busy, installations: visible ? installations : emptyCatalogPage(), repositories: visible ? repositories : emptyCatalogPage(), installationId: visible ? installationId : null, filters, selection: visible ? selection : null, job: visible ? job : null, pollingPaused: polls >= pollingDelays.length || pollFailed }} actions={actions} />;
}
