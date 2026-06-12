-- Storefront RUM errors & issues captured by the public tracker script.
-- Scoped by project_id (projects.id is VARCHAR(255) in this schema, so the FK
-- column mirrors that type). connector_instance_id is best-effort: a storefront
-- page only carries the connector id, and it may be cleared if the connector is
-- removed, so the column is nullable with ON DELETE SET NULL.
--
-- `metadata` (JSONB) holds the per-type flags that have no dedicated column:
--   platform pattern hits, payment/cart/checkout severity, network slow/failed
--   booleans, and js error line/column.

CREATE TABLE "storefront_errors" (
  "id"                    VARCHAR(36)  NOT NULL DEFAULT (gen_random_uuid())::text,
  "project_id"            VARCHAR(255) NOT NULL,
  "connector_instance_id" VARCHAR(36),
  "error_type"            VARCHAR(50)  NOT NULL,
  "severity"              VARCHAR(20)  NOT NULL,
  "message"               TEXT         NOT NULL,
  "source_url"            TEXT,
  "stack_trace"           TEXT,
  "request_url"           TEXT,
  "status_code"           INTEGER,
  "http_method"           VARCHAR(10),
  "duration_ms"           INTEGER,
  "resource_tag"          VARCHAR(20),
  "page_type"             VARCHAR(30),
  "page_url"              TEXT,
  "user_agent"            TEXT,
  "session_id"            VARCHAR(100),
  "metadata"              JSONB        NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at"           TIMESTAMPTZ  NOT NULL,
  "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "storefront_errors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "storefront_errors_error_type_check"
    CHECK ("error_type" IN (
      'js_error',
      'promise_rejection',
      'network_error',
      'resource_error',
      'checkout_error',
      'console_error'
    )),
  CONSTRAINT "storefront_errors_severity_check"
    CHECK ("severity" IN ('critical', 'warning', 'info'))
);

CREATE INDEX "idx_storefront_error_project_occurred"
  ON "storefront_errors"("project_id", "occurred_at" DESC);
CREATE INDEX "idx_storefront_error_connector_occurred"
  ON "storefront_errors"("connector_instance_id", "occurred_at" DESC);
CREATE INDEX "idx_storefront_error_type"
  ON "storefront_errors"("project_id", "error_type", "occurred_at");
CREATE INDEX "idx_storefront_error_page"
  ON "storefront_errors"("project_id", "page_type", "occurred_at");

ALTER TABLE "storefront_errors"
  ADD CONSTRAINT "storefront_errors_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "storefront_errors"
  ADD CONSTRAINT "storefront_errors_connector_instance_id_fkey"
  FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
