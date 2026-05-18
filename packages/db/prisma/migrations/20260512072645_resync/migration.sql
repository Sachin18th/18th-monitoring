-- AlterTable
ALTER TABLE "connector_instances" ADD COLUMN     "records_by_type" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "connector_resync_jobs" (
    "job_id" VARCHAR(64) NOT NULL,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "project_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "sync_targets" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(50) NOT NULL,
    "initiated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "error" JSONB,
    "target_results" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connector_resync_jobs_pkey" PRIMARY KEY ("job_id")
);

-- CreateTable
CREATE TABLE "canonical_products" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "product_id" VARCHAR(255) NOT NULL,
    "source_system" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "sku" VARCHAR(255),
    "inventory" INTEGER DEFAULT 0,
    "price" DECIMAL(20,4),
    "source_updated_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canonical_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_resync_job_connector_status" ON "connector_resync_jobs"("connector_instance_id", "status");

-- CreateIndex
CREATE INDEX "idx_resync_job_project" ON "connector_resync_jobs"("project_id");

-- CreateIndex
CREATE INDEX "idx_resync_job_tenant" ON "connector_resync_jobs"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_product_site" ON "canonical_products"("site_id");

-- CreateIndex
CREATE INDEX "idx_product_tenant" ON "canonical_products"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_product_source_ref" ON "canonical_products"("site_id", "tenant_id", "source_system", "product_id");

-- AddForeignKey
ALTER TABLE "connector_resync_jobs" ADD CONSTRAINT "connector_resync_jobs_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_resync_jobs" ADD CONSTRAINT "connector_resync_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_resync_jobs" ADD CONSTRAINT "connector_resync_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_products" ADD CONSTRAINT "canonical_products_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_products" ADD CONSTRAINT "canonical_products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
