-- Durable outbox/state only; no consumer, secret, or production activation.
CREATE TABLE `workbench_analysis_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `github_id` text NOT NULL,
  `project_id` text NOT NULL,
  `run_id` text NOT NULL,
  `repository_id` integer NOT NULL,
  `installation_id` integer NOT NULL,
  `repo` text NOT NULL,
  `revision` text NOT NULL,
  `request_id` text NOT NULL,
  `engine_version` text NOT NULL,
  `config_key` text NOT NULL,
  `status` text NOT NULL CHECK (`status` IN ('queued','running','complete','failed','cancelled')),
  `available_at` text NOT NULL,
  `retry_at` text,
  `failure_code` text,
  `lease_token` text,
  `lease_expires_at` text,
  `attempts` integer NOT NULL DEFAULT 0 CHECK (`attempts` >= 0 AND `attempts` <= 2),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`owner_id`,`project_id`) REFERENCES `workbench_projects` (`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`owner_id`,`run_id`) REFERENCES `workbench_runs` (`owner_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workbench_job_owner_request` ON `workbench_analysis_jobs` (`owner_id`,`request_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workbench_job_run` ON `workbench_analysis_jobs` (`run_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workbench_job_one_active_owner` ON `workbench_analysis_jobs` (`owner_id`) WHERE `status` IN ('queued','running');
--> statement-breakpoint
CREATE INDEX `workbench_job_recovery` ON `workbench_analysis_jobs` (`status`,`available_at`,`lease_expires_at`);
