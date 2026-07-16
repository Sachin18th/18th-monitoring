-- Add first-touch acquisition attribution + client identification to storefront_sessions.
-- Idempotent (IF NOT EXISTS) so it is safe to re-run across already-provisioned tenant DBs.

ALTER TABLE "storefront_sessions" ADD COLUMN IF NOT EXISTS "channel" VARCHAR(20);
ALTER TABLE "storefront_sessions" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "storefront_sessions" ADD COLUMN IF NOT EXISTS "medium" TEXT;
ALTER TABLE "storefront_sessions" ADD COLUMN IF NOT EXISTS "campaign" TEXT;
ALTER TABLE "storefront_sessions" ADD COLUMN IF NOT EXISTS "browser" VARCHAR(40);
ALTER TABLE "storefront_sessions" ADD COLUMN IF NOT EXISTS "os" VARCHAR(40);

CREATE INDEX IF NOT EXISTS "idx_storefront_session_channel"
  ON "storefront_sessions"("connector_instance_id", "channel");
