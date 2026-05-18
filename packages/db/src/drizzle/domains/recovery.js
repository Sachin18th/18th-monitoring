"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recoveryJobs = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const iam_1 = require("./iam");
// ─── RECOVERY JOBS ───────────────────────────────────────────────────────────
// Manages the state of heavy data operations like re-syncing an entire year
exports.recoveryJobs = (0, pg_core_1.pgTable)('recovery_jobs', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    jobType: (0, pg_core_1.varchar)('job_type', { length: 50 }).notNull(), // REPLAY_RAW, FULL_BACKFILL, CDM_REPROCESS
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull().default('PENDING'), // PENDING, RUNNING, COMPLETED, FAILED, PAUSED
    scope: (0, pg_core_1.jsonb)('scope').notNull(), // e.g. { startDate: '2023-01-01', connectorId: 'shopify_1' }
    config: (0, pg_core_1.jsonb)('config').notNull().default('{}'), // e.g. { concurrency: 5, batchSize: 100 }
    totalRecords: (0, pg_core_1.integer)('total_records').default(0),
    processedRecords: (0, pg_core_1.integer)('processed_records').default(0),
    failedRecords: (0, pg_core_1.integer)('failed_records').default(0),
    triggeredBy: (0, pg_core_1.varchar)('triggered_by', { length: 255 }).notNull(), // userId or 'SYSTEM'
    reason: (0, pg_core_1.text)('reason'),
    startedAt: (0, pg_core_1.timestamp)('started_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
    finishedAt: (0, pg_core_1.timestamp)('finished_at'),
    lastError: (0, pg_core_1.jsonb)('last_error'),
}, (table) => ({
    siteStatusIdx: (0, pg_core_1.index)('idx_recovery_site_status').on(table.siteId, table.status),
}));
