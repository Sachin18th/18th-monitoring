import { pgTable, varchar, timestamp, jsonb, serial, integer, index, text, numeric } from 'drizzle-orm/pg-core';
import { tenants, projects } from './iam';

// ─── ALERTS ──────────────────────────────────────────────────────────────────
export const alerts = pgTable('alerts', {
    id: varchar('id', { length: 36 }).primaryKey(),
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    
    severity: varchar('severity', { length: 20 }).notNull(), // INFO, WARNING, CRITICAL
    status: varchar('status', { length: 50 }).notNull().default('TRIGGERED'), // TRIGGERED, ACKNOWLEDGED, RESOLVED
    
    module: varchar('module', { length: 50 }).notNull(), // integrations, orders, performance
    alertType: varchar('alert_type', { length: 100 }).notNull(), // SYNC_FAILURE, REVENUE_DROP
    message: text('message').notNull(),
    
    context: jsonb('context').notNull().default('{}'), // related record IDs, threshold values
    correlationId: varchar('correlation_id', { length: 255 }),
    
    triggeredAt: timestamp('triggered_at').defaultNow().notNull(),
    acknowledgedAt: timestamp('acknowledged_at'),
    acknowledgedBy: varchar('acknowledged_by', { length: 255 }),
    resolvedAt: timestamp('resolved_at'),
}, (table) => ({
    siteIdx: index('idx_alert_site').on(table.siteId),
    tenantIdx: index('idx_alert_tenant').on(table.tenantId),
    statusIdx: index('idx_alert_status').on(table.status),
}));

// ─── ALERT RULES ─────────────────────────────────────────────────────────────
export const alertRules = pgTable('alert_rules', {
    id: varchar('id', { length: 36 }).primaryKey(),
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    severity: varchar('severity', { length: 20 }).notNull(),
    enabled: integer('enabled').default(1),
    
    criteria: jsonb('criteria').notNull(), // condition logic
    cooldownMinutes: integer('cooldown_minutes').default(60),
    
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteRuleIdx: index('idx_alert_rule_site').on(table.siteId),
}));

// ─── SYSTEM LOGS (Unified Audit/Error Stream) ───────────────────────────────
export const systemLogs = pgTable('system_logs', {
    id: serial('id').primaryKey(),
    siteId: varchar('site_id', { length: 255 }).references(() => projects.id),
    tenantId: varchar('tenant_id', { length: 36 }).references(() => tenants.id),
    
    level: varchar('level', { length: 20 }).notNull(), // INFO, WARN, ERROR, DEBUG
    module: varchar('module', { length: 100 }).notNull(), // connector-framework, analytics-engine
    message: text('message').notNull(),
    
    metadata: jsonb('metadata').notNull().default('{}'),
    correlationId: varchar('correlation_id', { length: 255 }),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (table) => ({
    siteTsIdx: index('idx_log_site_ts').on(table.siteId, table.timestamp),
    tenantTsIdx: index('idx_log_tenant_ts').on(table.tenantId, table.timestamp),
    correlationIdx: index('idx_log_correlation').on(table.correlationId),
}));

// ─── SYSTEM HEALTH METRICS (Internal Ops) ──────────────────────────────────
export const systemHealthMetrics = pgTable('system_health_metrics', {
    id: serial('id').primaryKey(),
    metricName: varchar('metric_name', { length: 255 }).notNull(), // queue_depth, worker_cpu, ingestion_latency
    metricValue: numeric('metric_value', { precision: 20, scale: 4 }).notNull(),
    labels: jsonb('labels').notNull().default('{}'), // worker_id, queue_name
    timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (table) => ({
    metricNameTsIdx: index('idx_health_name_ts').on(table.metricName, table.timestamp),
}));
// ─── CONNECTOR HEALTH SNAPSHOTS (History) ─────────────────────────────────
export const connectorHealthSnapshots = pgTable('connector_health_snapshots', {
    id: serial('id').primaryKey(),
    connectorInstanceId: varchar('connector_instance_id', { length: 36 }).notNull(),
    siteId: varchar('site_id', { length: 255 }).notNull(),
    
    status: varchar('status', { length: 50 }).notNull(),
    healthScore: integer('health_score'),
    
    dimensions: jsonb('dimensions').notNull().default('{}'), // connectivity, auth, etc.
    timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (table) => ({
    connectorTsIdx: index('idx_health_shot_connector_ts').on(table.connectorInstanceId, table.timestamp),
}));
