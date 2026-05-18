/*
  Warnings:

  - A unique constraint covering the columns `[site_id,metric_name,source]` on the table `performance_metrics` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "performance_metrics" ADD COLUMN     "source" VARCHAR(100) NOT NULL DEFAULT 'unknown';

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "slug" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "uq_perf_site_metric_source" ON "performance_metrics"("site_id", "metric_name", "source");
