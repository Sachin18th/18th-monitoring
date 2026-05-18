"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.qualityGateResults = exports.ingestionArtifacts = exports.ingestionEvents = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const iam_1 = require("./iam");
const integrations_1 = require("./integrations");
// ─── INGESTION EVENTS ──────────────────────────────────────────────────
// Tracks every piece of data entering the platform
exports.ingestionEvents = (0, pg_core_1.pgTable)('ingestion_events', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    projectId: (0, pg_core_1.varchar)('project_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    integrationId: (0, pg_core_1.varchar)('integration_id', { length: 36 }).references(() => integrations_1.connectorInstances.id),
    mode: (0, pg_core_1.varchar)('mode', { length: 20 }).notNull(), // WEBHOOK, POLLING, FILE_IMPORT
    status: (0, pg_core_1.varchar)('status', { length: 20 }).notNull(), // RECEIVED, QUEUED, COMPLETED, FAILED
    sourceReferenceId: (0, pg_core_1.varchar)('source_reference_id', { length: 255 }), // e.g. Shopify Order ID
    correlationId: (0, pg_core_1.varchar)('correlation_id', { length: 100 }).notNull(),
    validationReport: (0, pg_core_1.jsonb)('validation_report').default('{}'),
    dedupeKey: (0, pg_core_1.varchar)('dedupe_key', { length: 255 }),
    receivedAt: (0, pg_core_1.timestamp)('received_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
    error: (0, pg_core_1.jsonb)('error').default('{}'), // { code, message }
}, (table) => ({
    tenantIdx: (0, pg_core_1.index)('idx_ingest_tenant').on(table.tenantId),
    projectIdx: (0, pg_core_1.index)('idx_ingest_project').on(table.projectId),
    correlationIdx: (0, pg_core_1.index)('idx_ingest_correlation').on(table.correlationId),
    dedupeIdx: (0, pg_core_1.index)('idx_ingest_dedupe').on(table.dedupeKey),
}));
// ─── RAWS ARTIFACTS ───────────────────────────────────────────────────
// Preserves the literal raw payload for replay and audit
exports.ingestionArtifacts = (0, pg_core_1.pgTable)('ingestion_artifacts', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    ingestionEventId: (0, pg_core_1.varchar)('ingestion_event_id', { length: 36 }).notNull().references(() => exports.ingestionEvents.id),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).notNull(), // WEBHOOK_PAYLOAD, API_RESPONSE
    storagePath: (0, pg_core_1.text)('storage_path').notNull(), // Path to object storage (S3/GCS bucket)
    contentType: (0, pg_core_1.varchar)('content_type', { length: 100 }),
    sizeBytes: (0, pg_core_1.integer)('size_bytes'),
    checksum: (0, pg_core_1.varchar)('checksum', { length: 100 }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, (table) => ({
    eventIdx: (0, pg_core_1.index)('idx_artifact_event').on(table.ingestionEventId),
}));
// ─── QUALITY GATE RESULTS ──────────────────────────────────────────────
exports.qualityGateResults = (0, pg_core_1.pgTable)('quality_gate_results', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    ingestionEventId: (0, pg_core_1.varchar)('ingestion_event_id', { length: 36 }).notNull().references(() => exports.ingestionEvents.id),
    ruleName: (0, pg_core_1.varchar)('rule_name', { length: 255 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).notNull(), // PASS, FAIL, WARN
    details: (0, pg_core_1.text)('details'),
    confidenceScore: (0, pg_core_1.numeric)('confidence_score', { precision: 5, scale: 2 }),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, (table) => ({
    eventIdx: (0, pg_core_1.index)('idx_qgate_event').on(table.ingestionEventId),
}));
