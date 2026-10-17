CREATE TABLE `workbench_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`repo` text NOT NULL,
	`repository_id` integer NOT NULL,
	`authorized_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workbench_project_owner_repo` ON `workbench_projects` (`owner_id`,`repo`);--> statement-breakpoint
CREATE TABLE `workbench_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`run_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`decision` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `workbench_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workbench_review_owner_finding` ON `workbench_reviews` (`owner_id`,`run_id`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `workbench_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`repo` text NOT NULL,
	`repository_id` integer NOT NULL,
	`request_id` text NOT NULL,
	`requested_revision` text,
	`revision` text,
	`status` text NOT NULL,
	`result_json` text,
	`failure_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `workbench_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workbench_run_owner_request` ON `workbench_runs` (`owner_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workbench_run_one_running` ON `workbench_runs` (`owner_id`,`project_id`) WHERE "workbench_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX `workbench_run_owner_created` ON `workbench_runs` (`owner_id`,`created_at`);