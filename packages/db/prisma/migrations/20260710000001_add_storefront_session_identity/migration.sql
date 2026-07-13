-- Persist resolved shopper identity directly on the session, so the Session
-- Journey Timeline can ALWAYS show who a session was — even after the session
-- expires, the tab closes, or the tracker's client-side identity cache
-- (sessionStorage: __plat_shid for Shopify / __plat_mid for Adobe Commerce /
-- __plat_bid for BigCommerce) is gone, and even if a later identity beacon was
-- dropped (e.g. ngrok down). Populated at ingest and backfilled across all of a
-- visitor's sessions (see storefront-tracking.service.ts).
--
-- Email is stored only as the AES envelope + deterministic hash, never plaintext
-- (mirrors customer_profiles / storefront_events.properties).
ALTER TABLE "storefront_sessions"
  ADD COLUMN IF NOT EXISTS "customer_id"              TEXT,
  ADD COLUMN IF NOT EXISTS "customer_name"            TEXT,
  ADD COLUMN IF NOT EXISTS "customer_email_encrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "customer_email_hash"      TEXT,
  -- Which client-side identity cache the shopper was resolved from:
  -- 'shopify' (__plat_shid) | 'adobe_commerce' (__plat_mid) | 'bigcommerce' (__plat_bid).
  ADD COLUMN IF NOT EXISTS "identity_source"          TEXT,
  -- Raw non-sensitive identity payload as captured (customer_id, customer_name,
  -- cache key). Never contains a plaintext email.
  ADD COLUMN IF NOT EXISTS "identity_meta"            JSONB;

-- Resolve "which customer visited this store" lookups by email hash.
CREATE INDEX IF NOT EXISTS "idx_storefront_session_email_hash"
  ON "storefront_sessions"("connector_instance_id", "customer_email_hash");
