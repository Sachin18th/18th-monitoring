-- Storefront session/event tracking (anonymous visitor + session capture from
-- the public tracker script). Both tables are scoped by tenant_id AND
-- connector_instance_id and cascade-delete with their connector instance.
--
-- NOTE: connector_instances.id / tenants.id are VARCHAR(36) in this schema, so
-- the FK columns mirror that type (a UUID column cannot FK a VARCHAR(36) PK).
-- Primary keys default to a generated UUID rendered as text to match the
-- project-wide VARCHAR(36) id convention.

-- ── storefront_sessions ─────────────────────────────────────────────────────
CREATE TABLE "storefront_sessions" (
  "id"                    VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
  "connector_instance_id" VARCHAR(36) NOT NULL,
  "tenant_id"             VARCHAR(36) NOT NULL,
  "session_id"            TEXT NOT NULL,
  "visitor_id"            TEXT NOT NULL,
  "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_active_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "user_agent"            TEXT,
  "referrer"              TEXT,
  "landing_page"          TEXT,
  "device_type"           TEXT,
  "metadata"              JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT "storefront_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "storefront_sessions_device_type_check"
    CHECK ("device_type" IS NULL OR "device_type" IN ('mobile', 'desktop', 'tablet'))
);

CREATE UNIQUE INDEX "uq_storefront_session_connector_session"
  ON "storefront_sessions"("connector_instance_id", "session_id");
CREATE INDEX "idx_storefront_session_tenant"
  ON "storefront_sessions"("tenant_id");
CREATE INDEX "idx_storefront_session_connector"
  ON "storefront_sessions"("connector_instance_id");
CREATE INDEX "idx_storefront_session_visitor"
  ON "storefront_sessions"("connector_instance_id", "visitor_id");
CREATE INDEX "idx_storefront_session_last_active"
  ON "storefront_sessions"("connector_instance_id", "last_active_at");

ALTER TABLE "storefront_sessions"
  ADD CONSTRAINT "storefront_sessions_connector_instance_id_fkey"
  FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── storefront_events ───────────────────────────────────────────────────────
CREATE TABLE "storefront_events" (
  "id"                    VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
  "connector_instance_id" VARCHAR(36) NOT NULL,
  "tenant_id"             VARCHAR(36) NOT NULL,
  "session_id"            TEXT NOT NULL,
  "visitor_id"            TEXT NOT NULL,
  "event_type"            TEXT NOT NULL,
  "page_url"              TEXT,
  "page_title"            TEXT,
  "occurred_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "received_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "properties"            JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT "storefront_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "storefront_events_event_type_check"
    CHECK ("event_type" IN (
      'page_view',
      'product_view',
      'element_click',
      'checkout_step',
      'checkout_abandon',
      'checkout_complete'
    ))
);

CREATE INDEX "idx_storefront_event_tenant"
  ON "storefront_events"("tenant_id");
CREATE INDEX "idx_storefront_event_connector"
  ON "storefront_events"("connector_instance_id");
CREATE INDEX "idx_storefront_event_connector_occurred"
  ON "storefront_events"("connector_instance_id", "occurred_at");
CREATE INDEX "idx_storefront_event_session"
  ON "storefront_events"("connector_instance_id", "session_id");
CREATE INDEX "idx_storefront_event_type_occurred"
  ON "storefront_events"("connector_instance_id", "event_type", "occurred_at");

ALTER TABLE "storefront_events"
  ADD CONSTRAINT "storefront_events_connector_instance_id_fkey"
  FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
