import { pgTable, varchar, timestamp, jsonb, serial, integer, index, numeric, text } from 'drizzle-orm/pg-core';
import { tenants, projects } from './iam';

// ─── CONNECTOR INSTANCES ───────────────────────────────────────────────────
// Represents a specific integration connection for a project
export const connectorInstances = pgTable('connector_instances', {
    id: varchar('id', { length: 36 }).primaryKey(), // UUID
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    
    providerId: varchar('provider_id', { length: 255 }).notNull(), // e.g. 'shopify', 'magento'
    label: varchar('label', { length: 255 }).notNull(),
    category: varchar('category', { length: 50 }).notNull(), // ERP, CRM, etc.
    family: varchar('family', { length: 50 }).notNull(), // Commerce, Payment, etc.
    version: varchar('version', { length: 50 }).default('1.0.0'),
    status: varchar('status', { length: 50 }).notNull().default('DRAFT'), 
    lifecycleState: varchar('lifecycle_state', { length: 50 }).notNull().default('DRAFT'), 
    
    // Config versions and health
    configVersion: varchar('config_version', { length: 20 }).default('1.0.0'),
    healthStatus: varchar('health_status', { length: 50 }).notNull().default('HEALTHY'),
    
    syncConfig: jsonb('sync_config').notNull().default('{}'),
    mappingRules: jsonb('mapping_rules').notNull().default('{}'),
    
    lastSyncAt: timestamp('last_sync_at'),
    lastAttemptAt: timestamp('last_attempt_at'),
    lastWebhookAt: timestamp('last_webhook_at'),
    lastError: jsonb('last_error'),
    
    healthScore: integer('health_score').default(100),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    disconnectedAt: timestamp('disconnected_at'),
}, (table) => ({
    siteIdx: index('idx_connector_site').on(table.siteId),
    tenantIdx: index('idx_connector_tenant').on(table.tenantId),
}));

// ─── SYNC RUNS ─────────────────────────────────────────────────────────────
export const connectorSyncRuns = pgTable('connector_sync_runs', {
    id: varchar('id', { length: 36 }).primaryKey(),
    connectorInstanceId: varchar('connector_instance_id', { length: 36 }).notNull().references(() => connectorInstances.id),
    syncType: varchar('sync_type', { length: 50 }).notNull(), // POLL, WEBHOOK, BACKFILL, RECONCILE
    status: varchar('status', { length: 50 }).notNull(), // SUCCESS, PARTIAL, FAILED, RUNNING
    
    startedAt: timestamp('started_at').notNull(),
    finishedAt: timestamp('finished_at'),
    
    recordsFetched: integer('records_fetched').default(0),
    recordsProcessed: integer('records_processed').default(0),
    recordsFailed: integer('records_failed').default(0),
    
    checkpointValue: text('checkpoint_value'),
    errorSummary: jsonb('error_summary'),
}, (table) => ({
    connectorIdx: index('idx_sync_run_connector').on(table.connectorInstanceId),
}));

// ─── PROJECT ACCESS KEYS ───────────────────────────────────────────────────
export const projectAccessKeys = pgTable('project_access_keys', {
    id: varchar('id', { length: 36 }).primaryKey(),
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    
    label: varchar('label', { length: 255 }).notNull(),
    keyPrefix: varchar('key_prefix', { length: 20 }).notNull(),
    keyHash: varchar('key_hash', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('ACTIVE'),
    scopes: jsonb('scopes').notNull().default('[]'),
    
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: varchar('created_by', { length: 255 }).notNull(),
}, (table) => ({
    siteIdx: index('idx_key_site').on(table.siteId),
}));

// ─── WEBHOOK SUBSCRIPTIONS (OUTBOUND) ──────────────────────────────────────
export const webhookSubscriptions = pgTable('webhook_subscriptions', {
    id: varchar('id', { length: 36 }).primaryKey(),
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    
    label: varchar('label', { length: 255 }).notNull(),
    callbackUrl: text('callback_url').notNull(),
    secret: varchar('secret', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('ACTIVE'),
    eventTypes: jsonb('event_types').notNull().default('[]'),
    
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteIdx: index('idx_webhook_sub_site').on(table.siteId),
}));

// ─── CONNECTOR CREDENTIALS ────────────────────────────────────────────────
// Stores sensitive access parameters separately from the operational instance
export const connectorCredentials = pgTable('connector_credentials', {
    id: varchar('id', { length: 36 }).primaryKey(),
    connectorInstanceId: varchar('connector_instance_id', { length: 36 }).notNull().references(() => connectorInstances.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    
    authType: varchar('auth_type', { length: 50 }).notNull(), // OAUTH2, API_KEY, etc.
    vaultKey: varchar('vault_key', { length: 255 }), // Reference to external secret manager
    encryptedSecret: text('encrypted_secret'), // For local encrypted storage
    expiresAt: timestamp('expires_at'),
    lastRotatedAt: timestamp('last_rotated_at'),
    scopes: jsonb('scopes').default('[]'),
});

// ─── CONNECTOR LIFECYCLE EVENTS ───────────────────────────────────────────
// Audit log for discovery, sync attempts, and state changes
export const connectorLifecycleEvents = pgTable('connector_lifecycle_events', {
    id: varchar('id', { length: 36 }).primaryKey(),
    connectorInstanceId: varchar('connector_instance_id', { length: 36 }).notNull().references(() => connectorInstances.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    projectId: varchar('project_id', { length: 255 }).notNull().references(() => projects.id),
    
    eventType: varchar('event_type', { length: 100 }).notNull(),
    severity: varchar('severity', { length: 20 }).notNull(), // INFO, WARNING, ERROR
    payload: jsonb('payload').default('{}'),
    correlationId: varchar('correlation_id', { length: 100 }),
    triggeredBy: varchar('triggered_by', { length: 50 }).notNull(), // SYSTEM, USER
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    connectorIdx: index('idx_event_connector').on(table.connectorInstanceId),
    tenantIdx: index('idx_event_tenant').on(table.tenantId),
}));
