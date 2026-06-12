-- Backfill `storefront_events.canonical_stage` for rows written before the
-- column/classifier existed (they were inserted NULL by an older build).
--
-- This mirrors getCanonicalStage() in apps/api/src/lib/tracking/classifyEvent.ts:
-- map by raw event_type first; for page_view use properties.page_type; and only
-- when page_view has no usable page_type, fall back to platform + URL heuristics
-- (classifyShopify / classifyBigCommerce / classifyAdobeCommerce).
--
-- Idempotent: only touches rows where canonical_stage IS NULL.

UPDATE storefront_events e
SET canonical_stage = sub.stage
FROM (
  SELECT
    ev.id,
    CASE
      WHEN ev.event_type = 'checkout_complete' THEN 'purchase'
      WHEN ev.event_type = 'checkout_step'     THEN 'checkout'
      WHEN ev.event_type = 'checkout_abandon'  THEN 'checkout'
      WHEN ev.event_type = 'add_to_cart'       THEN 'add_to_cart'
      WHEN ev.event_type = 'product_view'      THEN 'product_view'
      WHEN ev.event_type = 'page_view' THEN
        CASE lower(coalesce(ev.properties->>'page_type', ev.properties->>'pageType', ''))
          WHEN 'confirmation' THEN 'purchase'
          WHEN 'checkout'     THEN 'checkout'
          WHEN 'product'      THEN 'product_view'
          WHEN 'cart'         THEN 'add_to_cart'
          ELSE
            -- page_type absent/unknown -> URL fallback, by platform (provider_id).
            CASE ci.provider_id
              WHEN 'adobe_commerce' THEN
                CASE
                  WHEN lower(ev.page_url) LIKE '%/checkout/onepage/success%'
                    OR lower(ev.page_url) LIKE '%/checkout/success%'
                    OR lower(ev.page_url) LIKE '%/sales/order/view%'   THEN 'purchase'
                  WHEN lower(ev.page_url) LIKE '%/checkout/cart%'      THEN 'add_to_cart'
                  WHEN (lower(ev.page_url) LIKE '%/checkout/%'
                        AND lower(ev.page_url) NOT LIKE '%/success%'
                        AND lower(ev.page_url) NOT LIKE '%/checkout/cart%') THEN 'checkout'
                  WHEN lower(ev.page_url) LIKE '%/catalog/product/view%' THEN 'product_view'
                  ELSE 'visit'
                END
              WHEN 'shopify' THEN
                CASE
                  WHEN lower(ev.page_url) LIKE '%/thank_you%'
                    OR lower(ev.page_url) LIKE '%/orders/%'           THEN 'purchase'
                  WHEN lower(ev.page_url) LIKE '%/checkouts/%'        THEN 'checkout'
                  WHEN lower(ev.page_url) LIKE '%/cart/add%'          THEN 'add_to_cart'
                  WHEN ev.page_url ~* '/products/[^/?]+'              THEN 'product_view'
                  ELSE 'visit'
                END
              WHEN 'bigcommerce' THEN
                CASE
                  WHEN lower(ev.page_url) LIKE '%/order-confirmation%' THEN 'purchase'
                  WHEN lower(ev.page_url) LIKE '%/checkout%'           THEN 'checkout'
                  WHEN lower(ev.page_url) LIKE '%/cart.php%'           THEN 'add_to_cart'
                  ELSE 'visit'
                END
              ELSE 'visit'
            END
        END
      ELSE 'visit'  -- element_click / custom events do not advance the funnel
    END AS stage
  FROM storefront_events ev
  JOIN connector_instances ci ON ci.id = ev.connector_instance_id
  WHERE ev.canonical_stage IS NULL
) sub
WHERE e.id = sub.id;