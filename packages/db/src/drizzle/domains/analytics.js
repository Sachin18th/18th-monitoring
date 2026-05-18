"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kpiValues = exports.performanceRollups = exports.performanceMetrics = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const iam_1 = require("./iam");
// ─── PERFORMANCE METRICS (Raw Telemetry) ─────────────────────────────────────
exports.performanceMetrics = (0, pg_core_1.pgTable)('performance_metrics', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    category: (0, pg_core_1.varchar)('category', { length: 50 }).notNull(), // WEB_VITALS, API_LATENCY, DB_LATENCY
    metricName: (0, pg_core_1.varchar)('metric_name', { length: 100 }).notNull(), // LCP, FID, CLS, request_duration
    metricValue: (0, pg_core_1.numeric)('metric_value', { precision: 20, scale: 4 }).notNull(),
    unit: (0, pg_core_1.varchar)('unit', { length: 20 }).notNull(), // ms, s, count
    // Context Dimensions
    region: (0, pg_core_1.varchar)('region', { length: 100 }),
    device: (0, pg_core_1.varchar)('device', { length: 100 }),
    browser: (0, pg_core_1.varchar)('browser', { length: 100 }),
    route: (0, pg_core_1.varchar)('route', { length: 255 }),
    timestamp: (0, pg_core_1.timestamp)('timestamp').notNull(),
    traceId: (0, pg_core_1.varchar)('trace_id', { length: 255 }),
    correlationId: (0, pg_core_1.varchar)('correlation_id', { length: 255 }),
}, (table) => ({
    siteMetricTsIdx: (0, pg_core_1.index)('idx_perf_site_name_ts').on(table.siteId, table.metricName, table.timestamp),
    tenantTsIdx: (0, pg_core_1.index)('idx_perf_tenant_ts').on(table.tenantId, table.timestamp),
}));
// ─── PERFORMANCE ROLLUPS (Pre-Aggregation) ──────────────────────────────────
exports.performanceRollups = (0, pg_core_1.pgTable)('performance_rollups', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    metricName: (0, pg_core_1.varchar)('metric_name', { length: 100 }).notNull(),
    bucketSize: (0, pg_core_1.varchar)('bucket_size', { length: 20 }).notNull(), // 1m, 5m, 1h, 1d
    timestamp: (0, pg_core_1.timestamp)('timestamp').notNull(),
    count: (0, pg_core_1.integer)('count').notNull(),
    min: (0, pg_core_1.numeric)('min', { precision: 20, scale: 4 }),
    max: (0, pg_core_1.numeric)('max', { precision: 20, scale: 4 }),
    sum: (0, pg_core_1.numeric)('sum', { precision: 20, scale: 4 }),
    avg: (0, pg_core_1.numeric)('avg', { precision: 20, scale: 4 }),
    p50: (0, pg_core_1.numeric)('p50', { precision: 20, scale: 4 }),
    p90: (0, pg_core_1.numeric)('p90', { precision: 20, scale: 4 }),
    p99: (0, pg_core_1.numeric)('p99', { precision: 20, scale: 4 }),
    dimensions: (0, pg_core_1.jsonb)('dimensions').notNull().default('{}'),
}, (table) => ({
    rollupIdx: (0, pg_core_1.index)('idx_perf_rollup').on(table.siteId, table.metricName, table.bucketSize, table.timestamp),
}));
// ─── BUSINESS KPI VALUES ────────────────────────────────────────────────────
// Stores computed business metrics (e.g. daily_revenue, conversion_rate)
exports.kpiValues = (0, pg_core_1.pgTable)('kpi_values', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    kpiName: (0, pg_core_1.varchar)('kpi_name', { length: 100 }).notNull(), // revenue, aov, repeat_customer_rate
    kpiValue: (0, pg_core_1.numeric)('kpi_value', { precision: 20, scale: 4 }).notNull(),
    timeWindow: (0, pg_core_1.varchar)('time_window', { length: 20 }).notNull(), // hourly, daily, monthly
    timestamp: (0, pg_core_1.timestamp)('timestamp').notNull(),
    metadata: (0, pg_core_1.jsonb)('metadata').notNull().default('{}'), // dimensions, source refs
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteKpiTsIdx: (0, pg_core_1.index)('idx_kpi_site_name_ts').on(table.siteId, table.kpiName, table.timestamp),
    tenantTsIdx: (0, pg_core_1.index)('idx_kpi_tenant_ts').on(table.tenantId, table.timestamp),
}));
