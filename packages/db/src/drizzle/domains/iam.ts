import { pgTable, varchar, timestamp, jsonb, serial, integer, index, primaryKey } from 'drizzle-orm/pg-core';

// ─── TENANTS ─────────────────────────────────────────────────────────────────
// Represents a customer organization (e.g., 'Acme Corp')
export const tenants = pgTable('tenants', {
    id: varchar('id', { length: 36 }).primaryKey(), // UUID
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(), // for subdomains or clean URLs
    status: varchar('status', { length: 50 }).notNull().default('ACTIVE'), // ACTIVE, SUSPENDED, DELETED
    plan: varchar('plan', { length: 50 }).notNull().default('FREE'), // FREE, PRO, ENTERPRISE
    settings: jsonb('settings').notNull().default('{}'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── PROJECTS (formerly SiteConfigs) ─────────────────────────────────────────
// Represents a specific store or monitored environment under a tenant
export const projects = pgTable('projects', {
    id: varchar('id', { length: 255 }).primaryKey(), // siteId
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    name: varchar('name', { length: 255 }).notNull(),
    environment: varchar('environment', { length: 50 }).notNull().default('production'),
    status: varchar('status', { length: 50 }).notNull().default('ACTIVE'), // ACTIVE, MAINTENANCE, ARCHIVED
    activeVersionId: varchar('active_version_id', { length: 36 }), // legacy config-manager ref
    settings: jsonb('settings').notNull().default('{}'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    tenantIdx: index('idx_project_tenant').on(table.tenantId),
}));

// ─── USERS ───────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    email: varchar('email', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: varchar('role', { length: 50 }).notNull(), // SUPER_ADMIN, ADMIN, OPERATOR, ANALYST, VIEWER
    status: varchar('status', { length: 50 }).notNull().default('ACTIVE'),
    mfaEnabled: integer('mfa_enabled').default(0),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    tenantIdx: index('idx_user_tenant').on(table.tenantId),
}));

// ─── USER PROJECT ACCESS ─────────────────────────────────────────────────────
// Many-to-many relationship between users and projects
export const userProjectAccess = pgTable('user_project_access', {
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
    projectId: varchar('project_id', { length: 255 }).notNull().references(() => projects.id),
    roleOverride: varchar('role_override', { length: 50 }), // optional granular role per project
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.userId, table.projectId] }),
}));

// ─── CONFIG VERSIONS ─────────────────────────────────────────────────────────
// Legacy support for config-manager
export const configVersions = pgTable('config_versions', {
    versionId: varchar('version_id', { length: 36 }).primaryKey(),
    siteId: varchar('site_id', { length: 255 }).notNull().references(() => projects.id),
    versionNumber: integer('version_number').notNull(),
    status: varchar('status', { length: 50 }).notNull(), // DRAFT, PUBLISHED, ARCHIVED
    kpiDefinitionBlob: jsonb('kpi_definition_blob').notNull().default('{}'),
    widgetDefinitionBlob: jsonb('widget_definition_blob').notNull().default('{}'),
    connectorDefinitionBlob: jsonb('connector_definition_blob').notNull().default('{}'),
    createdBy: varchar('created_by', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── AUDIT TRAILS ────────────────────────────────────────────────────────────
export const iamAuditLogs = pgTable('iam_audit_logs', {
    id: serial('id').primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
    actorId: varchar('actor_id', { length: 255 }).notNull(), // userId or 'SYSTEM'
    action: varchar('action', { length: 255 }).notNull(), // USER_CREATED, PROJECT_DELETED, etc.
    targetType: varchar('target_type', { length: 255 }).notNull(),
    targetId: varchar('target_id', { length: 255 }).notNull(),
    metadata: jsonb('metadata').notNull().default('{}'),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (table) => ({
    tenantTsIdx: index('idx_iam_audit_tenant_ts').on(table.tenantId, table.timestamp),
}));
