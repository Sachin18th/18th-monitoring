"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderEvents = exports.orderSnapshots = exports.canonicalOrders = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const iam_1 = require("./iam");
// ─── CANONICAL ORDERS (CDM Root) ─────────────────────────────────────────────
// The normalized truth for any order from any platform
exports.canonicalOrders = (0, pg_core_1.pgTable)('canonical_orders', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(), // Internal UUID
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    orderId: (0, pg_core_1.varchar)('order_id', { length: 255 }).notNull(), // Source Order Number (e.g. #1001)
    externalReferenceId: (0, pg_core_1.varchar)('external_ref_id', { length: 255 }), // Source UUID
    sourceSystem: (0, pg_core_1.varchar)('source_system', { length: 255 }).notNull(), // shopify, magento, pos
    channel: (0, pg_core_1.varchar)('channel', { length: 50 }).notNull(), // web, mobile, marketplace, brick-and-mortar
    lifecycleState: (0, pg_core_1.varchar)('lifecycle_state', { length: 50 }).notNull(), // PLACED, PAID, SHIPPED, DELIVERED, RETURNED, CANCELLED
    normalizedStatus: (0, pg_core_1.varchar)('normalized_status', { length: 50 }).notNull(), // ACTIVE, COMPLETED, FAILED
    // Financial Data
    currency: (0, pg_core_1.varchar)('currency', { length: 10 }).notNull(),
    totalAmount: (0, pg_core_1.numeric)('total_amount', { precision: 20, scale: 4 }).notNull(),
    taxAmount: (0, pg_core_1.numeric)('tax_amount', { precision: 20, scale: 4 }).default('0'),
    discountAmount: (0, pg_core_1.numeric)('discount_amount', { precision: 20, scale: 4 }).default('0'),
    paidAmount: (0, pg_core_1.numeric)('paid_amount', { precision: 20, scale: 4 }).default('0'),
    refundedAmount: (0, pg_core_1.numeric)('refunded_amount', { precision: 20, scale: 4 }).default('0'),
    // Milestones
    placedAt: (0, pg_core_1.timestamp)('placed_at').notNull(),
    paidAt: (0, pg_core_1.timestamp)('paid_at'),
    shippedAt: (0, pg_core_1.timestamp)('shipped_at'),
    deliveredAt: (0, pg_core_1.timestamp)('delivered_at'),
    // Tracking & Integrity
    mappingVersion: (0, pg_core_1.varchar)('mapping_version', { length: 20 }).notNull(),
    ingestionEventId: (0, pg_core_1.varchar)('ingestion_event_id', { length: 36 }),
    metadata: (0, pg_core_1.jsonb)('metadata').notNull().default('{}'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteIdx: (0, pg_core_1.index)('idx_order_site').on(table.siteId),
    tenantIdx: (0, pg_core_1.index)('idx_order_tenant').on(table.tenantId),
    orderIdIdx: (0, pg_core_1.index)('idx_order_source_id').on(table.orderId),
    lifecycleIdx: (0, pg_core_1.index)('idx_order_lifecycle').on(table.lifecycleState),
    placedTsIdx: (0, pg_core_1.index)('idx_order_placed_ts').on(table.placedAt),
}));
// ─── ORDER SNAPSHOTS (Time-Travel) ──────────────────────────────────────────
// Periodical snapshots of order state for trend analysis
exports.orderSnapshots = (0, pg_core_1.pgTable)('order_snapshots', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    orderInternalId: (0, pg_core_1.varchar)('order_internal_id', { length: 36 }).notNull().references(() => exports.canonicalOrders.id),
    snapshotTimestamp: (0, pg_core_1.timestamp)('snapshot_timestamp').defaultNow().notNull(),
    lifecycleState: (0, pg_core_1.varchar)('lifecycle_state', { length: 50 }).notNull(),
    totalAmount: (0, pg_core_1.numeric)('total_amount', { precision: 20, scale: 4 }),
    metadata: (0, pg_core_1.jsonb)('metadata'),
}, (table) => ({
    orderIdx: (0, pg_core_1.index)('idx_shot_order').on(table.orderInternalId),
}));
// ─── ORDER EVENTS (Fine-grained Timeline) ───────────────────────────────────
// Captures every atomic change to an order
exports.orderEvents = (0, pg_core_1.pgTable)('order_events', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    orderInternalId: (0, pg_core_1.varchar)('order_internal_id', { length: 36 }).notNull().references(() => exports.canonicalOrders.id),
    eventType: (0, pg_core_1.varchar)('event_type', { length: 100 }).notNull(), // TRANSACTION_AUTHORIZED, TRACKING_ADDED
    timestamp: (0, pg_core_1.timestamp)('timestamp').notNull(),
    payload: (0, pg_core_1.jsonb)('payload').notNull().default('{}'),
    correlationId: (0, pg_core_1.varchar)('correlation_id', { length: 255 }),
}, (table) => ({
    orderIdx: (0, pg_core_1.index)('idx_event_order').on(table.orderInternalId),
    typeIdx: (0, pg_core_1.index)('idx_event_type').on(table.eventType),
}));
