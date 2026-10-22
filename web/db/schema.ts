import { sql } from "drizzle-orm";
import { check, foreignKey, integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("workbench_projects", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  repo: text("repo").notNull(),
  repositoryId: integer("repository_id").notNull(),
  authorizedAt: text("authorized_at").notNull(),
  source: text("source", { enum: ["github-public", "github-app"] }).notNull().default("github-public"),
  installationId: integer("installation_id"),
  visibility: text("visibility", { enum: ["public", "private"] }).notNull().default("public"),
  revokedAt: text("revoked_at"),
}, (table) => [
  uniqueIndex("workbench_project_owner_repo").on(table.ownerId, table.repo),
  uniqueIndex("workbench_project_owner_id").on(table.ownerId, table.id),
  uniqueIndex("workbench_project_owner_repository").on(table.ownerId, table.repositoryId),
  check("workbench_project_source", sql`${table.source} IN ('github-public','github-app')`),
  check("workbench_project_visibility", sql`${table.visibility} IN ('public','private')`),
]);
// 0005 also owns the App-installation INSERT/UPDATE triggers. Preserve them in
// future table rebuilds; Drizzle snapshots do not describe SQLite triggers.

export const runs = sqliteTable("workbench_runs", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  projectId: text("project_id").notNull(),
  repo: text("repo").notNull(),
  repositoryId: integer("repository_id").notNull(),
  requestId: text("request_id").notNull(),
  requestedRevision: text("requested_revision"),
  revision: text("revision"),
  status: text("status", { enum: ["running", "complete", "failed"] }).notNull(),
  resultJson: text("result_json"),
  failureCode: text("failure_code"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  foreignKey({ name: "workbench_run_owner_project", columns: [table.ownerId, table.projectId], foreignColumns: [projects.ownerId, projects.id] }),
  uniqueIndex("workbench_run_owner_id").on(table.ownerId, table.id),
  uniqueIndex("workbench_run_owner_request").on(table.ownerId, table.requestId),
  uniqueIndex("workbench_run_one_running").on(table.ownerId, table.projectId).where(sql`${table.status} = 'running'`),
  index("workbench_run_owner_created").on(table.ownerId, table.createdAt),
]);

export const reviews = sqliteTable("workbench_reviews", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  runId: text("run_id").notNull(),
  fingerprint: text("fingerprint").notNull(),
  decision: text("decision", { enum: ["candidate", "confirmed", "false_positive", "accepted_risk"] }).notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  foreignKey({ name: "workbench_review_owner_run", columns: [table.ownerId, table.runId], foreignColumns: [runs.ownerId, runs.id] }),
  uniqueIndex("workbench_review_owner_finding").on(table.ownerId, table.runId, table.fingerprint),
]);

// Login state is ephemeral; access/refresh tokens are never persisted.
export const oauthFlows = sqliteTable("workbench_oauth_flows", {
  stateHash: text("state_hash").primaryKey(),
  browserHash: text("browser_hash").notNull(),
  verifier: text("verifier").notNull(),
  configKey: text("config_key").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("workbench_oauth_expiry").on(table.expiresAt)]);

export const githubSessions = sqliteTable("workbench_github_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  csrfHash: text("csrf_hash").notNull(),
  githubId: text("github_id").notNull(),
  ownerId: text("owner_id").notNull(),
  displayName: text("display_name").notNull(),
  configKey: text("config_key").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("workbench_github_session_expiry").on(table.expiresAt)]);

// Repository authorization is independent from the login session. Only an
// authenticated-encryption envelope is stored; its key remains in server secrets.
export const githubAppFlows = sqliteTable("workbench_github_app_flows", {
  stateHash: text("state_hash").primaryKey(),
  browserHash: text("browser_hash").notNull(),
  ownerId: text("owner_id").notNull(),
  githubId: text("github_id").notNull(),
  verifier: text("verifier").notNull(),
  configKey: text("config_key").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("workbench_github_app_flow_browser").on(table.ownerId, table.browserHash),
  index("workbench_github_app_flow_expiry").on(table.expiresAt),
]);

export const githubAppConnections = sqliteTable("workbench_github_app_connections", {
  ownerId: text("owner_id").primaryKey(),
  githubId: text("github_id").notNull(),
  tokenEnvelope: text("token_envelope").notNull(),
  keyVersion: text("key_version").notNull(),
  configKey: text("config_key").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("workbench_github_app_connection_expiry").on(table.expiresAt)]);

export const analysisJobs = sqliteTable("workbench_analysis_jobs", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  githubId: text("github_id").notNull(),
  projectId: text("project_id").notNull(),
  runId: text("run_id").notNull(),
  repositoryId: integer("repository_id").notNull(),
  installationId: integer("installation_id").notNull(),
  repo: text("repo").notNull(),
  revision: text("revision").notNull(),
  requestId: text("request_id").notNull(),
  engineVersion: text("engine_version").notNull(),
  configKey: text("config_key").notNull(),
  status: text("status", { enum: ["queued", "running", "complete", "failed", "cancelled"] }).notNull(),
  availableAt: text("available_at").notNull(),
  retryAt: text("retry_at"),
  failureCode: text("failure_code"),
  leaseToken: text("lease_token"),
  leaseExpiresAt: text("lease_expires_at"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  foreignKey({ columns: [table.ownerId, table.projectId], foreignColumns: [projects.ownerId, projects.id] }),
  foreignKey({ columns: [table.ownerId, table.runId], foreignColumns: [runs.ownerId, runs.id] }),
  uniqueIndex("workbench_job_owner_request").on(table.ownerId, table.requestId),
  uniqueIndex("workbench_job_run").on(table.runId),
  uniqueIndex("workbench_job_one_active_owner").on(table.ownerId).where(sql`${table.status} IN ('queued','running')`),
  index("workbench_job_recovery").on(table.status, table.availableAt, table.leaseExpiresAt),
  check("workbench_job_status", sql`${table.status} IN ('queued','running','complete','failed','cancelled')`),
  check("workbench_job_attempts", sql`${table.attempts} >= 0 AND ${table.attempts} <= 2`),
]);

// QA-only ledgers. Migration 0006 supplies immutable-window/retention/admission
// triggers and checks; no activation row, FK cascade or runtime provisioning.
export const qaWindow = sqliteTable("workbench_qa_window", {
  id: integer("id").primaryKey(),
  startsAt: integer("starts_at").notNull(),
  endsAt: integer("ends_at").notNull(),
  fixturesJson: text("fixtures_json").notNull(),
  closedAt: integer("closed_at"),
});
export const qaReservations = sqliteTable("workbench_qa_reservations", {
  jobId: text("job_id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  githubId: text("github_id").notNull(),
  repositoryId: integer("repository_id").notNull(),
  installationId: integer("installation_id").notNull(),
  repo: text("repo").notNull(),
  revision: text("revision").notNull(),
  day: integer("day").notNull(),
  createdAt: integer("created_at").notNull(),
  dispatches: integer("dispatches").notNull().default(0),
  nextDispatchAt: integer("next_dispatch_at").notNull().default(0),
}, table => [index("workbench_qa_day").on(table.day)]);
