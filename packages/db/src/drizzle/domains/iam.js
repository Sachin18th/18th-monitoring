"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.iamAuditLogs = exports.configVersions = exports.userProjectAccess = exports.users = exports.projects = exports.tenants = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
// ─── TENANTS ─────────────────────────────────────────────────────────────────
// Represents a customer organization (e.g., 'Acme Corp')
exports.tenants = (0, pg_core_1.pgTable)('tenants', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(), // UUID
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    slug: (0, pg_core_1.varchar)('slug', { length: 255 }).notNull().unique(), // for subdomains or clean URLs
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull().default('ACTIVE'), // ACTIVE, SUSPENDED, DELETED
    plan: (0, pg_core_1.varchar)('plan', { length: 50 }).notNull().default('FREE'), // FREE, PRO, ENTERPRISE
    settings: (0, pg_core_1.jsonb)('settings').notNull().default('{}'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// ─── PROJECTS (formerly SiteConfigs) ─────────────────────────────────────────
// Represents a specific store or monitored environment under a tenant
exports.projects = (0, pg_core_1.pgTable)('projects', {
    id: (0, pg_core_1.varchar)('id', { length: 255 }).primaryKey(), // siteId
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => exports.tenants.id),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    environment: (0, pg_core_1.varchar)('environment', { length: 50 }).notNull().default('production'),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull().default('ACTIVE'), // ACTIVE, MAINTENANCE, ARCHIVED
    activeVersionId: (0, pg_core_1.varchar)('active_version_id', { length: 36 }), // legacy config-manager ref
    settings: (0, pg_core_1.jsonb)('settings').notNull().default('{}'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, (table) => ({
    tenantIdx: (0, pg_core_1.index)('idx_project_tenant').on(table.tenantId),
}));
// ─── USERS ───────────────────────────────────────────────────────────────────
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => exports.tenants.id),
    email: (0, pg_core_1.varchar)('email', { length: 255 }).notNull().unique(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    passwordHash: (0, pg_core_1.varchar)('password_hash', { length: 255 }).notNull(),
    role: (0, pg_core_1.varchar)('role', { length: 50 }).notNull(), // SUPER_ADMIN, ADMIN, OPERATOR, ANALYST, VIEWER
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull().default('ACTIVE'),
    mfaEnabled: (0, pg_core_1.integer)('mfa_enabled').default(0),
    lastLoginAt: (0, pg_core_1.timestamp)('last_login_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, (table) => ({
    tenantIdx: (0, pg_core_1.index)('idx_user_tenant').on(table.tenantId),
}));
// ─── USER PROJECT ACCESS ─────────────────────────────────────────────────────
// Many-to-many relationship between users and projects
exports.userProjectAccess = (0, pg_core_1.pgTable)('user_project_access', {
    userId: (0, pg_core_1.varchar)('user_id', { length: 36 }).notNull().references(() => exports.users.id),
    projectId: (0, pg_core_1.varchar)('project_id', { length: 255 }).notNull().references(() => exports.projects.id),
    roleOverride: (0, pg_core_1.varchar)('role_override', { length: 50 }), // optional granular role per project
    assignedAt: (0, pg_core_1.timestamp)('assigned_at').defaultNow().notNull(),
}, (table) => ({
    pk: (0, pg_core_1.primaryKey)({ columns: [table.userId, table.projectId] }),
}));
// ─── CONFIG VERSIONS ─────────────────────────────────────────────────────────
// Legacy support for config-manager
exports.configVersions = (0, pg_core_1.pgTable)('config_versions', {
    versionId: (0, pg_core_1.varchar)('version_id', { length: 36 }).primaryKey(),
    siteId: (0, pg_core_1.varchar)('site_id', { length: 255 }).notNull().references(() => exports.projects.id),
    versionNumber: (0, pg_core_1.integer)('version_number').notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull(), // DRAFT, PUBLISHED, ARCHIVED
    kpiDefinitionBlob: (0, pg_core_1.jsonb)('kpi_definition_blob').notNull().default('{}'),
    widgetDefinitionBlob: (0, pg_core_1.jsonb)('widget_definition_blob').notNull().default('{}'),
    connectorDefinitionBlob: (0, pg_core_1.jsonb)('connector_definition_blob').notNull().default('{}'),
    createdBy: (0, pg_core_1.varchar)('created_by', { length: 255 }).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
// ─── AUDIT TRAILS ────────────────────────────────────────────────────────────
exports.iamAuditLogs = (0, pg_core_1.pgTable)('iam_audit_logs', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    tenantId: (0, pg_core_1.varchar)('tenant_id', { length: 36 }).notNull().references(() => exports.tenants.id),
    actorId: (0, pg_core_1.varchar)('actor_id', { length: 255 }).notNull(), // userId or 'SYSTEM'
    action: (0, pg_core_1.varchar)('action', { length: 255 }).notNull(), // USER_CREATED, PROJECT_DELETED, etc.
    targetType: (0, pg_core_1.varchar)('target_type', { length: 255 }).notNull(),
    targetId: (0, pg_core_1.varchar)('target_id', { length: 255 }).notNull(),
    metadata: (0, pg_core_1.jsonb)('metadata').notNull().default('{}'),
    timestamp: (0, pg_core_1.timestamp)('timestamp').defaultNow().notNull(),
}, (table) => ({
    tenantTsIdx: (0, pg_core_1.index)('idx_iam_audit_tenant_ts').on(table.tenantId, table.timestamp),
}));
