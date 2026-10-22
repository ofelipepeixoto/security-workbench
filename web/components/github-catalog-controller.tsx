"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { GitHubCatalog, isCatalogJobActive } from "./github-catalog";
import type { CatalogFilters, CatalogInstallation, CatalogJob, CatalogPage, CatalogRepository, CatalogSelection, CatalogStatus } from "./workbench-types";

export type CatalogCall = <T>(payload: object, signal?: AbortSignal, endpoint?: string) => Promise<T>;
type PageResponse<T> = { total_count: number; page: number; next_page: number | null; complete: boolean; synced_at: string } & T;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/i;
const pollingDelays = [1500, 3000, 6000, 10000, 15000, 20000];
export function catalogFailureScope(status?: number, code?: string) {
  if (status === 401) return ["disconnected", "not_connected", "expired", "revoked"].includes(code || "") ? "app_connection" : "login_session";
  return status === 403 ? "object_access" : "other";
}
function emptyPage<T>(): CatalogPage<T> { return { items: [], state: "idle", page: 0, nextPage: null, complete: false, syncedAt: null }; }
function pageResult<T extends { id: number }>(previous: CatalogPage<T>, items: T[], response: PageResponse<object>, append: boolean): CatalogPage<T> {
  const unique = new Map((append ? previous.items : []).map(item => [item.id, item]));
  for (const item of items) unique.set(item.id, item);
  return { items: [...unique.values()], state: "loaded", page: response.page, nextPage: response.next_page, complete: response.complete, syncedAt: response.synced_at };
}

export function GitHubCatalogController({ call, demo, sessionUnavailable, initialJob = "", onUnauthorized }: { call: CatalogCall; demo: boolean; sessionUnavailable: boolean; initialJob?: string; onUnauthorized: (error: unknown) => void }) {
  const [status, setStatus] = useState<CatalogStatus | null>(null), [statusLoading, setStatusLoading] = useState(!demo && !sessionUnavailable);
  const [installations, setInstallations] = useState<CatalogPage<CatalogInstallation>>(emptyPage), [repositories, setRepositories] = useState<CatalogPage<CatalogRepository>>(emptyPage);
  const [installationId, setInstallationId] = useState<number | null>(null), [selection, setSelection] = useState<CatalogSelection | null>(null);
  const [filters, setFilters] = useState<CatalogFilters>({ q: "", visibility: "", archived: "", language: "" });
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [refreshKey, setRefreshKey] = useState(0);
  const [job, setJob] = useState<CatalogJob | null>(null), [polls, setPolls] = useState(0), [pollFailed, setPollFailed] = useState(false);
  const catalogVersion = useRef(0), selectionVersion = useRef(0), currentInstallation = useRef<number | null>(null), currentJob = useRef<string | null>(null);
  const operation = useRef(false), alive = useRef(true), requestAttempt = useRef<{ projectId: string; revision: string; id: string } | null>(null);
  const invalidateSelection = useCallback(() => { selectionVersion.current += 1; requestAttempt.current = null; setSelection(null); }, []);
  const fail = useCallback((cause: unknown) => {
    if (cause instanceof Error && cause.name === "AbortError") return;
    const response = cause as { status?: number; message?: string; retryAt?: string; code?: string };
    const retry = response?.retryAt && !Number.isNaN(Date.parse(response.retryAt)) ? ` Próxima tentativa indicada pelo servidor: ${new Date(response.retryAt).toISOString()}.` : "";
    setError((cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "Não foi possível obter uma resposta confirmada. Consulte o histórico ou atualize o estado antes de tentar novamente.") + retry);
    if (response?.status === 404 && response.code === "not_found") { currentJob.current = null; setJob(null); }
    if ([401, 403].includes(response?.status || 0)) {
      catalogVersion.current += 1; currentInstallation.current = null; currentJob.current = null;
      setInstallations(emptyPage()); setRepositories(emptyPage()); setInstallationId(null); setJob(null); invalidateSelection();
      if (response.status === 401) {
        if (catalogFailureScope(response.status, response.code) === "app_connection") {
          const state = response.code === "expired" ? "expired" : response.code === "revoked" ? "revoked" : "not_connected";
          setStatus(previous => previous ? { ...previous, connection: { ...previous.connection, state } } : null);
        } else { setStatus(null); onUnauthorized(cause); }
      }
    }
  }, [invalidateSelection, onUnauthorized]);

  const loadRepositories = useCallback(async (id: number, page: number, version: number, signal?: AbortSignal) => {
    setRepositories(previous => ({ ...previous, state: "loading" }));
    try {
      const result = await call<PageResponse<{ repositories: CatalogRepository[] }>>({ action: "catalog-repositories", installationId: id, page }, signal);
      if (!alive.current || catalogVersion.current !== version || currentInstallation.current !== id) return;
      setRepositories(previous => pageResult(previous, result.repositories, result, page > 1));
    } catch (cause) {
      if (signal?.aborted || catalogVersion.current !== version || !alive.current) return;
      setRepositories(previous => ({ ...previous, items: [], state: "error" })); fail(cause);
    }
  }, [call, fail]);

  useEffect(() => {
    alive.current = true;
    if (demo || sessionUnavailable) return;
    const controller = new AbortController(), version = ++catalogVersion.current;
    void (async () => {
      try {
        const result = await call<{ catalog: CatalogStatus }>({ action: "catalog-status" }, controller.signal);
        if (controller.signal.aborted || version !== catalogVersion.current) return;
        setStatus(result.catalog); setStatusLoading(false);
        if (!result.catalog.enabled || result.catalog.connection.state !== "connected") return;
        const page = await call<PageResponse<{ installations: CatalogInstallation[] }>>({ action: "catalog-installations", page: 1 }, controller.signal);
        if (controller.signal.aborted || version !== catalogVersion.current) return;
        setInstallations(previous => pageResult(previous, page.installations, page, false));
        const first = page.installations.find(installation => !installation.suspended_at) || page.installations[0];
        if (first) { currentInstallation.current = first.id; setInstallationId(first.id); if (!first.suspended_at) await loadRepositories(first.id, 1, version, controller.signal); }
        if (initialJob && version === catalogVersion.current && !controller.signal.aborted) {
          if (!UUID.test(initialJob)) { setError("O identificador da solicitação na URL não é válido. Consulte seu histórico antes de solicitar outra análise."); return; }
          const found = await call<{ job: CatalogJob }>({ action: "job", jobId: initialJob }, controller.signal);
          if (!controller.signal.aborted && version === catalogVersion.current) { currentJob.current = found.job.id; setJob(found.job); }
        }
      } catch (cause) {
        if (!controller.signal.aborted && version === catalogVersion.current) { setStatusLoading(false); setInstallations(previous => ({ ...previous, state: "error" })); fail(cause); }
      }
    })();
    return () => { alive.current = false; controller.abort(); };
  }, [call, demo, sessionUnavailable, refreshKey, initialJob, fail, loadRepositories]);

  const refreshJob = useCallback(async (signal?: AbortSignal) => {
    const id = currentJob.current;
    if (!id) return;
    const result = await call<{ job: CatalogJob }>({ action: "job", jobId: id }, signal);
    if (alive.current && currentJob.current === id && !signal?.aborted) setJob(result.job);
  }, [call]);
  useEffect(() => {
    if (demo || sessionUnavailable || busy || status?.jobs_enabled !== true || status.connection.state !== "connected" || !isCatalogJobActive(job) || polls >= pollingDelays.length || pollFailed) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void refreshJob(controller.signal).then(() => { if (!controller.signal.aborted) setPolls(value => value + 1); }).catch(cause => { if (!controller.signal.aborted) { setPollFailed(true); fail(cause); } });
    }, pollingDelays[polls]);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [demo, sessionUnavailable, busy, status?.jobs_enabled, status?.connection.state, job, polls, pollFailed, refreshJob, fail]);

  async function exclusive(action: () => Promise<void>) {
    if (operation.current || demo || sessionUnavailable) return;
    operation.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (cause) { if (alive.current) fail(cause); }
    finally { operation.current = false; if (alive.current) setBusy(false); }
  }
  function refresh() {
    if (operation.current) return;
    catalogVersion.current += 1; invalidateSelection(); currentInstallation.current = null;
    setInstallations(emptyPage()); setRepositories(emptyPage()); setInstallationId(null); setStatusLoading(true); setError(""); setNotice(""); setRefreshKey(value => value + 1);
  }
  function chooseInstallation(id: number) {
    const selected = installations.items.find(installation => installation.id === id);
    if (!selected || operation.current) return;
    const version = ++catalogVersion.current;
    invalidateSelection(); currentInstallation.current = id; setInstallationId(id); setRepositories(emptyPage()); setFilters({ q: "", visibility: "", archived: "", language: "" });
    if (!selected.suspended_at) void exclusive(() => loadRepositories(id, 1, version));
  }
  function select(repository: CatalogRepository) {
    selectionVersion.current += 1; requestAttempt.current = null;
    setSelection({ repository, revisionInput: "", confirmed: false, prepared: null });
  }
  function changeRevision(value: string) {
    selectionVersion.current += 1; requestAttempt.current = null;
    setSelection(previous => previous ? { ...previous, revisionInput: value, confirmed: false, prepared: null } : null);
  }
  const actions = {
    refresh, chooseInstallation, select, revision: changeRevision, filter: setFilters,
    clearSelection: invalidateSelection,
    confirm: (confirmed: boolean) => setSelection(previous => previous?.prepared ? { ...previous, confirmed } : previous),
    connect: () => void exclusive(async () => {
      const result = await call<{ authorization_url: string }>({}, undefined, "/api/auth/github-app/start");
      const destination = new URL(result.authorization_url);
      if (destination.protocol !== "https:" || destination.hostname !== "github.com" || destination.pathname !== "/login/oauth/authorize" || destination.username || destination.password) throw new Error("O servidor não retornou um destino de autorização válido.");
      window.location.assign(destination.href);
    }),
    disconnect: () => void exclusive(async () => {
      const result = await call<{ ok: boolean; provider_revoked: boolean }>({}, undefined, "/api/auth/github-app/disconnect");
      if (!result.ok) throw new Error("Não foi possível confirmar a desconexão. Confira o estado antes de repetir.");
      catalogVersion.current += 1; currentInstallation.current = null; currentJob.current = null;
      invalidateSelection(); setInstallations(emptyPage()); setRepositories(emptyPage()); setInstallationId(null); setJob(null);
      setStatus(previous => previous ? { ...previous, connection: { state: "not_connected" } } : null);
      setNotice(result.provider_revoked ? "Conexão removida do Workbench; a revogação do token enviado ao GitHub foi confirmada. Isso não afirma revogação de todos os tokens nem exclusão do histórico." : "Conexão removida do Workbench. A revogação no GitHub não foi confirmada; gerencie a App no GitHub para revisar as permissões. Seu login e histórico não foram excluídos por esta ação.");
    }),
    moreInstallations: () => void exclusive(async () => {
      const page = installations.nextPage, version = catalogVersion.current;
      if (!page) return;
      const result = await call<PageResponse<{ installations: CatalogInstallation[] }>>({ action: "catalog-installations", page });
      if (alive.current && version === catalogVersion.current) setInstallations(previous => pageResult(previous, result.installations, result, true));
    }),
    moreRepositories: () => { if (installationId && repositories.nextPage) void exclusive(() => loadRepositories(installationId, repositories.nextPage!, catalogVersion.current)); },
    prepare: () => void exclusive(async () => {
      if (!selection || !installationId) return;
      const version = selectionVersion.current, repositoryId = selection.repository.id;
      const revision = selection.revisionInput.trim();
      if (revision && !SHA.test(revision)) throw new Error("Informe o SHA completo de 40 caracteres ou deixe o campo vazio para fixar a branch padrão.");
      const result = await call<NonNullable<CatalogSelection["prepared"]>>({ action: "catalog-authorize", installationId, repositoryId, ...(revision ? { revision } : {}) });
      if (!alive.current || version !== selectionVersion.current) return;
      if (!SHA.test(result.revision) || result.repository.id !== repositoryId || !UUID.test(result.project.id)) throw new Error("Não foi possível conferir a identidade e o commit retornados. Nenhuma análise foi solicitada.");
      if (requestAttempt.current && (requestAttempt.current.projectId !== result.project.id || requestAttempt.current.revision !== result.revision)) requestAttempt.current = null;
      setSelection(previous => previous ? { ...previous, prepared: result, confirmed: false } : null);
    }),
    enqueue: () => void exclusive(async () => {
      const prepared = selection?.prepared;
      if (!prepared || !selection?.confirmed || !status?.jobs_enabled) return;
      const { project, revision } = prepared;
      if (!requestAttempt.current || requestAttempt.current.projectId !== project.id || requestAttempt.current.revision !== revision) requestAttempt.current = { projectId: project.id, revision, id: crypto.randomUUID() };
      let result: { job: CatalogJob };
      try { result = await call<{ job: CatalogJob }>({ action: "enqueue-job", projectId: project.id, revision, requestId: requestAttempt.current.id, confirmed: true }); }
      catch (cause) { setNotice("Uma resposta perdida não garante que o servidor deixou de registrar a solicitação. Consulte seu histórico antes de mudar a seleção; repetir a mesma confirmação preserva o identificador desta tentativa."); throw cause; }
      if (!UUID.test(result.job.id)) throw new Error("Não foi possível confirmar o identificador da solicitação. Consulte o histórico antes de repetir.");
      currentJob.current = result.job.id; setJob(result.job); setPolls(0); setPollFailed(false);
      requestAttempt.current = null; setSelection(previous => previous ? { ...previous, confirmed: false } : null);
      const url = new URL(window.location.href); url.searchParams.set("job", result.job.id);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }),
    refreshJob: () => void exclusive(async () => { await refreshJob(); setPolls(0); setPollFailed(false); }),
    cancelJob: () => void exclusive(async () => {
      const id = currentJob.current;
      if (!id) return;
      const result = await call<{ job: CatalogJob }>({ action: "cancel-job", jobId: id });
      if (alive.current && currentJob.current === id) { setJob(result.job); setPolls(0); setPollFailed(false); }
    }),
  };
  return <GitHubCatalog model={{ demo, status: sessionUnavailable ? null : status, statusLoading: !sessionUnavailable && statusLoading, error, notice, busy, installations, repositories, installationId, filters, selection: sessionUnavailable ? null : selection, job: sessionUnavailable ? null : job, pollingPaused: polls >= pollingDelays.length || pollFailed }} actions={actions} />;
}
