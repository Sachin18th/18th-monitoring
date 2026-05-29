-- Migration: add_connector_instance_id_to_connector_sourced_tables
-- Description: Add connector_instance_id field to all tables that store connector-sourced data for multi-store isolation
-- Date: 2026-05-20

-- ============================================================================
-- Step 1: Add connector_instance_id columns (nullable initially for backfill)
-- ============================================================================

-- IAM Audit Logs
ALTER TABLE iam_audit_logs
ADD COLUMN IF NOT EXISTS connector_instance_id VARCHAR(36);

-- Customer Profiles
ALTER TABLE customer_profiles
ADD COLUMN IF NOT EXISTS connector_instance_id VARCHAR(36);

-- Customer Sessions
ALTER TABLE customer_sessions
ADD COLUMN IF NOT EXISTS connector_instance_id VARCHAR(36);

-- Customer Events
ALTER TABLE customer_events
ADD COLUMN IF NOT EXISTS connector_instance_id VARCHAR(36);

-- Alerts
ALTER TABLE alerts
ADD COLUMN IF NOT EXISTS connector_instance_id VARCHAR(36);

-- Alert Rules
ALTER TABLE alert_rules
ADD COLUMN IF NOT EXISTS connector_instance_id VARCHAR(36);

-- Performance Metrics
ALTER TABLE performance_metrics
ADD COLUMN IF NOT EXISTS connector_instance_id VARCHAR(36);

-- Performance Rollups
ALTER TABLE performance_rollups
ADD COLUMN IF NOT EXISTS connector_instance_id VARCHAR(36);

-- KPI Values
ALTER TABLE kpi_values
ADD COLUMN IF NOT EXISTS connector_instance_id VARCHAR(36);

-- Canonical Orders
ALTER TABLE canonical_orders
ADD COLUMN IF NOT EXISTS connector_instance_id VARCHAR(36);

-- Canonical Products
ALTER TABLE canonical_products
ADD COLUMN IF NOT EXISTS connector_instance_id VARCHAR(36);

-- Order Snapshots
ALTER TABLE order_snapshots
ADD COLUMN IF NOT EXISTS connector_instance_id VARCHAR(36);

-- Order Events
ALTER TABLE order_events
ADD COLUMN IF NOT EXISTS connector_instance_id VARCHAR(36);

-- ============================================================================
-- Step 2: Add indexes for new columns (for performance)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_iam_audit_connector ON iam_audit_logs(connector_instance_id);
CREATE INDEX IF NOT EXISTS idx_cust_profile_connector ON customer_profiles(connector_instance_id);
CREATE INDEX IF NOT EXISTS idx_session_connector ON customer_sessions(connector_instance_id);
CREATE INDEX IF NOT EXISTS idx_cust_event_connector ON customer_events(connector_instance_id);
CREATE INDEX IF NOT EXISTS idx_alert_connector ON alerts(connector_instance_id);
CREATE INDEX IF NOT EXISTS idx_alert_rule_connector ON alert_rules(connector_instance_id);
CREATE INDEX IF NOT EXISTS idx_perf_connector_ts ON performance_metrics(connector_instance_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_perf_rollup_connector_ts ON performance_rollups(connector_instance_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_kpi_connector_ts ON kpi_values(connector_instance_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_order_connector ON canonical_orders(connector_instance_id);
CREATE INDEX IF NOT EXISTS idx_product_connector ON canonical_products(connector_instance_id);
CREATE INDEX IF NOT EXISTS idx_shot_connector ON order_snapshots(connector_instance_id);
CREATE INDEX IF NOT EXISTS idx_order_event_connector ON order_events(connector_instance_id);

-- ============================================================================
-- Step 3: Backfill existing data
-- ============================================================================
-- For each project, find its connected connectors and stamp existing data
-- This uses the first/primary connector for each project

-- Backfill IAM Audit Logs (audit entries get connector from related orders if available)
-- For now, we'll leave these null as they're not strictly connector-sourced
-- Later, enrichment can stamp them based on context

-- Backfill Customer Profiles from their orders (if any exist)
UPDATE customer_profiles cp
SET connector_instance_id = (
    SELECT DISTINCT co.connector_instance_id
    FROM canonical_orders co
    WHERE co.tenant_id = cp.tenant_id
      AND co.site_id = cp.site_id
      AND co.metadata ->> 'customerId' = cp.id
    LIMIT 1
)
WHERE connector_instance_id IS NULL
  AND EXISTS (
    SELECT 1 FROM canonical_orders co
    WHERE co.tenant_id = cp.tenant_id
      AND co.site_id = cp.site_id
      AND co.metadata ->> 'customerId' = cp.id
  );

-- For customer profiles without orders, assign the first active connector
UPDATE customer_profiles cp
SET connector_instance_id = (
    SELECT id FROM connector_instances ci
    WHERE ci.site_id = cp.site_id
      AND ci.status = 'ACTIVE'
    ORDER BY ci.created_at ASC
    LIMIT 1
)
WHERE connector_instance_id IS NULL;

-- Backfill Customer Sessions (from profile's connector)
UPDATE customer_sessions cs
SET connector_instance_id = (
    SELECT connector_instance_id FROM customer_profiles cp
    WHERE cp.id = cs.customer_id
)
WHERE connector_instance_id IS NULL
  AND EXISTS (
    SELECT 1 FROM customer_profiles cp
    WHERE cp.id = cs.customer_id
      AND cp.connector_instance_id IS NOT NULL
  );

-- Backfill Customer Events (from session's connector)
UPDATE customer_events ce
SET connector_instance_id = (
    SELECT connector_instance_id FROM customer_sessions cs
    WHERE cs.id = ce.session_id
)
WHERE connector_instance_id IS NULL
  AND EXISTS (
    SELECT 1 FROM customer_sessions cs
    WHERE cs.id = ce.session_id
      AND cs.connector_instance_id IS NOT NULL
  );

-- Backfill Canonical Orders (these should have source system info)
UPDATE canonical_orders co
SET connector_instance_id = (
    SELECT id FROM connector_instances ci
    WHERE ci.site_id = co.site_id
      AND ci.status = 'ACTIVE'
      AND LOWER(ci.provider_id) LIKE LOWER(CONCAT('%', co.source_system, '%'))
    ORDER BY ci.created_at ASC
    LIMIT 1
)
WHERE connector_instance_id IS NULL;

-- Backfill Canonical Products (same logic as orders)
UPDATE canonical_products cp
SET connector_instance_id = (
    SELECT id FROM connector_instances ci
    WHERE ci.site_id = cp.site_id
      AND ci.status = 'ACTIVE'
      AND LOWER(ci.provider_id) LIKE LOWER(CONCAT('%', cp.source_system, '%'))
    ORDER BY ci.created_at ASC
    LIMIT 1
)
WHERE connector_instance_id IS NULL;

-- Backfill Order Snapshots (from canonical order)
UPDATE order_snapshots os
SET connector_instance_id = (
    SELECT connector_instance_id FROM canonical_orders co
    WHERE co.id = os.order_internal_id
)
WHERE connector_instance_id IS NULL
  AND EXISTS (
    SELECT 1 FROM canonical_orders co
    WHERE co.id = os.order_internal_id
      AND co.connector_instance_id IS NOT NULL
  );

-- Backfill Order Events (from canonical order)
UPDATE order_events oe
SET connector_instance_id = (
    SELECT connector_instance_id FROM canonical_orders co
    WHERE co.id = oe.order_internal_id
)
WHERE connector_instance_id IS NULL
  AND EXISTS (
    SELECT 1 FROM canonical_orders co
    WHERE co.id = oe.order_internal_id
      AND co.connector_instance_id IS NOT NULL
  );

-- Backfill Performance Metrics (assign to first active connector per project)
UPDATE performance_metrics pm
SET connector_instance_id = (
    SELECT id FROM connector_instances ci
    WHERE ci.site_id = pm.site_id
      AND ci.status = 'ACTIVE'
    ORDER BY ci.created_at ASC
    LIMIT 1
)
WHERE connector_instance_id IS NULL;

-- Backfill Performance Rollups
UPDATE performance_rollups pr
SET connector_instance_id = (
    SELECT id FROM connector_instances ci
    WHERE ci.site_id = pr.site_id
      AND ci.status = 'ACTIVE'
    ORDER BY ci.created_at ASC
    LIMIT 1
)
WHERE connector_instance_id IS NULL;

-- Backfill KPI Values
UPDATE kpi_values kv
SET connector_instance_id = (
    SELECT id FROM connector_instances ci
    WHERE ci.site_id = kv.site_id
      AND ci.status = 'ACTIVE'
    ORDER BY ci.created_at ASC
    LIMIT 1
)
WHERE connector_instance_id IS NULL;

-- Backfill Alerts
UPDATE alerts a
SET connector_instance_id = (
    SELECT id FROM connector_instances ci
    WHERE ci.site_id = a.site_id
      AND ci.status = 'ACTIVE'
    ORDER BY ci.created_at ASC
    LIMIT 1
)
WHERE connector_instance_id IS NULL;

-- Backfill Alert Rules
UPDATE alert_rules ar
SET connector_instance_id = (
    SELECT id FROM connector_instances ci
    WHERE ci.site_id = ar.site_id
      AND ci.status = 'ACTIVE'
    ORDER BY ci.created_at ASC
    LIMIT 1
)
WHERE connector_instance_id IS NULL;

-- ============================================================================
-- Step 4: Add foreign key constraints
-- ============================================================================

ALTER TABLE iam_audit_logs
ADD CONSTRAINT fk_iam_audit_connector
FOREIGN KEY (connector_instance_id)
REFERENCES connector_instances(id) ON DELETE SET NULL;

ALTER TABLE customer_profiles
ADD CONSTRAINT fk_cust_profile_connector
FOREIGN KEY (connector_instance_id)
REFERENCES connector_instances(id) ON DELETE SET NULL;

ALTER TABLE customer_sessions
ADD CONSTRAINT fk_session_connector
FOREIGN KEY (connector_instance_id)
REFERENCES connector_instances(id) ON DELETE SET NULL;

ALTER TABLE customer_events
ADD CONSTRAINT fk_cust_event_connector
FOREIGN KEY (connector_instance_id)
REFERENCES connector_instances(id) ON DELETE SET NULL;

ALTER TABLE alerts
ADD CONSTRAINT fk_alert_connector
FOREIGN KEY (connector_instance_id)
REFERENCES connector_instances(id) ON DELETE SET NULL;

ALTER TABLE alert_rules
ADD CONSTRAINT fk_alert_rule_connector
FOREIGN KEY (connector_instance_id)
REFERENCES connector_instances(id) ON DELETE SET NULL;

ALTER TABLE performance_metrics
ADD CONSTRAINT fk_perf_metric_connector
FOREIGN KEY (connector_instance_id)
REFERENCES connector_instances(id) ON DELETE SET NULL;

ALTER TABLE performance_rollups
ADD CONSTRAINT fk_perf_rollup_connector
FOREIGN KEY (connector_instance_id)
REFERENCES connector_instances(id) ON DELETE SET NULL;

ALTER TABLE kpi_values
ADD CONSTRAINT fk_kpi_value_connector
FOREIGN KEY (connector_instance_id)
REFERENCES connector_instances(id) ON DELETE SET NULL;

ALTER TABLE canonical_orders
ADD CONSTRAINT fk_order_connector
FOREIGN KEY (connector_instance_id)
REFERENCES connector_instances(id) ON DELETE SET NULL;

ALTER TABLE canonical_products
ADD CONSTRAINT fk_product_connector
FOREIGN KEY (connector_instance_id)
REFERENCES connector_instances(id) ON DELETE SET NULL;

ALTER TABLE order_snapshots
ADD CONSTRAINT fk_snapshot_connector
FOREIGN KEY (connector_instance_id)
REFERENCES connector_instances(id) ON DELETE SET NULL;

ALTER TABLE order_events
ADD CONSTRAINT fk_order_event_connector
FOREIGN KEY (connector_instance_id)
REFERENCES connector_instances(id) ON DELETE SET NULL;
