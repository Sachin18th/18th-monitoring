-- CDP customer groups (Phase 5) — user-defined, RULE-BASED dynamic segments.
-- Membership is evaluated at read time by CustomerGroupService, so there is no
-- membership table. Idempotent (IF NOT EXISTS) so it is safe to re-run across
-- provisioned tenant DBs.

CREATE TABLE IF NOT EXISTS "customer_groups" (
    "id"                    VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "site_id"               VARCHAR(255) NOT NULL,
    "name"                  VARCHAR(120) NOT NULL,
    "description"           TEXT,
    "color"                 VARCHAR(20),
    "rules"                 JSONB NOT NULL DEFAULT '{}',
    "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_customer_group_name" ON "customer_groups"("connector_instance_id", "name");
CREATE INDEX IF NOT EXISTS "idx_customer_group_connector" ON "customer_groups"("connector_instance_id");
