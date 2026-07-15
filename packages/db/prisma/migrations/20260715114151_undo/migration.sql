-- AlterTable
ALTER TABLE "storefront_sessions" ADD COLUMN     "customer_email_encrypted" TEXT,
ADD COLUMN     "customer_email_hash" TEXT,
ADD COLUMN     "customer_id" TEXT,
ADD COLUMN     "customer_name" TEXT,
ADD COLUMN     "identity_meta" JSONB,
ADD COLUMN     "identity_source" TEXT;

-- CreateIndex
CREATE INDEX "idx_storefront_event_visitor" ON "storefront_events"("connector_instance_id", "visitor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_storefront_session_email_hash" ON "storefront_sessions"("connector_instance_id", "customer_email_hash");
