-- CDP customer analytics (Phase 2) — see docs/CDP-IMPLEMENTATION-PLAN.md §5.1.
-- Computed transactional intelligence (RFM / CLTV / churn / segment) per customer
-- profile, derived from canonical_orders by CustomerAnalyticsService.
-- Idempotent (IF NOT EXISTS) so it is safe to re-run across provisioned tenant DBs.

CREATE TABLE IF NOT EXISTS "customer_metrics" (
    "id"                    VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "customer_profile_id"   VARCHAR(36) NOT NULL,
    "site_id"               VARCHAR(255) NOT NULL,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "order_count"           INTEGER NOT NULL DEFAULT 0,
    "total_revenue"         DECIMAL NOT NULL DEFAULT 0,
    "avg_order_value"       DECIMAL NOT NULL DEFAULT 0,
    "first_order_at"        TIMESTAMPTZ,
    "last_order_at"         TIMESTAMPTZ,
    "recency_days"          INTEGER,
    "frequency_monthly"     DECIMAL,
    "rfm_recency"           INTEGER,
    "rfm_frequency"         INTEGER,
    "rfm_monetary"          INTEGER,
    "rfm_score"             INTEGER,
    "cltv"                  DECIMAL,
    "cltv_tier"             VARCHAR(20),
    "churn_risk"            DECIMAL(4,3),
    "churn_level"           VARCHAR(20),
    "segment"               VARCHAR(30),
    "computed_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "customer_metrics_pkey" PRIMARY KEY ("id")
);

-- One current metrics row per profile (recompute upserts on this key).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_customer_metrics_profile"
    ON "customer_metrics"("connector_instance_id", "customer_profile_id");
CREATE INDEX IF NOT EXISTS "idx_customer_metrics_segment"
    ON "customer_metrics"("connector_instance_id", "segment");
CREATE INDEX IF NOT EXISTS "idx_customer_metrics_churn"
    ON "customer_metrics"("connector_instance_id", "churn_level");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_metrics_customer_profile_id_fkey') THEN
        ALTER TABLE "customer_metrics"
            ADD CONSTRAINT "customer_metrics_customer_profile_id_fkey"
            FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
