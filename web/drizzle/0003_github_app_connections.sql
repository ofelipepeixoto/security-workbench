-- Controlled pilot only. Apply after 0002, never implicitly in production.
CREATE TABLE `workbench_github_app_flows` (
  `state_hash` text PRIMARY KEY NOT NULL,
  `browser_hash` text NOT NULL,
  `owner_id` text NOT NULL,
  `github_id` text NOT NULL,
  `verifier` text NOT NULL,
  `config_key` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workbench_github_app_flow_browser` ON `workbench_github_app_flows` (`owner_id`, `browser_hash`);
--> statement-breakpoint
CREATE INDEX `workbench_github_app_flow_expiry` ON `workbench_github_app_flows` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `workbench_github_app_connections` (
  `owner_id` text PRIMARY KEY NOT NULL,
  `github_id` text NOT NULL,
  `token_envelope` text NOT NULL,
  `key_version` text NOT NULL,
  `config_key` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workbench_github_app_connection_expiry` ON `workbench_github_app_connections` (`expires_at`);
