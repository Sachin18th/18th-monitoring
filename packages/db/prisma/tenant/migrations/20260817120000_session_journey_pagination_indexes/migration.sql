-- Session Journey Timeline: indexes for keyset pagination + identity fallback.
--
-- The timeline lists sessions newest-first for one connector over a started_at
-- window, then pages with a (started_at, id) keyset cursor. Before this
-- migration the data plane had no index matching that access path — only
-- (connector_instance_id) alone, (connector_instance_id, last_active_at), and
-- two composites whose second column is funnel_stage / purchase_completed, which
-- cannot serve a plain connector + started_at DESC ordering. Every page load
-- therefore scanned and sorted every session row for the store.
--
-- The identity LATERAL joins in the same query fall back to "newest event from
-- this visitor that carried an identity", filtered on (connector_instance_id,
-- visitor_id) — also unindexed here, so each ran as a scan over the connector's
-- entire storefront_events partition, three times per returned row.
--
-- All additive / IF NOT EXISTS — safe to re-run.

-- ── Primary list ordering + keyset cursor ───────────────────────────────────
-- Matches: WHERE connector_instance_id = $1 [AND started_at < $cursor]
--          ORDER BY started_at DESC, id DESC
-- `id` is included so the cursor tiebreak stays index-ordered when several
-- sessions share a started_at timestamp.
CREATE INDEX IF NOT EXISTS "idx_ss_recent"
  ON "storefront_sessions"("connector_instance_id", "started_at" DESC, "id" DESC);

-- ── Identity fallback lookups ───────────────────────────────────────────────
-- Matches the visitor-level LATERAL joins: newest event for a visitor.
CREATE INDEX IF NOT EXISTS "idx_storefront_event_visitor"
  ON "storefront_events"("connector_instance_id", "visitor_id", "occurred_at" DESC);

-- ── Abandoned-checkout bucket ───────────────────────────────────────────────
-- The highest-value outcome bucket on the timeline, and the most selective:
-- a partial index keeps it cheap regardless of how much total traffic the store
-- has. The other three buckets (converted / browsed / bounced) are served by
-- idx_ss_purchase and idx_ss_recent respectively.
CREATE INDEX IF NOT EXISTS "idx_ss_abandoned"
  ON "storefront_sessions"("connector_instance_id", "started_at" DESC)
  WHERE "checkout_started" AND NOT "purchase_completed";
