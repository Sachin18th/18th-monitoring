import { pgTable, varchar, timestamp, jsonb, integer, index, text } from 'drizzle-orm/pg-core';
import { tenants, projects } from './iam';
import { connectorInstances } from './integrations';

// ─── PIPELINE JOBS ───────────────────────────────────────────────────────────
// Tracks the execution state of ingestion, transformation, and aggregation workloads.
export const pipelineJobs = pgTable('pipeline_jobs', {
    id: varchar('id', { length: 36 }).primaryKey(), // Job UUID
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    integrationId: varchar('integration_id', { length: 36 }).references(() => connectorInstances.id),
    
    type: varchar('type', { length: 50 }).notNull(), // INGESTION, TRANSFORMATION, AGGREGATION
    status: varchar('status', { length: 50 }).notNull().default('QUEUED'), // QUEUED, RUNNING, COMPLETED, FAILED, DEAD_LETTERED
    
    correlationId: varchar('correlation_id', { length: 100 }), // Ties back to ingestionEventId
    
    attempts: integer('attempts').default(0),
    maxRetries: integer('max_retries').default(3),
    
    payloadRef: jsonb('payload_ref').notNull().default('{}'), // e.g. { envelopeId, artifactId }
    errorSummary: jsonb('error_summary'),
    
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    siteTypeStatusIdx: index('idx_pipe_job_site_type_status').on(table.siteId, table.type, table.status),
    correlationIdx: index('idx_pipe_job_correlation').on(table.correlationId),
}));

// ─── PIPELINE CHECKPOINTS ───────────────────────────────────────────────────
// Preserves sync cursors/watermarks to allow resumable polling and backfills.
export const pipelineCheckpoints = pgTable('pipeline_checkpoints', {
    id: varchar('id', { length: 36 }).primaryKey(),
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    integrationId: varchar('integration_id', { length: 36 }).notNull().references(() => connectorInstances.id),
    
    entityType: varchar('entity_type', { length: 50 }).notNull(), // e.g. ORDERS, CUSTOMERS
    cursorType: varchar('cursor_type', { length: 50 }).notNull(), // TIMESTAMP, ID, PAGE_TOKEN
    
    cursorValue: varchar('cursor_value', { length: 255 }).notNull(), // High-water mark
    metadata: jsonb('metadata').notNull().default('{}'), // Additional contextual state
    
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    integrationEntityIdx: index('idx_pipe_ckpt_integration_entity').on(table.integrationId, table.entityType),
}));

// ─── DEAD LETTER QUEUE (DLQ) ────────────────────────────────────────────────
// Stores terminal pipeline failures for operator review and manual replay.
export const deadLetterQueue = pgTable('dead_letter_queue', {
    id: varchar('id', { length: 36 }).primaryKey(),
    jobId: varchar('job_id', { length: 36 }).notNull().references(() => pipelineJobs.id),
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    
    failureCategory: varchar('failure_category', { length: 50 }).notNull(), // SCHEMA_ERROR, NETWORK_TIMEOUT, MAPPING_EXCEPTION
    reason: text('reason').notNull(),
    
    payloadSnapshot: jsonb('payload_snapshot'), // The exact state of the payload when it died
    
    reviewedBy: varchar('reviewed_by', { length: 255 }), // User ID
    actionTaken: varchar('action_taken', { length: 50 }), // REPLAYED, DISCARDED, FIXED
    
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteStatusIdx: index('idx_dlq_site_status').on(table.siteId, table.actionTaken),
}));
