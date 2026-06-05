CREATE TABLE "canonical_checkouts" (
  "id" VARCHAR(36) NOT NULL,
  "site_id" VARCHAR(255) NOT NULL,
  "tenant_id" VARCHAR(36) NOT NULL,
  "connector_instance_id" VARCHAR(36),
  "checkout_id" VARCHAR(255) NOT NULL,
  "source_system" VARCHAR(255) NOT NULL,
  "token" VARCHAR(255),
  "customer_id" VARCHAR(36),
  "customer_email" VARCHAR(255),
  "status" VARCHAR(50) NOT NULL,
  "currency" VARCHAR(10) NOT NULL,
  "subtotal_amount" DECIMAL(20,4),
  "total_amount" DECIMAL(20,4) NOT NULL,
  "tax_amount" DECIMAL(20,4),
  "discount_amount" DECIMAL(20,4),
  "line_items_count" INTEGER DEFAULT 0,
  "line_items" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "abandoned_checkout_url" TEXT,
  "completed_order_id" VARCHAR(255),
  "started_at" TIMESTAMP(3) NOT NULL,
  "last_activity_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "canonical_checkouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_checkout_source_ref"
  ON "canonical_checkouts"("site_id", "tenant_id", "source_system", "checkout_id");
CREATE INDEX "idx_checkout_site"
  ON "canonical_checkouts"("site_id");
CREATE INDEX "idx_checkout_tenant"
  ON "canonical_checkouts"("tenant_id");
CREATE INDEX "idx_checkout_connector"
  ON "canonical_checkouts"("connector_instance_id");
CREATE INDEX "idx_checkout_status"
  ON "canonical_checkouts"("status");
CREATE INDEX "idx_checkout_started_ts"
  ON "canonical_checkouts"("started_at");

ALTER TABLE "canonical_checkouts"
  ADD CONSTRAINT "canonical_checkouts_site_id_fkey"
  FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "canonical_checkouts"
  ADD CONSTRAINT "canonical_checkouts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "canonical_checkouts"
  ADD CONSTRAINT "canonical_checkouts_connector_instance_id_fkey"
  FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
