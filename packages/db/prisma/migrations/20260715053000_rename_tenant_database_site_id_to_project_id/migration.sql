-- tenant_databases.site_id has always held the project id (projects.id); name it accordingly.
ALTER TABLE "tenant_databases" RENAME COLUMN "site_id" TO "project_id";
ALTER INDEX "idx_tenant_database_site" RENAME TO "idx_tenant_database_project";
