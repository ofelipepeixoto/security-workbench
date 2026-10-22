-- Reserve the new principal namespace without adopting pre-existing data.
-- Apply as one migration transaction. A failed guard/copy must roll back.
CREATE TABLE `__workbench_workspace_guard` (`ready` integer NOT NULL CHECK (`ready` = 1));
--> statement-breakpoint
INSERT INTO `__workbench_workspace_guard` (`ready`)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM `workbench_projects` WHERE `owner_id` LIKE 'github:%'
  UNION ALL SELECT 1 FROM `workbench_runs` WHERE `owner_id` LIKE 'github:%'
  UNION ALL SELECT 1 FROM `workbench_reviews` WHERE `owner_id` LIKE 'github:%'
) THEN 0 ELSE 1 END;
--> statement-breakpoint
CREATE UNIQUE INDEX `workbench_project_owner_id` ON `workbench_projects` (`owner_id`,`id`);
--> statement-breakpoint
CREATE TABLE `__new_workbench_runs` (
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
  CONSTRAINT `workbench_run_owner_project` FOREIGN KEY (`owner_id`,`project_id`) REFERENCES `workbench_projects`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workbench_run_owner_id` ON `__new_workbench_runs` (`owner_id`,`id`);
--> statement-breakpoint
INSERT INTO `__new_workbench_runs` SELECT * FROM `workbench_runs`;
--> statement-breakpoint
CREATE TABLE `__new_workbench_reviews` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `run_id` text NOT NULL,
  `fingerprint` text NOT NULL,
  `decision` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `workbench_review_owner_run` FOREIGN KEY (`owner_id`,`run_id`) REFERENCES `__new_workbench_runs`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_workbench_reviews` SELECT * FROM `workbench_reviews`;
--> statement-breakpoint
DROP TABLE `workbench_reviews`;
--> statement-breakpoint
DROP TABLE `workbench_runs`;
--> statement-breakpoint
ALTER TABLE `__new_workbench_runs` RENAME TO `workbench_runs`;
--> statement-breakpoint
ALTER TABLE `__new_workbench_reviews` RENAME TO `workbench_reviews`;
--> statement-breakpoint
CREATE UNIQUE INDEX `workbench_run_owner_request` ON `workbench_runs` (`owner_id`,`request_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workbench_run_one_running` ON `workbench_runs` (`owner_id`,`project_id`) WHERE "workbench_runs"."status" = 'running';
--> statement-breakpoint
CREATE INDEX `workbench_run_owner_created` ON `workbench_runs` (`owner_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workbench_review_owner_finding` ON `workbench_reviews` (`owner_id`,`run_id`,`fingerprint`);
--> statement-breakpoint
DROP TABLE `__workbench_workspace_guard`;
