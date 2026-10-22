-- Dormant on production: no activation row is inserted by a migration.
-- A QA operator inserts the reviewed window/fixture policy after approval.
CREATE TABLE workbench_qa_window (
  id integer PRIMARY KEY CHECK (id=1),
  starts_at integer NOT NULL,
  ends_at integer NOT NULL CHECK (ends_at=starts_at+604800000),
  fixtures_json text NOT NULL CHECK (json_valid(fixtures_json)),
  closed_at integer
);
--> statement-breakpoint
CREATE TRIGGER workbench_qa_no_reactivation BEFORE UPDATE ON workbench_qa_window
WHEN NEW.starts_at<>OLD.starts_at OR NEW.ends_at<>OLD.ends_at OR NEW.fixtures_json<>OLD.fixtures_json
  OR (OLD.closed_at IS NOT NULL AND NEW.closed_at IS NOT OLD.closed_at)
BEGIN SELECT RAISE(ABORT,'QA window is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER workbench_qa_keep_window BEFORE DELETE ON workbench_qa_window
BEGIN SELECT RAISE(ABORT,'QA window retention requires separate authorization'); END;
--> statement-breakpoint
-- No FK cascade: deletion/cancellation of a product object cannot reset quota.
CREATE TABLE workbench_qa_reservations (
  job_id text PRIMARY KEY NOT NULL,
  owner_id text NOT NULL,
  github_id text NOT NULL CHECK (github_id IN ('171351708','322086368')),
  repository_id integer NOT NULL,
  installation_id integer NOT NULL,
  repo text NOT NULL,
  revision text NOT NULL,
  day integer NOT NULL CHECK (day BETWEEN 0 AND 6),
  created_at integer NOT NULL,
  dispatches integer NOT NULL DEFAULT 0 CHECK (dispatches BETWEEN 0 AND 3),
  next_dispatch_at integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX workbench_qa_day ON workbench_qa_reservations(day);
--> statement-breakpoint
CREATE TRIGGER workbench_qa_admission BEFORE INSERT ON workbench_qa_reservations
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM workbench_qa_window w
    WHERE w.id=1 AND w.closed_at IS NULL AND NEW.created_at>=w.starts_at AND NEW.created_at<w.ends_at
      AND NEW.day=CAST((NEW.created_at-w.starts_at)/86400000 AS INTEGER)
      AND EXISTS (SELECT 1 FROM json_each(w.fixtures_json) f
        WHERE json_extract(f.value,'$.githubId')=NEW.github_id
          AND json_extract(f.value,'$.installationId')=NEW.installation_id
          AND json_extract(f.value,'$.repositoryId')=NEW.repository_id
          AND json_extract(f.value,'$.repo')=NEW.repo))
    THEN RAISE(ABORT,'QA admission denied') END;
  SELECT CASE WHEN (SELECT count(*) FROM workbench_qa_reservations WHERE day=NEW.day)>=50
    THEN RAISE(ABORT,'QA daily quota reached') END;
END;
--> statement-breakpoint
CREATE TRIGGER workbench_qa_claim_guard BEFORE UPDATE ON workbench_analysis_jobs
WHEN NEW.status='running' AND NEW.attempts>OLD.attempts AND EXISTS (SELECT 1 FROM workbench_qa_window)
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM workbench_qa_window w JOIN workbench_qa_reservations r ON r.job_id=NEW.id
   WHERE w.id=1 AND w.closed_at IS NULL AND r.owner_id=NEW.owner_id AND r.github_id=NEW.github_id
     AND r.repository_id=NEW.repository_id AND r.installation_id=NEW.installation_id AND r.repo=NEW.repo AND r.revision=NEW.revision
     AND CAST(round((julianday(NEW.updated_at)-2440587.5)*86400000) AS INTEGER)>=w.starts_at
     AND CAST(round((julianday(NEW.updated_at)-2440587.5)*86400000) AS INTEGER)<w.ends_at)
   THEN RAISE(ABORT,'QA claim denied') END;
END;
--> statement-breakpoint
CREATE TRIGGER workbench_qa_result_guard BEFORE UPDATE OF result_json ON workbench_runs
WHEN NEW.result_json IS NOT NULL AND EXISTS (SELECT 1 FROM workbench_qa_window)
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM workbench_qa_window w
   WHERE w.id=1 AND w.closed_at IS NULL
     AND CAST(round((julianday(NEW.updated_at)-2440587.5)*86400000) AS INTEGER)>=w.starts_at
     AND CAST(round((julianday(NEW.updated_at)-2440587.5)*86400000) AS INTEGER)<w.ends_at)
   THEN RAISE(ABORT,'QA result denied') END;
END;
--> statement-breakpoint
CREATE TRIGGER workbench_qa_keep_reservations BEFORE DELETE ON workbench_qa_reservations
BEGIN SELECT RAISE(ABORT,'QA quota ledger retention requires separate authorization'); END;
--> statement-breakpoint
CREATE TRIGGER workbench_qa_immutable_reservation BEFORE UPDATE ON workbench_qa_reservations
WHEN NEW.job_id<>OLD.job_id OR NEW.owner_id<>OLD.owner_id OR NEW.github_id<>OLD.github_id
 OR NEW.repository_id<>OLD.repository_id OR NEW.installation_id<>OLD.installation_id
 OR NEW.repo<>OLD.repo OR NEW.revision<>OLD.revision OR NEW.day<>OLD.day OR NEW.created_at<>OLD.created_at
 OR NEW.dispatches<OLD.dispatches OR NEW.next_dispatch_at<OLD.next_dispatch_at
BEGIN SELECT RAISE(ABORT,'QA reservation is immutable'); END;
--> statement-breakpoint
-- Even a producer accidentally missing the QA dependency cannot bypass admission
-- once this dedicated database has an activation row.
CREATE TRIGGER workbench_qa_job_reservation BEFORE INSERT ON workbench_analysis_jobs
WHEN EXISTS (SELECT 1 FROM workbench_qa_window)
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM workbench_qa_reservations r JOIN workbench_qa_window w ON w.id=1
   WHERE r.job_id=NEW.id AND r.owner_id=NEW.owner_id AND r.github_id=NEW.github_id
     AND r.repository_id=NEW.repository_id AND r.installation_id=NEW.installation_id
     AND r.repo=NEW.repo AND r.revision=NEW.revision AND w.closed_at IS NULL)
   THEN RAISE(ABORT,'QA job requires reservation') END;
END;
