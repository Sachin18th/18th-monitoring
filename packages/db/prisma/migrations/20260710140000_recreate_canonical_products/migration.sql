-- Re-creates the `canonical_products` table. It was dropped in
-- `20260702100515_drop_legacy_pipeline_tables`, but the `CanonicalProduct` model was left in
-- schema.prisma (an untracked schema↔DB drift), leaving product sync writing to a missing
-- table. This restores it so Shopify/Adobe/BigCommerce product sync can persist canonical
-- products. Uses IF NOT EXISTS so environments where the table still exists are unaffected.

-- CreateTable
CREATE TABLE IF NOT EXISTS "canonical_products" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36),
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
CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_source_ref" ON "canonical_products"("site_id", "tenant_id", "source_system", "product_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_product_site" ON "canonical_products"("site_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_product_tenant" ON "canonical_products"("tenant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_product_connector" ON "canonical_products"("connector_instance_id");

-- AddForeignKey
ALTER TABLE "canonical_products" ADD CONSTRAINT "canonical_products_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_products" ADD CONSTRAINT "canonical_products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_products" ADD CONSTRAINT "canonical_products_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
