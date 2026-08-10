-- CDP identity resolution (Phase 1) — see docs/CDP-IMPLEMENTATION-PLAN.md §4.
-- Bridges live storefront behavior to the CustomerProfile golden record.
-- Idempotent (IF NOT EXISTS / guarded) so it is safe to re-run across every
-- already-provisioned tenant database.

-- 1. Identity graph: one identifier -> exactly one profile (per connector).
CREATE TABLE IF NOT EXISTS "identity_links" (
    "id"                    VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "site_id"               VARCHAR(255) NOT NULL,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "customer_profile_id"   VARCHAR(36) NOT NULL,
    "identifier_type"       VARCHAR(20) NOT NULL,
    "identifier_value"      VARCHAR(255) NOT NULL,
    "confidence"            DECIMAL(4,3) NOT NULL DEFAULT 1.0,
    "first_seen_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    "last_seen_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "identity_links_pkey" PRIMARY KEY ("id")
);

-- Core CDP invariant: an identifier resolves to a single profile at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_identity_link_identifier"
    ON "identity_links"("connector_instance_id", "identifier_type", "identifier_value");
CREATE INDEX IF NOT EXISTS "idx_identity_link_customer"
    ON "identity_links"("customer_profile_id");

-- FK stays within the data plane (identity_links -> customer_profiles).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'identity_links_customer_profile_id_fkey'
    ) THEN
        ALTER TABLE "identity_links"
            ADD CONSTRAINT "identity_links_customer_profile_id_fkey"
            FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- 2. Golden-record uniqueness: one email hash -> one profile per connector.
--    Postgres treats NULLs as distinct, so guest profiles (NULL email_hash) never
--    collide — matches Prisma's @@unique([connectorInstanceId, emailHash]).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cust_profile_connector_email"
    ON "customer_profiles"("connector_instance_id", "email_hash");

-- 3. Bridge live behavior to the golden record (nullable; back-filled on stitch).
ALTER TABLE "storefront_sessions" ADD COLUMN IF NOT EXISTS "customer_profile_id" VARCHAR(36);
CREATE INDEX IF NOT EXISTS "idx_storefront_session_customer"
    ON "storefront_sessions"("connector_instance_id", "customer_profile_id");

ALTER TABLE "storefront_events" ADD COLUMN IF NOT EXISTS "customer_profile_id" VARCHAR(36);
CREATE INDEX IF NOT EXISTS "idx_storefront_event_customer"
    ON "storefront_events"("connector_instance_id", "customer_profile_id");

-- 4. Merge audit + reversibility.
CREATE TABLE IF NOT EXISTS "profile_merges" (
    "id"                    VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "from_profile_id"       VARCHAR(36) NOT NULL,
    "into_profile_id"       VARCHAR(36) NOT NULL,
    "reason"                VARCHAR(255),
    "payload"               JSONB NOT NULL DEFAULT '{}',
    "merged_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "profile_merges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_profile_merge_into" ON "profile_merges"("into_profile_id");
CREATE INDEX IF NOT EXISTS "idx_profile_merge_from" ON "profile_merges"("from_profile_id");
