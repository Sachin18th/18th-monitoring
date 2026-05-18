import { pgTable, varchar, timestamp, jsonb, serial, integer, index, numeric } from 'drizzle-orm/pg-core';
import { tenants, projects } from './iam';

// ─── PERFORMANCE METRICS (Raw Telemetry) ─────────────────────────────────────
export const performanceMetrics = pgTable('performance_metrics', {
    id: serial('id').primaryKey(),
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    
    category: varchar('category', { length: 50 }).notNull(), // WEB_VITALS, API_LATENCY, DB_LATENCY
    metricName: varchar('metric_name', { length: 100 }).notNull(), // LCP, FID, CLS, request_duration
    metricValue: numeric('metric_value', { precision: 20, scale: 4 }).notNull(),
    unit: varchar('unit', { length: 20 }).notNull(), // ms, s, count
    
    // Context Dimensions
    region: varchar('region', { length: 100 }),
    device: varchar('device', { length: 100 }),
    browser: varchar('browser', { length: 100 }),
    route: varchar('route', { length: 255 }),
    
    timestamp: timestamp('timestamp').notNull(),
    traceId: varchar('trace_id', { length: 255 }),
    correlationId: varchar('correlation_id', { length: 255 }),
}, (table) => ({
    siteMetricTsIdx: index('idx_perf_site_name_ts').on(table.siteId, table.metricName, table.timestamp),
    tenantTsIdx: index('idx_perf_tenant_ts').on(table.tenantId, table.timestamp),
}));

// ─── PERFORMANCE ROLLUPS (Pre-Aggregation) ──────────────────────────────────
export const performanceRollups = pgTable('performance_rollups', {
    id: serial('id').primaryKey(),
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    metricName: varchar('metric_name', { length: 100 }).notNull(),
    bucketSize: varchar('bucket_size', { length: 20 }).notNull(), // 1m, 5m, 1h, 1d
    timestamp: timestamp('timestamp').notNull(),
    
    count: integer('count').notNull(),
    min: numeric('min', { precision: 20, scale: 4 }),
    max: numeric('max', { precision: 20, scale: 4 }),
    sum: numeric('sum', { precision: 20, scale: 4 }),
    avg: numeric('avg', { precision: 20, scale: 4 }),
    p50: numeric('p50', { precision: 20, scale: 4 }),
    p90: numeric('p90', { precision: 20, scale: 4 }),
    p99: numeric('p99', { precision: 20, scale: 4 }),
    
    dimensions: jsonb('dimensions').notNull().default('{}'),
}, (table) => ({
    rollupIdx: index('idx_perf_rollup').on(table.siteId, table.metricName, table.bucketSize, table.timestamp),
}));

// ─── BUSINESS KPI VALUES ────────────────────────────────────────────────────
// Stores computed business metrics (e.g. daily_revenue, conversion_rate)
export const kpiValues = pgTable('kpi_values', {
    id: serial('id').primaryKey(),
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    
    kpiName: varchar('kpi_name', { length: 100 }).notNull(), // revenue, aov, repeat_customer_rate
    kpiValue: numeric('kpi_value', { precision: 20, scale: 4 }).notNull(),
    
    timeWindow: varchar('time_window', { length: 20 }).notNull(), // hourly, daily, monthly
    timestamp: timestamp('timestamp').notNull(),
    
    metadata: jsonb('metadata').notNull().default('{}'), // dimensions, source refs
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteKpiTsIdx: index('idx_kpi_site_name_ts').on(table.siteId, table.kpiName, table.timestamp),
    tenantTsIdx: index('idx_kpi_tenant_ts').on(table.tenantId, table.timestamp),
}));
