import { pgTable, varchar, timestamp, jsonb, serial, integer, index, numeric } from 'drizzle-orm/pg-core';
import { tenants, projects } from './iam';

// ─── CUSTOMER PROFILES ──────────────────────────────────────────────────────
// Unified identity for a customer across platforms
export const customerProfiles = pgTable('customer_profiles', {
    id: varchar('id', { length: 36 }).primaryKey(),
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    
    // Mapping keys to source systems
    externalIds: jsonb('external_ids').notNull().default('{}'), // e.g. { shopify: '123', magento: '456' }
    emailHash: varchar('email_hash', { length: 255 }),
    phoneHash: varchar('phone_hash', { length: 255 }),
    
    lifecycleState: varchar('lifecycle_state', { length: 50 }).notNull().default('NEW_GUEST'), // GUEST, CUSTOMER, LOYAL, CHURNED
    identityConfidence: numeric('identity_confidence').default('1.0'),
    
    firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    totalLtv: numeric('total_ltv', { precision: 20, scale: 4 }).default('0'),
    
    metadata: jsonb('metadata').notNull().default('{}'),
}, (table) => ({
    siteIdx: index('idx_cust_profile_site').on(table.siteId),
    emailIdx: index('idx_cust_profile_email').on(table.emailHash),
}));

// ─── CUSTOMER SESSIONS ──────────────────────────────────────────────────────
// High-level session tracking (Browser or App)
export const customerSessions = pgTable('customer_sessions', {
    id: varchar('id', { length: 36 }).primaryKey(),
    customerId: varchar('customer_id', { length: 36 }).notNull().references(() => customerProfiles.id),
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time'),
    durationSeconds: integer('duration_seconds'),
    
    device: varchar('device', { length: 100 }),
    browser: varchar('browser', { length: 100 }),
    trafficSource: varchar('traffic_source', { length: 255 }),
    
    isConverted: integer('is_converted').default(0),
    eventCount: integer('event_count').default(0),
}, (table) => ({
    customerIdx: index('idx_session_customer').on(table.customerId),
    siteIdx: index('idx_session_site').on(table.siteId),
}));

// ─── IDENTITY LINKS ──────────────────────────────────────────────────────────
// Tracks mapping between different customer IDs (Stripe ID to Shopify ID)
export const identityLinks = pgTable('identity_links', {
    id: serial('id').primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    primaryCustomerId: varchar('primary_customer_id', { length: 36 }).notNull(),
    secondaryCustomerId: varchar('secondary_customer_id', { length: 36 }).notNull(),
    linkType: varchar('link_type', { length: 50 }).notNull(), // MANUAL, PROBABILISTIC, DETERMINISTIC
    confidence: numeric('confidence').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── CUSTOMER EVENTS ─────────────────────────────────────────────────────────
export const customerEvents = pgTable('customer_events', {
    id: varchar('id', { length: 36 }).primaryKey(),
    customerId: varchar('customer_id', { length: 36 }).notNull().references(() => customerProfiles.id),
    sessionId: varchar('session_id', { length: 36 }).references(() => customerSessions.id),
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    
    eventName: varchar('event_name', { length: 255 }).notNull(), // click, view, add_to_cart
    category: varchar('category', { length: 50 }).notNull(), // behavioral, conversion
    
    timestamp: timestamp('timestamp').notNull(),
    utmSource: varchar('utm_source', { length: 100 }),
    utmMedium: varchar('utm_medium', { length: 100 }),
    utmCampaign: varchar('utm_campaign', { length: 100 }),
    
    metadata: jsonb('metadata').notNull().default('{}'),
}, (table) => ({
    sessionIdx: index('idx_cust_event_session').on(table.sessionId),
    customerTsIdx: index('idx_cust_event_cust_ts').on(table.customerId, table.timestamp),
}));
