import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("workbench_projects", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  repo: text("repo").notNull(),
  repositoryId: integer("repository_id").notNull(),
  authorizedAt: text("authorized_at").notNull(),
}, (table) => [uniqueIndex("workbench_project_owner_repo").on(table.ownerId, table.repo)]);

export const runs = sqliteTable("workbench_runs", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id),
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
  uniqueIndex("workbench_run_owner_request").on(table.ownerId, table.requestId),
  uniqueIndex("workbench_run_one_running").on(table.ownerId, table.projectId).where(sql`${table.status} = 'running'`),
  index("workbench_run_owner_created").on(table.ownerId, table.createdAt),
]);

export const reviews = sqliteTable("workbench_reviews", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  runId: text("run_id").notNull().references(() => runs.id),
  fingerprint: text("fingerprint").notNull(),
  decision: text("decision", { enum: ["candidate", "confirmed", "false_positive", "accepted_risk"] }).notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("workbench_review_owner_finding").on(table.ownerId, table.runId, table.fingerprint)]);

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
