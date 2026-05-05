"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectorLifecycleEvents = exports.connectorCredentials = exports.webhookSubscriptions = exports.projectAccessKeys = exports.connectorSyncRuns = exports.connectorInstances = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const iam_1 = require("./iam");
// ─── CONNECTOR INSTANCES ───────────────────────────────────────────────────
// Represents a specific integration connection for a project
exports.connectorInstances = (0, pg_core_1.pgTable)('connector_instances', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(), // UUID
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    providerId: (0, pg_core_1.varchar)('provider_id', { length: 255 }).notNull(), // e.g. 'shopify', 'magento'
    label: (0, pg_core_1.varchar)('label', { length: 255 }).notNull(),
    category: (0, pg_core_1.varchar)('category', { length: 50 }).notNull(), // ERP, CRM, etc.
    family: (0, pg_core_1.varchar)('family', { length: 50 }).notNull(), // Commerce, Payment, etc.
    version: (0, pg_core_1.varchar)('version', { length: 50 }).default('1.0.0'),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull().default('DRAFT'),
    lifecycleState: (0, pg_core_1.varchar)('lifecycle_state', { length: 50 }).notNull().default('DRAFT'),
    // Config versions and health
    configVersion: (0, pg_core_1.varchar)('config_version', { length: 20 }).default('1.0.0'),
    healthStatus: (0, pg_core_1.varchar)('health_status', { length: 50 }).notNull().default('HEALTHY'),
    syncConfig: (0, pg_core_1.jsonb)('sync_config').notNull().default('{}'),
    mappingRules: (0, pg_core_1.jsonb)('mapping_rules').notNull().default('{}'),
    lastSyncAt: (0, pg_core_1.timestamp)('last_sync_at'),
    lastAttemptAt: (0, pg_core_1.timestamp)('last_attempt_at'),
    lastWebhookAt: (0, pg_core_1.timestamp)('last_webhook_at'),
    lastError: (0, pg_core_1.jsonb)('last_error'),
    healthScore: (0, pg_core_1.integer)('health_score').default(100),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
    disconnectedAt: (0, pg_core_1.timestamp)('disconnected_at'),
}, (table) => ({
    siteIdx: (0, pg_core_1.index)('idx_connector_site').on(table.siteId),
    tenantIdx: (0, pg_core_1.index)('idx_connector_tenant').on(table.tenantId),
}));
// ─── SYNC RUNS ─────────────────────────────────────────────────────────────
exports.connectorSyncRuns = (0, pg_core_1.pgTable)('connector_sync_runs', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    connectorInstanceId: (0, pg_core_1.varchar)('connector_instance_id', { length: 36 }).notNull().references(() => exports.connectorInstances.id),
    syncType: (0, pg_core_1.varchar)('sync_type', { length: 50 }).notNull(), // POLL, WEBHOOK, BACKFILL, RECONCILE
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull(), // SUCCESS, PARTIAL, FAILED, RUNNING
    startedAt: (0, pg_core_1.timestamp)('started_at').notNull(),
    finishedAt: (0, pg_core_1.timestamp)('finished_at'),
    recordsFetched: (0, pg_core_1.integer)('records_fetched').default(0),
    recordsProcessed: (0, pg_core_1.integer)('records_processed').default(0),
    recordsFailed: (0, pg_core_1.integer)('records_failed').default(0),
    checkpointValue: (0, pg_core_1.text)('checkpoint_value'),
    errorSummary: (0, pg_core_1.jsonb)('error_summary'),
}, (table) => ({
    connectorIdx: (0, pg_core_1.index)('idx_sync_run_connector').on(table.connectorInstanceId),
}));
// ─── PROJECT ACCESS KEYS ───────────────────────────────────────────────────
exports.projectAccessKeys = (0, pg_core_1.pgTable)('project_access_keys', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    label: (0, pg_core_1.varchar)('label', { length: 255 }).notNull(),
    keyPrefix: (0, pg_core_1.varchar)('key_prefix', { length: 20 }).notNull(),
    keyHash: (0, pg_core_1.varchar)('key_hash', { length: 255 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull().default('ACTIVE'),
    scopes: (0, pg_core_1.jsonb)('scopes').notNull().default('[]'),
    lastUsedAt: (0, pg_core_1.timestamp)('last_used_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    createdBy: (0, pg_core_1.varchar)('created_by', { length: 255 }).notNull(),
}, (table) => ({
    siteIdx: (0, pg_core_1.index)('idx_key_site').on(table.siteId),
}));
// ─── WEBHOOK SUBSCRIPTIONS (OUTBOUND) ──────────────────────────────────────
exports.webhookSubscriptions = (0, pg_core_1.pgTable)('webhook_subscriptions', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    label: (0, pg_core_1.varchar)('label', { length: 255 }).notNull(),
    callbackUrl: (0, pg_core_1.text)('callback_url').notNull(),
    secret: (0, pg_core_1.varchar)('secret', { length: 255 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull().default('ACTIVE'),
    eventTypes: (0, pg_core_1.jsonb)('event_types').notNull().default('[]'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteIdx: (0, pg_core_1.index)('idx_webhook_sub_site').on(table.siteId),
}));
// ─── CONNECTOR CREDENTIALS ────────────────────────────────────────────────
// Stores sensitive access parameters separately from the operational instance
exports.connectorCredentials = (0, pg_core_1.pgTable)('connector_credentials', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    connectorInstanceId: (0, pg_core_1.varchar)('connector_instance_id', { length: 36 }).notNull().references(() => exports.connectorInstances.id),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    authType: (0, pg_core_1.varchar)('auth_type', { length: 50 }).notNull(), // OAUTH2, API_KEY, etc.
    vaultKey: (0, pg_core_1.varchar)('vault_key', { length: 255 }), // Reference to external secret manager
    encryptedSecret: (0, pg_core_1.text)('encrypted_secret'), // For local encrypted storage
    expiresAt: (0, pg_core_1.timestamp)('expires_at'),
    lastRotatedAt: (0, pg_core_1.timestamp)('last_rotated_at'),
    scopes: (0, pg_core_1.jsonb)('scopes').default('[]'),
});
// ─── CONNECTOR LIFECYCLE EVENTS ───────────────────────────────────────────
// Audit log for discovery, sync attempts, and state changes
exports.connectorLifecycleEvents = (0, pg_core_1.pgTable)('connector_lifecycle_events', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    connectorInstanceId: (0, pg_core_1.varchar)('connector_instance_id', { length: 36 }).notNull().references(() => exports.connectorInstances.id),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    projectId: (0, pg_core_1.varchar)('project_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    eventType: (0, pg_core_1.varchar)('event_type', { length: 100 }).notNull(),
    severity: (0, pg_core_1.varchar)('severity', { length: 20 }).notNull(), // INFO, WARNING, ERROR
    payload: (0, pg_core_1.jsonb)('payload').default('{}'),
    correlationId: (0, pg_core_1.varchar)('correlation_id', { length: 100 }),
    triggeredBy: (0, pg_core_1.varchar)('triggered_by', { length: 50 }).notNull(), // SYSTEM, USER
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
}, (table) => ({
    connectorIdx: (0, pg_core_1.index)('idx_event_connector').on(table.connectorInstanceId),
    tenantIdx: (0, pg_core_1.index)('idx_event_tenant').on(table.tenantId),
}));
