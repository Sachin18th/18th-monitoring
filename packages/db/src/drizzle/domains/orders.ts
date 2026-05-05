import { pgTable, varchar, timestamp, jsonb, serial, integer, index, numeric } from 'drizzle-orm/pg-core';
import { tenants, projects } from './iam';

// ─── CANONICAL ORDERS (CDM Root) ─────────────────────────────────────────────
// The normalized truth for any order from any platform
export const canonicalOrders = pgTable('canonical_orders', {
    id: varchar('id', { length: 36 }).primaryKey(), // Internal UUID
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    
    orderId: varchar('order_id', { length: 255 }).notNull(), // Source Order Number (e.g. #1001)
    externalReferenceId: varchar('external_ref_id', { length: 255 }), // Source UUID
    
    sourceSystem: varchar('source_system', { length: 255 }).notNull(), // shopify, magento, pos
    channel: varchar('channel', { length: 50 }).notNull(), // web, mobile, marketplace, brick-and-mortar
    
    lifecycleState: varchar('lifecycle_state', { length: 50 }).notNull(), // PLACED, PAID, SHIPPED, DELIVERED, RETURNED, CANCELLED
    normalizedStatus: varchar('normalized_status', { length: 50 }).notNull(), // ACTIVE, COMPLETED, FAILED
    
    // Financial Data
    currency: varchar('currency', { length: 10 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 20, scale: 4 }).notNull(),
    taxAmount: numeric('tax_amount', { precision: 20, scale: 4 }).default('0'),
    discountAmount: numeric('discount_amount', { precision: 20, scale: 4 }).default('0'),
    paidAmount: numeric('paid_amount', { precision: 20, scale: 4 }).default('0'),
    refundedAmount: numeric('refunded_amount', { precision: 20, scale: 4 }).default('0'),
    
    // Milestones
    placedAt: timestamp('placed_at').notNull(),
    paidAt: timestamp('paid_at'),
    shippedAt: timestamp('shipped_at'),
    deliveredAt: timestamp('delivered_at'),
    
    // Tracking & Integrity
    mappingVersion: varchar('mapping_version', { length: 20 }).notNull(),
    ingestionEventId: varchar('ingestion_event_id', { length: 36 }),
    
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteIdx: index('idx_order_site').on(table.siteId),
    tenantIdx: index('idx_order_tenant').on(table.tenantId),
    orderIdIdx: index('idx_order_source_id').on(table.orderId),
    lifecycleIdx: index('idx_order_lifecycle').on(table.lifecycleState),
    placedTsIdx: index('idx_order_placed_ts').on(table.placedAt),
}));

// ─── ORDER SNAPSHOTS (Time-Travel) ──────────────────────────────────────────
// Periodical snapshots of order state for trend analysis
export const orderSnapshots = pgTable('order_snapshots', {
    id: serial('id').primaryKey(),
    orderInternalId: varchar('order_internal_id', { length: 36 }).notNull().references(() => canonicalOrders.id),
    snapshotTimestamp: timestamp('snapshot_timestamp').defaultNow().notNull(),
    lifecycleState: varchar('lifecycle_state', { length: 50 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 20, scale: 4 }),
    metadata: jsonb('metadata'),
}, (table) => ({
    orderIdx: index('idx_shot_order').on(table.orderInternalId),
}));

// ─── ORDER EVENTS (Fine-grained Timeline) ───────────────────────────────────
// Captures every atomic change to an order
export const orderEvents = pgTable('order_events', {
    id: varchar('id', { length: 36 }).primaryKey(),
    orderInternalId: varchar('order_internal_id', { length: 36 }).notNull().references(() => canonicalOrders.id),
    eventType: varchar('event_type', { length: 100 }).notNull(), // TRANSACTION_AUTHORIZED, TRACKING_ADDED
    timestamp: timestamp('timestamp').notNull(),
    payload: jsonb('payload').notNull().default('{}'),
    correlationId: varchar('correlation_id', { length: 255 }),
}, (table) => ({
    orderIdx: index('idx_event_order').on(table.orderInternalId),
    typeIdx: index('idx_event_type').on(table.eventType),
}));
