-- AlterTable
ALTER TABLE "users" ALTER COLUMN "mfa_enabled" DROP NOT NULL;

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "external_ids" JSONB NOT NULL DEFAULT '{}',
    "email_hash" VARCHAR(255),
    "phone_hash" VARCHAR(255),
    "lifecycle_state" VARCHAR(50) NOT NULL DEFAULT 'NEW_GUEST',
    "identity_confidence" DECIMAL(65,30),
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_ltv" DECIMAL(65,30),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" VARCHAR(36) NOT NULL,
    "customer_id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "device" VARCHAR(100),
    "browser" VARCHAR(100),
    "traffic_source" VARCHAR(255),
    "is_converted" INTEGER DEFAULT 0,
    "event_count" INTEGER DEFAULT 0,

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_links" (
    "id" SERIAL NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "primary_customer_id" VARCHAR(36) NOT NULL,
    "secondary_customer_id" VARCHAR(36) NOT NULL,
    "link_type" VARCHAR(50) NOT NULL,
    "confidence" DECIMAL(65,30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_events" (
    "id" VARCHAR(36) NOT NULL,
    "customer_id" VARCHAR(36) NOT NULL,
    "session_id" VARCHAR(36),
    "site_id" VARCHAR(255) NOT NULL,
    "event_name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "utm_source" VARCHAR(100),
    "utm_medium" VARCHAR(100),
    "utm_campaign" VARCHAR(100),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "customer_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_cust_profile_site" ON "customer_profiles"("site_id");

-- CreateIndex
CREATE INDEX "idx_cust_profile_email" ON "customer_profiles"("email_hash");

-- CreateIndex
CREATE INDEX "idx_session_customer" ON "customer_sessions"("customer_id");

-- CreateIndex
CREATE INDEX "idx_session_site" ON "customer_sessions"("site_id");

-- CreateIndex
CREATE INDEX "idx_cust_event_session" ON "customer_events"("session_id");

-- CreateIndex
CREATE INDEX "idx_cust_event_cust_ts" ON "customer_events"("customer_id", "timestamp");

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_links" ADD CONSTRAINT "identity_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_events" ADD CONSTRAINT "customer_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_events" ADD CONSTRAINT "customer_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "customer_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_events" ADD CONSTRAINT "customer_events_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
