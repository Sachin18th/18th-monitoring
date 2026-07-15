-- Physical database-per-tenant: control-plane provisioning tables.
--
-- NOTE: `prisma migrate dev` auto-generated a much larger diff because this
-- repo's migration history has drifted from schema.prisma in both directions
-- (schema.prisma still declares models for tables dropped by
-- 20260702091601_drop_unused_tables / 20260702100515_drop_legacy_pipeline_tables,
-- and the live DB carries storefront_sessions identity columns not present in
-- schema.prisma). Applying that diff would DROP live columns and re-create
-- already-dropped tables. This migration was hand-trimmed to ONLY the additive
-- statements for this change, and must be applied with `prisma migrate deploy`
-- (which runs the file verbatim, without re-diffing against schema.prisma).

-- CreateTable
CREATE TABLE "tenant_databases" (
    "id" VARCHAR(36) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "db_host" VARCHAR(255) NOT NULL,
    "db_port" INTEGER NOT NULL DEFAULT 5432,
    "db_name" VARCHAR(255) NOT NULL,
    "db_user" VARCHAR(255) NOT NULL,
    "vault_key" VARCHAR(255),
    "encrypted_secret" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "provisioned_at" TIMESTAMP(3),
    "last_migration_version" VARCHAR(255),
    "last_error" JSONB,
    "provisioning_started_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_databases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_database_provisioning_events" (
    "id" VARCHAR(36) NOT NULL,
    "tenant_database_id" VARCHAR(36) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "from_status" VARCHAR(50),
    "to_status" VARCHAR(50),
    "severity" VARCHAR(20) NOT NULL,
    "payload" JSONB DEFAULT '{}',
    "error_detail" TEXT,
    "correlation_id" VARCHAR(100),
    "triggered_by" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_database_provisioning_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_databases_tenant_id_key" ON "tenant_databases"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_tenant_database_status" ON "tenant_databases"("status");

-- CreateIndex
CREATE INDEX "idx_tenant_db_event_db" ON "tenant_database_provisioning_events"("tenant_database_id");

-- CreateIndex
CREATE INDEX "idx_tenant_db_event_tenant" ON "tenant_database_provisioning_events"("tenant_id");

-- AddForeignKey
ALTER TABLE "tenant_databases" ADD CONSTRAINT "tenant_databases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_database_provisioning_events" ADD CONSTRAINT "tenant_database_provisioning_events_tenant_database_id_fkey" FOREIGN KEY ("tenant_database_id") REFERENCES "tenant_databases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
