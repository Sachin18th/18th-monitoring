/*
  Warnings:

  - You are about to drop the `alert_rules` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `alerts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `canonical_orders` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `canonical_product_categories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `canonical_products` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `customer_profiles` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `discovered_page_urls` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `order_events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `order_snapshots` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `performance_metrics` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `storefront_errors` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `storefront_events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `storefront_sessions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "alert_rules" DROP CONSTRAINT "alert_rules_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "alert_rules" DROP CONSTRAINT "alert_rules_site_id_fkey";

-- DropForeignKey
ALTER TABLE "alert_rules" DROP CONSTRAINT "alert_rules_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_site_id_fkey";

-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "canonical_orders" DROP CONSTRAINT "canonical_orders_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "canonical_orders" DROP CONSTRAINT "canonical_orders_site_id_fkey";

-- DropForeignKey
ALTER TABLE "canonical_orders" DROP CONSTRAINT "canonical_orders_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "canonical_product_categories" DROP CONSTRAINT "canonical_product_categories_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "canonical_product_categories" DROP CONSTRAINT "canonical_product_categories_site_id_fkey";

-- DropForeignKey
ALTER TABLE "canonical_product_categories" DROP CONSTRAINT "canonical_product_categories_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "canonical_products" DROP CONSTRAINT "canonical_products_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "canonical_products" DROP CONSTRAINT "canonical_products_site_id_fkey";

-- DropForeignKey
ALTER TABLE "canonical_products" DROP CONSTRAINT "canonical_products_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "customer_profiles" DROP CONSTRAINT "customer_profiles_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "customer_profiles" DROP CONSTRAINT "customer_profiles_site_id_fkey";

-- DropForeignKey
ALTER TABLE "customer_profiles" DROP CONSTRAINT "customer_profiles_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "discovered_page_urls" DROP CONSTRAINT "discovered_page_urls_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "order_events" DROP CONSTRAINT "order_events_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "order_events" DROP CONSTRAINT "order_events_order_internal_id_fkey";

-- DropForeignKey
ALTER TABLE "order_events" DROP CONSTRAINT "order_events_project_id_fkey";

-- DropForeignKey
ALTER TABLE "order_snapshots" DROP CONSTRAINT "order_snapshots_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "order_snapshots" DROP CONSTRAINT "order_snapshots_order_internal_id_fkey";

-- DropForeignKey
ALTER TABLE "order_snapshots" DROP CONSTRAINT "order_snapshots_project_id_fkey";

-- DropForeignKey
ALTER TABLE "performance_metrics" DROP CONSTRAINT "performance_metrics_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "performance_metrics" DROP CONSTRAINT "performance_metrics_site_id_fkey";

-- DropForeignKey
ALTER TABLE "performance_metrics" DROP CONSTRAINT "performance_metrics_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "storefront_errors" DROP CONSTRAINT "storefront_errors_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "storefront_errors" DROP CONSTRAINT "storefront_errors_project_id_fkey";

-- DropForeignKey
ALTER TABLE "storefront_events" DROP CONSTRAINT "storefront_events_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "storefront_sessions" DROP CONSTRAINT "storefront_sessions_connector_instance_id_fkey";

-- DropTable
DROP TABLE "alert_rules";

-- DropTable
DROP TABLE "alerts";

-- DropTable
DROP TABLE "canonical_orders";

-- DropTable
DROP TABLE "canonical_product_categories";

-- DropTable
DROP TABLE "canonical_products";

-- DropTable
DROP TABLE "customer_profiles";

-- DropTable
DROP TABLE "discovered_page_urls";

-- DropTable
DROP TABLE "order_events";

-- DropTable
DROP TABLE "order_snapshots";

-- DropTable
DROP TABLE "performance_metrics";

-- DropTable
DROP TABLE "storefront_errors";

-- DropTable
DROP TABLE "storefront_events";

-- DropTable
DROP TABLE "storefront_sessions";
