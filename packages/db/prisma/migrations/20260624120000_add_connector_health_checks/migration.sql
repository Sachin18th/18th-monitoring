-- CreateTable
CREATE TABLE "connector_health_checks" (
    "id" SERIAL NOT NULL,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "provider_id" VARCHAR(255) NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "state" VARCHAR(32) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "endpoint" VARCHAR(512),
    "error" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connector_health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_apihealth_site_ts" ON "connector_health_checks"("site_id", "checked_at");

-- CreateIndex
CREATE INDEX "idx_apihealth_connector_ts" ON "connector_health_checks"("connector_instance_id", "checked_at");

-- AddForeignKey
ALTER TABLE "connector_health_checks" ADD CONSTRAINT "connector_health_checks_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
