-- Inert until a separately approved, bounded policy is inserted in isolated QA.
-- No policy, credential, spend or user consent is created by this migration.
CREATE TABLE workbench_contextual_policy (
 id integer PRIMARY KEY CHECK (id=1),
 enabled integer NOT NULL CHECK (enabled IN (0,1)),
 version text NOT NULL,
 model text NOT NULL,
 organization_id text NOT NULL,
 project_id text NOT NULL,
 data_policy text NOT NULL CHECK (data_policy='fixture-snippets-v1'),
 starts_at integer NOT NULL,
 ends_at integer NOT NULL CHECK (ends_at>starts_at AND ends_at<=starts_at+604800000),
 price_expires_at integer NOT NULL,
 input_micro_usd_per_million integer NOT NULL CHECK (input_micro_usd_per_million>0),
 output_micro_usd_per_million integer NOT NULL CHECK (output_micro_usd_per_million>0),
 max_input_tokens integer NOT NULL CHECK (max_input_tokens BETWEEN 16384 AND 65536),
 max_output_tokens integer NOT NULL CHECK (max_output_tokens BETWEEN 512 AND 2048),
 budget_micro_usd integer NOT NULL CHECK (budget_micro_usd>=0 AND budget_micro_usd<=10000000),
 max_review_micro_usd integer NOT NULL CHECK (max_review_micro_usd>0 AND max_review_micro_usd<=budget_micro_usd),
 daily_user_limit integer NOT NULL CHECK (daily_user_limit BETWEEN 1 AND 5),
 total_limit integer NOT NULL CHECK (total_limit BETWEEN 1 AND 20),
 retention_ms integer NOT NULL CHECK (retention_ms BETWEEN 60000 AND 86400000),
 scopes_json text NOT NULL CHECK (json_valid(scopes_json) AND json_type(scopes_json)='array')
);
--> statement-breakpoint
CREATE TABLE workbench_contextual_reviews (
 id text PRIMARY KEY NOT NULL,
 owner_id text NOT NULL,
 run_id text NOT NULL,
 repository_id integer NOT NULL,
 revision text NOT NULL CHECK (length(revision)=40),
 review_key text NOT NULL,
 policy_version text NOT NULL,
 model text NOT NULL,
 state text NOT NULL CHECK (state IN ('reserved','sending','complete','insufficient_context','unknown','unavailable','deleted','expired')),
 reserved_micro_usd integer NOT NULL CHECK (reserved_micro_usd>0),
 actual_micro_usd integer,
 input_tokens integer,
 output_tokens integer,
 input_bytes integer NOT NULL CHECK (input_bytes BETWEEN 1 AND 65536),
 output_bytes integer,
 duration_ms integer,
 result_json text CHECK (result_json IS NULL OR (json_valid(result_json) AND length(result_json)<=32768)),
 failure_code text,
 outcome_unknown integer NOT NULL DEFAULT 0 CHECK (outcome_unknown IN (0,1)),
 created_at integer NOT NULL,
 expires_at integer NOT NULL,
 updated_at integer NOT NULL,
 FOREIGN KEY (owner_id,run_id) REFERENCES workbench_runs(owner_id,id) ON DELETE NO ACTION
);
--> statement-breakpoint
CREATE UNIQUE INDEX workbench_contextual_key ON workbench_contextual_reviews(owner_id,review_key);
--> statement-breakpoint
CREATE INDEX workbench_contextual_owner_day ON workbench_contextual_reviews(owner_id,created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX workbench_contextual_single_provider_call ON workbench_contextual_reviews((1)) WHERE state IN ('reserved','sending') OR outcome_unknown=1;
--> statement-breakpoint
-- Admission is one atomic SQLite/D1 statement, including financial and user caps.
-- Every reservation remains charged at its conservative maximum, even after
-- deletion/expiration/timeout; these do not grant a new paid retry or refund.
CREATE TRIGGER workbench_contextual_admission BEFORE INSERT ON workbench_contextual_reviews
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM workbench_contextual_policy p
   WHERE p.id=1 AND p.enabled=1 AND p.version=NEW.policy_version AND p.model=NEW.model AND NEW.state='reserved' AND NEW.outcome_unknown=0 AND NEW.result_json IS NULL
    AND NEW.created_at>=p.starts_at AND NEW.created_at<p.ends_at AND NEW.created_at<p.price_expires_at
    AND NEW.expires_at>NEW.created_at AND NEW.expires_at<=MIN(NEW.created_at+p.retention_ms,p.ends_at)
    AND NEW.reserved_micro_usd<=p.max_review_micro_usd
    AND NEW.reserved_micro_usd=CAST((p.max_input_tokens*p.input_micro_usd_per_million+p.max_output_tokens*p.output_micro_usd_per_million+999999)/1000000 AS INTEGER)
    AND COALESCE((SELECT SUM(reserved_micro_usd) FROM workbench_contextual_reviews),0)+NEW.reserved_micro_usd<=p.budget_micro_usd
    AND (SELECT COUNT(*) FROM workbench_contextual_reviews)<p.total_limit
    AND (SELECT COUNT(*) FROM workbench_contextual_reviews r WHERE r.owner_id=NEW.owner_id AND CAST(r.created_at/86400000 AS INTEGER)=CAST(NEW.created_at/86400000 AS INTEGER))<p.daily_user_limit
    AND EXISTS (SELECT 1 FROM json_each(p.scopes_json) s
      WHERE json_extract(s.value,'$.owner_id')=NEW.owner_id
        AND json_extract(s.value,'$.repository_id')=NEW.repository_id
        AND json_extract(s.value,'$.revision')=NEW.revision)
    AND EXISTS (SELECT 1 FROM workbench_runs r WHERE r.owner_id=NEW.owner_id AND r.id=NEW.run_id
      AND r.repository_id=NEW.repository_id AND r.revision=NEW.revision AND r.status='complete'))
  THEN RAISE(ABORT,'Contextual admission denied') END;
END;
--> statement-breakpoint
CREATE TRIGGER workbench_contextual_immutable BEFORE UPDATE ON workbench_contextual_reviews
WHEN NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.run_id<>OLD.run_id OR NEW.repository_id<>OLD.repository_id
 OR NEW.revision<>OLD.revision OR NEW.review_key<>OLD.review_key OR NEW.policy_version<>OLD.policy_version
 OR NEW.model<>OLD.model OR NEW.reserved_micro_usd<>OLD.reserved_micro_usd OR NEW.created_at<>OLD.created_at OR NEW.outcome_unknown<OLD.outcome_unknown OR NEW.input_bytes<>OLD.input_bytes
 OR NEW.expires_at<>OLD.expires_at OR (OLD.state NOT IN ('reserved','sending') AND NEW.state NOT IN (OLD.state,'deleted','expired'))
BEGIN SELECT RAISE(ABORT,'Contextual reservation is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER workbench_contextual_keep_ledger BEFORE DELETE ON workbench_contextual_reviews
BEGIN SELECT RAISE(ABORT,'Contextual ledger deletion requires separate retention authorization'); END;
--> statement-breakpoint
-- A policy that already reserved spend cannot change prices, limits, target,
-- model, scope, TTL or window underneath an in-flight call. It may be disabled.
CREATE TRIGGER workbench_contextual_policy_locked BEFORE UPDATE ON workbench_contextual_policy
WHEN EXISTS(SELECT 1 FROM workbench_contextual_reviews) AND (
 NEW.enabled>OLD.enabled OR NEW.version<>OLD.version OR NEW.model<>OLD.model OR NEW.organization_id<>OLD.organization_id
 OR NEW.project_id<>OLD.project_id OR NEW.data_policy<>OLD.data_policy OR NEW.starts_at<>OLD.starts_at OR NEW.ends_at<>OLD.ends_at
 OR NEW.price_expires_at<>OLD.price_expires_at OR NEW.input_micro_usd_per_million<>OLD.input_micro_usd_per_million
 OR NEW.output_micro_usd_per_million<>OLD.output_micro_usd_per_million OR NEW.max_input_tokens<>OLD.max_input_tokens
 OR NEW.max_output_tokens<>OLD.max_output_tokens OR NEW.budget_micro_usd<>OLD.budget_micro_usd
 OR NEW.max_review_micro_usd<>OLD.max_review_micro_usd OR NEW.daily_user_limit<>OLD.daily_user_limit
 OR NEW.total_limit<>OLD.total_limit OR NEW.retention_ms<>OLD.retention_ms OR NEW.scopes_json<>OLD.scopes_json)
BEGIN SELECT RAISE(ABORT,'Active contextual policy is immutable; disable and review separately'); END;
--> statement-breakpoint
CREATE TRIGGER workbench_contextual_keep_policy BEFORE DELETE ON workbench_contextual_policy
WHEN EXISTS(SELECT 1 FROM workbench_contextual_reviews)
BEGIN SELECT RAISE(ABORT,'Contextual policy retention requires separate authorization'); END;
