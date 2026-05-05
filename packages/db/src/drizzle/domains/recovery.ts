import { pgTable, varchar, timestamp, jsonb, integer, index, text } from 'drizzle-orm/pg-core';
import { tenants, projects } from './iam';

// ─── RECOVERY JOBS ───────────────────────────────────────────────────────────
// Manages the state of heavy data operations like re-syncing an entire year
export const recoveryJobs = pgTable('recovery_jobs', {
    id: varchar('id', { length: 36 }).primaryKey(),
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    
    jobType: varchar('job_type', { length: 50 }).notNull(), // REPLAY_RAW, FULL_BACKFILL, CDM_REPROCESS
    status: varchar('status', { length: 50 }).notNull().default('PENDING'), // PENDING, RUNNING, COMPLETED, FAILED, PAUSED
    
    scope: jsonb('scope').notNull(), // e.g. { startDate: '2023-01-01', connectorId: 'shopify_1' }
    config: jsonb('config').notNull().default('{}'), // e.g. { concurrency: 5, batchSize: 100 }
    
    totalRecords: integer('total_records').default(0),
    processedRecords: integer('processed_records').default(0),
    failedRecords: integer('failed_records').default(0),
    
    triggeredBy: varchar('triggered_by', { length: 255 }).notNull(), // userId or 'SYSTEM'
    reason: text('reason'),
    
    startedAt: timestamp('started_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    finishedAt: timestamp('finished_at'),
    
    lastError: jsonb('last_error'),
}, (table) => ({
    siteStatusIdx: index('idx_recovery_site_status').on(table.siteId, table.status),
}));
