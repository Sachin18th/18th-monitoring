-- Supports the visitor-level identity backfill in the Session Journey Timeline
-- (apps/api/src/routes/storefront/session-journeys.ts): for each session we look
-- up the most recent event with the same visitor_id that carried an identity, so
-- a shopper identified in ANY session names their other sessions too. Matches the
-- lateral join's filter (connector_instance_id + visitor_id, newest occurred_at).
CREATE INDEX IF NOT EXISTS "idx_storefront_event_visitor"
  ON "storefront_events"("connector_instance_id", "visitor_id", "occurred_at");
