-- Corrects sessions falsely recorded as purchases on customer account pages.
--
-- The tracker classified any page carrying an order number as an order
-- confirmation. Customer account pages qualify on every signal it used: they sit
-- under /orders/ or /sales/order/ (matching the Shopify and generic URL
-- patterns) and they render order numbers (matching the DOM check). A shopper
-- reviewing a past order therefore emitted checkout_complete → canonical_stage
-- 'purchase' → purchase_completed on the session.
--
-- Because funnel_stage only ever ratchets upward at ingest, the mistake was
-- permanent: it inflated conversion rate, the checkout funnel and the Customers
-- page for real client stores.
--
-- The tracker fix is in apps/api/src/public/tracker.src.js (isAccountPage()).
-- This repairs the data already collected.

-- Same paths the tracker now excludes. Written without \b, which Postgres
-- regexes treat differently to JavaScript.
CREATE OR REPLACE FUNCTION _plat_is_account_url(u text) RETURNS boolean AS $$
  SELECT u ~* '/(account|customer/account|my[-_]?account|sales/order|order[-_]history|orders/history)(/|$|\?)';
$$ LANGUAGE sql IMMUTABLE;

-- 1. Reclassify the misfired events. They were real page views, just not
--    purchases, so they are downgraded rather than deleted — deleting would
--    lose the fact the shopper visited at all.
UPDATE storefront_events
   SET canonical_stage = 'visit',
       event_type      = 'page_view'
 WHERE canonical_stage = 'purchase'
   AND page_url IS NOT NULL
   AND _plat_is_account_url(page_url);

-- 2. Clear purchase_completed on sessions left with no genuine purchase event.
--    Sessions that also had a real confirmation keep their flag.
WITH remaining AS (
    SELECT connector_instance_id,
           session_id,
           bool_or(canonical_stage = 'purchase') AS has_purchase
      FROM storefront_events
     GROUP BY 1, 2
)
UPDATE storefront_sessions s
   SET purchase_completed = FALSE
  FROM remaining r
 WHERE r.connector_instance_id = s.connector_instance_id
   AND r.session_id            = s.session_id
   AND s.purchase_completed    = TRUE
   AND r.has_purchase          = FALSE;

-- 3. Recompute funnel_stage from the surviving events, and drop 'purchase' from
--    funnel_stages_reached, for the sessions corrected above.
WITH highest AS (
    SELECT e.connector_instance_id,
           e.session_id,
           CASE MAX(CASE e.canonical_stage
                      WHEN 'purchase'      THEN 5
                      WHEN 'checkout'      THEN 4
                      WHEN 'add_to_cart'   THEN 3
                      WHEN 'product_view'  THEN 2
                      ELSE 1
                    END)
             WHEN 5 THEN 'purchase'
             WHEN 4 THEN 'checkout'
             WHEN 3 THEN 'add_to_cart'
             WHEN 2 THEN 'product_view'
             ELSE 'visit'
           END AS stage
      FROM storefront_events e
     GROUP BY 1, 2
)
UPDATE storefront_sessions s
   SET funnel_stage = h.stage,
       funnel_stages_reached = COALESCE((
           SELECT jsonb_agg(v)
             FROM jsonb_array_elements_text(s.funnel_stages_reached) AS t(v)
            WHERE v <> 'purchase'
       ), '["visit"]'::jsonb)
  FROM highest h
 WHERE h.connector_instance_id = s.connector_instance_id
   AND h.session_id            = s.session_id
   AND s.purchase_completed    = FALSE
   AND s.funnel_stage          = 'purchase';

DROP FUNCTION _plat_is_account_url(text);
