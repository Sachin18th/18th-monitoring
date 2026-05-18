ALTER TABLE "iam_audit_logs"
  ADD COLUMN "project_id" VARCHAR(255);

ALTER TABLE "iam_audit_logs"
  ADD CONSTRAINT "iam_audit_logs_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_iam_audit_project_ts" ON "iam_audit_logs"("project_id", "timestamp");

ALTER TABLE "system_health_metrics"
  ADD COLUMN "project_id" VARCHAR(255);

ALTER TABLE "system_health_metrics"
  ADD CONSTRAINT "system_health_metrics_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_health_project_ts" ON "system_health_metrics"("project_id", "timestamp");

ALTER TABLE "connector_health_snapshots"
  ADD COLUMN "project_id" VARCHAR(255);

ALTER TABLE "connector_health_snapshots"
  ADD CONSTRAINT "connector_health_snapshots_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_health_shot_project_ts" ON "connector_health_snapshots"("project_id", "timestamp");

ALTER TABLE "order_snapshots"
  ADD COLUMN "project_id" VARCHAR(255);

ALTER TABLE "order_snapshots"
  ADD CONSTRAINT "order_snapshots_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_shot_project_ts" ON "order_snapshots"("project_id", "snapshot_timestamp");

ALTER TABLE "order_events"
  ADD COLUMN "project_id" VARCHAR(255);

ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_event_project_ts" ON "order_events"("project_id", "timestamp");
