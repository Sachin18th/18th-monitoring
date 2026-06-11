-- Session-level funnel aggregation.
--
-- Collapses per-page-view event spam into one authoritative row per session and
-- makes the Purchase Journey Funnel computable directly from storefront_sessions
-- (visit → product_view → add_to_cart → checkout → purchase). Plain page_views
-- now only advance the session aggregate; only milestone events still get their
-- own storefront_events row (carrying a canonical_stage for raw reference).
--
-- All columns use IF NOT EXISTS so the migration is safe to re-run / apply over
-- a partially-patched database.

-- ── storefront_sessions: funnel aggregate columns ───────────────────────────
ALTER TABLE "storefront_sessions"
  ADD COLUMN IF NOT EXISTS "page_view_count"       INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "page_urls_visited"     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "funnel_stage"          VARCHAR(50) NOT NULL DEFAULT 'visit',
  ADD COLUMN IF NOT EXISTS "funnel_stages_reached" JSONB       NOT NULL DEFAULT '["visit"]'::jsonb,
  ADD COLUMN IF NOT EXISTS "product_viewed"        BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "product_ids_viewed"    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "add_to_cart"           BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "checkout_started"      BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "purchase_completed"    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "last_page_url"         TEXT,
  ADD COLUMN IF NOT EXISTS "last_page_title"       TEXT,
  ADD COLUMN IF NOT EXISTS "platform"              VARCHAR(50);

-- Funnel queries filter sessions by connector + time window, then COUNT FILTER
-- on the boolean flags. A composite index on (connector, started_at) already
-- exists for the time window; the booleans are cheap to scan once the window is
-- narrowed, so no extra per-flag index is added here.
CREATE INDEX IF NOT EXISTS "idx_storefront_session_funnel_stage"
  ON "storefront_sessions"("connector_instance_id", "funnel_stage");
CREATE INDEX IF NOT EXISTS "idx_storefront_session_platform"
  ON "storefront_sessions"("connector_instance_id", "platform");

-- ── storefront_events: canonical funnel stage ───────────────────────────────
-- Original event_type is preserved (raw reference / debugging); canonical_stage
-- is the normalized funnel stage produced by classifyEvent().
ALTER TABLE "storefront_events"
  ADD COLUMN IF NOT EXISTS "canonical_stage" VARCHAR(50);

CREATE INDEX IF NOT EXISTS "idx_storefront_events_canonical_stage"
  ON "storefront_events"("connector_instance_id", "canonical_stage", "occurred_at");
