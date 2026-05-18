// import crypto from 'crypto';
// import { TimeSeriesRepository, EventStoreRepository, RelationalRepository } from '../interfaces';
// import { MetricRecord, Tenant, SiteMetadata } from '../models';
// import { ConfigResolver } from '../../../../packages/config/src/resolver';
// import { seed18thDigitech } from '../seeders/demo-seeder';

// // ─── Singleton in-memory store shared across the whole process ────────────────
// export const GlobalMemoryStore = {
//     metrics: [] as MetricRecord[],
//     events: [] as any[],
//     alerts: [] as any[],
//     tenants: new Map<string, any>(),
//     orders: new Map<string, any>(),
//     users: new Map<string, any>(),
//     projects: new Map<string, any>(),
//     sessions: new Map<string, any>(),
//     synthetics: [] as any[],
//     ingestionLogs: [] as any[],
//     integrationSyncs: [] as any[],
//     pipelineJobs: [] as any[],
//     pipelineCheckpoints: new Map<string, any>(),
//     deadLetterQueue: [] as any[],
//     alertRules: [] as any[],
//     healthSnapshots: [] as any[],
//     canonicalOrders: [] as any[],
//     projectIntegrations: new Map<string, any[]>(), // siteId -> Array of instances
//     connectorCredentials: new Map<string, any[]>(), // instanceId -> Array of credentials
//     connectorLifecycleEvents: [] as any[],
//     projectAccessKeys: new Map<string, any[]>(),   // siteId -> Array of keys
//     projectWebhookSubscriptions: new Map<string, any[]>(), // siteId -> Array of subscriptions
//     webhookDeliveryLogs: [] as any[],
//     governanceAuditLogs: [] as any[],
//     rateLimitBuckets: new Map<string, { count: number, resetAt: number }>(),
//     syncHistory: [] as any[],
//     orderSnapshots: [] as any[],

//     _p(pwd: string): string {
//         const salt = process.env.JWT_SECRET || 'hardcoded_demo_salt';
//         const hash = crypto.scryptSync(pwd, salt, 64).toString('hex');
//         return `${salt}:${hash}`;
//     },

//     seed() {
//         console.log('[DB] Initializing strictly isolated platform state...');
        
//         // Seed 18th Digitech Creation (Primary Canonical Project)
//         if (process.env.ENABLE_DEMO_SEEDING !== 'false') {
//             seed18thDigitech(this);
//         }
//     },

//     pruneSessions() {
//         const now = Date.now();
//         const thirtyMinutes = 30 * 60 * 1000;
//         for (const [sid, session] of this.sessions.entries()) {
//             if (now - new Date(session.lastActiveAt).getTime() > thirtyMinutes) {
//                 this.sessions.delete(sid);
//             }
//         }
//     }
// };

// // Periodic pruning every 5 minutes
// setInterval(() => GlobalMemoryStore.pruneSessions(), 5 * 60 * 1000);

// // Initial seed
// GlobalMemoryStore.seed();

// // ─── Time-Series Adapter ──────────────────────────────────────────────────────
// export class InMemoryTimeSeriesAdapter implements TimeSeriesRepository {
//     async insertBatch(metrics: MetricRecord[]): Promise<void> {
//         GlobalMemoryStore.metrics.push(...metrics);
//         console.log(`[Storage:TS] Saved ${metrics.length} metric records.`);
//     }

//     async queryKpi(siteId: string, kpiName: string, _startTime?: string, _endTime?: string): Promise<MetricRecord[]> {
//         return GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === kpiName);
//     }
// }

// // ─── Event Store Adapter ──────────────────────────────────────────────────────
// export class InMemoryEventAdapter implements EventStoreRepository {
//     async appendEvent(_eventId: string, _siteId: string, payload: any): Promise<void> {
//         GlobalMemoryStore.events.push(payload);
//     }
//     async getEvent(_eventId: string): Promise<any | null> { return null; }
//     async queryEvents(_siteId: string, _filters: any): Promise<any[]> { return GlobalMemoryStore.events; }
// }

// // ─── Relational Adapter ───────────────────────────────────────────────────────
// export class InMemoryRelationalAdapter implements RelationalRepository {
//     async getTenant(tenantId: string): Promise<Tenant | null> {
//         return GlobalMemoryStore.tenants.get(tenantId) || null;
//     }
//     async getSiteMetadata(siteId: string): Promise<SiteMetadata | null> {
//         const project = GlobalMemoryStore.projects.get(siteId);
//         if (!project) return null;
//         return {
//             siteId: project.id,
//             tenantId: project.tenantId,
//             domain: project.id + '.monitor.io',
//             status: project.status === 'active' ? 'active' : 'suspended',
//             config: {}
//         };
//     }

//     async updateSiteConfig(siteId: string, config: any): Promise<void> {
//         const project = GlobalMemoryStore.projects.get(siteId);
//         if (!project) throw new Error('Project not found');
//         project.settings = { ...project.settings, ...config };
//     }

//     async getAlertRules(siteId: string): Promise<any[]> {
//         const resolver = new ConfigResolver();
//         const config = resolver.resolve(siteId);

//         // Dynamically build rules based on thresholds config
//         return [
//             { id: 'rule_page_load_01', siteId, kpiName: 'pageLoadTime', threshold: config.thresholds.pageLoadMs, type: 'gt', severity: 'warning' },
//             { id: 'rule_error_rate_01', siteId, kpiName: 'errorRatePct', threshold: config.thresholds.errorRatePct, type: 'gt', severity: 'high' },
//             { id: 'rule_oms_failure_01', siteId, kpiName: 'oms_sync_failed_count', threshold: 0, type: 'gt', severity: 'critical' },
//             { id: 'rule_delayed_orders_01', siteId, kpiName: 'delayedOrdersCount', threshold: 0, type: 'gt', severity: 'warning' },
//             { id: 'rule_synthetic_fail', siteId, kpiName: 'syntheticFailure', threshold: 0, type: 'gt', severity: 'critical' }
//         ];
//     }

//     async saveAlertState(alert: any): Promise<void> {
//         // De-duplicate: one active alert per rule
//         const existing = GlobalMemoryStore.alerts.find(
//             a => a.ruleId === alert.ruleId && a.status === 'active'
//         );
//         if (!existing) {
//             alert.status = 'active';
//             alert.alertId = 'alt_' + Math.random().toString(36).slice(2, 7).toUpperCase();
//             GlobalMemoryStore.alerts.push(alert);
//             console.log(`[Storage:Alert] 🔴 New alert: ${alert.kpiName} → "${alert.message}"`);
//         }
//     }

//     // ─── User Management ───
//     async getUsersByProject(projectId: string): Promise<any[]> {
//         return Array.from(GlobalMemoryStore.users.values()).filter(u =>
//             u.assignedProjects.includes(projectId) && u.role === 'CUSTOMER'
//         );
//     }

//     async createUser(user: any): Promise<void> {
//         if (GlobalMemoryStore.users.has(user.email)) {
//             throw new Error('User already exists');
//         }
//         GlobalMemoryStore.users.set(user.email, user);
//     }

//     async updateUser(userId: string, updates: any): Promise<void> {
//         // userId is email in this in-memory mock
//         const user = GlobalMemoryStore.users.get(userId);
//         if (!user) throw new Error('User not found');

//         Object.assign(user, updates);
//         user.audit.updatedAt = new Date().toISOString();
//     }
// }
import crypto from 'crypto';
import { TimeSeriesRepository, EventStoreRepository, RelationalRepository } from '../interfaces';
import { MetricRecord, Tenant, SiteMetadata } from '../models';
import { ConfigResolver } from '../../../../packages/config/src/resolver';
import { seed18thDigitech } from '../seeders/demo-seeder';

// ─── Singleton in-memory store shared across the whole process ────────────────
export const GlobalMemoryStore = {
    metrics: [] as MetricRecord[],
    events: [] as any[],
    alerts: [] as any[],
    tenants: new Map<string, any>(),
    orders: new Map<string, any>(),
    users: new Map<string, any>(),
    projects: new Map<string, any>(),
    sessions: new Map<string, any>(),
    synthetics: [] as any[],
    ingestionLogs: [] as any[],
    integrationSyncs: [] as any[],
    pipelineJobs: [] as any[],
    pipelineCheckpoints: new Map<string, any>(),
    deadLetterQueue: [] as any[],
    alertRules: [] as any[],
    healthSnapshots: [] as any[],
    canonicalOrders: [] as any[],
    projectIntegrations: new Map<string, any[]>(), // siteId -> Array of instances
    connectorCredentials: new Map<string, any[]>(), // instanceId -> Array of credentials
    connectorLifecycleEvents: [] as any[],
    projectAccessKeys: new Map<string, any[]>(),   // siteId -> Array of keys
    projectWebhookSubscriptions: new Map<string, any[]>(), // siteId -> Array of subscriptions
    webhookDeliveryLogs: [] as any[],
    governanceAuditLogs: [] as any[],
    rateLimitBuckets: new Map<string, { count: number, resetAt: number }>(),
    syncHistory: [] as any[],
    orderSnapshots: [] as any[],

    _p(pwd: string): string {
        const salt = process.env.JWT_SECRET || 'hardcoded_demo_salt';
        const hash = crypto.scryptSync(pwd, salt, 64).toString('hex');
        return `${salt}:${hash}`;
    },

    seed() {
        console.log('[DB] Initializing strictly isolated platform state...');
        
        // Seed 18th Digitech Creation (Primary Canonical Project)
        if (process.env.ENABLE_DEMO_SEEDING !== 'false') {
            seed18thDigitech(this);
        }
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
    async getTenant(tenantId: string): Promise<Tenant | null> {
        return GlobalMemoryStore.tenants.get(tenantId) || null;
    }
    async getSiteMetadata(siteId: string): Promise<SiteMetadata | null> {
        const project = GlobalMemoryStore.projects.get(siteId);
        if (!project) return null;
        return {
            siteId: project.id,
            tenantId: project.tenantId,
            domain: project.id + '.monitor.io',
            status: project.status === 'active' ? 'active' : 'suspended',
            config: {}
        };
    }

    async updateSiteConfig(siteId: string, config: any): Promise<void> {
        const project = GlobalMemoryStore.projects.get(siteId);
        if (!project) throw new Error('Project not found');
        project.settings = { ...project.settings, ...config };
    }

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