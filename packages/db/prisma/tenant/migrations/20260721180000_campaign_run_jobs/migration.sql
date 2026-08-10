-- CDP campaign run jobs (Phase 5) — track async (background) campaign generation.
-- Idempotent so it is safe to re-run across provisioned tenant DBs.

CREATE TABLE IF NOT EXISTS "campaign_run_jobs" (
    "id"                    VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "site_id"               VARCHAR(255) NOT NULL,
    "kind"                  VARCHAR(20) NOT NULL,
    "group_id"              VARCHAR(36),
    "goal"                  VARCHAR(40) NOT NULL,
    "label"                 VARCHAR(160),
    "status"                VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
    "total"                 INTEGER NOT NULL DEFAULT 0,
    "processed"             INTEGER NOT NULL DEFAULT 0,
    "generated"             INTEGER NOT NULL DEFAULT 0,
    "skipped"               INTEGER NOT NULL DEFAULT 0,
    "error"                 TEXT,
    "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "finished_at"           TIMESTAMPTZ,
    CONSTRAINT "campaign_run_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_campaign_job_status" ON "campaign_run_jobs"("connector_instance_id", "status");
CREATE INDEX IF NOT EXISTS "idx_campaign_job_group" ON "campaign_run_jobs"("connector_instance_id", "group_id");
