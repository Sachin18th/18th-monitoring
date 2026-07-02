-- AlterTable
-- Widen performance_metrics.route from VarChar(255) to VarChar(1024) so full per-page-type
-- PSI URLs (PDP/PLP) — which mirror discovered_page_urls.resolved_url (VarChar 1024) — save
-- cleanly. Deep nested category paths (e.g. Adobe url_path) exceed 255 and previously threw
-- "value too long for type character varying(255)" during the metric upsert.
ALTER TABLE "performance_metrics" ALTER COLUMN "route" TYPE VARCHAR(1024);
