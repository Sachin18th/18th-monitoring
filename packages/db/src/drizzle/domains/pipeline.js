"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deadLetterQueue = exports.pipelineCheckpoints = exports.pipelineJobs = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const iam_1 = require("./iam");
const integrations_1 = require("./integrations");
// ─── PIPELINE JOBS ───────────────────────────────────────────────────────────
// Tracks the execution state of ingestion, transformation, and aggregation workloads.
exports.pipelineJobs = (0, pg_core_1.pgTable)('pipeline_jobs', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(), // Job UUID
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    integrationId: (0, pg_core_1.varchar)('integration_id', { length: 36 }).references(() => integrations_1.connectorInstances.id),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).notNull(), // INGESTION, TRANSFORMATION, AGGREGATION
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull().default('QUEUED'), // QUEUED, RUNNING, COMPLETED, FAILED, DEAD_LETTERED
    correlationId: (0, pg_core_1.varchar)('correlation_id', { length: 100 }), // Ties back to ingestionEventId
    attempts: (0, pg_core_1.integer)('attempts').default(0),
    maxRetries: (0, pg_core_1.integer)('max_retries').default(3),
    payloadRef: (0, pg_core_1.jsonb)('payload_ref').notNull().default('{}'), // e.g. { envelopeId, artifactId }
    errorSummary: (0, pg_core_1.jsonb)('error_summary'),
    startedAt: (0, pg_core_1.timestamp)('started_at'),
    completedAt: (0, pg_core_1.timestamp)('completed_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, (table) => ({
    siteTypeStatusIdx: (0, pg_core_1.index)('idx_pipe_job_site_type_status').on(table.siteId, table.type, table.status),
    correlationIdx: (0, pg_core_1.index)('idx_pipe_job_correlation').on(table.correlationId),
}));
// ─── PIPELINE CHECKPOINTS ───────────────────────────────────────────────────
// Preserves sync cursors/watermarks to allow resumable polling and backfills.
exports.pipelineCheckpoints = (0, pg_core_1.pgTable)('pipeline_checkpoints', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    integrationId: (0, pg_core_1.varchar)('integration_id', { length: 36 }).notNull().references(() => integrations_1.connectorInstances.id),
    entityType: (0, pg_core_1.varchar)('entity_type', { length: 50 }).notNull(), // e.g. ORDERS, CUSTOMERS
    cursorType: (0, pg_core_1.varchar)('cursor_type', { length: 50 }).notNull(), // TIMESTAMP, ID, PAGE_TOKEN
    cursorValue: (0, pg_core_1.varchar)('cursor_value', { length: 255 }).notNull(), // High-water mark
    metadata: (0, pg_core_1.jsonb)('metadata').notNull().default('{}'), // Additional contextual state
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, (table) => ({
    integrationEntityIdx: (0, pg_core_1.index)('idx_pipe_ckpt_integration_entity').on(table.integrationId, table.entityType),
}));
// ─── DEAD LETTER QUEUE (DLQ) ────────────────────────────────────────────────
// Stores terminal pipeline failures for operator review and manual replay.
exports.deadLetterQueue = (0, pg_core_1.pgTable)('dead_letter_queue', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    jobId: (0, pg_core_1.varchar)('job_id', { length: 36 }).notNull().references(() => exports.pipelineJobs.id),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    failureCategory: (0, pg_core_1.varchar)('failure_category', { length: 50 }).notNull(), // SCHEMA_ERROR, NETWORK_TIMEOUT, MAPPING_EXCEPTION
    reason: (0, pg_core_1.text)('reason').notNull(),
    payloadSnapshot: (0, pg_core_1.jsonb)('payload_snapshot'), // The exact state of the payload when it died
    reviewedBy: (0, pg_core_1.varchar)('reviewed_by', { length: 255 }), // User ID
    actionTaken: (0, pg_core_1.varchar)('action_taken', { length: 50 }), // REPLAYED, DISCARDED, FIXED
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteStatusIdx: (0, pg_core_1.index)('idx_dlq_site_status').on(table.siteId, table.actionTaken),
}));
