-- CreateTable
CREATE TABLE "canonical_product_categories" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36),
    "product_id" VARCHAR(255) NOT NULL,
    "source_system" VARCHAR(255) NOT NULL,
    "category_id" VARCHAR(255),
    "category_name" VARCHAR(255) NOT NULL,
    "category_path" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "source_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canonical_product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_product_category_source_ref" ON "canonical_product_categories"("site_id", "tenant_id", "source_system", "product_id", "category_name");

-- CreateIndex
CREATE INDEX "idx_product_category_site" ON "canonical_product_categories"("site_id");

-- CreateIndex
CREATE INDEX "idx_product_category_tenant" ON "canonical_product_categories"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_product_category_connector" ON "canonical_product_categories"("connector_instance_id");

-- CreateIndex
CREATE INDEX "idx_product_category_product" ON "canonical_product_categories"("product_id");

-- CreateIndex
CREATE INDEX "idx_product_category_name" ON "canonical_product_categories"("category_name");

-- AddForeignKey
ALTER TABLE "canonical_product_categories" ADD CONSTRAINT "canonical_product_categories_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_product_categories" ADD CONSTRAINT "canonical_product_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_product_categories" ADD CONSTRAINT "canonical_product_categories_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
