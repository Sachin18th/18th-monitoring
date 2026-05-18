/*
  Warnings:

  - A unique constraint covering the columns `[project_id,provider_id,is_active]` on the table `connector_credentials` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "connector_credentials" DROP CONSTRAINT "connector_credentials_connector_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "connector_credentials" DROP CONSTRAINT "connector_credentials_tenant_id_fkey";

-- AlterTable
ALTER TABLE "connector_credentials" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "project_id" VARCHAR(255),
ADD COLUMN     "provider_id" VARCHAR(255),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "idx_credential_project" ON "connector_credentials"("project_id");

-- CreateIndex
CREATE INDEX "idx_credential_tenant" ON "connector_credentials"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_credential_connector" ON "connector_credentials"("connector_instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_unique_project_provider_credential" ON "connector_credentials"("project_id", "provider_id", "is_active");

-- AddForeignKey
ALTER TABLE "connector_credentials" ADD CONSTRAINT "connector_credentials_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_credentials" ADD CONSTRAINT "connector_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_credentials" ADD CONSTRAINT "connector_credentials_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
