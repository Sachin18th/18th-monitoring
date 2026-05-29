CREATE TABLE "payment_gateway_configs" (
  "id" VARCHAR(36) NOT NULL,
  "project_id" VARCHAR(255) NOT NULL,
  "tenant_id" VARCHAR(36) NOT NULL,
  "gateway_name" VARCHAR(50) NOT NULL,
  "label" VARCHAR(255) NOT NULL,
  "api_key" VARCHAR(255),
  "api_secret" VARCHAR(255),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_checked_at" TIMESTAMP(3),
  "last_status" VARCHAR(20),
  "last_payload" JSONB,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_gateway_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_payment_gateway_project_gateway"
  ON "payment_gateway_configs"("project_id", "tenant_id", "gateway_name");
CREATE INDEX "idx_payment_gateway_project"
  ON "payment_gateway_configs"("project_id");
CREATE INDEX "idx_payment_gateway_tenant"
  ON "payment_gateway_configs"("tenant_id");
CREATE INDEX "idx_payment_gateway_name"
  ON "payment_gateway_configs"("gateway_name");

ALTER TABLE "payment_gateway_configs"
  ADD CONSTRAINT "payment_gateway_configs_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_gateway_configs"
  ADD CONSTRAINT "payment_gateway_configs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payment_gateway_status_snapshots" (
  "id" VARCHAR(36) NOT NULL,
  "payment_gateway_config_id" VARCHAR(36) NOT NULL,
  "project_id" VARCHAR(255) NOT NULL,
  "tenant_id" VARCHAR(36) NOT NULL,
  "gateway_name" VARCHAR(50) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "active_downtimes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" VARCHAR(50) NOT NULL DEFAULT 'journey-refresh',
  "error_message" TEXT,

  CONSTRAINT "payment_gateway_status_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_payment_gateway_snapshot_project_ts"
  ON "payment_gateway_status_snapshots"("project_id", "gateway_name", "checked_at");
CREATE INDEX "idx_payment_gateway_snapshot_config_ts"
  ON "payment_gateway_status_snapshots"("payment_gateway_config_id", "checked_at");

ALTER TABLE "payment_gateway_status_snapshots"
  ADD CONSTRAINT "payment_gateway_status_snapshots_payment_gateway_config_id_fkey"
  FOREIGN KEY ("payment_gateway_config_id") REFERENCES "payment_gateway_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_gateway_status_snapshots"
  ADD CONSTRAINT "payment_gateway_status_snapshots_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_gateway_status_snapshots"
  ADD CONSTRAINT "payment_gateway_status_snapshots_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
