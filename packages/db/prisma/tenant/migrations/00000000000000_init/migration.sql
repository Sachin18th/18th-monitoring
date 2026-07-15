-- CreateTable
CREATE TABLE "canonical_orders" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36),
    "order_id" VARCHAR(255) NOT NULL,
    "external_ref_id" VARCHAR(255),
    "source_system" VARCHAR(255) NOT NULL,
    "channel" VARCHAR(50) NOT NULL,
    "lifecycle_state" VARCHAR(50) NOT NULL,
    "normalized_status" VARCHAR(50) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "total_amount" DECIMAL(20,4) NOT NULL,
    "tax_amount" DECIMAL(20,4),
    "discount_amount" DECIMAL(20,4),
    "paid_amount" DECIMAL(20,4),
    "refunded_amount" DECIMAL(20,4),
    "placed_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "mapping_version" VARCHAR(20) NOT NULL,
    "ingestion_event_id" VARCHAR(36),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canonical_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_products" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36),
    "product_id" VARCHAR(255) NOT NULL,
    "source_system" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "sku" VARCHAR(255),
    "inventory" INTEGER DEFAULT 0,
    "price" DECIMAL(20,4),
    "source_updated_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canonical_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_product_categories" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36),
    "product_id" VARCHAR(255) NOT NULL,
    "source_system" VARCHAR(255) NOT NULL,
    "category_id" VARCHAR(255),
    "category_name" VARCHAR(255) NOT NULL,
    "category_path" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "source_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canonical_product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_checkouts" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36),
    "checkout_id" VARCHAR(255) NOT NULL,
    "source_system" VARCHAR(255) NOT NULL,
    "token" VARCHAR(255),
    "customer_id" VARCHAR(36),
    "customer_email" VARCHAR(255),
    "status" VARCHAR(50) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "subtotal_amount" DECIMAL(20,4),
    "total_amount" DECIMAL(20,4) NOT NULL,
    "tax_amount" DECIMAL(20,4),
    "discount_amount" DECIMAL(20,4),
    "line_items_count" INTEGER DEFAULT 0,
    "line_items" JSONB NOT NULL DEFAULT '[]',
    "abandoned_checkout_url" TEXT,
    "completed_order_id" VARCHAR(255),
    "started_at" TIMESTAMP(3) NOT NULL,
    "last_activity_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canonical_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_snapshots" (
    "id" SERIAL NOT NULL,
    "order_internal_id" VARCHAR(36) NOT NULL,
    "project_id" VARCHAR(255),
    "connector_instance_id" VARCHAR(36),
    "snapshot_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lifecycle_state" VARCHAR(50) NOT NULL,
    "total_amount" DECIMAL(20,4),
    "metadata" JSONB,

    CONSTRAINT "order_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" VARCHAR(36) NOT NULL,
    "order_internal_id" VARCHAR(36) NOT NULL,
    "project_id" VARCHAR(255),
    "connector_instance_id" VARCHAR(36),
    "event_type" VARCHAR(100) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "correlation_id" VARCHAR(255),

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36),
    "external_ids" JSONB NOT NULL DEFAULT '{}',
    "email_hash" VARCHAR(255),
    "email_encrypted" TEXT,
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
    "connector_instance_id" VARCHAR(36),
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
CREATE TABLE "customer_events" (
    "id" VARCHAR(36) NOT NULL,
    "customer_id" VARCHAR(36) NOT NULL,
    "session_id" VARCHAR(36),
    "site_id" VARCHAR(255) NOT NULL,
    "connector_instance_id" VARCHAR(36),
    "event_name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "utm_source" VARCHAR(100),
    "utm_medium" VARCHAR(100),
    "utm_campaign" VARCHAR(100),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "customer_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storefront_sessions" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "session_id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" TEXT,
    "referrer" TEXT,
    "landing_page" TEXT,
    "device_type" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "page_view_count" INTEGER NOT NULL DEFAULT 0,
    "page_urls_visited" JSONB NOT NULL DEFAULT '[]',
    "funnel_stage" VARCHAR(50) NOT NULL DEFAULT 'visit',
    "funnel_stages_reached" JSONB NOT NULL DEFAULT '["visit"]',
    "product_viewed" BOOLEAN NOT NULL DEFAULT false,
    "product_ids_viewed" JSONB NOT NULL DEFAULT '[]',
    "add_to_cart" BOOLEAN NOT NULL DEFAULT false,
    "checkout_started" BOOLEAN NOT NULL DEFAULT false,
    "purchase_completed" BOOLEAN NOT NULL DEFAULT false,
    "last_page_url" TEXT,
    "last_page_title" TEXT,
    "platform" VARCHAR(50),

    CONSTRAINT "storefront_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storefront_events" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "session_id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "canonical_stage" VARCHAR(50),
    "page_url" TEXT,
    "page_title" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "properties" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "storefront_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storefront_errors" (
    "id" VARCHAR(36) NOT NULL DEFAULT (gen_random_uuid())::text,
    "project_id" VARCHAR(255) NOT NULL,
    "connector_instance_id" VARCHAR(36),
    "error_type" VARCHAR(50) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "source_url" TEXT,
    "stack_trace" TEXT,
    "request_url" TEXT,
    "status_code" INTEGER,
    "http_method" VARCHAR(10),
    "duration_ms" INTEGER,
    "resource_tag" VARCHAR(20),
    "page_type" VARCHAR(30),
    "page_url" TEXT,
    "user_agent" TEXT,
    "session_id" VARCHAR(100),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storefront_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_metrics" (
    "id" SERIAL NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36),
    "category" VARCHAR(50) NOT NULL,
    "metric_name" VARCHAR(100) NOT NULL,
    "source" VARCHAR(100) NOT NULL DEFAULT 'unknown',
    "metric_value" DECIMAL(20,4) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "region" VARCHAR(100),
    "device" VARCHAR(100),
    "browser" VARCHAR(100),
    "route" VARCHAR(1024),
    "timestamp" TIMESTAMP(3) NOT NULL,
    "trace_id" VARCHAR(255),
    "correlation_id" VARCHAR(255),

    CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_rollups" (
    "id" SERIAL NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "connector_instance_id" VARCHAR(36),
    "metric_name" VARCHAR(100) NOT NULL,
    "bucket_size" VARCHAR(20) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "min" DECIMAL(20,4),
    "max" DECIMAL(20,4),
    "sum" DECIMAL(20,4),
    "avg" DECIMAL(20,4),
    "p50" DECIMAL(20,4),
    "p90" DECIMAL(20,4),
    "p99" DECIMAL(20,4),
    "dimensions" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "performance_rollups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_values" (
    "id" SERIAL NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36),
    "kpi_name" VARCHAR(100) NOT NULL,
    "kpi_value" DECIMAL(20,4) NOT NULL,
    "time_window" VARCHAR(20) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovered_page_urls" (
    "id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "page_type" VARCHAR(20) NOT NULL,
    "resolved_url" VARCHAR(1024) NOT NULL,
    "url_resolution_method" VARCHAR(20) NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovered_page_urls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36),
    "severity" VARCHAR(20) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'TRIGGERED',
    "module" VARCHAR(50) NOT NULL,
    "alert_type" VARCHAR(100) NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',
    "correlation_id" VARCHAR(255),
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" VARCHAR(255),
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "severity" VARCHAR(20) NOT NULL,
    "enabled" INTEGER DEFAULT 1,
    "criteria" JSONB NOT NULL,
    "cooldown_minutes" INTEGER DEFAULT 60,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_order_site" ON "canonical_orders"("site_id");

-- CreateIndex
CREATE INDEX "idx_order_tenant" ON "canonical_orders"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_order_connector" ON "canonical_orders"("connector_instance_id");

-- CreateIndex
CREATE INDEX "idx_order_source_id" ON "canonical_orders"("order_id");

-- CreateIndex
CREATE INDEX "idx_order_lifecycle" ON "canonical_orders"("lifecycle_state");

-- CreateIndex
CREATE INDEX "idx_order_placed_ts" ON "canonical_orders"("placed_at");

-- CreateIndex
CREATE INDEX "idx_product_site" ON "canonical_products"("site_id");

-- CreateIndex
CREATE INDEX "idx_product_tenant" ON "canonical_products"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_product_connector" ON "canonical_products"("connector_instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_product_source_ref" ON "canonical_products"("site_id", "tenant_id", "source_system", "product_id");

-- CreateIndex
CREATE INDEX "idx_product_category_site" ON "canonical_product_categories"("site_id");

-- CreateIndex
CREATE INDEX "idx_product_category_tenant" ON "canonical_product_categories"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_product_category_connector" ON "canonical_product_categories"("connector_instance_id");

-- CreateIndex
CREATE INDEX "idx_product_category_product" ON "canonical_product_categories"("product_id");

-- CreateIndex
CREATE INDEX "idx_product_category_name" ON "canonical_product_categories"("category_name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_product_category_source_ref" ON "canonical_product_categories"("site_id", "tenant_id", "source_system", "product_id", "category_name");

-- CreateIndex
CREATE INDEX "idx_checkout_site" ON "canonical_checkouts"("site_id");

-- CreateIndex
CREATE INDEX "idx_checkout_tenant" ON "canonical_checkouts"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_checkout_connector" ON "canonical_checkouts"("connector_instance_id");

-- CreateIndex
CREATE INDEX "idx_checkout_status" ON "canonical_checkouts"("status");

-- CreateIndex
CREATE INDEX "idx_checkout_started_ts" ON "canonical_checkouts"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_checkout_source_ref" ON "canonical_checkouts"("site_id", "tenant_id", "source_system", "checkout_id");

-- CreateIndex
CREATE INDEX "idx_shot_order" ON "order_snapshots"("order_internal_id");

-- CreateIndex
CREATE INDEX "idx_shot_project_ts" ON "order_snapshots"("project_id", "snapshot_timestamp");

-- CreateIndex
CREATE INDEX "idx_shot_connector" ON "order_snapshots"("connector_instance_id");

-- CreateIndex
CREATE INDEX "idx_order_event_order" ON "order_events"("order_internal_id");

-- CreateIndex
CREATE INDEX "idx_order_event_project_ts" ON "order_events"("project_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_order_event_connector" ON "order_events"("connector_instance_id");

-- CreateIndex
CREATE INDEX "idx_order_event_type" ON "order_events"("event_type");

-- CreateIndex
CREATE INDEX "idx_cust_profile_site" ON "customer_profiles"("site_id");

-- CreateIndex
CREATE INDEX "idx_cust_profile_connector" ON "customer_profiles"("connector_instance_id");

-- CreateIndex
CREATE INDEX "idx_cust_profile_email" ON "customer_profiles"("email_hash");

-- CreateIndex
CREATE INDEX "idx_session_customer" ON "customer_sessions"("customer_id");

-- CreateIndex
CREATE INDEX "idx_session_site" ON "customer_sessions"("site_id");

-- CreateIndex
CREATE INDEX "idx_session_connector" ON "customer_sessions"("connector_instance_id");

-- CreateIndex
CREATE INDEX "idx_cust_event_session" ON "customer_events"("session_id");

-- CreateIndex
CREATE INDEX "idx_cust_event_cust_ts" ON "customer_events"("customer_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_cust_event_connector" ON "customer_events"("connector_instance_id");

-- CreateIndex
CREATE INDEX "idx_storefront_session_tenant" ON "storefront_sessions"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_storefront_session_connector" ON "storefront_sessions"("connector_instance_id");

-- CreateIndex
CREATE INDEX "idx_storefront_session_visitor" ON "storefront_sessions"("connector_instance_id", "visitor_id");

-- CreateIndex
CREATE INDEX "idx_storefront_session_last_active" ON "storefront_sessions"("connector_instance_id", "last_active_at");

-- CreateIndex
CREATE INDEX "idx_storefront_session_funnel_stage" ON "storefront_sessions"("connector_instance_id", "funnel_stage");

-- CreateIndex
CREATE INDEX "idx_storefront_session_platform" ON "storefront_sessions"("connector_instance_id", "platform");

-- CreateIndex
CREATE INDEX "idx_ss_funnel" ON "storefront_sessions"("connector_instance_id", "funnel_stage", "started_at" DESC);

-- CreateIndex
CREATE INDEX "idx_ss_purchase" ON "storefront_sessions"("connector_instance_id", "purchase_completed", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_storefront_session_connector_session" ON "storefront_sessions"("connector_instance_id", "session_id");

-- CreateIndex
CREATE INDEX "idx_storefront_event_tenant" ON "storefront_events"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_storefront_event_connector" ON "storefront_events"("connector_instance_id");

-- CreateIndex
CREATE INDEX "idx_storefront_event_connector_occurred" ON "storefront_events"("connector_instance_id", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_storefront_event_session" ON "storefront_events"("connector_instance_id", "session_id");

-- CreateIndex
CREATE INDEX "idx_storefront_event_type_occurred" ON "storefront_events"("connector_instance_id", "event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_storefront_events_canonical_stage" ON "storefront_events"("connector_instance_id", "canonical_stage", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_storefront_error_project_occurred" ON "storefront_errors"("project_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "idx_storefront_error_connector_occurred" ON "storefront_errors"("connector_instance_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "idx_storefront_error_type" ON "storefront_errors"("project_id", "error_type", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_storefront_error_page" ON "storefront_errors"("project_id", "page_type", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_perf_site_name_ts" ON "performance_metrics"("site_id", "metric_name", "timestamp");

-- CreateIndex
CREATE INDEX "idx_perf_tenant_ts" ON "performance_metrics"("tenant_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_perf_connector_ts" ON "performance_metrics"("connector_instance_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "uq_perf_site_metric_source" ON "performance_metrics"("site_id", "metric_name", "source");

-- CreateIndex
CREATE INDEX "idx_perf_rollup" ON "performance_rollups"("site_id", "metric_name", "bucket_size", "timestamp");

-- CreateIndex
CREATE INDEX "idx_perf_rollup_connector_ts" ON "performance_rollups"("connector_instance_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_kpi_site_name_ts" ON "kpi_values"("site_id", "kpi_name", "timestamp");

-- CreateIndex
CREATE INDEX "idx_kpi_tenant_ts" ON "kpi_values"("tenant_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_kpi_connector_ts" ON "kpi_values"("connector_instance_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_discovered_connector_pagetype" ON "discovered_page_urls"("connector_instance_id", "page_type");

-- CreateIndex
CREATE UNIQUE INDEX "uq_discovered_page_url" ON "discovered_page_urls"("connector_instance_id", "page_type", "resolved_url");

-- CreateIndex
CREATE INDEX "idx_alert_site" ON "alerts"("site_id");

-- CreateIndex
CREATE INDEX "idx_alert_tenant" ON "alerts"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_alert_connector" ON "alerts"("connector_instance_id");

-- CreateIndex
CREATE INDEX "idx_alert_status" ON "alerts"("status");

-- CreateIndex
CREATE INDEX "idx_alert_rule_site" ON "alert_rules"("site_id");

-- CreateIndex
CREATE INDEX "idx_alert_rule_connector" ON "alert_rules"("connector_instance_id");

-- AddForeignKey
ALTER TABLE "order_snapshots" ADD CONSTRAINT "order_snapshots_order_internal_id_fkey" FOREIGN KEY ("order_internal_id") REFERENCES "canonical_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_internal_id_fkey" FOREIGN KEY ("order_internal_id") REFERENCES "canonical_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_events" ADD CONSTRAINT "customer_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_events" ADD CONSTRAINT "customer_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "customer_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

