-- Session-funnel query indexes for the journey-intel page.
--
-- The funnel + Session Intelligence KPIs read from storefront_sessions, filtered
-- by connector_instance_id over a started_at window (the schema's session
-- start-time column; the spec's "first_seen_at" maps to it). canonical_stage on
-- storefront_events already has an index from 20260610000000.
--
-- All additive / IF NOT EXISTS — safe to re-run.

CREATE INDEX IF NOT EXISTS "idx_ss_funnel"
  ON "storefront_sessions"("connector_instance_id", "funnel_stage", "started_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_ss_purchase"
  ON "storefront_sessions"("connector_instance_id", "purchase_completed", "started_at" DESC);
