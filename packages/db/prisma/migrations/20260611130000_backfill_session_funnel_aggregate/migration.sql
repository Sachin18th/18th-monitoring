-- Backfill storefront_sessions funnel aggregate columns from storefront_events.
--
-- Sessions ingested by a server build that predated the session-funnel-aggregation
-- feature (20260610000000) were written with the column DEFAULTS — page_view_count=0,
-- funnel_stage='visit', and all funnel booleans false — even though their
-- storefront_events clearly reached product_view / add_to_cart / checkout / purchase.
-- That made conversion (purchases / sessions) and every funnel metric wrong.
--
-- This recomputes the per-session aggregate from the authoritative event stream
-- (storefront_events.canonical_stage, populated by 20260611120000_backfill_canonical_stage),
-- monotonically merging with any value already present so re-running is safe and never
-- regresses a correctly-aggregated session. A purchase implies checkout (off-domain
-- checkout pages may never emit a checkout event), mirroring aggregateSession().
--
-- Idempotent: deterministic recompute, OR-merged with current values.

WITH agg AS (
  SELECT
    e.connector_instance_id,
    e.session_id,
    COUNT(*)                                               AS evt_count,
    bool_or(e.canonical_stage = 'product_view')            AS product_viewed,
    bool_or(e.canonical_stage = 'add_to_cart')             AS add_to_cart,
    bool_or(e.canonical_stage IN ('checkout', 'purchase')) AS checkout_started,
    bool_or(e.canonical_stage = 'purchase')                AS purchase_completed
  FROM storefront_events e
  WHERE e.canonical_stage IS NOT NULL
  GROUP BY e.connector_instance_id, e.session_id
)
UPDATE storefront_sessions s
SET
  product_viewed     = s.product_viewed     OR agg.product_viewed,
  add_to_cart        = s.add_to_cart        OR agg.add_to_cart,
  checkout_started   = s.checkout_started   OR agg.checkout_started OR agg.purchase_completed,
  purchase_completed = s.purchase_completed OR agg.purchase_completed,
  -- The aggregate counts every folded event; never shrink an existing count.
  page_view_count    = GREATEST(s.page_view_count, agg.evt_count::int),
  funnel_stage = CASE
    WHEN s.purchase_completed OR agg.purchase_completed                         THEN 'purchase'
    WHEN s.checkout_started   OR agg.checkout_started OR agg.purchase_completed  THEN 'checkout'
    WHEN s.add_to_cart        OR agg.add_to_cart                                THEN 'add_to_cart'
    WHEN s.product_viewed     OR agg.product_viewed                            THEN 'product_view'
    ELSE 'visit'
  END,
  funnel_stages_reached = (
    SELECT COALESCE(jsonb_agg(stage ORDER BY rank), '["visit"]'::jsonb)
    FROM (VALUES
      ('visit', 1),
      ('product_view', 2),
      ('add_to_cart', 3),
      ('checkout', 4),
      ('purchase', 5)
    ) v(stage, rank)
    WHERE v.stage = 'visit'
       OR (v.stage = 'product_view' AND (s.product_viewed   OR agg.product_viewed))
       OR (v.stage = 'add_to_cart'  AND (s.add_to_cart      OR agg.add_to_cart))
       OR (v.stage = 'checkout'     AND (s.checkout_started OR agg.checkout_started OR agg.purchase_completed))
       OR (v.stage = 'purchase'     AND (s.purchase_completed OR agg.purchase_completed))
  )
FROM agg
WHERE s.connector_instance_id = agg.connector_instance_id
  AND s.session_id = agg.session_id;