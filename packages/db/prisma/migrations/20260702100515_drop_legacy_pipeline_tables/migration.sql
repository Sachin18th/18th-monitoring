/*
  Warnings:

  - You are about to drop the `canonical_checkouts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `canonical_products` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `customer_events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `customer_sessions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `dead_letter_queue` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ingestion_artifacts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ingestion_events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `kpi_values` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `performance_rollups` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `pipeline_checkpoints` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `pipeline_jobs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `recovery_jobs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `system_logs` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "canonical_checkouts" DROP CONSTRAINT "canonical_checkouts_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "canonical_checkouts" DROP CONSTRAINT "canonical_checkouts_site_id_fkey";

-- DropForeignKey
ALTER TABLE "canonical_checkouts" DROP CONSTRAINT "canonical_checkouts_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "canonical_products" DROP CONSTRAINT "canonical_products_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "canonical_products" DROP CONSTRAINT "canonical_products_site_id_fkey";

-- DropForeignKey
ALTER TABLE "canonical_products" DROP CONSTRAINT "canonical_products_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "customer_events" DROP CONSTRAINT "customer_events_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "customer_events" DROP CONSTRAINT "customer_events_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "customer_events" DROP CONSTRAINT "customer_events_session_id_fkey";

-- DropForeignKey
ALTER TABLE "customer_events" DROP CONSTRAINT "customer_events_site_id_fkey";

-- DropForeignKey
ALTER TABLE "customer_sessions" DROP CONSTRAINT "customer_sessions_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "customer_sessions" DROP CONSTRAINT "customer_sessions_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "customer_sessions" DROP CONSTRAINT "customer_sessions_site_id_fkey";

-- DropForeignKey
ALTER TABLE "dead_letter_queue" DROP CONSTRAINT "dead_letter_queue_job_id_fkey";

-- DropForeignKey
ALTER TABLE "dead_letter_queue" DROP CONSTRAINT "dead_letter_queue_site_id_fkey";

-- DropForeignKey
ALTER TABLE "dead_letter_queue" DROP CONSTRAINT "dead_letter_queue_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "ingestion_artifacts" DROP CONSTRAINT "ingestion_artifacts_ingestion_event_id_fkey";

-- DropForeignKey
ALTER TABLE "ingestion_events" DROP CONSTRAINT "ingestion_events_integration_id_fkey";

-- DropForeignKey
ALTER TABLE "ingestion_events" DROP CONSTRAINT "ingestion_events_project_id_fkey";

-- DropForeignKey
ALTER TABLE "ingestion_events" DROP CONSTRAINT "ingestion_events_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "kpi_values" DROP CONSTRAINT "kpi_values_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "kpi_values" DROP CONSTRAINT "kpi_values_site_id_fkey";

-- DropForeignKey
ALTER TABLE "kpi_values" DROP CONSTRAINT "kpi_values_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "performance_rollups" DROP CONSTRAINT "performance_rollups_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "performance_rollups" DROP CONSTRAINT "performance_rollups_site_id_fkey";

-- DropForeignKey
ALTER TABLE "pipeline_checkpoints" DROP CONSTRAINT "pipeline_checkpoints_integration_id_fkey";

-- DropForeignKey
ALTER TABLE "pipeline_checkpoints" DROP CONSTRAINT "pipeline_checkpoints_site_id_fkey";

-- DropForeignKey
ALTER TABLE "pipeline_jobs" DROP CONSTRAINT "pipeline_jobs_integration_id_fkey";

-- DropForeignKey
ALTER TABLE "pipeline_jobs" DROP CONSTRAINT "pipeline_jobs_site_id_fkey";

-- DropForeignKey
ALTER TABLE "pipeline_jobs" DROP CONSTRAINT "pipeline_jobs_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "recovery_jobs" DROP CONSTRAINT "recovery_jobs_site_id_fkey";

-- DropForeignKey
ALTER TABLE "recovery_jobs" DROP CONSTRAINT "recovery_jobs_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "system_logs" DROP CONSTRAINT "system_logs_site_id_fkey";

-- DropForeignKey
ALTER TABLE "system_logs" DROP CONSTRAINT "system_logs_tenant_id_fkey";

-- DropTable
DROP TABLE "canonical_checkouts";

-- DropTable
DROP TABLE "canonical_products";

-- DropTable
DROP TABLE "customer_events";

-- DropTable
DROP TABLE "customer_sessions";

-- DropTable
DROP TABLE "dead_letter_queue";

-- DropTable
DROP TABLE "ingestion_artifacts";

-- DropTable
DROP TABLE "ingestion_events";

-- DropTable
DROP TABLE "kpi_values";

-- DropTable
DROP TABLE "performance_rollups";

-- DropTable
DROP TABLE "pipeline_checkpoints";

-- DropTable
DROP TABLE "pipeline_jobs";

-- DropTable
DROP TABLE "recovery_jobs";

-- DropTable
DROP TABLE "system_logs";
