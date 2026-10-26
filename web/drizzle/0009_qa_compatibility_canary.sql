-- QA-only compatibility canary; no activation row is inserted by migration.
CREATE TABLE workbench_qa_canary (
 id integer PRIMARY KEY CHECK (id=1),
 starts_at integer NOT NULL,
 ends_at integer NOT NULL CHECK (ends_at=starts_at+900000),
 fixtures_json text NOT NULL CHECK (json_valid(fixtures_json)),
 source_sha text NOT NULL CHECK(length(source_sha)=40 AND source_sha NOT GLOB '*[^0-9a-f]*'),
 closed_at integer
);
--> statement-breakpoint
CREATE TRIGGER workbench_qa_canary_immutable BEFORE UPDATE ON workbench_qa_canary
WHEN NEW.starts_at<>OLD.starts_at OR NEW.ends_at<>OLD.ends_at OR NEW.fixtures_json<>OLD.fixtures_json OR NEW.source_sha<>OLD.source_sha
 OR (OLD.closed_at IS NOT NULL AND NEW.closed_at IS NOT OLD.closed_at)
BEGIN SELECT RAISE(ABORT,'QA canary is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER workbench_qa_keep_canary BEFORE DELETE ON workbench_qa_canary
BEGIN SELECT RAISE(ABORT,'QA canary retention requires separate authorization'); END;
--> statement-breakpoint
CREATE VIEW workbench_qa_active_window AS
 SELECT id,starts_at,ends_at,fixtures_json,closed_at,'window' AS mode,NULL AS source_sha FROM workbench_qa_window
 UNION ALL SELECT id,starts_at,ends_at,fixtures_json,closed_at,'canary' AS mode,source_sha FROM workbench_qa_canary
 WHERE NOT EXISTS (SELECT 1 FROM workbench_qa_window);
--> statement-breakpoint
CREATE TRIGGER workbench_qa_window_opening BEFORE INSERT ON workbench_qa_window
BEGIN
 SELECT CASE WHEN abs(NEW.starts_at-CAST(round((julianday('now')-2440587.5)*86400000) AS INTEGER))>5000 OR NEW.closed_at IS NOT NULL
  OR json_type(NEW.fixtures_json)<>'array' OR json_array_length(NEW.fixtures_json) NOT BETWEEN 1 AND 10
  OR EXISTS (SELECT 1 FROM json_each(NEW.fixtures_json) f
    WHERE json_type(f.value) IS NOT 'object' OR json_type(f.value,'$.githubId') IS NOT 'text'
      OR json_extract(f.value,'$.githubId') NOT IN ('171351708','322086368')
      OR json_type(f.value,'$.repositoryId') IS NOT 'integer' OR json_extract(f.value,'$.repositoryId')<1
      OR json_type(f.value,'$.installationId') IS NOT 'integer' OR json_extract(f.value,'$.installationId')<1
      OR json_type(f.value,'$.revision') IS NOT 'text' OR length(json_extract(f.value,'$.revision'))<>40 OR json_extract(f.value,'$.revision') GLOB '*[^0-9a-f]*'
      OR json_type(f.value,'$.repo') IS NOT 'text' OR length(json_extract(f.value,'$.repo'))>160
      OR json_extract(f.value,'$.repo') GLOB '*[^A-Za-z0-9_./-]*'
      OR NOT ((json_extract(f.value,'$.githubId')='171351708' AND json_extract(f.value,'$.repo') GLOB 'ofelipepeixoto/*')
        OR (json_extract(f.value,'$.githubId')='322086368' AND json_extract(f.value,'$.repo') GLOB 'radartech-news/*')))
 THEN RAISE(ABORT,'QA window opening denied') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM workbench_qa_canary WHERE closed_at IS NULL) THEN RAISE(ABORT,'Close QA canary before opening window') END;
END;
--> statement-breakpoint
CREATE TRIGGER workbench_qa_canary_opening BEFORE INSERT ON workbench_qa_canary
BEGIN
 SELECT CASE WHEN abs(NEW.starts_at-CAST(round((julianday('now')-2440587.5)*86400000) AS INTEGER))>5000 OR NEW.closed_at IS NOT NULL
  OR json_type(NEW.fixtures_json)<>'array' OR json_array_length(NEW.fixtures_json) NOT BETWEEN 1 AND 10
  OR EXISTS (SELECT 1 FROM json_each(NEW.fixtures_json) f
    WHERE json_type(f.value) IS NOT 'object' OR json_type(f.value,'$.githubId') IS NOT 'text'
      OR json_extract(f.value,'$.githubId') NOT IN ('171351708','322086368')
      OR json_type(f.value,'$.repositoryId') IS NOT 'integer' OR json_extract(f.value,'$.repositoryId')<1
      OR json_type(f.value,'$.installationId') IS NOT 'integer' OR json_extract(f.value,'$.installationId')<1
      OR json_type(f.value,'$.revision') IS NOT 'text' OR length(json_extract(f.value,'$.revision'))<>40 OR json_extract(f.value,'$.revision') GLOB '*[^0-9a-f]*'
      OR json_type(f.value,'$.repo') IS NOT 'text' OR length(json_extract(f.value,'$.repo'))>160
      OR json_extract(f.value,'$.repo') GLOB '*[^A-Za-z0-9_./-]*'
      OR NOT ((json_extract(f.value,'$.githubId')='171351708' AND json_extract(f.value,'$.repo') GLOB 'ofelipepeixoto/*')
        OR (json_extract(f.value,'$.githubId')='322086368' AND json_extract(f.value,'$.repo') GLOB 'radartech-news/*')))
 THEN RAISE(ABORT,'QA canary opening denied') END;
 SELECT CASE WHEN json_array_length(NEW.fixtures_json)<>2 OR (SELECT count(*) FROM json_each(NEW.fixtures_json) WHERE json_extract(value,'$.githubId')='171351708')<>1 OR (SELECT count(*) FROM json_each(NEW.fixtures_json) WHERE json_extract(value,'$.githubId')='322086368')<>1 THEN RAISE(ABORT,'QA canary requires both actors') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM workbench_qa_window) THEN RAISE(ABORT,'QA window already exists') END;
END;
--> statement-breakpoint
DROP TRIGGER workbench_qa_admission;
--> statement-breakpoint
CREATE TRIGGER workbench_qa_admission BEFORE INSERT ON workbench_qa_reservations
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM workbench_qa_active_window w
    WHERE w.id=1 AND w.closed_at IS NULL AND NEW.created_at>=w.starts_at AND NEW.created_at<w.ends_at
      AND NEW.day=CAST((NEW.created_at-w.starts_at)/86400000 AS INTEGER)
      AND EXISTS (SELECT 1 FROM json_each(w.fixtures_json) f
        WHERE json_extract(f.value,'$.githubId')=NEW.github_id
          AND json_extract(f.value,'$.installationId')=NEW.installation_id
          AND json_extract(f.value,'$.repositoryId')=NEW.repository_id
          AND json_extract(f.value,'$.repo')=NEW.repo
          AND json_extract(f.value,'$.revision')=NEW.revision))
    THEN RAISE(ABORT,'QA admission denied') END;
  SELECT CASE WHEN (SELECT count(*) FROM workbench_qa_reservations WHERE day=NEW.day)>=CASE WHEN EXISTS(SELECT 1 FROM workbench_qa_active_window WHERE mode='canary') THEN 2 ELSE 50 END
    THEN RAISE(ABORT,'QA daily quota reached') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM workbench_qa_active_window WHERE mode='canary') AND EXISTS(SELECT 1 FROM workbench_qa_reservations WHERE github_id=NEW.github_id) THEN RAISE(ABORT,'QA canary actor quota reached') END;
END;
--> statement-breakpoint
DROP TRIGGER workbench_qa_claim_guard;
--> statement-breakpoint
CREATE TRIGGER workbench_qa_claim_guard BEFORE UPDATE ON workbench_analysis_jobs
WHEN NEW.status='running' AND NEW.attempts>OLD.attempts AND EXISTS (SELECT 1 FROM workbench_qa_active_window)
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM workbench_qa_active_window w JOIN workbench_qa_reservations r ON r.job_id=NEW.id
   WHERE w.id=1 AND w.closed_at IS NULL AND r.owner_id=NEW.owner_id AND r.github_id=NEW.github_id
     AND r.created_at>=w.starts_at AND r.created_at<w.ends_at AND r.repository_id=NEW.repository_id AND r.installation_id=NEW.installation_id AND r.repo=NEW.repo AND r.revision=NEW.revision
     AND CAST(round((julianday(NEW.updated_at)-2440587.5)*86400000) AS INTEGER)>=w.starts_at
     AND CAST(round((julianday(NEW.updated_at)-2440587.5)*86400000) AS INTEGER)<w.ends_at)
   THEN RAISE(ABORT,'QA claim denied') END;
END;
--> statement-breakpoint
DROP TRIGGER workbench_qa_result_guard;
--> statement-breakpoint
CREATE TRIGGER workbench_qa_result_guard BEFORE UPDATE OF result_json ON workbench_runs
WHEN NEW.result_json IS NOT NULL AND EXISTS (SELECT 1 FROM workbench_qa_active_window)
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM workbench_qa_active_window w JOIN workbench_analysis_jobs j ON j.run_id=NEW.id AND j.owner_id=NEW.owner_id JOIN workbench_qa_reservations r ON r.job_id=j.id
   WHERE w.id=1 AND w.closed_at IS NULL AND r.owner_id=j.owner_id AND r.github_id=j.github_id
     AND r.repository_id=j.repository_id AND r.installation_id=j.installation_id AND r.repo=j.repo AND r.revision=j.revision
     AND r.created_at>=w.starts_at AND r.created_at<w.ends_at
     AND CAST(round((julianday(NEW.updated_at)-2440587.5)*86400000) AS INTEGER)>=w.starts_at
     AND CAST(round((julianday(NEW.updated_at)-2440587.5)*86400000) AS INTEGER)<w.ends_at)
   THEN RAISE(ABORT,'QA result denied') END;
END;
--> statement-breakpoint
DROP TRIGGER workbench_qa_job_reservation;
--> statement-breakpoint
CREATE TRIGGER workbench_qa_job_reservation BEFORE INSERT ON workbench_analysis_jobs
WHEN EXISTS (SELECT 1 FROM workbench_qa_active_window)
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM workbench_qa_reservations r JOIN workbench_qa_active_window w ON w.id=1
   WHERE r.job_id=NEW.id AND r.owner_id=NEW.owner_id AND r.github_id=NEW.github_id
     AND r.repository_id=NEW.repository_id AND r.installation_id=NEW.installation_id
     AND r.created_at>=w.starts_at AND r.created_at<w.ends_at AND r.repo=NEW.repo AND r.revision=NEW.revision AND w.closed_at IS NULL)
   THEN RAISE(ABORT,'QA job requires reservation') END;
END;
--> statement-breakpoint
