CREATE TABLE `workbench_github_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`csrf_hash` text NOT NULL,
	`github_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`display_name` text NOT NULL,
	`config_key` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workbench_github_session_expiry` ON `workbench_github_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `workbench_oauth_flows` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`verifier` text NOT NULL,
	`config_key` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workbench_oauth_expiry` ON `workbench_oauth_flows` (`expires_at`);