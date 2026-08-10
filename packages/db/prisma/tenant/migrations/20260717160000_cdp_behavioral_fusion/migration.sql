-- CDP behavioral fusion (Phase 3) — see docs/CDP-IMPLEMENTATION-PLAN.md §5.2/§6.1.
-- Live behavioral signals fused with historical metrics into "fused segments".
-- Idempotent (IF NOT EXISTS) so it is safe to re-run across provisioned tenant DBs.

CREATE TABLE IF NOT EXISTS "customer_behavior_snapshots" (
    "id"                    VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "customer_profile_id"   VARCHAR(36) NOT NULL,
    "site_id"               VARCHAR(255) NOT NULL,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "last_session_at"       TIMESTAMPTZ,
    "sessions_last_30d"     INTEGER NOT NULL DEFAULT 0,
    "live_furthest_stage"   VARCHAR(50),
    "cart_abandoned_at"     TIMESTAMPTZ,
    "recent_categories"     JSONB NOT NULL DEFAULT '[]',
    "fused_segments"        JSONB NOT NULL DEFAULT '[]',
    "signals"               JSONB NOT NULL DEFAULT '{}',
    "computed_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "customer_behavior_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_behavior_snapshot_profile"
    ON "customer_behavior_snapshots"("connector_instance_id", "customer_profile_id");
CREATE INDEX IF NOT EXISTS "idx_behavior_snapshot_connector"
    ON "customer_behavior_snapshots"("connector_instance_id");
-- GIN index so fused-segment membership queries (array_contains) stay fast.
CREATE INDEX IF NOT EXISTS "idx_behavior_snapshot_fused"
    ON "customer_behavior_snapshots" USING GIN ("fused_segments");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_behavior_snapshots_customer_profile_id_fkey') THEN
        ALTER TABLE "customer_behavior_snapshots"
            ADD CONSTRAINT "customer_behavior_snapshots_customer_profile_id_fkey"
            FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
