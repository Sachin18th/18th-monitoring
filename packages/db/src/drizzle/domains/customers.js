"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerEvents = exports.identityLinks = exports.customerSessions = exports.customerProfiles = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const iam_1 = require("./iam");
// ─── CUSTOMER PROFILES ──────────────────────────────────────────────────────
// Unified identity for a customer across platforms
exports.customerProfiles = (0, pg_core_1.pgTable)('customer_profiles', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    // Mapping keys to source systems
    externalIds: (0, pg_core_1.jsonb)('external_ids').notNull().default('{}'), // e.g. { shopify: '123', magento: '456' }
    emailHash: (0, pg_core_1.varchar)('email_hash', { length: 255 }),
    phoneHash: (0, pg_core_1.varchar)('phone_hash', { length: 255 }),
    lifecycleState: (0, pg_core_1.varchar)('lifecycle_state', { length: 50 }).notNull().default('NEW_GUEST'), // GUEST, CUSTOMER, LOYAL, CHURNED
    identityConfidence: (0, pg_core_1.numeric)('identity_confidence').default('1.0'),
    firstSeenAt: (0, pg_core_1.timestamp)('first_seen_at').defaultNow().notNull(),
    lastSeenAt: (0, pg_core_1.timestamp)('last_seen_at').defaultNow().notNull(),
    totalLtv: (0, pg_core_1.numeric)('total_ltv', { precision: 20, scale: 4 }).default('0'),
    metadata: (0, pg_core_1.jsonb)('metadata').notNull().default('{}'),
}, (table) => ({
    siteIdx: (0, pg_core_1.index)('idx_cust_profile_site').on(table.siteId),
    emailIdx: (0, pg_core_1.index)('idx_cust_profile_email').on(table.emailHash),
}));
// ─── CUSTOMER SESSIONS ──────────────────────────────────────────────────────
// High-level session tracking (Browser or App)
exports.customerSessions = (0, pg_core_1.pgTable)('customer_sessions', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    customerId: (0, pg_core_1.varchar)('customer_id', { length: 36 }).notNull().references(() => exports.customerProfiles.id),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    startTime: (0, pg_core_1.timestamp)('start_time').notNull(),
    endTime: (0, pg_core_1.timestamp)('end_time'),
    durationSeconds: (0, pg_core_1.integer)('duration_seconds'),
    device: (0, pg_core_1.varchar)('device', { length: 100 }),
    browser: (0, pg_core_1.varchar)('browser', { length: 100 }),
    trafficSource: (0, pg_core_1.varchar)('traffic_source', { length: 255 }),
    isConverted: (0, pg_core_1.integer)('is_converted').default(0),
    eventCount: (0, pg_core_1.integer)('event_count').default(0),
}, (table) => ({
    customerIdx: (0, pg_core_1.index)('idx_session_customer').on(table.customerId),
    siteIdx: (0, pg_core_1.index)('idx_session_site').on(table.siteId),
}));
// ─── IDENTITY LINKS ──────────────────────────────────────────────────────────
// Tracks mapping between different customer IDs (Stripe ID to Shopify ID)
exports.identityLinks = (0, pg_core_1.pgTable)('identity_links', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => iam_1.tenants.id),
    primaryCustomerId: (0, pg_core_1.varchar)('primary_customer_id', { length: 36 }).notNull(),
    secondaryCustomerId: (0, pg_core_1.varchar)('secondary_customer_id', { length: 36 }).notNull(),
    linkType: (0, pg_core_1.varchar)('link_type', { length: 50 }).notNull(), // MANUAL, PROBABILISTIC, DETERMINISTIC
    confidence: (0, pg_core_1.numeric)('confidence').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
// ─── CUSTOMER EVENTS ─────────────────────────────────────────────────────────
exports.customerEvents = (0, pg_core_1.pgTable)('customer_events', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    customerId: (0, pg_core_1.varchar)('customer_id', { length: 36 }).notNull().references(() => exports.customerProfiles.id),
    sessionId: (0, pg_core_1.varchar)('session_id', { length: 36 }).references(() => exports.customerSessions.id),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => iam_1.projects.id),
    eventName: (0, pg_core_1.varchar)('event_name', { length: 255 }).notNull(), // click, view, add_to_cart
    category: (0, pg_core_1.varchar)('category', { length: 50 }).notNull(), // behavioral, conversion
    timestamp: (0, pg_core_1.timestamp)('timestamp').notNull(),
    utmSource: (0, pg_core_1.varchar)('utm_source', { length: 100 }),
    utmMedium: (0, pg_core_1.varchar)('utm_medium', { length: 100 }),
    utmCampaign: (0, pg_core_1.varchar)('utm_campaign', { length: 100 }),
    metadata: (0, pg_core_1.jsonb)('metadata').notNull().default('{}'),
}, (table) => ({
    sessionIdx: (0, pg_core_1.index)('idx_cust_event_session').on(table.sessionId),
    customerTsIdx: (0, pg_core_1.index)('idx_cust_event_cust_ts').on(table.customerId, table.timestamp),
}));
