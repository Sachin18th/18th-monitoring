"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryRelationalAdapter = exports.InMemoryEventAdapter = exports.InMemoryTimeSeriesAdapter = exports.GlobalMemoryStore = void 0;
const crypto_1 = __importDefault(require("crypto"));
const resolver_1 = require("../../../../packages/config/src/resolver");
// ─── Singleton in-memory store shared across the whole process ────────────────
exports.GlobalMemoryStore = {
    metrics: [],
    events: [],
    alerts: [],
    tenants: new Map(),
    orders: new Map(),
    users: new Map(),
    projects: new Map(),
    sessions: new Map(),
    synthetics: [],
    ingestionLogs: [],
    integrationSyncs: [],
    pipelineJobs: [],
    pipelineCheckpoints: new Map(),
    deadLetterQueue: [],
    alertRules: [],
    healthSnapshots: [],
    canonicalOrders: [],
    projectIntegrations: new Map(), // siteId -> Array of instances
    connectorCredentials: new Map(), // instanceId -> Array of credentials
    connectorLifecycleEvents: [],
    projectAccessKeys: new Map(), // siteId -> Array of keys
    projectWebhookSubscriptions: new Map(), // siteId -> Array of subscriptions
    webhookDeliveryLogs: [],
    governanceAuditLogs: [],
    rateLimitBuckets: new Map(),
    syncHistory: [],
    orderSnapshots: [],
    _p(pwd) {
        const salt = process.env.JWT_SECRET || 'hardcoded_demo_salt';
        const hash = crypto_1.default.scryptSync(pwd, salt, 64).toString('hex');
        return `${salt}:${hash}`;
    },
    seed() {
        const now = new Date().toISOString();
        // Seed Tenants
        this.tenants.set('tenant_001', {
            id: 'tenant_001',
            name: 'Global Retail Corp',
            slug: 'global-retail',
            status: 'ACTIVE',
            plan: 'ENTERPRISE',
            settings: {},
            createdAt: now,
            updatedAt: now
        });
        this.tenants.set('tenant_002', {
            id: 'tenant_002',
            name: 'Tushar Creations',
            slug: 'tushar-creations',
            status: 'ACTIVE',
            plan: 'PRO',
            settings: {},
            createdAt: now,
            updatedAt: now
        });
        // Seed Projects
        this.projects.set('store_001', {
            id: 'store_001',
            tenantId: 'tenant_001',
            name: 'Global Flagship Store',
            slug: 'global-flagship',
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
            metricsSummary: { activeUsers: 142, errorRate: 0.02, revenue: 12400 }
        });
        this.projects.set('store_002', {
            id: 'store_002',
            tenantId: 'tenant_001',
            name: 'European Outlet',
            slug: 'eu-outlet',
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
            metricsSummary: { activeUsers: 85, errorRate: 0.05, revenue: 5600 }
        });
        this.projects.set('store_003', {
            id: 'store_003',
            tenantId: 'tenant_002',
            name: 'Tushar Portfolio',
            slug: 'tushar-portfolio',
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
            metricsSummary: { activeUsers: 12, errorRate: 0.0, revenue: 0 }
        });
        this.projects.set('tc_demo_004', {
            id: 'tc_demo_004',
            tenantId: 'tenant_001',
            name: 'High-Volume Commerce Demo',
            slug: 'commerce-demo',
            status: 'active',
            createdAt: now,
            updatedAt: now,
            metricsSummary: { activeUsers: 1250, errorRate: 0.01, revenue: 45200 }
        });
        // Seed Default Access Keys for store_001
        this.projectAccessKeys.set('store_001', [
            {
                id: 'key_master_001',
                label: 'Main ERP Ingestion',
                prefix: 'mk_live_8f7b',
                secretHash: this._p('sk_live_master_seed'), // reveal-once logic simulated
                status: 'active',
                environment: 'production',
                purpose: 'Primary data sync for SAP',
                isVip: true,
                scopes: ['ingestion', 'admin'],
                rateLimit: { max: 1000, windowMs: 60000 },
                allowedIps: ['0.0.0.0/0'],
                createdAt: now,
                lastUsedAt: now,
                createdBy: 'u1'
            },
            {
                id: 'key_audit_002',
                label: 'Reporting Analytics',
                prefix: 'ak_calc_429a',
                secretHash: this._p('sk_test_audit_seed'),
                status: 'active',
                environment: 'staging',
                purpose: 'External BI connector',
                isVip: false,
                scopes: ['reporting'],
                rateLimit: { max: 100, windowMs: 60000 },
                allowedIps: ['10.0.0.0/8'],
                createdAt: now,
                createdBy: 'u1'
            }
        ]);
        // Seed Multi-Instance Integrations for store_001
        this.projectIntegrations.set('store_001', [
            {
                id: 'int_magento_main',
                tenantId: 'tenant_001',
                siteId: 'store_001',
                connectorId: 'magento_us_web',
                label: 'Global Online Storefront',
                category: 'Commerce',
                family: 'Commerce',
                status: 'ACTIVE',
                healthStatus: 'HEALTHY',
                healthScore: 98,
                enabled: true,
                configVersion: '1.0.0',
                syncSettings: { frequency: '15m', retryPolicy: 'exponential', timeout: 30 },
                lastSyncAt: now,
                lastSyncStatus: 'success'
            },
            {
                id: 'int_vend_pos',
                tenantId: 'tenant_001',
                siteId: 'store_001',
                connectorId: 'pos_us_stores',
                label: 'US Retail POS (Vend)',
                category: 'Retail',
                family: 'POS',
                status: 'ACTIVE',
                healthStatus: 'HEALTHY',
                healthScore: 98,
                enabled: true,
                configVersion: '1.0.0',
                syncSettings: { frequency: '1h', retryPolicy: 'constant', timeout: 60 },
                lastSyncAt: now,
                lastSyncStatus: 'success',
            },
            {
                id: 'int_celigo_sync',
                tenantId: 'tenant_001',
                siteId: 'store_001',
                connectorId: 'celigo',
                label: 'Celigo iPaaS Router',
                category: 'middleware',
                family: 'connector',
                status: 'ACTIVE',
                healthStatus: 'HEALTHY',
                healthScore: 99,
                enabled: true,
                configVersion: '1.2.0',
                syncSettings: { frequency: 'webhook', timeout: 120 },
                lastSyncAt: new Date(Date.now() - 5000).toISOString(),
                lastSyncStatus: 'success',
                errorCount: 0
            },
            {
                id: 'int_custom_wms',
                tenantId: 'tenant_001',
                siteId: 'store_001',
                connectorId: 'custom_api',
                label: 'Legacy WMS Internal API',
                category: 'custom',
                family: 'WMS',
                status: 'DRAFT',
                healthStatus: 'HEALTHY',
                healthScore: 50,
                enabled: false,
                configVersion: '1.0.0',
                syncSettings: { frequency: '1h', timeout: 60 },
                errorCount: 15
            }
        ]);
        this.projectIntegrations.set('tc_demo_004', [
            {
                id: 'int_sap_erp',
                connectorId: 'sap_s4hana',
                label: 'SAP S/4HANA Core',
                category: 'ERP',
                status: 'Active',
                health: 100,
                enabled: true,
                config: { prod: { endpoint: 'https://sap.tc.internal/api' } },
                syncSettings: { frequency: '5m', retryPolicy: 'exponential', timeout: 60 },
                lastSyncAt: now,
                lastSyncStatus: 'success',
                errorCount: 0
            },
            {
                id: 'int_oms_sterling',
                connectorId: 'ibm_sterling',
                label: 'IBM Sterling Distribution',
                category: 'OMS',
                status: 'Degraded',
                health: 80,
                enabled: true,
                config: { prod: { endpoint: 'https://oms.tc.internal/api' } },
                syncSettings: { frequency: '15m', retryPolicy: 'exponential', timeout: 60 },
                lastSyncAt: new Date(Date.now() - 30000).toISOString(),
                lastSyncStatus: 'failure',
                errorCount: 3
            },
            {
                id: 'int_dotdigital',
                connectorId: 'dotdigital',
                label: 'DotDigital Engagement',
                category: 'Marketing',
                status: 'Active',
                health: 98,
                enabled: true,
                config: { prod: { endpoint: 'https://api.dotmailer.com/v2' } },
                syncSettings: { frequency: '1h', timeout: 30 },
                lastSyncAt: now,
                lastSyncStatus: 'success'
            },
            {
                id: 'int_moengage',
                connectorId: 'moengage',
                label: 'MoEngage Retention',
                category: 'Marketing',
                status: 'Active',
                health: 99,
                enabled: true,
                config: { prod: { endpoint: 'https://api.moengage.com/v1' } },
                syncSettings: { frequency: '15m', timeout: 30 },
                lastSyncAt: now,
                lastSyncStatus: 'success'
            }
        ]);
        // Seed Credentials
        this.connectorCredentials.set('int_magento_main', [{
                id: 'cred_magento_01',
                connectorInstanceId: 'int_magento_main',
                tenantId: 'tenant_001',
                authType: 'API_KEY',
                vaultKey: 'vault/tenant_001/magento_main_secret',
                scopes: ['orders:read', 'products:read'],
                createdAt: now
            }]);
        this.connectorCredentials.set('int_vend_pos', [{
                id: 'cred_vend_01',
                connectorInstanceId: 'int_vend_pos',
                tenantId: 'tenant_001',
                authType: 'OAUTH2',
                vaultKey: 'vault/tenant_001/vend_oauth_token',
                expiresAt: new Date(Date.now() + 86400000).toISOString(),
                createdAt: now
            }]);
        // Seed Users
        this.users.set('superadmin@monitor.io', {
            id: 'u_super_001',
            email: 'superadmin@monitor.io',
            name: 'Platform Superadmin',
            role: 'SUPER_ADMIN',
            status: 'active',
            tenantId: 'tenant_001',
            assignedProjects: ['store_001', 'store_002', 'store_003', 'tc_demo_004'],
            passwordHash: this._p('password123'),
            audit: { createdAt: now, updatedAt: now }
        });
        this.users.set('admin@store001.com', {
            id: 'u_admin_001',
            email: 'admin@store001.com',
            name: 'Store Manager',
            role: 'TENANT_ADMIN',
            status: 'active',
            tenantId: 'tenant_001',
            assignedProjects: ['store_001', 'tc_demo_004'],
            passwordHash: this._p('password123'),
            audit: { createdAt: now, updatedAt: now }
        });
        this.users.set('viewer@store001.com', {
            id: 'u_viewer_001',
            email: 'viewer@store001.com',
            name: 'John Viewer',
            role: 'VIEWER',
            status: 'active',
            tenantId: 'tenant_001',
            assignedProjects: ['store_001', 'tc_demo_004'],
            passwordHash: this._p('password123'),
            audit: { createdAt: now, updatedAt: now }
        });
        // Seed Webhook Subscriptions for store_001
        this.projectWebhookSubscriptions.set('store_001', [
            {
                id: 'sub_order_alerts_001',
                siteId: 'store_001',
                label: 'External OMS Sync',
                callbackUrl: 'https://webhook.site/demo-oms-sync-endpoint',
                secret: 'sh_test_secret_12345',
                status: 'active',
                eventTypes: ['order.delayed', 'order.stuck', 'order.mismatched'],
                retryPolicy: { maxRetries: 5, backoff: 'exponential' },
                createdAt: now,
                updatedAt: now,
                createdBy: 'u1'
            },
            {
                id: 'sub_perf_monitoring_002',
                siteId: 'store_001',
                label: 'Performance Slack Bot',
                callbackUrl: 'https://hooks.slack.com/services/T000/B000/XXXX',
                secret: 'sh_slack_secret_56789',
                status: 'active',
                eventTypes: ['performance.anomaly_detected', 'alert.triggered'],
                retryPolicy: { maxRetries: 3, backoff: 'constant' },
                createdAt: now,
                updatedAt: now,
                createdBy: 'u1'
            }
        ]);
        // Seed Orders for tc_demo_004
        const orderIds = ['ORD-9901', 'ORD-9902', 'ORD-9903', 'ORD-9904', 'ORD-9905'];
        orderIds.forEach((id, idx) => {
            this.orders.set(id, {
                id,
                siteId: 'tc_demo_004',
                externalOrderId: `EXT-${1000 + idx}`,
                amount: 150 + (idx * 45.2),
                status: idx === 0 ? 'failed' : idx === 2 ? 'placed' : 'shipped',
                channel: idx % 2 === 0 ? 'web' : 'api',
                createdAt: new Date(Date.now() - (idx * 2 * 60 * 60 * 1000)).toISOString(),
            });
        });
        // Seed Metrics for tc_demo_004
        const metrics = [
            { siteId: 'tc_demo_004', kpiName: 'pageLoadTime', value: 2450, timestamp: now, dimensions: { url: '/home' } },
            { siteId: 'tc_demo_004', kpiName: 'pageLoadTime', value: 3100, timestamp: now, dimensions: { url: '/checkout' } },
            { siteId: 'tc_demo_004', kpiName: 'errorRatePct', value: 1.2, timestamp: now, dimensions: {} },
            { siteId: 'tc_demo_004', kpiName: 'activeUsersIncrement', value: 1, timestamp: now, dimensions: { sessionId: 's1', action: 'active' } },
            { siteId: 'tc_demo_004', kpiName: 'activeUsersIncrement', value: 1, timestamp: now, dimensions: { sessionId: 's2', action: 'active' } },
            { siteId: 'tc_demo_004', kpiName: 'syncSuccessPing', value: 1, timestamp: now, dimensions: { systemName: 'SAP' } }
        ];
        this.metrics.push(...metrics);
        console.log('[DB] Seeded 3 users, 2 webhook subscriptions, and baseline metrics for tc_demo_004');
    },
    pruneSessions() {
        const now = Date.now();
        const thirtyMinutes = 30 * 60 * 1000;
        for (const [sid, session] of this.sessions.entries()) {
            if (now - new Date(session.lastActiveAt).getTime() > thirtyMinutes) {
                this.sessions.delete(sid);
            }
        }
    }
};
// Periodic pruning every 5 minutes
setInterval(() => exports.GlobalMemoryStore.pruneSessions(), 5 * 60 * 1000);
// Initial seed
exports.GlobalMemoryStore.seed();
// ─── Time-Series Adapter ──────────────────────────────────────────────────────
class InMemoryTimeSeriesAdapter {
    async insertBatch(metrics) {
        exports.GlobalMemoryStore.metrics.push(...metrics);
        console.log(`[Storage:TS] Saved ${metrics.length} metric records.`);
    }
    async queryKpi(siteId, kpiName, _startTime, _endTime) {
        return exports.GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === kpiName);
    }
}
exports.InMemoryTimeSeriesAdapter = InMemoryTimeSeriesAdapter;
// ─── Event Store Adapter ──────────────────────────────────────────────────────
class InMemoryEventAdapter {
    async appendEvent(_eventId, _siteId, payload) {
        exports.GlobalMemoryStore.events.push(payload);
    }
    async getEvent(_eventId) { return null; }
    async queryEvents(_siteId, _filters) { return exports.GlobalMemoryStore.events; }
}
exports.InMemoryEventAdapter = InMemoryEventAdapter;
// ─── Relational Adapter ───────────────────────────────────────────────────────
class InMemoryRelationalAdapter {
    async getTenant(tenantId) {
        return exports.GlobalMemoryStore.tenants.get(tenantId) || null;
    }
    async getSiteMetadata(siteId) {
        const project = exports.GlobalMemoryStore.projects.get(siteId);
        if (!project)
            return null;
        return {
            siteId: project.id,
            tenantId: project.tenantId,
            domain: project.id + '.monitor.io',
            status: project.status === 'active' ? 'active' : 'suspended',
            config: {}
        };
    }
    async updateSiteConfig(siteId, config) {
        const project = exports.GlobalMemoryStore.projects.get(siteId);
        if (!project)
            throw new Error('Project not found');
        project.settings = { ...project.settings, ...config };
    }
    async getAlertRules(siteId) {
        const resolver = new resolver_1.ConfigResolver();
        const config = resolver.resolve(siteId);
        // Dynamically build rules based on thresholds config
        return [
            { id: 'rule_page_load_01', siteId, kpiName: 'pageLoadTime', threshold: config.thresholds.pageLoadMs, type: 'gt', severity: 'warning' },
            { id: 'rule_error_rate_01', siteId, kpiName: 'errorRatePct', threshold: config.thresholds.errorRatePct, type: 'gt', severity: 'high' },
            { id: 'rule_oms_failure_01', siteId, kpiName: 'oms_sync_failed_count', threshold: 0, type: 'gt', severity: 'critical' },
            { id: 'rule_delayed_orders_01', siteId, kpiName: 'delayedOrdersCount', threshold: 0, type: 'gt', severity: 'warning' },
            { id: 'rule_synthetic_fail', siteId, kpiName: 'syntheticFailure', threshold: 0, type: 'gt', severity: 'critical' }
        ];
    }
    async saveAlertState(alert) {
        // De-duplicate: one active alert per rule
        const existing = exports.GlobalMemoryStore.alerts.find(a => a.ruleId === alert.ruleId && a.status === 'active');
        if (!existing) {
            alert.status = 'active';
            alert.alertId = 'alt_' + Math.random().toString(36).slice(2, 7).toUpperCase();
            exports.GlobalMemoryStore.alerts.push(alert);
            console.log(`[Storage:Alert] 🔴 New alert: ${alert.kpiName} → "${alert.message}"`);
        }
    }
    // ─── User Management ───
    async getUsersByProject(projectId) {
        return Array.from(exports.GlobalMemoryStore.users.values()).filter(u => u.assignedProjects.includes(projectId) && u.role === 'CUSTOMER');
    }
    async createUser(user) {
        if (exports.GlobalMemoryStore.users.has(user.email)) {
            throw new Error('User already exists');
        }
        exports.GlobalMemoryStore.users.set(user.email, user);
    }
    async updateUser(userId, updates) {
        // userId is email in this in-memory mock
        const user = exports.GlobalMemoryStore.users.get(userId);
        if (!user)
            throw new Error('User not found');
        Object.assign(user, updates);
        user.audit.updatedAt = new Date().toISOString();
    }
}
exports.InMemoryRelationalAdapter = InMemoryRelationalAdapter;
