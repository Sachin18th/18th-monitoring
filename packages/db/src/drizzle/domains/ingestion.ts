import { pgTable, varchar, timestamp, jsonb, serial, integer, index, numeric, text } from 'drizzle-orm/pg-core';
import { tenants, projects } from './iam';
import { connectorInstances } from './integrations';

// ─── INGESTION EVENTS ──────────────────────────────────────────────────
// Tracks every piece of data entering the platform
export const ingestionEvents = pgTable('ingestion_events', {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    projectId: varchar('project_id', { length: 255 }).notNull().references(() => projects.id),
    integrationId: varchar('integration_id', { length: 36 }).references(() => connectorInstances.id),
    
    mode: varchar('mode', { length: 20 }).notNull(), // WEBHOOK, POLLING, FILE_IMPORT
    status: varchar('status', { length: 20 }).notNull(), // RECEIVED, QUEUED, COMPLETED, FAILED
    
    sourceReferenceId: varchar('source_reference_id', { length: 255 }), // e.g. Shopify Order ID
    correlationId: varchar('correlation_id', { length: 100 }).notNull(),
    
    validationReport: jsonb('validation_report').default('{}'),
    dedupeKey: varchar('dedupe_key', { length: 255 }),
    
    receivedAt: timestamp('received_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    
    error: jsonb('error').default('{}'), // { code, message }
}, (table) => ({
    tenantIdx: index('idx_ingest_tenant').on(table.tenantId),
    projectIdx: index('idx_ingest_project').on(table.projectId),
    correlationIdx: index('idx_ingest_correlation').on(table.correlationId),
    dedupeIdx: index('idx_ingest_dedupe').on(table.dedupeKey),
}));

// ─── RAWS ARTIFACTS ───────────────────────────────────────────────────
// Preserves the literal raw payload for replay and audit
export const ingestionArtifacts = pgTable('ingestion_artifacts', {
    id: varchar('id', { length: 36 }).primaryKey(),
    ingestionEventId: varchar('ingestion_event_id', { length: 36 }).notNull().references(() => ingestionEvents.id),
    
    type: varchar('type', { length: 50 }).notNull(), // WEBHOOK_PAYLOAD, API_RESPONSE
    storagePath: text('storage_path').notNull(), // Path to object storage (S3/GCS bucket)
    contentType: varchar('content_type', { length: 100 }),
    sizeBytes: integer('size_bytes'),
    checksum: varchar('checksum', { length: 100 }),
    
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    eventIdx: index('idx_artifact_event').on(table.ingestionEventId),
}));
// ─── QUALITY GATE RESULTS ──────────────────────────────────────────────
export const qualityGateResults = pgTable('quality_gate_results', {
    id: serial('id').primaryKey(),
    ingestionEventId: varchar('ingestion_event_id', { length: 36 }).notNull().references(() => ingestionEvents.id),
    
    ruleName: varchar('rule_name', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(), // PASS, FAIL, WARN
    details: text('details'),
    
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    eventIdx: index('idx_qgate_event').on(table.ingestionEventId),
}));
