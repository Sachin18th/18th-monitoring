-- CDP triggered campaigns (Phase 4) — see docs/CDP-IMPLEMENTATION-PLAN.md §6.2.
-- Personalized messages generated when a fused segment fires (history + recs + live).
-- Idempotent (IF NOT EXISTS) so it is safe to re-run across provisioned tenant DBs.

CREATE TABLE IF NOT EXISTS "campaign_messages" (
    "id"                    VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "customer_profile_id"   VARCHAR(36) NOT NULL,
    "site_id"               VARCHAR(255) NOT NULL,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "trigger"               VARCHAR(40) NOT NULL,
    "goal"                  VARCHAR(40) NOT NULL,
    "channel"               VARCHAR(20) NOT NULL DEFAULT 'email',
    "subject"               TEXT NOT NULL,
    "body"                  TEXT NOT NULL,
    "recommended_products"  JSONB NOT NULL DEFAULT '[]',
    "generator"             VARCHAR(20) NOT NULL,
    "status"                VARCHAR(20) NOT NULL DEFAULT 'GENERATED',
    "reason"                TEXT,
    "sent_at"               TIMESTAMPTZ,
    "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "campaign_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_campaign_msg_customer" ON "campaign_messages"("connector_instance_id", "customer_profile_id");
CREATE INDEX IF NOT EXISTS "idx_campaign_msg_status" ON "campaign_messages"("connector_instance_id", "status");
CREATE INDEX IF NOT EXISTS "idx_campaign_msg_cooldown" ON "campaign_messages"("connector_instance_id", "customer_profile_id", "trigger");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_messages_customer_profile_id_fkey') THEN
        ALTER TABLE "campaign_messages"
            ADD CONSTRAINT "campaign_messages_customer_profile_id_fkey"
            FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
