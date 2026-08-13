-- Speeds up the Session Journey Timeline on stores with a lot of event history.
--
-- The timeline query runs six LEFT JOIN LATERAL subqueries per session, each of
-- the form "newest event in this session where <condition>": filter on
-- (connector_instance_id, session_id), ORDER BY occurred_at DESC, LIMIT 1.
--
-- idx_storefront_event_session covers only the filter, so Postgres had to sort
-- each lateral's matches. At the default page size of 50 sessions that is 300
-- sorts per request, which pushed the endpoint past the dashboard's request
-- timeout and surfaced as the global "Real-time Feed Interrupted" banner.
--
-- Adding occurred_at lets every lateral read one row directly off the index.
-- CONCURRENTLY is not used: prisma migrate runs inside a transaction, and these
-- per-store databases are small enough that a brief lock is acceptable.

CREATE INDEX IF NOT EXISTS idx_storefront_event_session_occurred
  ON storefront_events (connector_instance_id, session_id, occurred_at);
