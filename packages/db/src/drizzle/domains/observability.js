"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectorHealthSnapshots = exports.systemHealthMetrics = exports.systemLogs = exports.alertRules = exports.alerts = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const iam_1 = require("./iam");
// ─── ALERTS ──────────────────────────────────────────────────────────────────
exports.alerts = (0, pg_core_1.pgTable)('alerts', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    severity: (0, pg_core_1.varchar)('severity', { length: 20 }).notNull(), // INFO, WARNING, CRITICAL
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull().default('TRIGGERED'), // TRIGGERED, ACKNOWLEDGED, RESOLVED
    module: (0, pg_core_1.varchar)('module', { length: 50 }).notNull(), // integrations, orders, performance
    alertType: (0, pg_core_1.varchar)('alert_type', { length: 100 }).notNull(), // SYNC_FAILURE, REVENUE_DROP
    message: (0, pg_core_1.text)('message').notNull(),
    context: (0, pg_core_1.jsonb)('context').notNull().default('{}'), // related record IDs, threshold values
    correlationId: (0, pg_core_1.varchar)('correlation_id', { length: 255 }),
    triggeredAt: (0, pg_core_1.timestamp)('triggered_at').defaultNow().notNull(),
    acknowledgedAt: (0, pg_core_1.timestamp)('acknowledged_at'),
    acknowledgedBy: (0, pg_core_1.varchar)('acknowledged_by', { length: 255 }),
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at'),
}, (table) => ({
    siteIdx: (0, pg_core_1.index)('idx_alert_site').on(table.siteId),
    tenantIdx: (0, pg_core_1.index)('idx_alert_tenant').on(table.tenantId),
    statusIdx: (0, pg_core_1.index)('idx_alert_status').on(table.status),
}));
// ─── ALERT RULES ─────────────────────────────────────────────────────────────
exports.alertRules = (0, pg_core_1.pgTable)('alert_rules', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    description: (0, pg_core_1.text)('description'),
    severity: (0, pg_core_1.varchar)('severity', { length: 20 }).notNull(),
    enabled: (0, pg_core_1.integer)('enabled').default(1),
    criteria: (0, pg_core_1.jsonb)('criteria').notNull(), // condition logic
    cooldownMinutes: (0, pg_core_1.integer)('cooldown_minutes').default(60),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteRuleIdx: (0, pg_core_1.index)('idx_alert_rule_site').on(table.siteId),
}));
// ─── SYSTEM LOGS (Unified Audit/Error Stream) ───────────────────────────────
exports.systemLogs = (0, pg_core_1.pgTable)('system_logs', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).references(() => iam_1.projects.id),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).references(() => iam_1.tenants.id),
    level: (0, pg_core_1.varchar)('level', { length: 20 }).notNull(), // INFO, WARN, ERROR, DEBUG
    module: (0, pg_core_1.varchar)('module', { length: 100 }).notNull(), // connector-framework, analytics-engine
    message: (0, pg_core_1.text)('message').notNull(),
    metadata: (0, pg_core_1.jsonb)('metadata').notNull().default('{}'),
    correlationId: (0, pg_core_1.varchar)('correlation_id', { length: 255 }),
    timestamp: (0, pg_core_1.timestamp)('timestamp').defaultNow().notNull(),
}, (table) => ({
    siteTsIdx: (0, pg_core_1.index)('idx_log_site_ts').on(table.siteId, table.timestamp),
    tenantTsIdx: (0, pg_core_1.index)('idx_log_tenant_ts').on(table.tenantId, table.timestamp),
    correlationIdx: (0, pg_core_1.index)('idx_log_correlation').on(table.correlationId),
}));
// ─── SYSTEM HEALTH METRICS (Internal Ops) ──────────────────────────────────
exports.systemHealthMetrics = (0, pg_core_1.pgTable)('system_health_metrics', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    metricName: (0, pg_core_1.varchar)('metric_name', { length: 255 }).notNull(), // queue_depth, worker_cpu, ingestion_latency
    metricValue: (0, pg_core_1.numeric)('metric_value', { precision: 20, scale: 4 }).notNull(),
    labels: (0, pg_core_1.jsonb)('labels').notNull().default('{}'), // worker_id, queue_name
    timestamp: (0, pg_core_1.timestamp)('timestamp').defaultNow().notNull(),
}, (table) => ({
    metricNameTsIdx: (0, pg_core_1.index)('idx_health_name_ts').on(table.metricName, table.timestamp),
}));
// ─── CONNECTOR HEALTH SNAPSHOTS (History) ─────────────────────────────────
exports.connectorHealthSnapshots = (0, pg_core_1.pgTable)('connector_health_snapshots', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    connectorInstanceId: (0, pg_core_1.varchar)('connector_instance_id', { length: 36 }).notNull(),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull(),
    healthScore: (0, pg_core_1.integer)('health_score'),
    dimensions: (0, pg_core_1.jsonb)('dimensions').notNull().default('{}'), // connectivity, auth, etc.
    timestamp: (0, pg_core_1.timestamp)('timestamp').defaultNow().notNull(),
}, (table) => ({
    connectorTsIdx: (0, pg_core_1.index)('idx_health_shot_connector_ts').on(table.connectorInstanceId, table.timestamp),
}));
