-- Scope payment gateway configs + snapshots to a specific connected store
-- (connector instance) so the Backend API page's Payment Gateways tab can
-- reflect the store selected at the top of the page.

-- AlterTable: add the connector column (nullable = "applies to all stores").
ALTER TABLE "payment_gateway_configs" ADD COLUMN "connector_instance_id" VARCHAR(36);
ALTER TABLE "payment_gateway_status_snapshots" ADD COLUMN "connector_instance_id" VARCHAR(36);

-- Backfill existing rows to the project's first (earliest created) connector.
UPDATE "payment_gateway_configs" c
SET "connector_instance_id" = (
    SELECT ci."id"
    FROM "connector_instances" ci
    WHERE ci."site_id" = c."project_id"
      AND ci."tenant_id" = c."tenant_id"
    ORDER BY ci."created_at" ASC
    LIMIT 1
)
WHERE c."connector_instance_id" IS NULL;

-- Snapshots inherit the connector from their parent config.
UPDATE "payment_gateway_status_snapshots" s
SET "connector_instance_id" = c."connector_instance_id"
FROM "payment_gateway_configs" c
WHERE s."payment_gateway_config_id" = c."id"
  AND s."connector_instance_id" IS NULL;

-- Swap the project-level uniqueness for a connector-level one so each store can
-- have its own copy of the same gateway (e.g. two stores both using Razorpay).
DROP INDEX IF EXISTS "uq_payment_gateway_project_gateway";

CREATE UNIQUE INDEX "uq_payment_gateway_project_connector_gateway"
    ON "payment_gateway_configs" ("project_id", "tenant_id", "connector_instance_id", "gateway_name");

-- CreateIndex
CREATE INDEX "idx_payment_gateway_connector" ON "payment_gateway_configs" ("connector_instance_id");
CREATE INDEX "idx_payment_gateway_snapshot_connector_ts" ON "payment_gateway_status_snapshots" ("connector_instance_id", "checked_at");

-- AddForeignKey: deleting a store nulls the link (rows survive as project-wide).
ALTER TABLE "payment_gateway_configs"
    ADD CONSTRAINT "payment_gateway_configs_connector_instance_id_fkey"
    FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_gateway_status_snapshots"
    ADD CONSTRAINT "payment_gateway_status_snapshots_connector_instance_id_fkey"
    FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
