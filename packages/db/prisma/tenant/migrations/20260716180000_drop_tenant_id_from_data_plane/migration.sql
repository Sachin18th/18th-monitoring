-- Drop the redundant `tenant_id` column from every tenant data-plane table.
--
-- In the database-per-tenant model each tenant owns its own physical Postgres
-- database, so `tenant_id` holds a single constant value across every row and
-- carries no information. This migration removes the column, the indexes that
-- were keyed on it, and rebuilds the composite UNIQUE indexes without it.
--
-- Idempotent (IF EXISTS / IF NOT EXISTS) so it is safe to re-run across every
-- already-provisioned tenant database.

-- 1) Drop composite UNIQUE indexes that included tenant_id (rebuilt below).
DROP INDEX IF EXISTS "uq_product_source_ref";
DROP INDEX IF EXISTS "uq_product_category_source_ref";
DROP INDEX IF EXISTS "uq_checkout_source_ref";

-- 2) Drop single-purpose tenant_id indexes.
DROP INDEX IF EXISTS "idx_order_tenant";
DROP INDEX IF EXISTS "idx_product_tenant";
DROP INDEX IF EXISTS "idx_product_category_tenant";
DROP INDEX IF EXISTS "idx_checkout_tenant";
DROP INDEX IF EXISTS "idx_storefront_session_tenant";
DROP INDEX IF EXISTS "idx_storefront_event_tenant";
DROP INDEX IF EXISTS "idx_perf_tenant_ts";
DROP INDEX IF EXISTS "idx_kpi_tenant_ts";
DROP INDEX IF EXISTS "idx_alert_tenant";

-- 3) Drop the tenant_id column from every data-plane table.
ALTER TABLE "canonical_orders"             DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "canonical_products"           DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "canonical_product_categories" DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "canonical_checkouts"          DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "customer_profiles"            DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "storefront_sessions"          DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "storefront_events"            DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "performance_metrics"          DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "kpi_values"                   DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "discovered_page_urls"         DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "alerts"                       DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "alert_rules"                  DROP COLUMN IF EXISTS "tenant_id";

-- 4) Recreate the composite UNIQUE indexes without tenant_id (same names).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_source_ref"
  ON "canonical_products"("site_id", "source_system", "product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_category_source_ref"
  ON "canonical_product_categories"("site_id", "source_system", "product_id", "category_name");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_checkout_source_ref"
  ON "canonical_checkouts"("site_id", "source_system", "checkout_id");
