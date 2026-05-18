/*
  Warnings:

  - You are about to drop the `ConfigVersion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IamAuditLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Project` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Tenant` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserProjectAccess` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ConfigVersion" DROP CONSTRAINT "ConfigVersion_siteId_fkey";

-- DropForeignKey
ALTER TABLE "IamAuditLog" DROP CONSTRAINT "IamAuditLog_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "UserProjectAccess" DROP CONSTRAINT "UserProjectAccess_projectId_fkey";

-- DropForeignKey
ALTER TABLE "UserProjectAccess" DROP CONSTRAINT "UserProjectAccess_userId_fkey";

-- DropTable
DROP TABLE "ConfigVersion";

-- DropTable
DROP TABLE "IamAuditLog";

-- DropTable
DROP TABLE "Project";

-- DropTable
DROP TABLE "Tenant";

-- DropTable
DROP TABLE "User";

-- DropTable
DROP TABLE "UserProjectAccess";

-- CreateTable
CREATE TABLE "tenants" (
    "id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "plan" VARCHAR(50) NOT NULL DEFAULT 'FREE',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "environment" VARCHAR(50) NOT NULL DEFAULT 'production',
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "active_version_id" VARCHAR(36),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(36) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "mfa_enabled" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_project_access" (
    "user_id" VARCHAR(36) NOT NULL,
    "project_id" VARCHAR(255) NOT NULL,
    "role_override" VARCHAR(50),
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_project_access_pkey" PRIMARY KEY ("user_id","project_id")
);

-- CreateTable
CREATE TABLE "config_versions" (
    "version_id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "kpi_definition_blob" JSONB NOT NULL DEFAULT '{}',
    "widget_definition_blob" JSONB NOT NULL DEFAULT '{}',
    "connector_definition_blob" JSONB NOT NULL DEFAULT '{}',
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_versions_pkey" PRIMARY KEY ("version_id")
);

-- CreateTable
CREATE TABLE "iam_audit_logs" (
    "id" SERIAL NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "actor_id" VARCHAR(255) NOT NULL,
    "action" VARCHAR(255) NOT NULL,
    "target_type" VARCHAR(255) NOT NULL,
    "target_id" VARCHAR(255) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iam_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_instances" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "provider_id" VARCHAR(255) NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "family" VARCHAR(50) NOT NULL,
    "version" VARCHAR(50) DEFAULT '1.0.0',
    "status" VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    "lifecycle_state" VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    "config_version" VARCHAR(20),
    "health_status" VARCHAR(50) NOT NULL DEFAULT 'HEALTHY',
    "sync_config" JSONB NOT NULL DEFAULT '{}',
    "mapping_rules" JSONB NOT NULL DEFAULT '{}',
    "last_sync_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "last_webhook_at" TIMESTAMP(3),
    "last_error" JSONB,
    "health_score" INTEGER DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnected_at" TIMESTAMP(3),

    CONSTRAINT "connector_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_sync_runs" (
    "id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "sync_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "records_fetched" INTEGER DEFAULT 0,
    "records_processed" INTEGER DEFAULT 0,
    "records_failed" INTEGER DEFAULT 0,
    "checkpoint_value" TEXT,
    "error_summary" JSONB,

    CONSTRAINT "connector_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_access_keys" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "key_prefix" VARCHAR(20) NOT NULL,
    "key_hash" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(255) NOT NULL,

    CONSTRAINT "project_access_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "callback_url" TEXT NOT NULL,
    "secret" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "event_types" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_credentials" (
    "id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "auth_type" VARCHAR(50) NOT NULL,
    "vault_key" VARCHAR(255),
    "encrypted_secret" TEXT,
    "expires_at" TIMESTAMP(3),
    "last_rotated_at" TIMESTAMP(3),
    "scopes" JSONB DEFAULT '[]',

    CONSTRAINT "connector_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_lifecycle_events" (
    "id" VARCHAR(36) NOT NULL,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "project_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "payload" JSONB DEFAULT '{}',
    "correlation_id" VARCHAR(100),
    "triggered_by" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connector_lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
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

-- CreateTable
CREATE TABLE "system_logs" (
    "id" SERIAL NOT NULL,
    "site_id" VARCHAR(255),
    "tenant_id" VARCHAR(36),
    "level" VARCHAR(20) NOT NULL,
    "module" VARCHAR(100) NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "correlation_id" VARCHAR(255),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_health_metrics" (
    "id" SERIAL NOT NULL,
    "metric_name" VARCHAR(255) NOT NULL,
    "metric_value" DECIMAL(20,4) NOT NULL,
    "labels" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_health_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_health_snapshots" (
    "id" SERIAL NOT NULL,
    "connector_instance_id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "health_score" INTEGER,
    "dimensions" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connector_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_metrics" (
    "id" SERIAL NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "metric_name" VARCHAR(100) NOT NULL,
    "metric_value" DECIMAL(20,4) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "region" VARCHAR(100),
    "device" VARCHAR(100),
    "browser" VARCHAR(100),
    "route" VARCHAR(255),
    "timestamp" TIMESTAMP(3) NOT NULL,
    "trace_id" VARCHAR(255),
    "correlation_id" VARCHAR(255),

    CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_rollups" (
    "id" SERIAL NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
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
    "kpi_name" VARCHAR(100) NOT NULL,
    "kpi_value" DECIMAL(20,4) NOT NULL,
    "time_window" VARCHAR(20) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_orders" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
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
CREATE TABLE "order_snapshots" (
    "id" SERIAL NOT NULL,
    "order_internal_id" VARCHAR(36) NOT NULL,
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
    "event_type" VARCHAR(100) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "correlation_id" VARCHAR(255),

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_events" (
    "id" VARCHAR(36) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "project_id" VARCHAR(255) NOT NULL,
    "integration_id" VARCHAR(36),
    "mode" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "source_reference_id" VARCHAR(255),
    "correlation_id" VARCHAR(100) NOT NULL,
    "validation_report" JSONB DEFAULT '{}',
    "dedupe_key" VARCHAR(255),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" JSONB DEFAULT '{}',

    CONSTRAINT "ingestion_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_artifacts" (
    "id" VARCHAR(36) NOT NULL,
    "ingestion_event_id" VARCHAR(36) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "storage_path" TEXT NOT NULL,
    "content_type" VARCHAR(100),
    "size_bytes" INTEGER,
    "checksum" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_gate_results" (
    "id" SERIAL NOT NULL,
    "ingestion_event_id" VARCHAR(36) NOT NULL,
    "rule_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "details" TEXT,
    "confidence_score" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_gate_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_jobs" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "integration_id" VARCHAR(36),
    "type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
    "correlation_id" VARCHAR(100),
    "attempts" INTEGER DEFAULT 0,
    "max_retries" INTEGER DEFAULT 3,
    "payload_ref" JSONB NOT NULL DEFAULT '{}',
    "error_summary" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_checkpoints" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "integration_id" VARCHAR(36) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "cursor_type" VARCHAR(50) NOT NULL,
    "cursor_value" VARCHAR(255) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_queue" (
    "id" VARCHAR(36) NOT NULL,
    "job_id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "failure_category" VARCHAR(50) NOT NULL,
    "reason" TEXT NOT NULL,
    "payload_snapshot" JSONB,
    "reviewed_by" VARCHAR(255),
    "action_taken" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dead_letter_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_jobs" (
    "id" VARCHAR(36) NOT NULL,
    "site_id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(36) NOT NULL,
    "job_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "scope" JSONB NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "total_records" INTEGER DEFAULT 0,
    "processed_records" INTEGER DEFAULT 0,
    "failed_records" INTEGER DEFAULT 0,
    "triggered_by" VARCHAR(255) NOT NULL,
    "reason" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "last_error" JSONB,

    CONSTRAINT "recovery_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "idx_project_tenant" ON "projects"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_user_tenant" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_iam_audit_tenant_ts" ON "iam_audit_logs"("tenant_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_connector_site" ON "connector_instances"("site_id");

-- CreateIndex
CREATE INDEX "idx_connector_tenant" ON "connector_instances"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_sync_run_connector" ON "connector_sync_runs"("connector_instance_id");

-- CreateIndex
CREATE INDEX "idx_key_site" ON "project_access_keys"("site_id");

-- CreateIndex
CREATE INDEX "idx_webhook_sub_site" ON "webhook_subscriptions"("site_id");

-- CreateIndex
CREATE INDEX "idx_event_connector" ON "connector_lifecycle_events"("connector_instance_id");

-- CreateIndex
CREATE INDEX "idx_event_tenant" ON "connector_lifecycle_events"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_alert_site" ON "alerts"("site_id");

-- CreateIndex
CREATE INDEX "idx_alert_tenant" ON "alerts"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_alert_status" ON "alerts"("status");

-- CreateIndex
CREATE INDEX "idx_alert_rule_site" ON "alert_rules"("site_id");

-- CreateIndex
CREATE INDEX "idx_log_site_ts" ON "system_logs"("site_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_log_tenant_ts" ON "system_logs"("tenant_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_log_correlation" ON "system_logs"("correlation_id");

-- CreateIndex
CREATE INDEX "idx_health_name_ts" ON "system_health_metrics"("metric_name", "timestamp");

-- CreateIndex
CREATE INDEX "idx_health_shot_connector_ts" ON "connector_health_snapshots"("connector_instance_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_perf_site_name_ts" ON "performance_metrics"("site_id", "metric_name", "timestamp");

-- CreateIndex
CREATE INDEX "idx_perf_tenant_ts" ON "performance_metrics"("tenant_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_perf_rollup" ON "performance_rollups"("site_id", "metric_name", "bucket_size", "timestamp");

-- CreateIndex
CREATE INDEX "idx_kpi_site_name_ts" ON "kpi_values"("site_id", "kpi_name", "timestamp");

-- CreateIndex
CREATE INDEX "idx_kpi_tenant_ts" ON "kpi_values"("tenant_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_order_site" ON "canonical_orders"("site_id");

-- CreateIndex
CREATE INDEX "idx_order_tenant" ON "canonical_orders"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_order_source_id" ON "canonical_orders"("order_id");

-- CreateIndex
CREATE INDEX "idx_order_lifecycle" ON "canonical_orders"("lifecycle_state");

-- CreateIndex
CREATE INDEX "idx_order_placed_ts" ON "canonical_orders"("placed_at");

-- CreateIndex
CREATE INDEX "idx_shot_order" ON "order_snapshots"("order_internal_id");

-- CreateIndex
CREATE INDEX "idx_event_order" ON "order_events"("order_internal_id");

-- CreateIndex
CREATE INDEX "idx_event_type" ON "order_events"("event_type");

-- CreateIndex
CREATE INDEX "idx_ingest_tenant" ON "ingestion_events"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_ingest_project" ON "ingestion_events"("project_id");

-- CreateIndex
CREATE INDEX "idx_ingest_correlation" ON "ingestion_events"("correlation_id");

-- CreateIndex
CREATE INDEX "idx_ingest_dedupe" ON "ingestion_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "idx_artifact_event" ON "ingestion_artifacts"("ingestion_event_id");

-- CreateIndex
CREATE INDEX "idx_qgate_event" ON "quality_gate_results"("ingestion_event_id");

-- CreateIndex
CREATE INDEX "idx_pipe_job_site_type_status" ON "pipeline_jobs"("site_id", "type", "status");

-- CreateIndex
CREATE INDEX "idx_pipe_job_correlation" ON "pipeline_jobs"("correlation_id");

-- CreateIndex
CREATE INDEX "idx_pipe_ckpt_integration_entity" ON "pipeline_checkpoints"("integration_id", "entity_type");

-- CreateIndex
CREATE INDEX "idx_dlq_site_status" ON "dead_letter_queue"("site_id", "action_taken");

-- CreateIndex
CREATE INDEX "idx_recovery_site_status" ON "recovery_jobs"("site_id", "status");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_project_access" ADD CONSTRAINT "user_project_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_project_access" ADD CONSTRAINT "user_project_access_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_versions" ADD CONSTRAINT "config_versions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_audit_logs" ADD CONSTRAINT "iam_audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_instances" ADD CONSTRAINT "connector_instances_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_instances" ADD CONSTRAINT "connector_instances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_sync_runs" ADD CONSTRAINT "connector_sync_runs_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_access_keys" ADD CONSTRAINT "project_access_keys_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_access_keys" ADD CONSTRAINT "project_access_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_credentials" ADD CONSTRAINT "connector_credentials_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_credentials" ADD CONSTRAINT "connector_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_lifecycle_events" ADD CONSTRAINT "connector_lifecycle_events_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_lifecycle_events" ADD CONSTRAINT "connector_lifecycle_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_lifecycle_events" ADD CONSTRAINT "connector_lifecycle_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_rollups" ADD CONSTRAINT "performance_rollups_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_values" ADD CONSTRAINT "kpi_values_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_values" ADD CONSTRAINT "kpi_values_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_orders" ADD CONSTRAINT "canonical_orders_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_orders" ADD CONSTRAINT "canonical_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_snapshots" ADD CONSTRAINT "order_snapshots_order_internal_id_fkey" FOREIGN KEY ("order_internal_id") REFERENCES "canonical_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_internal_id_fkey" FOREIGN KEY ("order_internal_id") REFERENCES "canonical_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_events" ADD CONSTRAINT "ingestion_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_events" ADD CONSTRAINT "ingestion_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_events" ADD CONSTRAINT "ingestion_events_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_artifacts" ADD CONSTRAINT "ingestion_artifacts_ingestion_event_id_fkey" FOREIGN KEY ("ingestion_event_id") REFERENCES "ingestion_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_gate_results" ADD CONSTRAINT "quality_gate_results_ingestion_event_id_fkey" FOREIGN KEY ("ingestion_event_id") REFERENCES "ingestion_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_jobs" ADD CONSTRAINT "pipeline_jobs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_jobs" ADD CONSTRAINT "pipeline_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_jobs" ADD CONSTRAINT "pipeline_jobs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_checkpoints" ADD CONSTRAINT "pipeline_checkpoints_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_checkpoints" ADD CONSTRAINT "pipeline_checkpoints_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "connector_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dead_letter_queue" ADD CONSTRAINT "dead_letter_queue_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "pipeline_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dead_letter_queue" ADD CONSTRAINT "dead_letter_queue_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dead_letter_queue" ADD CONSTRAINT "dead_letter_queue_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_jobs" ADD CONSTRAINT "recovery_jobs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_jobs" ADD CONSTRAINT "recovery_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
