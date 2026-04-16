import { pgTable, varchar, timestamp, jsonb, serial, integer, index } from 'drizzle-orm/pg-core';

export const siteConfigs = pgTable('site_configs', {
    siteId: varchar('site_id', { length: 255 }).primaryKey(),
    activeVersionId: varchar('active_version_id', { length: 36 }),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const configVersions = pgTable('config_versions', {
    versionId: varchar('version_id', { length: 36 }).primaryKey(),
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => siteConfigs.siteId),
    versionNumber: integer('version_number').notNull(),
    status: varchar('status', { length: 50 }).notNull(), // DRAFT, PUBLISHED, ARCHIVED
    kpiDefinitionBlob: jsonb('kpi_definition_blob').notNull().default('{}'),
    widgetDefinitionBlob: jsonb('widget_definition_blob').notNull().default('{}'),
    connectorDefinitionBlob: jsonb('connector_definition_blob').notNull().default('{}'),
    createdBy: varchar('created_by', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
    logId: serial('log_id').primaryKey(),
    siteId: varchar('site_id', { length: 255 }).notNull(),
    actorId: varchar('actor_id', { length: 255 }).notNull(),
    action: varchar('action', { length: 255 }).notNull(),
    entityType: varchar('entity_type', { length: 255 }).notNull(),
    entityId: varchar('entity_id', { length: 255 }).notNull(),
    changes: jsonb('changes').notNull().default('{}'),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (table) => ({
    siteIdTimestampIdx: index('audit_logs_site_id_timestamp_idx').on(table.siteId, table.timestamp),
}));

// -- PHASE 3: Ingestion & Reconciliation --

export const rawPayloads = pgTable('raw_payloads', {
    payloadId: varchar('payload_id', { length: 36 }).primaryKey(),
    siteId: varchar('site_id', { length: 255 }).notNull(),
    connectorId: varchar('connector_id', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(), // PENDING, PROCESSED, FAILED
    rawData: jsonb('raw_data').notNull().default('{}'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const normalizedOrders = pgTable('normalized_orders', {
    orderId: varchar('order_id', { length: 36 }).primaryKey(),
    externalOrderId: varchar('external_order_id', { length: 255 }),
    tenantId: varchar('tenant_id', { length: 255 }).notNull(),
    siteId: varchar('site_id', { length: 255 }).notNull(),
    orderSource: varchar('order_source', { length: 50 }).notNull(), // online, offline
    sourceSystem: varchar('source_system', { length: 255 }).notNull(),
    channel: varchar('channel', { length: 255 }).notNull(),
    orderType: varchar('order_type', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    currency: varchar('currency', { length: 10 }).notNull(),
    amount: integer('amount').notNull(),
    ingestedAt: timestamp('ingested_at').defaultNow().notNull(),
}, (table) => ({
    externalOrderIdIdx: index('normalized_orders_external_order_id_idx').on(table.externalOrderId),
    siteIdIdx:          index('normalized_orders_site_id_idx').on(table.siteId),
    siteIdSourceIdx:    index('normalized_orders_site_id_source_idx').on(table.siteId, table.orderSource),
}));

export const syncLogs = pgTable('sync_logs', {
    syncId: varchar('sync_id', { length: 36 }).primaryKey(),
    siteId: varchar('site_id', { length: 255 }).notNull(),
    connectorId: varchar('connector_id', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(), // SUCCESS, PARTIAL, FAILED
    recordsProcessed: integer('records_processed').notNull().default(0),
    recordsFailed: integer('records_failed').notNull().default(0),
    recordsDeduped: integer('records_deduped').notNull().default(0),
    errorSummary: jsonb('error_summary').notNull().default('[]'),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (table) => ({
    connectorSiteIdx: index('sync_logs_connector_site_idx').on(table.connectorId, table.siteId),
}));

