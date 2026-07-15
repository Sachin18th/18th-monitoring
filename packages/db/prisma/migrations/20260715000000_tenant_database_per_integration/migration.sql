-- DATABASE-PER-INTEGRATION: re-key tenant_databases from one-row-per-tenant to
-- one-row-per-connector-instance (a connected store). Existing rows keep
-- connector_instance_id NULL and are treated as legacy per-tenant databases.

-- Drop the one-DB-per-tenant constraint; a tenant now has one DB per integration.
DROP INDEX "tenant_databases_tenant_id_key";

ALTER TABLE "tenant_databases" ADD COLUMN "connector_instance_id" VARCHAR(36);
ALTER TABLE "tenant_databases" ADD COLUMN "site_id" VARCHAR(255);

CREATE UNIQUE INDEX "tenant_databases_connector_instance_id_key" ON "tenant_databases"("connector_instance_id");
CREATE INDEX "idx_tenant_database_tenant" ON "tenant_databases"("tenant_id");
CREATE INDEX "idx_tenant_database_site" ON "tenant_databases"("site_id");

ALTER TABLE "tenant_databases" ADD CONSTRAINT "tenant_databases_connector_instance_id_fkey"
  FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
