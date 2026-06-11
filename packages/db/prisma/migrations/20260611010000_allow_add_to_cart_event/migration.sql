-- Allow the 'add_to_cart' storefront event type.
--
-- The "magento Customer session" change (81918ce) started emitting and accepting
-- 'add_to_cart' on the tracker + ingest service, but the storefront_events
-- event_type CHECK constraint (from 20260608000000) was never widened to match.
-- Any ingest batch containing an add_to_cart row therefore failed the whole
-- multi-row INSERT, and the error was swallowed (HTTP 200, accepted:0) -- so
-- events silently stopped landing. This brings the DB back in line with the app.
--
-- Idempotent: drop-if-exists then recreate with the full allowed set.

ALTER TABLE "storefront_events"
  DROP CONSTRAINT IF EXISTS "storefront_events_event_type_check";

ALTER TABLE "storefront_events"
  ADD CONSTRAINT "storefront_events_event_type_check"
    CHECK ("event_type" IN (
      'page_view',
      'product_view',
      'add_to_cart',
      'element_click',
      'checkout_step',
      'checkout_abandon',
      'checkout_complete'
    ));
