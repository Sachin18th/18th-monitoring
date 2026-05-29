-- DropForeignKey
ALTER TABLE "alert_rules" DROP CONSTRAINT "fk_alert_rule_connector";

-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "fk_alert_connector";

-- DropForeignKey
ALTER TABLE "canonical_orders" DROP CONSTRAINT "fk_order_connector";

-- DropForeignKey
ALTER TABLE "canonical_products" DROP CONSTRAINT "fk_product_connector";

-- DropForeignKey
ALTER TABLE "customer_events" DROP CONSTRAINT "fk_cust_event_connector";

-- DropForeignKey
ALTER TABLE "customer_profiles" DROP CONSTRAINT "fk_cust_profile_connector";

-- DropForeignKey
ALTER TABLE "customer_sessions" DROP CONSTRAINT "fk_session_connector";

-- DropForeignKey
ALTER TABLE "iam_audit_logs" DROP CONSTRAINT "fk_iam_audit_connector";

-- DropForeignKey
ALTER TABLE "kpi_values" DROP CONSTRAINT "fk_kpi_value_connector";

-- DropForeignKey
ALTER TABLE "order_events" DROP CONSTRAINT "fk_order_event_connector";

-- DropForeignKey
ALTER TABLE "order_snapshots" DROP CONSTRAINT "fk_snapshot_connector";

-- DropForeignKey
ALTER TABLE "performance_metrics" DROP CONSTRAINT "fk_perf_metric_connector";

-- DropForeignKey
ALTER TABLE "performance_rollups" DROP CONSTRAINT "fk_perf_rollup_connector";

-- DropEnum
DROP TYPE IF EXISTS "PlatformType";

-- DropEnum
DROP TYPE IF EXISTS "UserRole";

-- AddForeignKey
ALTER TABLE "iam_audit_logs" ADD CONSTRAINT "iam_audit_logs_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_events" ADD CONSTRAINT "customer_events_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_rollups" ADD CONSTRAINT "performance_rollups_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_values" ADD CONSTRAINT "kpi_values_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_orders" ADD CONSTRAINT "canonical_orders_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_products" ADD CONSTRAINT "canonical_products_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_snapshots" ADD CONSTRAINT "order_snapshots_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_connector_instance_id_fkey" FOREIGN KEY ("connector_instance_id") REFERENCES "connector_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_event_connector" RENAME TO "idx_lifecycle_event_connector";

-- RenameIndex
ALTER INDEX "idx_event_tenant" RENAME TO "idx_lifecycle_event_tenant";

-- RenameIndex
ALTER INDEX "idx_event_order" RENAME TO "idx_order_event_order";

-- RenameIndex
ALTER INDEX "idx_event_project_ts" RENAME TO "idx_order_event_project_ts";

-- RenameIndex
ALTER INDEX "idx_event_type" RENAME TO "idx_order_event_type";
