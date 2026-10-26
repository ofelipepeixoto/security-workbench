"use client";
// Full document navigation avoids the observed vinext production routing regression and reloads the server authorization gate.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Activity, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Download, FileCode2, FileText, FolderGit2, GitBranch, LayoutDashboard, LockKeyhole, Plus, RefreshCw, Search, Settings2, Shield, SlidersHorizontal, X, AlertCircle, Menu, User, CircleHelp, ListChecks } from "lucide-react";
import { GitHubCatalogController, catalogFailureScope, type CatalogCall } from "../components/github-catalog-controller";
import { GitHubSessionStatus, type GitHubSessionSnapshot } from "../components/github-session-status";
import { OperationalInfo } from "../components/operational-info";
import { AutomaticGuidance, type AutomaticGuidanceData } from "../components/automatic-guidance";
import { ContextualReview, ContextualReviewController, type ContextualReviewEnvelope } from "../components/contextual-review";
import { buildReviewGuidance, renderReviewGuidanceMarkdown } from "../lib/review-advisor.mjs";
import { newReaImportAttemptTracker } from "../lib/rea-import-attempt.mjs";
import { renderCorrectionPrompt } from "../lib/correction-prompt.mjs";
import { applyWorkbenchRequest, callWorkbenchCatalog, createWorkbenchCatalogRecovery, createWorkbenchRequestScope, downloadWorkbenchMarkdown as download, exportWorkbenchReport, invalidateWorkbenchAccess } from "../lib/workbench-request-scope.mjs";
import { demoProject, demoRun, resetDemo, updateDemoRuns, useDemoHydrated, useDemoRuns } from "../components/demo-workbench";
import type { Comparison, Filters, Finding, FindingsResult, HistoricalFinding, Project, Run, WorkbenchView } from "../components/workbench-types";

const decisions: Record<string, string> = { candidate: "A revisar", confirmed: "Confirmado após revisão", false_positive: "Falso positivo", accepted_risk: "Risco aceito" };
const kinds: Record<string, string> = { "possible-secret": "Possível credencial em código", "broad-workflow-permissions": "Permissões amplas no workflow",
  "rea-structural-endpoint": "Observação estrutural REA: endpoint", "rea-structural-storage": "Observação estrutural REA: armazenamento",
  "rea-structural-worker": "Observação estrutural REA: worker", "rea-structural-service-worker": "Observação estrutural REA: service worker",
  "rea-structural-context-bridge-api": "Observação estrutural REA: ponte de contexto", "rea-structural-ipc-handler": "Observação estrutural REA: IPC",
  "rea-structural-browser-window": "Observação estrutural REA: janela de navegador" };
const confidence: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta" };
const navigation = [
  { id: "dashboard", label: "Visão geral", icon: LayoutDashboard }, { id: "projects", label: "Projetos", icon: FolderGit2 }, { id: "repositories", label: "Repositórios GitHub", icon: GitBranch },
  { id: "findings", label: "Achados", icon: ListChecks }, { id: "runs", label: "Análises", icon: Activity },
  { id: "compare", label: "Comparação", icon: SlidersHorizontal }, { id: "reports", label: "Relatórios", icon: FileText },
  { id: "profile", label: "Perfil", icon: User }, { id: "account", label: "Conta e acesso", icon: Settings2 },
  { id: "help", label: "Ajuda", icon: CircleHelp },
];
const emptyRuns: Run[] = [];
const anonymousSession: GitHubSessionSnapshot = { state: "anonymous" };
const emptyFilters: Filters = { q: "", project: "", status: "", kind: "", from: "", to: "", before: "", after: "", run: "" };

class ApiError extends Error { constructor(message: string, public status: number, public code?: string, public retryAt?: string) { super(message); } }
async function api<T>(payload?: object, csrfToken = "", signal?: AbortSignal, endpoint = "/api/workbench"): Promise<T> {
  const response = await fetch(endpoint, payload ? { method: "POST", headers: { "Content-Type": "application/json", ...(csrfToken ? { "X-Workbench-CSRF": csrfToken } : {}) }, body: JSON.stringify(payload), cache: "no-store", signal } : { cache: "no-store", signal });
  let result: T & { error?: string; code?: string; retry_at?: string };
  try { result = await response.json() as T & { error?: string; code?: string; retry_at?: string }; }
  catch { throw new ApiError("O servidor não retornou uma resposta válida. Confira o histórico antes de tentar novamente.", response.status); }
  if (!response.ok) throw new ApiError(catalogFailureScope(response.status, result.code) === "login_session" ? "Sua sessão expirou ou não está disponível. Entre novamente pelo GitHub para continuar." : result.error || "Não foi possível concluir. Confira o histórico antes de tentar novamente.", response.status, result.code, result.retry_at);
  return result;
}
function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "Horário indisponível" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(parsed) + " UTC";
}
function demoReport(run: Run) {
  return "# Security Workbench — EXEMPLO FICTÍCIO\n\nNenhum repositório foi analisado. Revisões fictícias ficam somente neste navegador.\n\nRepositório: " + run.repo + "\n\nCommit fictício: " + run.revision + "\n\nCobertura parcial: exemplo de " + run.files_read + " arquivos.\n\n" + (run.findings || []).map(item => "## " + kinds[item.kind] + "\n\nEstado: " + decisions[item.status] + "\n\n" + item.evidence + "\n\nImpacto possível: " + item.impact + "\n\nRecomendação: " + item.recommendation).join("\n\n") + "\n\nAusência de detecção não comprova segurança.\n\n" + renderReviewGuidanceMarkdown(run) + "\n\n## Prompt para propor correções\n\nEste relatório é fictício: use o prompt abaixo apenas para conhecer o formato.\n\n" + renderCorrectionPrompt() + "\n";
}
function matchesRun(run: Run, filters: Filters) {
  const day = run.created_at.slice(0, 10);
  return (!filters.q || (run.repo + " " + run.id + " " + run.revision).toLowerCase().includes(filters.q.toLowerCase())) && (!filters.project || run.project_id === filters.project) && (!filters.status || (filters.status === "partial" ? run.status === "complete" && run.partial : run.status === filters.status)) && (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
}
function ErrorBox({ message }: { message: string }) { return <div className="notice error" role="alert"><AlertCircle size={18} /><span>{message}</span></div>; }
function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className="empty"><FileText size={28} aria-hidden="true" /><h2>{title}</h2>{children}</div>; }
function Modal({ title, children, onClose, busy, wide = false }: { title: string; children: ReactNode; onClose: () => void; busy: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); onClose(); }} className={wide ? "modal modal-catalog" : "modal"} aria-labelledby="modal-title" aria-busy={busy}><div className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={20} /></button></div>{children}</dialog>;
}
export function WorkbenchListState({ loading, unavailable, children, retry }: { loading: boolean; unavailable: boolean; children: ReactNode; retry?: () => void }) {
  if (loading) return <p className="loading" role="status">Carregando lista…</p>;
  if (unavailable) return <div className="list-recovery" role="status"><p>Não foi possível carregar a lista. Confira o erro e retome o acesso ou a consulta.</p>{retry && <button className="button secondary" onClick={retry}>Tentar carregar novamente</button>}</div>;
  return <>{children}</>;
}
function reviewCounts(run: Run) {
  if (run.status !== "complete" || !run.findings) return null;
  const reviewed = run.findings.filter(finding => ["confirmed", "false_positive", "accepted_risk"].includes(finding.status)).length;
  return { total: run.findings.length, reviewed, pending: run.findings.length - reviewed };
}
function sourceLabel(run: Pick<Run, "source">, demo = false) { return demo ? "Exemplo fictício" : run.source === "rea-import" ? "REA local importado" : run.source === "github-app" ? "GitHub App" : "GitHub público"; }
export function RunMetadata({ run, demo }: { run: Run; demo: boolean }) {
  const counts = reviewCounts(run);
  return <section className="panel analysis-context" aria-label="Resumo da análise"><dl>
    <div><dt>Projeto</dt><dd>{run.repo}</dd></div>
    <div><dt>Origem</dt><dd>{sourceLabel(run, demo)}</dd></div>
    <div><dt>{run.source === "rea-import" ? "Commit declarado" : "Versão do código"}</dt><dd><code>{run.revision?.slice(0, 12) || "Não informado"}</code>{run.source === "rea-import" ? <small>Vínculo não verificado</small> : !demo && run.verified_revision === true ? <small>Vínculo verificado na aquisição</small> : !demo && run.source === "github-app" ? <small>Verificação depende do resultado da aquisição</small> : null}</dd></div>
    <div><dt>Cobertura</dt><dd>{demo ? "Exemplo parcial" : run.source === "rea-import" ? "Parcial · importação" : run.status !== "complete" ? "Resultado ainda indisponível" : run.partial ? "Parcial" : "Formatos suportados"}</dd></div>
    <div><dt>Revisão humana</dt><dd>{counts ? counts.total ? `${counts.pending} a revisar · ${counts.reviewed} revisados` : "Nenhum candidato" : "Ainda não disponível"}</dd></div>
    <div><dt>{demo ? "arquivos no exemplo" : run.source === "rea-import" ? "arquivos declarados" : "arquivos lidos"}</dt><dd>{run.files_read ?? "Não informado"}</dd></div>
  </dl></section>;
}
export function RunOutcome({ run, demo, busy = false, compareHref = "", refreshHref = "", onExport }: { run: Run; demo: boolean; busy?: boolean; compareHref?: string; refreshHref?: string; onExport?: () => void }) {
  const counts = reviewCounts(run), complete = run.status === "complete", pending = counts?.pending ?? 0;
  const acquisitionFailures: Record<string, string> = {
    github_rate_limited: "O limite de consultas públicas do GitHub foi atingido. A cota é compartilhada por IP nesta versão. Aguarde e consulte o histórico antes de tentar novamente; esta análise não foi concluída.",
    acquisition_timeout: "A leitura do repositório ultrapassou o tempo limite. A cobertura não foi concluída; este registro não representa uma análise sem achados. Consulte o histórico antes de tentar novamente.",
    acquisition_failed: "Não foi possível concluir a leitura do repositório. A causa não foi confirmada. Consulte o histórico antes de tentar novamente; ainda não há um resultado concluído para revisar.",
  };
  const acquisitionFailure = run.status === "failed" && Object.hasOwn(acquisitionFailures, run.failure_code || "") ? acquisitionFailures[run.failure_code || ""] : undefined;
  const firstPending = run.findings?.find(finding => !["confirmed", "false_positive", "accepted_risk"].includes(finding.status));
  const title = !complete ? run.status === "running" ? "A análise está em andamento" : "A análise não foi concluída" : !counts ? "O resultado precisa ser carregado" : pending ? `${pending} ${pending === 1 ? "candidato aguarda" : "candidatos aguardam"} sua revisão` : counts.total ? "Revisões registradas para os candidatos" : run.source === "rea-import" ? "Nenhum candidato foi importado" : "Nenhum candidato detectado no escopo lido";
  return <section className="panel analysis-outcome" id="analysis-result" aria-labelledby="analysis-result-title"><div className="outcome-top"><span className="outcome-icon" aria-hidden="true">{complete ? <ListChecks size={25} /> : <Activity size={25} />}</span><div className="grow"><p className="eyebrow">RESULTADO E PRÓXIMA AÇÃO</p><h2 id="analysis-result-title">{title}</h2></div><RunStatus run={run} /></div>
    <p className="outcome-explanation">{!complete ? acquisitionFailure || (run.failure_code === "interrupted" ? "O processamento foi interrompido. O registro foi preservado; confira seu estado antes de iniciar outra solicitação." : "Confira o estado desta solicitação antes de iniciar outra. Ainda não há um resultado concluído para revisar.") : !counts ? "Os candidatos não estão disponíveis neste registro. Recarregue a análise ou confira seu estado no histórico antes de interpretar o resultado." : pending ? "Confira a evidência e registre sua decisão para cada candidato. Uma detecção ou observação estrutural não confirma uma vulnerabilidade." : counts?.total ? "As decisões estão registradas nesta análise. Você pode conferir o relatório; não detectar novamente um candidato não comprova correção." : "Confira a cobertura e as omissões antes de interpretar o resultado. A ausência de candidatos não comprova segurança."}</p>
    {complete && run.source === "rea-import" && <p className="outcome-boundary">O Workbench importou um artefato declarado pelo operador. O REA não foi executado na hospedagem.</p>}
    {demo && <p className="outcome-boundary">Este resultado é fictício e as decisões ficam somente nesta sessão do navegador.</p>}
    {complete && onExport && <p className="outcome-boundary">O Markdown inclui candidatos, evidências, decisões e um prompt para sua IA propor correções. Confira os dados antes de compartilhá-los. Nenhuma correção é aplicada automaticamente.</p>}
    <div className="button-row outcome-actions">{complete ? <>{!counts && refreshHref ? <a target="_top" className="button primary" href={refreshHref}>Recarregar análise<RefreshCw size={16} /></a> : pending && firstPending ? <a className="button primary" href={"#" + encodeURIComponent(firstPending.fingerprint)}>Revisar próximo candidato<ArrowRight size={16} /></a> : counts?.total && onExport ? <button className="button primary" disabled={busy} onClick={onExport}><Download size={16} />Baixar Markdown</button> : <a className="button primary" href="#analysis-coverage">Entender a cobertura<ArrowRight size={16} /></a>}{onExport && (pending > 0 || !counts?.total) && <button className="button secondary" disabled={busy} onClick={onExport}><Download size={16} />Baixar Markdown</button>}{compareHref && <a target="_top" className="text-button" href={compareHref}>Comparar análises<ArrowRight size={16} /></a>}</> : refreshHref && <a target="_top" className="button primary" href={refreshHref}>Atualizar estado<RefreshCw size={16} /></a>}</div>
  </section>;
}
const omissionReasonLabels = {
  unsupported_node_kind: "Tipo de estrutura ainda não importado",
  unsupported_evidence_authority: "Origem da evidência fora do contrato aceito",
  unsupported_evidence_state: "Estado da evidência fora do contrato aceito",
  artifact_or_location_unavailable: "Artefato ou localização não disponível",
  unsupported_location_kind: "Formato de localização ainda não importado",
  duplicate_observation: "Observação repetida",
  candidate_limit: "Limite de candidatos atingido",
};
function recordedCount(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }
export function RunCoverage({ run, demo = false }: { run: Run; demo?: boolean }) {
  const imported = run.source === "rea-import", provenance = run.provenance;
  const seen = recordedCount(provenance?.observations_seen), accepted = recordedCount(provenance?.observations_imported), omitted = recordedCount(provenance?.observations_omitted);
  const reasons = Object.entries(omissionReasonLabels).flatMap(([key, label]) => {
    const count = recordedCount(provenance?.observations_omitted_by_reason?.[key as keyof typeof omissionReasonLabels]);
    return count !== null && count > 0 ? [{ key, label, count }] : [];
  });
  return <section className="panel analysis-coverage" id="analysis-coverage" aria-labelledby="analysis-coverage-title"><div className="section-heading"><div><h2 id="analysis-coverage-title">O que este resultado cobre</h2><p>{imported ? "Observações estruturais recebidas no artefato e sua importação para revisão." : "Arquivos e regras cobertos por esta análise estática."}</p></div><span className="badge">{imported || run.partial ? "Cobertura parcial" : "Formatos suportados"}</span></div><div className="coverage-body">
    {demo && <p className="coverage-boundary">Esta cobertura faz parte de um exemplo fictício. Nenhum arquivo real foi lido.</p>}{imported ? <><dl className="coverage-counts">{[["Recebidas no artefato", seen], ["Importadas para revisão", accepted], ["Não importadas", omitted]].map(([label, count]) => <div key={String(label)}><dt>{label}</dt><dd>{count ?? <span className="not-recorded">Não registrado</span>}</dd></div>)}</dl>
      <p>Recebidas não significa vulnerabilidades. Somente a projeção aceita pelo Workbench vira candidato; estatísticas e cobertura do REA são declaradas pelo artefato.</p>
      <div className="coverage-reasons"><h3>Por que observações não foram importadas?</h3>{reasons.length ? <ul>{reasons.map(reason => <li key={reason.key}><span>{reason.label}</span><b>{reason.count}</b></li>)}</ul> : omitted === 0 && provenance?.observations_omitted_by_reason ? <p>Nenhuma omissão registrada nesta importação.</p> : <p>Motivos não registrados nesta importação. O histórico foi preservado; não é possível atribuir motivos retroativamente.</p>}</div>
      {(seen === null || accepted === null || omitted === null) && <p className="coverage-legacy">Há contagens não registradas nesta importação. Elas não foram estimadas a partir dos candidatos ou das omissões.</p>}
      <p className="coverage-boundary">Origem, execução, isolamento e vínculo com o commit não foram comprovados pelo Workbench. Cobertura parcial e omissões precisam acompanhar qualquer conclusão.</p>
    </> : <><p>{run.files_read ?? "Quantidade não informada de"} {demo ? "arquivos no exemplo" : "arquivos lidos"}{run.bytes_read != null ? ` · ${run.bytes_read} bytes` : ""}. Até 20 arquivos suportados, 256 KiB por arquivo e 2 MiB no total.</p>{run.omissions?.length ? <><h3>Limites e omissões registrados</h3><ul>{run.omissions.map((omission, index) => <li key={index}>{omission}</li>)}</ul></> : <p>{run.partial ? "A análise registra cobertura parcial, mas não detalha as omissões neste histórico." : "Nenhuma omissão foi registrada. Isso não significa cobertura de todos os tipos de arquivo ou de todas as vulnerabilidades."}</p>}<p>Não inclui histórico Git completo, consulta de CVEs ou execução do código alvo.</p></>}
  </div></section>;
}
export function RunEvidenceDetails({ run }: { run: Run }) {
  const imported = run.source === "rea-import";
  return <section className="panel details-panel" id="analysis-technical"><details><summary>Identidade e detalhes técnicos<span>Commit completo, hashes e limites</span></summary><div className="technical-body"><h3>Identidade do resultado</h3><dl><dt>Repositório</dt><dd>{run.repo}</dd><dt>ID estável</dt><dd>{run.repository_id ?? "Não informado"}</dd><dt>ID da análise</dt><dd><code>{run.id}</code></dd><dt>{imported ? "Commit declarado" : "Commit"}</dt><dd><code>{run.revision || "Não informado"}</code></dd><dt>{imported ? "Digest declarado" : "Digest"}</dt><dd><code>{run.digest || "Não informado"}</code><small>Impressão digital registrada para o artefato.</small></dd><dt>{imported ? "Bytes declarados" : "Bytes lidos"}</dt><dd>{run.bytes_read ?? "Não informado"}</dd>{imported && <><dt>Achados declarados pelo REA</dt><dd>{recordedCount(run.provenance?.native_findings_declared) ?? "Não registrado nesta importação"}<small>Contagem informativa do artefato; não equivale aos candidatos importados.</small></dd></>}</dl>
    <h3>Dependências inventariadas</h3><p>{imported ? "Esta projeção REA não fornece inventário de dependências nem consulta CVEs." : "Inventário dos manifestos lidos, sem consulta de CVEs."}</p>{!imported && (run.dependencies?.length ? <ul className="dependency-list">{run.dependencies.map((dependency, index) => <li key={index}><strong>{dependency.name}</strong><code>{dependency.version}</code><span>{dependency.source}</span></li>)}</ul> : <p>Nenhuma dependência inventariada neste resultado.</p>)}
    {imported && <><h3>Limites registrados</h3><p>Importação de JSON de até 1 MiB, com projeção de até 100 candidatos estruturais. Estatísticas, hashes e cobertura são declarados pelo artefato; não comprovam leitura dos arquivos, execução ou isolamento do REA.</p>{run.omissions?.length ? <ul>{run.omissions.map((omission, index) => <li key={index}>{omission}</li>)}</ul> : null}</>}
  </div></details></section>;
}
function RunStatus({ run }: { run: Run }) { return <span className={"badge " + (run.status === "complete" ? run.partial ? "amber" : "green" : "amber")}>{run.status === "complete" ? run.partial ? "Concluída · parcial" : "Concluída" : run.status === "running" ? "Em andamento" : "Não concluída"}</span>; }
export function RunsTable({ items, href, report = false, restricted = false }: { items: Run[]; href: (path: string, query?: Record<string, string>) => string; report?: boolean; restricted?: boolean }) {
  return items.length ? <div className="table-scroll" role="region" aria-label="Histórico de análises" tabIndex={0}><table><thead><tr><th scope="col">Repositório / versão</th><th scope="col">Quando</th><th scope="col">Arquivos</th><th scope="col">Detecções</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Ação</span></th></tr></thead><tbody>{items.map(run => <tr key={run.id}><td><strong>{run.repo.split("/")[1]}</strong><small>{run.revision?.slice(0, 12) || "Versão não fixada"} · {sourceLabel(run, run.id.startsWith("example-"))} · {run.id.slice(0, 12)}</small></td><td>{date(run.created_at)}</td><td>{run.files_read ?? "—"}{run.source === "rea-import" && <small>declarados no artefato</small>}</td><td>{run.findings_count ?? run.findings?.length ?? "—"}</td><td><RunStatus run={run} /></td><td><a target="_top" className="text-button" href={report ? href("/reports", { run: run.id }) : href("/runs/" + encodeURIComponent(run.id))}>{report ? "Ver Markdown" : run.status === "complete" ? "Revisar" : "Ver estado"}<ArrowRight size={15} /></a></td></tr>)}</tbody></table></div> : restricted ? <Empty title="Histórico com acesso restrito"><p>Parte do histórico depende da revalidação do acesso aos repositórios. Consulte o catálogo; uma lista vazia nesta seleção não comprova ausência de análises ou achados.</p></Empty> : <Empty title="Nenhuma análise nesta seleção"><p>Ajuste os filtros ou inicie uma análise de um projeto autorizado.</p></Empty>;
}
function FiltersForm({ path, demo, filters, projects, findings = false, state = true }: { path: string; demo: boolean; filters: Filters; projects: Project[]; findings?: boolean; state?: boolean }) {
  return <form method="get" action={path} target="_top" className="toolbar filter-form" aria-label="Filtros">{demo && <input type="hidden" name="demo" value="1" />}<label className="search"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar {findings ? "achados por repositório, arquivo ou evidência" : "repositório, análise ou commit"}</span><input name="q" maxLength={250} defaultValue={filters.q} placeholder={findings ? "Repositório, arquivo ou evidência" : "Repositório ou commit"} /></label><label className="history-filter">Projeto<select name="project" defaultValue={filters.project}><option value="">Todos</option>{projects.map(project => <option value={project.id} key={project.id}>{project.repo}</option>)}</select></label>{state && <label className="history-filter">{findings ? "Decisão" : "Estado"}<select name="status" defaultValue={filters.status}><option value="">Todos</option>{findings ? Object.entries(decisions).map(([value, label]) => <option value={value} key={value}>{label}</option>) : <><option value="complete">Concluída</option><option value="partial">Cobertura parcial</option><option value="running">Em andamento</option><option value="failed">Não concluída</option></>}</select></label>}{findings && <label className="history-filter">Categoria<select name="kind" defaultValue={filters.kind}><option value="">Todas</option>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}<label className="history-filter">De (UTC)<input type="date" name="from" defaultValue={filters.from} /></label><label className="history-filter">Até (UTC)<input type="date" name="to" defaultValue={filters.to} /></label><button type="submit" className="button secondary">Aplicar filtros</button><a className="text-button" target="_top" href={path + (demo ? "?demo=1" : "")}>Limpar</a></form>;
}
function FindingCard({ finding, busy, save, index, guidance }: { finding: Finding; busy: boolean; save: (finding: Finding, decision: string) => void; index: number; guidance?: AutomaticGuidanceData }) {
  const [decision, setDecision] = useState(finding.status);
  const titleId = `finding-title-${finding.fingerprint}`, selectId = `finding-decision-${finding.fingerprint}`, helpId = `finding-help-${finding.fingerprint}`;
  const decisionHelp: Record<string, string> = { candidate: "Ainda preciso conferir a evidência e o contexto.", confirmed: "Conferi a evidência e confirmei o problema neste contexto.", false_positive: "Conferi a evidência; ela não representa este problema no contexto analisado.", accepted_risk: "O risco foi reconhecido e sua aceitação é uma decisão humana; isso não indica correção." };
  return <section className="finding" id={finding.fingerprint} tabIndex={-1} aria-labelledby={titleId}><div className="finding-heading"><span className="finding-index">{String(index + 1).padStart(2, "0")}</span><div className="grow"><p className="eyebrow">{finding.path}:{finding.line}</p><h3 id={titleId}>{kinds[finding.kind] || "Candidato detectado"}</h3></div><span className={"badge " + (finding.status === "candidate" ? "amber" : "")}>{decisions[finding.status] || finding.status}</span></div><div className="finding-content">{finding.kind.startsWith("rea-structural-") && <p className="finding-context">Esta observação descreve uma estrutura do código. Sua presença, por si só, não confirma uma vulnerabilidade.</p>}<div className="evidence-label">EVIDÊNCIA · CONFIANÇA {confidence[finding.confidence]?.toUpperCase() || finding.confidence}</div><p className="evidence">{finding.evidence}</p><div className="finding-guidance"><div><h4>Impacto possível</h4><p>{finding.impact}</p></div><div><h4>O que fazer</h4><p>{finding.recommendation}</p></div></div><AutomaticGuidance guidance={guidance} findingId={finding.fingerprint} /><form className="review-row" aria-labelledby={titleId} onSubmit={event => { event.preventDefault(); save(finding, decision); }}><div className="review-choice"><label htmlFor={selectId}>Sua decisão <span className="sr-only">sobre {finding.path}, linha {finding.line}</span></label><select id={selectId} aria-describedby={helpId} value={decision} onChange={event => setDecision(event.target.value)} disabled={busy}>{Object.entries(decisions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><p id={helpId}>{decisionHelp[decision] || "Confira a evidência antes de registrar a decisão."}</p></div><button className="button secondary" disabled={busy}><Check size={16} />{busy ? "Salvando…" : "Salvar revisão"}<span className="sr-only"> de {finding.path}, linha {finding.line}</span></button></form></div></section>;
}

export default function Workbench({ signedIn, name, initialSession = anonymousSession, githubReady = false, csrfToken = "", initialView = "dashboard", initialRunId = "", initialFilters = emptyFilters, demoRequested = false }: { signedIn: boolean; name: string; initialSession?: GitHubSessionSnapshot; githubReady?: boolean; csrfToken?: string; initialView?: WorkbenchView; initialRunId?: string; initialFilters?: Filters; demoRequested?: boolean }) {
  const demo = !signedIn || demoRequested;
  const demoRuns = useDemoRuns();
  const demoHydrated = useDemoHydrated();
  const [realProjects, setProjects] = useState<Project[]>([]), [realRuns, setRuns] = useState<Run[]>([]), [realSelected, setSelected] = useState<Run | null>(null);
  const [loading, setLoading] = useState(signedIn && !demo && initialView !== "repositories"), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [listFailed, setListFailed] = useState(false), [listAccessRestricted, setListAccessRestricted] = useState(false), [aggregateAccessRestricted, setAggregateAccessRestricted] = useState(false);
  const accessRestricted = listAccessRestricted || aggregateAccessRestricted;
  const [accessRequests] = useState(() => createWorkbenchRequestScope({ expiresAt: initialSession.state === "authenticated" ? initialSession.expiresAt : Infinity }));
  const [sessionLost, setSessionLost] = useState(false), [refreshKey, setRefreshKey] = useState(0), [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<"project" | "scan" | "catalog" | "rea" | null>(null), [repo, setRepo] = useState(""), [identity, setIdentity] = useState<{ repo: string; id: number; branch: string } | null>(null), [confirmed, setConfirmed] = useState(false);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogRecovery] = useState(createWorkbenchCatalogRecovery);
  const [catalogAccessBlocked, setCatalogAccessBlocked] = useState(false);
  const [projectId, setProjectId] = useState(""), [revision, setRevision] = useState(""), [advanced, setAdvanced] = useState(false);
  const [aggregate, setAggregate] = useState<FindingsResult | null>(null), [aggregateError, setAggregateError] = useState("");
  const [before, setBefore] = useState(initialFilters.before), [after, setAfter] = useState(initialFilters.after), [comparison, setComparison] = useState<Comparison | null>(null);
  const [linkedRuns, setLinkedRuns] = useState<Run[]>([]);
  const [report, setReport] = useState<{ filename: string; markdown: string; isCurrent: () => boolean } | null>(null);
  const [reaFile, setReaFile] = useState<File | null>(null), [reaConfirmed, setReaConfirmed] = useState(false);
  const reaAttempts = useRef(newReaImportAttemptTracker());
  const reaSubmitting = useRef(false);
  const mobileMenuTrigger = useRef<HTMLButtonElement>(null);
  const accessRecoveryAttempted = useRef(false);
  const catalogNavigation = useRef<() => boolean>(() => false);
  const listUnavailable = listFailed || sessionLost;
  const projects = demo ? [demoProject] : sessionLost ? [] : realProjects;
  const runs = demo ? demoRuns : sessionLost ? emptyRuns : realRuns;
  const selected = demo ? demoRuns.find(run => run.id === initialRunId) || null : sessionLost ? null : realSelected;
  const completed = runs.filter(run => run.status === "complete");
  const comparableRuns = [...completed, ...(sessionLost ? [] : linkedRuns.filter(run => run.status === "complete" && !completed.some(item => item.id === run.id)))];
  const needsAggregate = initialView === "dashboard" || initialView === "findings";
  const historical: HistoricalFinding[] = demo ? demoRuns.flatMap(run => (run.findings || []).map(finding => ({ ...finding, run_id: run.id, project_id: run.project_id, repo: run.repo, revision: run.revision || "", created_at: run.created_at }))) : sessionLost ? [] : aggregate?.findings || [];
  const aggregateReady = demo || (!sessionLost && Boolean(aggregate));
  const dashboardRuns = runs.filter(run => matchesRun(run, initialFilters));
  const dashboardFindings = historical.filter(finding => (!initialFilters.project || finding.project_id === initialFilters.project) && (!initialFilters.q || (finding.repo + " " + finding.run_id + " " + finding.revision).toLowerCase().includes(initialFilters.q.toLowerCase())) && (!initialFilters.from || finding.created_at.slice(0, 10) >= initialFilters.from) && (!initialFilters.to || finding.created_at.slice(0, 10) <= initialFilters.to));
  const totalDetections = dashboardRuns.filter(run => run.status === "complete").reduce((sum, run) => sum + (run.findings_count ?? run.findings?.length ?? 0), 0);
  const filters = initialFilters;
  const filteredRuns = runs.filter(run => matchesRun(run, filters));
  const filteredFindings = historical.filter(finding => (!filters.q || (finding.repo + " " + finding.path + " " + finding.evidence).toLowerCase().includes(filters.q.toLowerCase())) && (!filters.project || finding.project_id === filters.project) && (!filters.status || finding.status === filters.status) && (!filters.kind || finding.kind === filters.kind) && (!filters.from || finding.created_at.slice(0, 10) >= filters.from) && (!filters.to || finding.created_at.slice(0, 10) <= filters.to));
  const href = (path: string, query: Record<string, string> = {}) => { const params = new URLSearchParams(query); if (demo) params.set("demo", "1"); return path + (params.size ? "?" + params.toString() : ""); };
  const go = (path: string, query: Record<string, string> = {}) => {
    window.location.assign(href(path, query));
  };
  const handleFailure = useCallback((cause: unknown) => {
    if (cause instanceof Error && cause.name === "AbortError") return;
    // Invalidate synchronously, before React's next render or effect cleanup.
    // A late HTTP 200 must never download, navigate or repopulate old data.
    const scope = invalidateWorkbenchAccess(accessRequests, cause, catalogRecovery);
    setError(cause instanceof Error ? cause.message : "Não foi possível concluir. Tente novamente.");
    if (scope === "repository_access" || scope === "login_session") {
      // Drop the catalog's already-loaded rows as well as in-flight responses.
      // Repository revocation does not invalidate the independent login.
      setCatalogAccessBlocked(true);
      reaAttempts.current.invalidate(); reaSubmitting.current = false; setBusy(false); setCatalogBusy(false); setModal(null); setIdentity(null); setReaFile(null); setReaConfirmed(false); setNotice(""); setComparison(null); setBefore(""); setAfter(""); setProjects([]); setRuns([]); setLinkedRuns([]); setSelected(null); setAggregate(null); setReport(null);
    }
    if (scope === "repository_access") {
      setListAccessRestricted(true); setAggregateAccessRestricted(true); setListFailed(true);
      // Refresh only metadata once after a permission change. Never enqueue or
      // retry an analysis, and never leave cached private data on this screen.
      if (!accessRecoveryAttempted.current && initialView !== "repositories") { accessRecoveryAttempted.current = true; setLoading(true); setRefreshKey(value => value + 1); }
      return;
    }
    if (scope === "login_session") { setSessionLost(true); setLoading(false); }
  }, [accessRequests, catalogRecovery, initialView]);
  const handleSessionLost = useCallback(() => handleFailure(new ApiError("Sua sessão GitHub não está confirmada. Entre novamente ou recarregue com a conta atual antes de consultar dados reais.", 401)), [handleFailure]);
  const catalogCall: CatalogCall = useCallback(async <T,>(payload: object, signal?: AbortSignal, endpoint = "/api/workbench"): Promise<T> => {
    const request = accessRequests.begin(signal);
    return callWorkbenchCatalog(request, catalogRecovery, current => api<T>(payload, csrfToken, current.signal, endpoint), handleFailure, result => {
      if (endpoint === "/api/auth/github-app/disconnect" && (result as { ok?: boolean }).ok) handleFailure(new ApiError("A conexão da GitHub App foi removida. O login permanece separado; revalide o acesso aos repositórios.", 401, "disconnected"));
    });
  }, [accessRequests, catalogRecovery, csrfToken, handleFailure]);
  const captureContextualAccess = useCallback(() => accessRequests.capture(), [accessRequests]);
  const contextualTransport = useCallback(async ({method,signal}:{method:"GET"|"POST";signal:AbortSignal}):Promise<ContextualReviewEnvelope> => {
    if (!selected?.id || demo) throw new DOMException("Contexto indisponível.", "AbortError");
    const request = accessRequests.begin(signal);
    try {
      request.assertCurrent();
      const endpoint = "/api/workbench/contextual-review" + (method === "GET" ? "?runId=" + encodeURIComponent(selected.id) : "");
      const result = await api<ContextualReviewEnvelope>(method === "POST" ? {runId:selected.id} : undefined, csrfToken, request.signal, endpoint);
      request.assertCurrent(); return result;
    } finally { request.finish(); }
  }, [accessRequests,csrfToken,demo,selected?.id]);
  // The parent must open before the catalog's passive effects capture tickets.
  // Layout cleanup/reopening also preserves StrictMode's setup/cleanup replay.
  useLayoutEffect(() => { accessRequests.open(); return () => accessRequests.close(); }, [accessRequests]);
  useEffect(() => {
    if (!mobileMenu) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { setMobileMenu(false); mobileMenuTrigger.current?.focus(); } };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenu]);
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  useEffect(() => {
    if (demo || !signedIn || sessionLost || initialView === "repositories") return;
    const request = accessRequests.begin();
    void applyWorkbenchRequest(request, current => api<{ projects: Project[]; runs: Run[]; access_restricted?: boolean }>(undefined, csrfToken, current.signal), {
      success(result) { setProjects(result.projects); setRuns(result.runs); setListAccessRestricted(Boolean(result.access_restricted)); setListFailed(false); setLoading(false); },
      failure(cause) { handleFailure(cause); setListFailed(true); setLoading(false); },
    });
    return request.finish;
  }, [accessRequests, signedIn, demo, sessionLost, initialView, csrfToken, refreshKey, handleFailure]);
  useEffect(() => {
    if (demo || !signedIn || sessionLost || !needsAggregate) return;
    const request = accessRequests.begin();
    void applyWorkbenchRequest(request, current => api<FindingsResult>({ action: "findings" }, csrfToken, current.signal), {
      success(result) { setAggregate(result); setAggregateAccessRestricted(Boolean(result.access_restricted)); setAggregateError(""); },
      failure(cause) { setAggregateError("As decisões de revisão não puderam ser carregadas."); handleFailure(cause); },
    });
    return request.finish;
  }, [accessRequests, demo, signedIn, sessionLost, needsAggregate, csrfToken, refreshKey, handleFailure]);
  useEffect(() => {
    if (demo || !signedIn || sessionLost || initialView !== "detail" || !initialRunId) return;
    const request = accessRequests.begin();
    void applyWorkbenchRequest(request, current => api<{ run: Run }>({ action: "run", runId: initialRunId }, csrfToken, current.signal), { success: result => setSelected(result.run), failure: handleFailure });
    return request.finish;
  }, [accessRequests, demo, signedIn, sessionLost, initialView, initialRunId, csrfToken, handleFailure]);
  useEffect(() => {
    if (demo || !signedIn || sessionLost || initialView !== "reports" || !initialFilters.run) return;
    const request = accessRequests.begin();
    void applyWorkbenchRequest(request, current => api<{ filename: string; markdown: string }>({ action: "report", runId: initialFilters.run }, csrfToken, current.signal), { success: result => setReport({ ...result, isCurrent: accessRequests.capture() }), failure: handleFailure });
    return request.finish;
  }, [accessRequests, demo, signedIn, sessionLost, initialView, initialFilters.run, csrfToken, handleFailure]);

  useEffect(() => {
    if (demo || !signedIn || sessionLost || loading || listFailed || initialView !== "compare") return;
    const missing = [...new Set([initialFilters.before, initialFilters.after])].filter(id => id && !runs.some(run => run.id === id) && !linkedRuns.some(run => run.id === id));
    if (!missing.length) return;
    const request = accessRequests.begin();
    void applyWorkbenchRequest(request, current => Promise.all(missing.map(runId => api<{ run: Run }>({ action: "run", runId }, csrfToken, current.signal))), { success: results => setLinkedRuns(current => [...current, ...results.map(result => result.run)]), failure: handleFailure });
    return request.finish;
  }, [accessRequests, demo, signedIn, sessionLost, loading, listFailed, initialView, initialFilters.before, initialFilters.after, runs, linkedRuns, csrfToken, handleFailure]);

  function refresh() { accessRecoveryAttempted.current = false; setLoading(true); setListFailed(false); setError(""); setAggregateError(""); setRefreshKey(value => value + 1); }
  function openProject() { reaAttempts.current.invalidate(); setError(""); setIdentity(null); setRepo(""); setConfirmed(false); setModal("project"); }
  function openScan(id?: string) {
    if (!accessRequests.isOpen()) return;
    reaAttempts.current.invalidate();
    const target = id ? projects.find(project => project.id === id) : projects[0];
    // New real analyses start with the current authorized GitHub catalog,
    // independently of projects already persisted in the Workbench.
    if (!demo && (!id || target?.source === "github-app" || target?.installation_id || !target)) {
      catalogRecovery.resume(); setCatalogAccessBlocked(false);
      catalogNavigation.current = accessRequests.capture();
      setError(""); setCatalogBusy(false); setModal("catalog"); return;
    }
    if (!target) { openProject(); return; }
    setError(""); setProjectId(target.id); setRevision(""); setAdvanced(false); setModal("scan");
  }
  function showDemo() {
    resetDemo();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Explicitly enter the fictitious mode with a full reload.
    window.location.assign("/dashboard?demo=1");
  }
  function openRea() { reaAttempts.current.invalidate(); setError(""); setProjectId(projects[0]?.id || ""); setRevision(""); setReaFile(null); setReaConfirmed(false); setModal("rea"); }
  function retryCatalog() { if (!accessRequests.isOpen()) return; catalogRecovery.resume(); setError(""); setCatalogAccessBlocked(false); }
  async function importRea(event: FormEvent) {
    event.preventDefault();
    if (busy || reaSubmitting.current || demo || !signedIn || sessionLost || !reaConfirmed || !reaFile) return;
    if (reaFile.size > 1024 * 1024) { setError("O JSON deve ter no máximo 1 MiB. Reduza o artefato localmente antes de importar."); return; }
    const request = accessRequests.begin();
    if (!request.isCurrent()) return;
    const contextVersion = reaAttempts.current.captureContext();
    reaSubmitting.current = true; setBusy(true); setError("");
    await applyWorkbenchRequest(request, async current => {
      let evidence: string, bytes: ArrayBuffer;
      try {
        bytes = await reaFile.arrayBuffer(); current.assertCurrent();
        evidence = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch (cause) {
        current.assertCurrent();
        throw cause instanceof Error && cause.name === "AbortError" ? cause : new Error("O JSON precisa usar UTF-8 válido. Confira o arquivo localmente antes de importar.");
      }
      const digest = await crypto.subtle.digest("SHA-256", bytes); current.assertCurrent();
      const reportDigest = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
      const requestId = reaAttempts.current.resolve({ projectId, commitSha: revision, reportDigest, contextVersion });
      if (!requestId) throw new Error("A seleção mudou. Confira projeto, commit e arquivo antes de importar novamente.");
      const result = await api<{ run: Run }>({ projectId, revision, requestId, evidence }, csrfToken, current.signal, "/api/workbench/rea");
      return { result, requestId };
    }, {
      success({ result, requestId }) { reaAttempts.current.resetAfterSuccess({ id: requestId }); go("/runs/" + encodeURIComponent(result.run.id)); },
      failure(cause) { handleFailure(cause); if (request.isCurrent()) setNotice("Confira o histórico antes de repetir a importação."); },
      settled() { reaSubmitting.current = false; setBusy(false); },
    });
  }
  async function inspectRepo(event: FormEvent) {
    event.preventDefault(); const request = accessRequests.begin(); if (!request.isCurrent()) return;
    setBusy(true); setError("");
    await applyWorkbenchRequest(request, async current => demo ? { repo: demoProject.repo, id: 100, branch: "main" } : (await api<{ repository: { repo: string; id: number; branch: string } }>({ action: "inspect", repo }, csrfToken, current.signal)).repository, {
      success(result) { setIdentity(result); setConfirmed(false); }, failure: handleFailure, settled: () => setBusy(false),
    });
  }
  async function authorize() {
    if (!identity || !confirmed) return;
    const request = accessRequests.begin(); if (!request.isCurrent()) return;
    setBusy(true); setError("");
    await applyWorkbenchRequest(request, current => demo ? null : api({ action: "authorize", repo: identity.repo, repositoryId: identity.id, confirmed: true }, csrfToken, current.signal), {
      success() { if (demo) { setNotice("Projeto fictício conferido. Nenhuma autorização real foi registrada."); setModal(null); } else go("/projects"); }, failure: handleFailure, settled: () => setBusy(false),
    });
  }
  async function scan(event: FormEvent) {
    event.preventDefault(); const request = accessRequests.begin(); if (!request.isCurrent()) return;
    setBusy(true); setError("");
    await applyWorkbenchRequest(request, async current => {
      if (!demo && projects.some(project => project.id === projectId && (project.source === "github-app" || project.installation_id))) throw new Error("Use o catálogo GitHub para revalidar este repositório e solicitar sua análise por job.");
      if (!demo) return (await api<{ run: Run }>({ action: "scan", projectId, requestId: crypto.randomUUID(), revision: advanced ? revision : null }, csrfToken, current.signal)).run;
      const run = { ...demoRun, id: "example-" + crypto.randomUUID(), created_at: new Date().toISOString(), revision: advanced ? revision.toLowerCase() : demoRun.revision };
      if (!updateDemoRuns(runs => [run, ...runs], true)) throw new Error("O armazenamento da sessão do navegador está indisponível. A nova análise fictícia precisa dele para continuar acessível após a navegação; use as análises de exemplo existentes.");
      return run;
    }, {
      success: run => go("/runs/" + encodeURIComponent(run.id)),
      failure(cause) { handleFailure(cause); if (request.isCurrent()) setNotice("Confira o histórico antes de iniciar outra análise; uma falha de rede não garante que a solicitação foi interrompida."); },
      settled: () => setBusy(false),
    });
  }
  async function review(item: Finding, decision: string) {
    if (!selected) return;
    const request = accessRequests.begin(); if (!request.isCurrent()) return;
    setBusy(true); setError("");
    await applyWorkbenchRequest(request, async current => {
      if (!demo) return { run: (await api<{ run: Run }>({ action: "review", runId: selected.id, fingerprint: item.fingerprint, decision }, csrfToken, current.signal)).run, persisted: true };
      const persisted = updateDemoRuns(runs => runs.map(run => run.id === selected.id ? { ...run, findings: run.findings?.map(finding => finding.fingerprint === item.fingerprint ? { ...finding, status: decision } : finding) } : run));
      return { run: null, persisted };
    }, {
      success({ run, persisted }) { if (run) setSelected(run); setNotice(demo ? persisted ? "Revisão fictícia mantida nesta sessão do navegador. Nada foi gravado no servidor." : "Armazenamento indisponível: a revisão fictícia vale somente nesta tela e será perdida ao navegar ou recarregar. Nada foi gravado no servidor." : "Revisão registrada no servidor. Recarregue esta URL para conferir a persistência."); },
      failure: handleFailure, settled: () => setBusy(false),
    });
  }
  async function exportReport(run: Run) {
    const request = accessRequests.begin(); if (!request.isCurrent()) return;
    setBusy(true); setError("");
    await exportWorkbenchReport(request, current => demo ? { filename: "exemplo-security-workbench.md", markdown: demoReport(run) } : api<{ filename: string; markdown: string }>({ action: "report", runId: run.id }, csrfToken, current.signal), {
      download, notice: () => setNotice("Download solicitado: relatório de candidatos, decisões e prompt para propor correções. Confira o Markdown na pasta de downloads do navegador."), failure: handleFailure, settled: () => setBusy(false),
    });
  }
  async function compare(event: FormEvent) {
    event.preventDefault(); const request = accessRequests.begin(); if (!request.isCurrent()) return;
    setBusy(true); setError(""); setComparison(null);
    await applyWorkbenchRequest(request, async currentRequest => {
      const left = comparableRuns.find(run => run.id === before), right = comparableRuns.find(run => run.id === after);
      if (!left || !right || left.id === right.id || left.project_id !== right.project_id || (left.source || "github-public") !== (right.source || "github-public")) throw new Error("Escolha duas análises concluídas diferentes do mesmo projeto e método.");
      if (!demo) return (await api<{ comparison: Comparison }>({ action: "compare", before, after }, csrfToken, currentRequest.signal)).comparison;
      const old = new Set(left.findings?.map(item => item.fingerprint)), current = new Set(right.findings?.map(item => item.fingerprint));
      return { new: [...current].filter(item => !old.has(item)), no_longer_detected: [...old].filter(item => !current.has(item)), still_detected: [...current].filter(item => old.has(item)), partial: left.partial || right.partial };
    }, {
      success(result) { setComparison(result); window.history.replaceState(null, "", href("/compare", { before, after })); }, failure: handleFailure, settled: () => setBusy(false),
    });
  }
  const selectedGuidance = selected ? selected.guidance ?? buildReviewGuidance(selected) : undefined;
  const close = () => { if (!busy && !catalogBusy) { catalogNavigation.current = () => false; reaAttempts.current.invalidate(); setModal(null); } };
  const currentNav = initialView === "detail" ? "runs" : initialView;
  const currentLabel = initialView === "detail" ? "Revisão da análise" : initialView === "onboarding" ? "Primeiros passos" : navigation.find(item => item.id === currentNav)?.label || "Workbench";
  const reportRun = demo ? demoRuns.find(run => run.id === filters.run) : null;
  const reportContent = reportRun ? { filename: "exemplo-security-workbench.md", markdown: demoReport(reportRun), isCurrent: () => true } : sessionLost ? null : report;
  return <div className="app-shell"><a href="#main" className="skip-link">Pular para conteúdo</a>
    <aside className="sidebar"><div className="mobile-brand"><a target="_top" className="brand" href={href("/dashboard")} aria-label="Security Workbench — visão geral"><span className="brand-mark"><Shield size={23} /></span><span>Security<br /><b>Workbench</b></span></a><button ref={mobileMenuTrigger} className="mobile-menu icon-button" aria-expanded={mobileMenu} aria-controls="workspace-navigation" aria-label={mobileMenu ? "Fechar navegação" : "Abrir navegação"} onClick={() => setMobileMenu(value => !value)}>{mobileMenu ? <X size={22} /> : <Menu size={22} />}</button></div><p className="sidebar-label">ÁREA DE TRABALHO</p><nav id="workspace-navigation" className={mobileMenu ? "is-open" : ""} aria-label="Principal">{navigation.map(item => <a target="_top" key={item.id} className={"nav-item " + (currentNav === item.id ? "active" : "")} aria-current={currentNav === item.id ? "page" : undefined} href={href("/" + item.id)}><item.icon size={19} aria-hidden="true" />{item.label}{item.id === "projects" && projects.length > 0 && <span className="nav-count">{projects.length}</span>}</a>)}</nav><div className="sidebar-footer"><LockKeyhole size={17} /><div><strong>{signedIn && !demo ? "Espaço pessoal" : "Exemplo público"}</strong><small>{signedIn && !demo ? "Dados da sua conta" : "Dados fictícios"}</small></div></div></aside>
    <div className="workspace"><header className="topbar"><nav className="breadcrumb" aria-label="Localização"><a target="_top" href={href("/dashboard")}>Workbench</a><ChevronRight size={13} aria-hidden="true" /><strong aria-current="page">{currentLabel}</strong></nav><GitHubSessionStatus initialSession={initialSession} demo={demo} githubReady={githubReady} sessionLost={sessionLost} csrfToken={csrfToken} onSessionLost={handleSessionLost} /></header>
      {demo && <div className="demo-banner"><span><strong>Demonstração</strong> · Dados fictícios guardados apenas nesta sessão do navegador. Nenhum repositório é analisado.</span>{signedIn ? <a target="_top" href="/dashboard">Voltar à operação real</a> : <a target="_top" href="/access">Entrar como proprietário</a>}</div>}
      <main id="main" className="main-content" tabIndex={-1}>{error && !modal && <ErrorBox message={error} />}{notice && !modal && <div className="notice success" role="status"><CheckCircle2 size={18} /><span>{notice}</span><button className="icon-button" onClick={() => setNotice("")} aria-label="Dispensar aviso"><X size={14} /></button></div>}
        {(!signedIn || sessionLost) && <div className="login-note"><LockKeyhole size={20} /><div><strong>{sessionLost ? "Entre novamente para continuar" : "A demonstração é pública. Seus projetos reais exigem GitHub."}</strong><p>A operação real depende da autorização de acesso no servidor.</p></div><a className="button primary" target="_top" href="/access">Entrar com GitHub<ArrowRight size={16} /></a></div>}
        {loading && <p className="loading" role="status">Carregando projetos e histórico da sua conta…</p>}{accessRestricted && !demo && !sessionLost && <p className="notice" role="status">Parte do histórico não está disponível porque o acesso atual a repositórios da GitHub App não foi confirmado. Uma lista reduzida não significa ausência de projetos ou análises.</p>}
        {initialView === "repositories" && (catalogAccessBlocked && !sessionLost ? <section className="panel"><div className="section-heading"><div><h1>Acesso ao catálogo interrompido</h1><p>O acesso a um repositório ou à solicitação não foi confirmado. As listas anteriores foram retiradas. Nenhuma análise foi solicitada novamente.</p></div><button className="button secondary" onClick={retryCatalog}>Revalidar acesso aos repositórios</button></div></section> : <GitHubCatalogController call={catalogCall} captureAccess={accessRequests.capture} demo={demo} sessionUnavailable={sessionLost} initialJob={initialFilters.job || ""} onUnauthorized={handleFailure} />)}
        {initialView === "dashboard" && <><div className="page-heading"><div><p className="eyebrow">EVIDÊNCIA E DECISÃO HUMANA</p><h1>Visão geral</h1><p>Retome seu projeto, confira a cobertura e revise as detecções.</p></div><button className="button primary" disabled={busy || sessionLost || loading} onClick={() => openScan()}><Plus size={18} />Nova análise</button></div><section className="panel"><FiltersForm path="/dashboard" demo={demo} filters={filters} projects={projects} state={false} /></section><div className="summary-line"><div><b>{loading || listUnavailable ? "—" : projects.filter(project => !filters.project || project.id === filters.project).length}</b><span>projetos cadastrados</span></div><div><b>{loading || listUnavailable ? "—" : dashboardRuns.filter(run => run.status === "complete").length}</b><span>análises concluídas na seleção</span></div><div><b>{loading || listUnavailable ? "—" : totalDetections}</b><span>detecções no histórico carregado</span></div><span className="summary-note"><Shield size={16} />Revisão humana obrigatória</span></div>
          <section className="panel"><div className="section-heading"><div><h2>Decisões no histórico amostrado</h2><p>Até 20 análises concluídas e 500 detecções, mesmo quando anteriores às 100 execuções da listagem. Uma detecção em dois commits conta duas vezes. Não são vulnerabilidades únicas ou correções verificadas.</p></div><a target="_top" className="text-button" href={href("/findings")}>Ver achados<ArrowRight size={15} /></a></div>{aggregateError ? <ErrorBox message={aggregateError} /> : <div className="decision-metrics">{Object.entries(decisions).map(([decision, label]) => <div key={decision}><b>{aggregateReady && !loading && !listUnavailable ? dashboardFindings.filter(finding => finding.status === decision).length : "—"}</b><span>{label}</span></div>)}</div>}{!aggregateReady && !aggregateError && !sessionLost && <p className="data-note" role="status">Carregando decisões registradas…</p>}{aggregate?.truncated && <p className="data-note">Contagem parcial: o limite da consulta foi atingido. Abra análises individuais para conferir o restante.</p>}</section>
          {!projects.length && !loading && !listUnavailable && !accessRestricted ? <section className="panel empty"><h2>Comece pelo código que você controla</h2><p>Confira o acesso ao repositório e a identidade antes de confirmar uma análise.</p><div className="button-row">{demo ? <button className="button primary" onClick={openProject} disabled={sessionLost}>Adicionar projeto</button> : <a target="_top" className="button primary" href={href("/repositories")}>Encontrar repositórios<ArrowRight size={16} /></a>}<a target="_top" className="button secondary" href={href("/onboarding")}>Primeiros passos</a></div></section> : projects[0] && <section className="project-focus"><span className="focus-icon"><FolderGit2 size={30} /></span><div className="grow"><p className="eyebrow">RETOME SEU PROJETO</p><h2>{projects[0].repo.split("/")[1]}</h2><p>{projects[0].repo}</p></div><button className="button primary" onClick={() => openScan(projects[0].id)} disabled={busy || sessionLost}>Analisar versão<ArrowRight size={16} /></button></section>}
          <section className="panel"><div className="section-heading"><div><h2>Análises recentes</h2><p>Commit, cobertura e resultado de cada execução.</p></div><a target="_top" className="text-button" href={href("/runs")}>Ver todas<ArrowRight size={15} /></a></div><WorkbenchListState loading={loading} unavailable={listUnavailable} retry={!demo && !sessionLost ? refresh : undefined}><RunsTable items={dashboardRuns.slice(0, 5)} href={href} restricted={accessRestricted} /></WorkbenchListState></section><div className="bottom-note"><FileCode2 size={18} /><p>Regras limitadas de possíveis credenciais e permissões de workflows. Dependências são inventariadas, sem consulta de CVEs.</p><a target="_top" className="text-button" href={href("/help")}>Ver limites</a></div></>}
        {initialView === "projects" && <><div className="page-heading"><div><p className="eyebrow">ESCOPO AUTORIZADO</p><h1>Projetos</h1><p>Esta lista mostra projetos cadastrados no Workbench. Seus repositórios GitHub não são importados automaticamente: use o catálogo para a GitHub App ou o cadastro público manual do piloto legado.</p></div><div className="button-row"><button className="button secondary" onClick={openRea} disabled={busy || sessionLost || loading}>Importar REA local</button><a target="_top" className="button secondary" href={href("/repositories")}>Consultar catálogo<ArrowRight size={16} /></a><button className="button primary" onClick={openProject} disabled={busy || sessionLost || loading}><Plus size={17} />Adicionar projeto</button></div></div><section className="panel"><form className="toolbar filter-form" method="get" action="/projects" target="_top">{demo && <input type="hidden" name="demo" value="1" />}<label className="search"><Search size={17} /><span className="sr-only">Buscar projetos por repositório</span><input name="q" maxLength={250} placeholder="Buscar repositório" defaultValue={filters.q} /></label><button className="button secondary">Buscar</button><a target="_top" className="text-button" href={href("/projects")}>Limpar</a></form><WorkbenchListState loading={loading} unavailable={listUnavailable} retry={!demo && !sessionLost ? refresh : undefined}>{projects.filter(project => project.repo.toLowerCase().includes(filters.q.toLowerCase())).map(project => { const latest = runs.find(run => run.project_id === project.id); return <div className="project-row" key={project.id}><span className="repo-icon"><FolderGit2 size={23} /></span><div className="grow"><h2>{project.repo.split("/")[1]}</h2><p>{project.repo}</p><small>ID estável {project.repository_id} · Autorizado em {date(project.authorized_at)}</small><p className="project-analysis">{latest ? latest.status === "complete" ? "Última análise: " + (latest.partial ? "cobertura parcial" : "formatos suportados") + " · " + latest.revision?.slice(0, 12) : latest.status === "running" ? "Análise em andamento" : "Última análise não concluída" : project.has_runs ? "Histórico fora da lista atual" : project.has_runs === false || demo ? "Ainda não analisado" : "Histórico não carregado"}</p></div><span className="badge">{project.source === "github-app" || project.installation_id ? `GitHub App · ${project.visibility === "private" ? "privado" : project.visibility === "public" ? "público" : "acesso a revalidar"}` : "Público · leitura estática"}</span><div className="button-row"><a target="_top" className="text-button" href={href("/runs", { project: project.id })}>Ver histórico</a><button className="button secondary" onClick={() => openScan(project.id)} disabled={busy || sessionLost}>Analisar<ArrowRight size={16} /></button></div></div>; })}{!projects.some(project => project.repo.toLowerCase().includes(filters.q.toLowerCase())) && !loading && !listUnavailable && !accessRestricted && <Empty title={projects.length ? "Nenhum projeto corresponde à busca" : "Adicione seu primeiro repositório"}><p>{projects.length ? "Limpe a busca para ver todos os projetos." : "O sistema confere nome e ID antes de registrar seu escopo."}</p></Empty>}</WorkbenchListState></section></>}
        {initialView === "runs" && <><div className="page-heading"><div><p className="eyebrow">HISTÓRICO E COBERTURA</p><h1>Análises</h1><p>Resultados vinculados ao repositório e ao commit de origem.</p></div><div className="button-row"><button className="button secondary" onClick={refresh} disabled={loading || demo || sessionLost}><RefreshCw size={16} />Atualizar</button><button className="button primary" onClick={() => openScan()} disabled={busy || sessionLost || loading}><Plus size={17} />Nova análise</button></div></div><section className="panel"><FiltersForm path="/runs" demo={demo} filters={filters} projects={projects} />{!loading && !listUnavailable && <p className="data-note" role="status">{filteredRuns.length} de {runs.length} análises carregadas. Consulta limitada às 100 mais recentes. Importações REA possuem vínculo de commit declarado, não verificado.</p>}<WorkbenchListState loading={loading} unavailable={listUnavailable} retry={!demo && !sessionLost ? refresh : undefined}><RunsTable items={filteredRuns} href={href} restricted={accessRestricted} /></WorkbenchListState></section></>}
        {initialView === "findings" && <><div className="page-heading"><div><p className="eyebrow">REVISÃO DO HISTÓRICO</p><h1>Achados</h1><p>Detecções por análise, com decisão humana. Uma suspeita não é uma vulnerabilidade confirmada.</p></div><button className="button secondary" onClick={refresh} disabled={loading || demo || sessionLost}><RefreshCw size={16} />Atualizar</button></div><section className="panel"><FiltersForm path="/findings" demo={demo} filters={filters} projects={projects} findings />{sessionLost ? <p className="data-note">Sessão indisponível. Entre novamente para consultar os achados reais.</p> : aggregateError ? <ErrorBox message={aggregateError} /> : !aggregateReady ? <p className="loading" role="status">Carregando achados e decisões…</p> : <><p className="data-note" role="status">{filteredFindings.length} de {historical.length} detecções carregadas em até 20 análises concluídas (limite de 500 detecções){aggregate?.truncated ? "; cobertura da listagem parcial por limite de consulta" : ""}. Resultados de commits diferentes podem se repetir.</p>{filteredFindings.length ? <div className="findings-list">{filteredFindings.map(finding => <article className="finding-list-row" key={finding.run_id + finding.fingerprint}><div className="grow"><p className="eyebrow">{finding.repo} · {finding.revision.slice(0, 12)}</p><h2>{kinds[finding.kind] || "Candidato detectado"}</h2><p>{finding.path}:{finding.line} · {date(finding.created_at)} · {sourceLabel(finding, demo)}</p><p>Confiança: {confidence[finding.confidence] || finding.confidence}</p></div><span className={"badge " + (finding.status === "candidate" ? "amber" : "")}>{decisions[finding.status] || finding.status}</span><a target="_top" className="button secondary" href={href("/runs/" + encodeURIComponent(finding.run_id)) + "#" + encodeURIComponent(finding.fingerprint)}>Revisar evidência<ArrowRight size={16} /></a></article>)}</div> : <Empty title={aggregateAccessRestricted ? "Parte dos achados está com acesso restrito" : "Nenhuma detecção nesta seleção"}><p>{aggregateAccessRestricted ? "Somente dados com acesso atual confirmado entram nesta lista. Zero observável não significa zero achados no histórico; revalide o acesso no catálogo." : "Limpe os filtros ou confira a cobertura das análises. Isso não comprova ausência de vulnerabilidades."}</p></Empty>}</>}</section></>}
        {initialView === "detail" && <><a target="_top" className="text-button back" href={href("/runs")}><ArrowLeft size={16} />Todas as análises</a>{!selected ? <section className="panel empty"><h1>{error ? "Não foi possível abrir esta análise" : demo && initialRunId.startsWith("example-") && !demoHydrated ? "Abrindo exemplo…" : demo ? "Esta análise não faz parte do exemplo" : "Abrindo análise…"}</h1><p>{demo ? "Para abrir uma análise real, entre como proprietário. A demonstração possui somente IDs fictícios." : "O servidor verifica sua sessão e o acesso à análise."}</p><a target="_top" className="button secondary" href={href("/runs")}>Voltar ao histórico</a></section> : <>
          <div className="page-heading analysis-heading"><div><p className="eyebrow">DETALHE DA ANÁLISE</p><h1>{selected.repo.split("/")[1] || selected.repo}</h1><p>{date(selected.created_at)} · {sourceLabel(selected, demo)}</p></div><a target="_top" className="text-button" href={href("/runs", { project: selected.project_id })}>Histórico deste projeto<ArrowRight size={16} /></a></div>
          <nav className="analysis-nav" aria-label="Nesta análise"><a href="#analysis-result">Resultado</a>{selected.status === "complete" && <><a href="#analysis-guidance">Orientação automática</a><a href="#analysis-review">Revisão</a><a href="#analysis-coverage">Cobertura e omissões</a><a href="#analysis-technical">Detalhes técnicos</a></>}</nav>
          <RunOutcome run={selected} demo={demo} busy={busy || sessionLost} compareHref={href("/compare", { after: selected.id, before: completed.find(run => run.id !== selected.id && run.project_id === selected.project_id && (run.source || "github-public") === (selected.source || "github-public"))?.id || "" })} refreshHref={href("/runs/" + encodeURIComponent(selected.id))} onExport={() => void exportReport(selected)} />
          <RunMetadata run={selected} demo={demo} />
          {selected.status === "complete" && <AutomaticGuidance guidance={selectedGuidance} />}
          {selected.status === "complete" && (demo ? <ContextualReview review={{schema:"security-workbench.contextual-review/v1",method:"model-contextual",state:"disabled",revision:selected.revision}} /> : <ContextualReviewController runId={selected.id} revision={selected.revision} transport={contextualTransport} sessionUnavailable={sessionLost} captureAccess={captureContextualAccess} onUnauthorized={handleFailure} />)}
          {selected.status === "complete" && <><section id="analysis-review" aria-labelledby="analysis-review-title"><div className="section-heading review-section-heading"><div><h2 id="analysis-review-title">Candidatos para revisão <span className="badge">{selected.findings?.length ?? "Não informado"}</span></h2><p>Confira evidência, impacto possível e recomendação antes de registrar sua decisão. Confiança não é severidade.</p></div></div>{selected.findings?.length ? selected.findings.map((finding, index) => <FindingCard key={finding.fingerprint + finding.status} finding={finding} index={index} guidance={selectedGuidance} busy={busy || sessionLost} save={(item, decision) => void review(item, decision)} />) : <section className="panel"><Empty title={!selected.findings ? "Candidatos não disponíveis neste registro" : selected.source === "rea-import" ? "Nenhum candidato importado para revisão" : "Nenhum candidato nos arquivos lidos"}><p>Confira a cobertura e as omissões abaixo. Isso não comprova ausência de vulnerabilidades.</p><a className="text-button" href="#analysis-coverage">Conferir cobertura<ArrowRight size={16} /></a></Empty></section>}</section><RunCoverage run={selected} demo={demo} /><RunEvidenceDetails run={selected} /></>}
        </>}</>}

        {initialView === "compare" && <><div className="page-heading"><div><p className="eyebrow">MESMO PROJETO, VERSÕES EXPLÍCITAS</p><h1>Comparar análises</h1><p>Escolha duas execuções concluídas do mesmo projeto e método. IDs explícitos da URL também são consultados quando estiverem fora do histórico carregado.</p></div></div><section className="panel comparison-panel"><form onSubmit={compare}><label className="field">Análise de referência<select required value={before} onChange={event => { setBefore(event.target.value); setComparison(null); }}><option value="">Escolha a análise anterior</option>{comparableRuns.filter(run => run.id !== after && (!after || (run.project_id === comparableRuns.find(item => item.id === after)?.project_id && (run.source || "github-public") === (comparableRuns.find(item => item.id === after)?.source || "github-public")))).map(run => <option key={run.id} value={run.id}>{run.repo} · {sourceLabel(run, demo)} · {date(run.created_at)} · {run.revision?.slice(0, 12)}</option>)}</select></label><label className="field">Análise a comparar<select required value={after} onChange={event => { const next = event.target.value; setAfter(next); if (before === next || comparableRuns.find(run => run.id === before)?.project_id !== comparableRuns.find(run => run.id === next)?.project_id || (comparableRuns.find(run => run.id === before)?.source || "github-public") !== (comparableRuns.find(run => run.id === next)?.source || "github-public")) setBefore(""); setComparison(null); }}><option value="">Escolha a outra análise</option>{comparableRuns.map(run => <option key={run.id} value={run.id}>{run.repo} · {sourceLabel(run, demo)} · {date(run.created_at)} · {run.revision?.slice(0, 12)}</option>)}</select></label><button className="button primary" disabled={busy || !before || !after || sessionLost}>{busy ? "Comparando…" : "Comparar versões"}</button></form>{comparableRuns.length < 2 && !loading && !listUnavailable && <p className="data-note">É necessário concluir pelo menos duas análises do mesmo projeto e método.</p>}{comparison && <div className="comparison" role="status"><div><b>{comparison.new.length}</b><span>novas detecções</span></div><div><b>{comparison.no_longer_detected.length}</b><span>não detectadas agora</span></div><div><b>{comparison.still_detected.length}</b><span>continuam detectadas</span></div><p>Não detectar novamente não comprova correção.{comparison.partial ? " Uma das análises possui cobertura parcial." : ""}</p></div>}</section></>}
        {initialView === "reports" && <><div className="page-heading"><div><p className="eyebrow">RELATÓRIO COM LIMITES E DECISÕES</p><h1>Relatórios</h1><p>O Markdown reúne candidatos, evidências, cobertura e decisões humanas. Inclui um prompt para sua IA propor correções; não confirma vulnerabilidades nem aplica mudanças.</p></div></div>{filters.run ? <><a target="_top" className="text-button back" href={href("/reports")}><ArrowLeft size={16} />Escolher outra análise</a><section className="panel report-panel">{reportContent ? <><div className="section-heading"><div><h2>Prévia Markdown</h2><p>{reportContent.filename}</p><p>Leve o arquivo e o prompt incluído à IA que você escolher. Revise o conteúdo e a política de privacidade antes de compartilhar código, nomes ou evidências. O Workbench não envia nada a uma IA.</p></div><button className="button primary" onClick={() => { if (!reportContent.isCurrent()) return; download(reportContent.markdown, reportContent.filename); if (reportContent.isCurrent()) setNotice("Download solicitado. Confira o arquivo no navegador."); }}><Download size={16} />Baixar Markdown</button></div><pre className="markdown-preview" tabIndex={0} aria-label="Conteúdo do relatório Markdown">{reportContent.markdown}</pre></> : <Empty title={error || demo ? "Relatório indisponível" : "Gerando prévia…"}><p>Escolha uma análise concluída à qual sua sessão tenha acesso.</p></Empty>}</section></> : <section className="panel"><FiltersForm path="/reports" demo={demo} filters={filters} projects={projects} state={false} /><WorkbenchListState loading={loading} unavailable={listUnavailable} retry={!demo && !sessionLost ? refresh : undefined}><RunsTable items={filteredRuns.filter(run => run.status === "complete")} href={href} report restricted={accessRestricted} /></WorkbenchListState></section>}</>}
        {["profile", "account", "help", "onboarding"].includes(initialView) && <OperationalInfo view={initialView as "profile" | "account" | "help" | "onboarding"} signedIn={signedIn && !sessionLost} name={name} githubReady={githubReady} csrfToken={csrfToken} projectCount={!demo && (loading || listUnavailable) ? null : projects.length} demo={demo} onAddProject={openProject} onShowDemo={showDemo} />}
        <footer className="page-footer"><span>Security Workbench / Experimental</span><span><LockKeyhole size={12} />Escopo autorizado. Evidência antes de decisão.</span></footer>
      </main>
    </div>
    {modal === "catalog" && <Modal title="Nova análise · repositórios GitHub" onClose={close} busy={busy || catalogBusy} wide>
      <p className="modal-description">Escolha um repositório do GitHub conectado, mesmo que ainda não seja um projeto no Workbench. Listar e selecionar não inicia uma análise.</p>
      <GitHubCatalogController call={catalogCall} captureAccess={accessRequests.capture} demo={demo} sessionUnavailable={sessionLost} onUnauthorized={handleFailure} embedded onBusyChange={setCatalogBusy} onJobCreated={job => { if (catalogNavigation.current()) go("/repositories", { job: job.id }); }} />
    </Modal>}
    {modal === "project" && <Modal title={identity ? "Confirme o escopo" : "Adicionar projeto"} onClose={close} busy={busy}>{error && <ErrorBox message={error} />}<p className="modal-description">{demo ? "Este fluxo usa sempre o mesmo repositório fictício. Nenhum link informado é consultado." : "Adicione um repositório público seu. A identidade será conferida antes do cadastro."}</p>{!identity ? <form onSubmit={inspectRepo}><label className="field">Link ou nome do repositório<input autoFocus required maxLength={250} value={repo} onChange={event => setRepo(event.target.value)} placeholder="https://github.com/ofelipepeixoto/rea" disabled={busy} /><small>Somente repositórios públicos de ofelipepeixoto nesta versão.</small></label><div className="modal-actions"><button className="button secondary" type="button" disabled={busy} onClick={close}>Cancelar</button><button className="button primary" disabled={busy || sessionLost}>{busy ? "Conferindo…" : "Conferir repositório"}<ArrowRight size={16} /></button></div></form> : <><div className="identity-card"><FolderGit2 size={28} /><div><strong>{identity.repo}</strong><p>Público · branch {identity.branch}</p><small>ID estável {identity.id}</small></div></div><label className="checkbox"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /><span>Tenho autorização para analisar este repositório e confirmo a identidade acima. Autorizo somente leitura estática.</span></label><div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => setIdentity(null)}>Voltar</button><button className="button primary" disabled={busy || !confirmed || sessionLost} onClick={() => void authorize()}>{busy ? "Salvando…" : demo ? "Concluir exemplo" : "Autorizar e adicionar"}<Check size={16} /></button></div></>}</Modal>}
    {modal === "rea" && <Modal title="Importar análise estática REA (local)" onClose={close} busy={busy}>{error && <ErrorBox message={error} />}{demo ? <><p className="modal-description">A importação exige a sessão do proprietário e um projeto real autorizado. A demonstração não envia arquivos nem simula execução do REA.</p><button className="button secondary" onClick={close}>Voltar ao exemplo</button></> : <><p className="modal-description">Importe um JSON produzido localmente e conferido pelo operador. A hospedagem não executa o REA ou o código do alvo. O arquivo bruto não é persistido; os candidatos normalizados seguem para revisão humana.</p>{!projects.length ? <p className="notice">Cadastre um projeto autorizado antes de importar um artefato.</p> : <form onSubmit={importRea}><label className="field">Projeto autorizado<select required value={projectId} disabled={busy} onChange={event => { reaAttempts.current.invalidate(); setProjectId(event.target.value); setReaConfirmed(false); }}>{projects.map(project => <option key={project.id} value={project.id}>{project.repo}</option>)}</select></label><label className="field">Commit declarado<input required pattern="[0-9a-fA-F]{40}" maxLength={40} disabled={busy} value={revision} onChange={event => { reaAttempts.current.invalidate(); setRevision(event.target.value); setReaConfirmed(false); }} placeholder="SHA completo de 40 caracteres" /><small>O vínculo do artefato com esse commit não será verificado pela aquisição GitHub.</small></label><label className="field">Artefato JSON local<input type="file" required accept="application/json,.json" disabled={busy} onChange={event => { reaAttempts.current.invalidate(); setReaFile(event.target.files?.[0] || null); setReaConfirmed(false); }} /><small>Máximo de 1 MiB. Não envie arquivos com credenciais ou conteúdo sensível bruto.</small></label><label className="checkbox"><input type="checkbox" required disabled={busy} checked={reaConfirmed} onChange={event => setReaConfirmed(event.target.checked)} /><span>Conferi a origem e o conteúdo do JSON, tenho autorização para esse projeto e declaro o commit informado. Entendo que a importação é parcial e não verifica esse vínculo.</span></label><div className="modal-actions"><button type="button" className="button secondary" onClick={close} disabled={busy}>Cancelar</button><button className="button primary" disabled={busy || !reaConfirmed || !reaFile || sessionLost}>{busy ? "Importando…" : "Importar para revisão"}</button></div></form>}</>}</Modal>}
    {modal === "scan" && <Modal title={demo ? "Nova análise fictícia" : "Nova análise"} onClose={close} busy={busy}>{error && <ErrorBox message={error} />}<p className="modal-description">{demo ? "O exemplo repete a fixture, sem rede e sem analisar um repositório." : "Escolha um projeto autorizado. A versão atual é fixada em um commit antes da leitura."}</p><form onSubmit={scan}><label className="field">Projeto<select required disabled={busy} value={projectId} onChange={event => setProjectId(event.target.value)}>{projects.filter(project => demo || (!project.installation_id && project.source !== "github-app")).map(project => <option key={project.id} value={project.id}>{project.repo}</option>)}</select></label><div className="version-choice"><GitBranch size={20} /><div><strong>{advanced ? "Commit específico" : "Versão atual do projeto"}</strong><p>{advanced ? "Use o SHA completo para repetir uma análise." : "O commit efetivo ficará registrado no resultado."}</p></div></div><label className="checkbox compact"><input type="checkbox" checked={advanced} disabled={busy} onChange={event => setAdvanced(event.target.checked)} /><span>Quero escolher um commit específico</span></label>{advanced && <label className="field">SHA do commit<input required disabled={busy} pattern="[0-9a-fA-F]{40}" maxLength={40} value={revision} onChange={event => setRevision(event.target.value)} placeholder="40 caracteres hexadecimais" /></label>}<div className="scope-note"><Shield size={18} /><p>Até 20 arquivos suportados. Sem execução do alvo. Possíveis credenciais são redigidas.</p></div>{busy && <div className="notice" role="status"><span className="spinner" /><span>Solicitação em andamento. Aguarde e confira o histórico se a conexão falhar.</span></div>}<div className="modal-actions"><button className="button secondary" type="button" disabled={busy} onClick={close}>Cancelar</button><button className="button primary" disabled={busy || sessionLost}>{busy ? "Analisando…" : demo ? "Criar análise fictícia" : "Iniciar análise"}<ArrowRight size={16} /></button></div></form></Modal>}
  </div>;
}
