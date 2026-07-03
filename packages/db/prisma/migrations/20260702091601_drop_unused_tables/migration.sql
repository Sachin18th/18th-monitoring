/*
  Warnings:

  - You are about to drop the `connector_health_snapshots` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `identity_links` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `quality_gate_results` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "connector_health_snapshots" DROP CONSTRAINT "connector_health_snapshots_project_id_fkey";

-- DropForeignKey
ALTER TABLE "identity_links" DROP CONSTRAINT "identity_links_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "quality_gate_results" DROP CONSTRAINT "quality_gate_results_ingestion_event_id_fkey";

-- DropTable
DROP TABLE "connector_health_snapshots";

-- DropTable
DROP TABLE "identity_links";

-- DropTable
DROP TABLE "quality_gate_results";
