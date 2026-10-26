import type { ContextualReviewData } from "./contextual-review";
import type { AutomaticGuidanceData } from "./automatic-guidance";

export type WorkbenchView = "dashboard" | "projects" | "repositories" | "findings" | "runs" | "detail" | "compare" | "reports" | "profile" | "account" | "help" | "onboarding";
export type Project = { id: string; repo: string; repository_id: number; authorized_at: string; has_runs?: boolean; source?: string; installation_id?: number; visibility?: "public" | "private" };
export type Finding = { fingerprint: string; kind: string; path: string; line: number; status: string; confidence: string; evidence: string; impact: string; recommendation: string };
export type ReaProvenance = { observations_seen?: number; observations_imported?: number; observations_omitted?: number; observations_omitted_by_reason?: Partial<Record<"unsupported_node_kind" | "unsupported_evidence_authority" | "unsupported_evidence_state" | "artifact_or_location_unavailable" | "unsupported_location_kind" | "duplicate_observation" | "candidate_limit", number>>; native_findings_declared?: number };
export type Run = { id: string; project_id: string; repo: string; repository_id?: number; status: string; revision: string | null; created_at: string; files_read: number | null; bytes_read?: number | null; partial: boolean; findings_count?: number | null; digest?: string; omissions?: string[]; findings?: Finding[]; dependencies?: { name: string; version: string; source: string }[]; failure_code?: string; source?: string; verified_revision?: boolean; provenance?: ReaProvenance; guidance?: AutomaticGuidanceData; contextual_review?: ContextualReviewData };
export type HistoricalFinding = Finding & { run_id: string; project_id: string; repo: string; revision: string; created_at: string; source?: string };
export type FindingsResult = { findings: HistoricalFinding[]; truncated: boolean; runs_considered: number; access_restricted?: boolean };
export type Comparison = { new: string[]; no_longer_detected: string[]; still_detected: string[]; partial: boolean };
export type Filters = { q: string; project: string; status: string; kind: string; from: string; to: string; before: string; after: string; run: string; job?: string };

export type CatalogLimits = { files: number; bytes: number; fileBytes: number; deadlineMs: number };
export type CatalogInstallation = { id: number; account: { login: string; type: string }; suspended_at: string | null; repository_selection: string; permissions?: Record<string, string | null>; manage_url?: string };
export type CatalogAnalysisAccess = { state: "available" | "contents_permission_required" | "repository_read_required" | "disabled"; can_analyze: boolean; qa_allowed?: boolean; qa_reason?: string; manage_url?: string };
export type CatalogRepository = { id: number; name: string; full_name: string; owner: { login: string }; private: boolean; visibility?: "public" | "private" | "internal"; fork?: boolean; default_branch: string | null; language: string | null; archived: boolean; disabled?: boolean; installation_id: number; permissions?: { pull?: boolean; contents?: string }; analysis_access?: CatalogAnalysisAccess };
export type CatalogInstallationCoverage = { scope: "user_app_installations"; global_complete: false };
export type CatalogCoverage = { scope: "installation_user_intersection"; repository_selection: "all" | "selected"; global_complete: false; contents_permission: boolean; manage_url?: string };
export type CatalogConnectionState = "not_configured" | "not_connected" | "connected" | "expired" | "revoked" | "unavailable";
export type CatalogStatus = { enabled: boolean; connection: { state: CatalogConnectionState; manage_url?: string; installation_url?: string | null; validated_at?: string }; connect_url?: string; limits: CatalogLimits; jobs_enabled: boolean; analysis_policy?: "qa_selected_fixtures" | "authorized_repositories" };
export type CatalogPage<T> = { items: T[]; state: "idle" | "loading" | "loaded" | "error"; page: number; nextPage: number | null; complete: boolean; syncedAt: string | null; totalCount?: number | null; coverage?: CatalogCoverage | CatalogInstallationCoverage | null; pageLimit?: number | null; limitReached?: boolean };
export type CatalogFilters = { q: string; visibility: string; archived: string; language: string };
export type CatalogJob = { id: string; run_id: string | null; status: string; available_at?: string; retry_at?: string; failure_code?: string };
export type CatalogSelection = { repository: CatalogRepository; revisionInput: string; confirmed: boolean; prepared: { project: Project; repository: CatalogRepository; revision: string; limits: CatalogLimits } | null };
export type CatalogModel = { demo: boolean; status: CatalogStatus | null; statusLoading: boolean; error: string; notice?: string; busy: boolean; installations: CatalogPage<CatalogInstallation>; repositories: CatalogPage<CatalogRepository>; installationId: number | null; filters: CatalogFilters; selection: CatalogSelection | null; job: CatalogJob | null; pollingPaused: boolean };
