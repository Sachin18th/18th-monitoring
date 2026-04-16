import crypto from 'crypto';
import { TimeSeriesRepository, EventStoreRepository, RelationalRepository } from '../interfaces';
import { MetricRecord, Tenant, SiteMetadata } from '../models';
import { ConfigResolver } from '../../../../packages/config/src/resolver';

// ─── Singleton in-memory store shared across the whole process ────────────────
export const GlobalMemoryStore = {
    metrics: [] as MetricRecord[],
    events: [] as any[],
    alerts: [] as any[],
    orders: new Map<string, any>(),
    users: new Map<string, any>(),
    projects: new Map<string, any>(),
    sessions: new Map<string, any>(),
    synthetics: [] as any[],
    ingestionLogs: [] as any[],
    integrationSyncs: [] as any[],
    projectIntegrations: new Map<string, any[]>(), // siteId -> Array of instances
    projectAccessKeys: new Map<string, any[]>(),   // siteId -> Array of keys
    governanceAuditLogs: [] as any[],
    rateLimitBuckets: new Map<string, { count: number, resetAt: number }>(),
    syncHistory: [] as any[],

    _p(pwd: string): string {
        const salt = process.env.JWT_SECRET || 'hardcoded_demo_salt';
        const hash = crypto.scryptSync(pwd, salt, 64).toString('hex');
        return `${salt}:${hash}`;
    },

    seed() {
        const now = new Date().toISOString();
        // Seed Projects
        this.projects.set('store_001', {
            id: 'store_001', name: 'Standard Store v1', status: 'active',
            description: 'Main US retail frontend with default monitoring',
            lastActivity: now,
            metricsSummary: { activeUsers: 1420, errorRate: 1.2, revenue: 12500 }
        });
        this.projects.set('store_002', {
            id: 'store_002', name: 'Premium Merchant', status: 'active',
            description: 'High-volume checkout with critical alerts enabled',
            lastActivity: now,
            metricsSummary: { activeUsers: 840, errorRate: 0.5, revenue: 42000 }
        });
        this.projects.set('store_003', {
            id: 'store_003', name: 'Store EU-01', status: 'maintenance',
            description: 'European cluster currently undergoing load test',
            lastActivity: now,
            metricsSummary: { activeUsers: 12, errorRate: 94.0, revenue: 0 },
            globalRateLimit: { max: 5000, windowMs: 60000 } // fallback ceiling
        });

        this.projects.set('tc_demo_004', {
            id: 'tc_demo_004', name: "Sachin's Creation", status: 'active',
            description: 'Live Demo Simulation Environment for VIP Presentation',
            lastActivity: now,
            metricsSummary: { activeUsers: 840, errorRate: 2.1, revenue: 154000 }
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
                connectorId: 'magento_us_web',
                label: 'Global Online Storefront',
                category: 'Commerce',
                status: 'Active',
                health: 98,
                enabled: true,
                config: {
                    prod: { clientId: 'magento_p_01', apiKey: '••••••••8901' },
                    staging: { clientId: 'magento_s_01', apiKey: '••••••••1234' }
                },
                syncSettings: { frequency: '15m', retryPolicy: 'exponential', timeout: 30 },
                lastSyncAt: now,
                lastSyncStatus: 'success'
            },
            {
                id: 'int_vend_pos',
                connectorId: 'pos_us_stores',
                label: 'US Retail POS (Vend)',
                category: 'Retail',
                status: 'Degraded',
                health: 72,
                enabled: true,
                config: {
                    prod: { clientId: 'vend_p_99', apiKey: '••••••••4567' }
                },
                syncSettings: { frequency: '1h', retryPolicy: 'constant', timeout: 60 },
                lastSyncAt: now,
                lastSyncStatus: 'failure',
            },
            {
                id: 'int_celigo_sync',
                connectorId: 'celigo',
                label: 'Celigo iPaaS Router',
                category: 'middleware',
                status: 'Active',
                health: 99,
                enabled: true,
                config: {
                    prod: { endpoint: 'https://api.celigo.com/v1', apiKey: '••••••••celigo89' }
                },
                syncSettings: { frequency: 'webhook', timeout: 120 },
                lastSyncAt: new Date(Date.now() - 5000).toISOString(),
                lastSyncStatus: 'success',
                errorCount: 0
            },
            {
                id: 'int_custom_wms',
                connectorId: 'custom_api',
                label: 'Legacy WMS Internal API',
                category: 'custom',
                status: 'Configuring',
                health: 50,
                enabled: false,
                config: {
                    staging: { endpoint: 'http://internal.wms.local:8080', clientId: 'wms_test' }
                },
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

        // Seed Users
        this.users.set('superadmin@monitor.io', {
            id: 'u1', email: 'superadmin@monitor.io', name: 'Super Admin',
            passwordHash: this._p('password123'),
            role: 'SUPER_ADMIN', status: 'active', assignedProjects: ['store_001', 'store_002', 'store_003', 'tc_demo_004'],
            audit: { createdAt: now, updatedAt: now }
        });

        this.users.set('admin@store001.com', {
            id: 'u2', email: 'admin@store001.com', name: 'Project Admin',
            passwordHash: this._p('password123'),
            role: 'ADMIN', status: 'active', assignedProjects: ['store_001'],
            audit: { createdAt: now, updatedAt: now }
        });

        this.users.set('viewer@store001.com', {
            id: 'u3', email: 'viewer@store001.com', name: 'Customer Viewer',
            passwordHash: this._p('password123'),
            role: 'CUSTOMER', status: 'active', assignedProjects: ['store_001'],
            audit: { createdAt: now, updatedAt: now }
        });

        console.log('[DB] Seeded 3 users with dynamically hashed passwords');
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
setInterval(() => GlobalMemoryStore.pruneSessions(), 5 * 60 * 1000);

// Initial seed
GlobalMemoryStore.seed();

// ─── Time-Series Adapter ──────────────────────────────────────────────────────
export class InMemoryTimeSeriesAdapter implements TimeSeriesRepository {
    async insertBatch(metrics: MetricRecord[]): Promise<void> {
        GlobalMemoryStore.metrics.push(...metrics);
        console.log(`[Storage:TS] Saved ${metrics.length} metric records.`);
    }

    async queryKpi(siteId: string, kpiName: string, _startTime?: string, _endTime?: string): Promise<MetricRecord[]> {
        return GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === kpiName);
    }
}

// ─── Event Store Adapter ──────────────────────────────────────────────────────
export class InMemoryEventAdapter implements EventStoreRepository {
    async appendEvent(_eventId: string, _siteId: string, payload: any): Promise<void> {
        GlobalMemoryStore.events.push(payload);
    }
    async getEvent(_eventId: string): Promise<any | null> { return null; }
    async queryEvents(_siteId: string, _filters: any): Promise<any[]> { return GlobalMemoryStore.events; }
}

// ─── Relational Adapter ───────────────────────────────────────────────────────
export class InMemoryRelationalAdapter implements RelationalRepository {
    async getTenant(_tenantId: string): Promise<Tenant | null> { return null; }
    async getSiteMetadata(_siteId: string): Promise<SiteMetadata | null> { return null; }
    async updateSiteConfig(_siteId: string, _config: any): Promise<void> { }

    async getAlertRules(siteId: string): Promise<any[]> {
        const resolver = new ConfigResolver();
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

    async saveAlertState(alert: any): Promise<void> {
        // De-duplicate: one active alert per rule
        const existing = GlobalMemoryStore.alerts.find(
            a => a.ruleId === alert.ruleId && a.status === 'active'
        );
        if (!existing) {
            alert.status = 'active';
            alert.alertId = 'alt_' + Math.random().toString(36).slice(2, 7).toUpperCase();
            GlobalMemoryStore.alerts.push(alert);
            console.log(`[Storage:Alert] 🔴 New alert: ${alert.kpiName} → "${alert.message}"`);
        }
    }

    // ─── User Management ───
    async getUsersByProject(projectId: string): Promise<any[]> {
        return Array.from(GlobalMemoryStore.users.values()).filter(u =>
            u.assignedProjects.includes(projectId) && u.role === 'CUSTOMER'
        );
    }

    async createUser(user: any): Promise<void> {
        if (GlobalMemoryStore.users.has(user.email)) {
            throw new Error('User already exists');
        }
        GlobalMemoryStore.users.set(user.email, user);
    }

    async updateUser(userId: string, updates: any): Promise<void> {
        // userId is email in this in-memory mock
        const user = GlobalMemoryStore.users.get(userId);
        if (!user) throw new Error('User not found');

        Object.assign(user, updates);
        user.audit.updatedAt = new Date().toISOString();
    }
}
