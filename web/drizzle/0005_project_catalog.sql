-- Preparation only: apply after 0002/0003/0004 in an approved environment.
-- Duplicate stable repository IDs abort; never merge/reassign legacy projects.
CREATE UNIQUE INDEX workbench_project_owner_repository ON workbench_projects(owner_id, repository_id);
--> statement-breakpoint
ALTER TABLE workbench_projects ADD COLUMN source TEXT NOT NULL DEFAULT 'github-public' CHECK(source IN ('github-public','github-app'));
--> statement-breakpoint
ALTER TABLE workbench_projects ADD COLUMN installation_id INTEGER;
--> statement-breakpoint
ALTER TABLE workbench_projects ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private'));
--> statement-breakpoint
ALTER TABLE workbench_projects ADD COLUMN revoked_at TEXT;
--> statement-breakpoint
CREATE TRIGGER workbench_project_app_insert BEFORE INSERT ON workbench_projects
WHEN NEW.source = 'github-app' AND (NEW.installation_id IS NULL OR NEW.installation_id < 1)
BEGIN SELECT RAISE(ABORT, 'app_installation_required'); END;
--> statement-breakpoint
CREATE TRIGGER workbench_project_app_update BEFORE UPDATE ON workbench_projects
WHEN NEW.source = 'github-app' AND (NEW.installation_id IS NULL OR NEW.installation_id < 1)
BEGIN SELECT RAISE(ABORT, 'app_installation_required'); END;
