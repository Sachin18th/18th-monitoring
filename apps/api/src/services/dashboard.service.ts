<<<<<<< HEAD
import { prisma } from '@kpi-platform/db';
import type { MetricFilterDto, KpiSummaryResponse, AlertSummaryResponse } from '../models/dashboard.dto';
import { AnalyticsEngine } from './analytics-engine.service';

const GlobalMemoryStore: any = (globalThis as any).GlobalMemoryStore ?? {
    orders: new Map<string, any>(),
    metrics: [] as any[],
    projectIntegrations: new Map<string, any[]>(),
    governanceConfigs: {},
    governanceAuditLogs: [],
    projects: {},
    tenantUsers: [],
    apiKeys: [],
};
=======
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import type { MetricFilterDto, KpiSummaryResponse, AlertSummaryResponse } from '../models/dashboard.dto';

// Computes the numeric average of a KPI from the in-memory store
function getAvg(siteId: string, kpiName: string): number | null {
    const records = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === kpiName);
    if (records.length === 0) return null;
    const sum = records.reduce((s, r) => s + r.value, 0);
    return Math.round(sum / records.length);
}

function getCount(siteId: string, kpiName: string): number {
    return GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === kpiName).length;
}

function stateFor(kpiName: string, val: number | null): 'healthy' | 'warning' | 'critical' {
    if (val === null || val === 0) return 'healthy';
    if (kpiName === 'pageLoadTime') {
        if (val > 4000) return 'critical';
        if (val > 3000) return 'warning';
    }
    if (kpiName === 'errorRatePct') {
        if (val > 4) return 'critical';
        if (val >= 2) return 'warning';
    }
    if (kpiName === 'oms_sync_failed_count') {
        if (val > 2) return 'critical';
        if (val >= 1) return 'warning';
    }
    return 'healthy';
}
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb

export class DashboardService {
    /**
     * Extracts and calculates the core Key Performance Indicators for a specific site.
     * Evaluates data over the given time range and computes the standard health states.
     * 
     * @param filters - The DTO containing the 'siteId' constraint.
     * @returns A mapped array of aggregated KPI objects.
     */
    static async getKpiSummaries(filters: MetricFilterDto): Promise<KpiSummaryResponse[]> {
        const { siteId } = filters;
<<<<<<< HEAD
        const analytics = await AnalyticsEngine.getSummaryKpis(siteId, filters);
        const systemPerf = await AnalyticsEngine.getSystemPerformance(siteId);

        return [
            {
                kpiName: 'revenue',
                value: analytics.revenue,
                trendPct: 8.5,
                state: 'healthy',
                unit: 'USD'
            },
            {
                kpiName: 'pageLoadTime',
                value: systemPerf.avgLatencyMs,
                trendPct: -2.1,
                state: systemPerf.avgLatencyMs > 2000 ? 'warning' : 'healthy',
                unit: 'ms'
            },
            {
                kpiName: 'ordersTotal',
                value: analytics.orderCount,
                trendPct: 12.4,
                state: 'healthy',
                unit: 'orders'
            },
            {
                kpiName: 'aov',
                value: analytics.aov,
                trendPct: 4.2,
                state: 'healthy',
                unit: 'USD'
            }
=======

        // Performance
        const pageLoad  = getAvg(siteId, 'pageLoadTime');
        const errCount  = getCount(siteId, 'errorRatePct');
        
        // Users
        const activeUsersCount = new Set(
            GlobalMemoryStore.metrics
                .filter(m => m.siteId === siteId && m.kpiName === 'activeUsersIncrement' && m.dimensions?.action === 'active')
                .map(m => m.dimensions?.sessionId)
        ).size;
        
        // Orders
        const ordersTotal = Array.from(GlobalMemoryStore.orders.values()).filter(o => o.siteId === siteId).length;
        const delayedOrders = Array.from(GlobalMemoryStore.orders.values()).filter(o => o.siteId === siteId && o.status === 'placed').length;

        // Integrations
        const totalSuccessful = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === 'syncSuccessPing').length;
        const totalFailed = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === 'syncFailurePing').length;
        const totalSyncs = totalSuccessful + totalFailed;
        const syncSuccessRate = totalSyncs > 0 ? Math.round((totalSuccessful / totalSyncs) * 100) : 100;

        return [
            {
                kpiName: 'pageLoadTime',
                value: pageLoad ?? 0,
                trendPct: (pageLoad || 0) > 3000 ? +12 : -5,
                state: stateFor('pageLoadTime', pageLoad),
            },
            {
                kpiName: 'errorRatePct',
                value: errCount,
                trendPct: errCount > 5 ? +15 : 0,
                state: stateFor('errorRatePct', errCount),
            },
            {
                kpiName: 'activeUsers',
                value: activeUsersCount || 0,
                trendPct: +5,
                state: 'healthy',
            },
            {
                kpiName: 'ordersTotal',
                value: ordersTotal,
                trendPct: +10,
                state: 'healthy',
            },
            {
                kpiName: 'ordersDelayCount',
                value: delayedOrders,
                trendPct: 0,
                state: stateFor('ordersDelayCount', delayedOrders),
            },
            {
                kpiName: 'syncSuccessRate',
                value: syncSuccessRate,
                trendPct: 0,
                state: syncSuccessRate < 95 ? 'warning' : 'healthy',
            },
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
        ];
    }

    /**
     * Retrieves currently active threshold breaches and architectural alerts.
     * Guaranteed to isolate outputs to the requested 'siteId' preventing cross-tenant leakage.
     * 
     * @param filters - Contains limit/offset for pagination and 'siteId'.
     * @returns A mapped array of alert summaries sorted dynamically.
     */
    static async getActiveAlerts(filters: MetricFilterDto): Promise<AlertSummaryResponse[]> {
<<<<<<< HEAD
        if (!filters || !filters.siteId) return [];
        const { siteId, limit = 50, offset = 0 } = filters;
        
        const alerts = await prisma.alert.findMany({
            where: { siteId, status: { in: ['TRIGGERED', 'ACTIVE'] } },
            orderBy: { triggeredAt: 'desc' },
            take: limit,
            skip: offset,
            select: {
                id: true,
                severity: true,
                status: true,
                message: true,
                triggeredAt: true,
                acknowledgedAt: true,
                resolvedAt: true,
                siteId: true,
                alertType: true,
                module: true
            }
        });
        
        return alerts.map((a: any) => ({
            alertId: a.id,
            kpiName: a.alertType || 'Unknown Metric',
            severity: a.severity || 'warning',
            status: a.status || 'active',
            message: a.message || 'System threshold breach detected',
            triggeredAt: a.triggeredAt?.toISOString() || new Date().toISOString(),
            acknowledgedAt: a.acknowledgedAt?.toISOString(),
            resolvedAt: a.resolvedAt?.toISOString(),
            module: a.module || 'System',
            affectedEntity: '-',
            ruleId: a.alertType,
            siteId: a.siteId,
        }));
    }

    static async getAuditLogs(filters: MetricFilterDto) {
        const { siteId } = filters;
        const logs = await prisma.iamAuditLog.findMany({
            where: { tenantId: siteId },
            orderBy: { timestamp: 'desc' },
            take: 50,
            select: {
                id: true,
                actorId: true,
                action: true,
                targetType: true,
                targetId: true,
                timestamp: true,
                metadata: true
            }
        });

        if (logs.length === 0) {
            return [
                { id: 'aud-boot-1', actor: 'System (Boot)', action: 'Platform Initialized', entity: siteId, value: '-', timestamp: new Date().toLocaleString(), category: 'system' },
                { id: 'aud-boot-2', actor: 'System', action: 'Alert Rules Loaded', entity: 'AlertEngine', value: '5 rules active', timestamp: new Date(Date.now() - 60000).toLocaleString(), category: 'configuration' },
            ];
        }

    //     return logs.map((l: any) => ({
    //         id: l.id,
    //         actor: l.actor || 'System',
    //         action: l.action,
    //         entity: l.resourceType || '-',
    //         value: l.resourceId || '-',
    //         timestamp: l.createdAt.toLocaleString(),
    //         category: 'system'
    //     }));
    // }
    return logs.map((l: any) => ({
    id: l.id,
    actor: l.actorId || 'System',
    action: l.action,
    entity: l.targetType || '-',
    value: l.targetId || '-',
    timestamp: l.timestamp.toLocaleString(),
    category: 'system'
}));

        }

    static async getActivityFeed(filters: MetricFilterDto) {
        const { siteId } = filters;
    
        // Get recent sync events
        const syncEvents = await prisma.connectorLifecycleEvent.findMany({
            where: { projectId: siteId, eventType: 'CONNECTOR_SYNCED' },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
                id: true,
                connectorInstanceId: true,
                createdAt: true,
                severity: true,
                payload: true
            }
        });

        const syncs = syncEvents.map((s: any) => ({
            id: `act-sync-${s.id}`,
            type: 'Integration Sync',
            entity: s.connectorInstanceId || 'Connector',
            timestamp: s.createdAt.toISOString(),
            status: s.severity === 'ERROR' ? 'error' : 'success',
            description: `Sync ${s.severity === 'ERROR' ? 'failed' : 'completed'} with ${s.payload?.records || 0} records.`
        }));

        // Get recent ingestion events
        const ingestions = await prisma.ingestionEvent.findMany({
            where: { projectId: siteId },
            orderBy: { receivedAt: 'desc' },
            take: 3,
            select: {
                id: true,
                mode: true,
                sourceReferenceId: true,
                receivedAt: true,
                status: true
            }
        });

        const ingestionsFeed = ingestions.map((l: any) => ({
            id: `act-ing-${l.id}`,
            type: 'Event Ingested',
            entity: l.sourceReferenceId || 'Ingestion Pipeline',
            timestamp: l.receivedAt.toISOString(),
            status: l.status === 'SUCCESS' ? 'success' : 'processing',
            description: `${l.mode || 'Event'} received from ${l.sourceReferenceId || 'unknown'}.`
        }));

        const combined = [...syncs, ...ingestionsFeed]
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 10);

        if (combined.length === 0) {
            return [
                { id: 'act-boot-1', type: 'System Heartbeat', entity: siteId, timestamp: new Date().toISOString(), status: 'success', description: 'Platform is operational. Awaiting real event ingestion.' },
            ];
        }
        return combined;
=======
        const { siteId, limit = 50, offset = 0 } = filters;
        // ⚠️ Critical: filter by siteId to prevent cross-tenant data leakage
        return GlobalMemoryStore.alerts
            .filter((a: any) => a.siteId === siteId)
            .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())
            .slice(offset, offset + limit)
            .map((a: any) => ({
                alertId: a.alertId,
                kpiName: a.kpiName,
                severity: a.severity,
                status: a.status || 'active',
                message: a.message,
                triggeredAt: a.triggeredAt,
                ruleId: a.ruleId,
                siteId: a.siteId,
            }));
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }

    static async getPerformanceSummary(filters: MetricFilterDto) {
        const { siteId } = filters;
<<<<<<< HEAD
        const systemPerf = await AnalyticsEngine.getSystemPerformance(siteId);
        
        const metrics = await prisma.performanceMetric.findMany({
            where: { siteId },
            select: { metricValue: true, metricName: true }
        });

        const getAvg = (metricName: string) => {
            const filtered = metrics.filter(m => m.metricName === metricName);
            if (filtered.length === 0) return 0;
            return Math.round(filtered.reduce((s, m) => s + Number(m.metricValue), 0) / filtered.length);
        };

        const avg = systemPerf.avgLatencyMs || 1200;
        
        return {
            p50: avg,
            p75: avg * 1.15,
            p90: avg * 1.3,
            p95: avg * 1.5,
            p99: avg * 2.2,
            avg: avg,
            errorRate: getAvg('errorRate') || 0.42,
            uptime: systemPerf.uptime || 99.9,
            ttfb: getAvg('ttfb') || 140,
            fid: getAvg('fid') || 12,
            cls: getAvg('cls') || 0.02,
            lcp: getAvg('lcp') || 1200,
            fcp: getAvg('fcp') || 800
        };
    }

    static async getPerformanceAnomalies(filters: MetricFilterDto) {
        const { siteId } = filters;
        return [
            { 
              id: 'anom-1', 
              metric: 'p95 Latency', 
              severity: 'critical', 
              impact: 'Region: India', 
              scope: 'Checkout API',
              window: 'Last 15m',
              deviation: '+450ms',
              status: 'active'
            },
            { 
              id: 'anom-2', 
              metric: 'Error Rate', 
              severity: 'warning', 
              impact: 'Browser: Safari Mobile', 
              scope: 'Product Details',
              window: 'Last 1h',
              deviation: '+2.4%',
              status: 'active'
            }
        ];
    }

    static async getRegionalPerformance(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        const metrics = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'latencyByRegion' },
            select: { region: true, metricValue: true }
        });
        
        const regions = metrics.map(m => ({
            region: m.region || 'Unknown',
            countryCode: m.region || '??',
            avgLatency: Math.round(Number(m.metricValue)),
            errorRate: 0.2,
            trafficShare: 20,
            health: Number(m.metricValue) > 400 ? 'warning' as const : 'healthy' as const
        }));

        if (regions.length === 0) {
            return [
                { region: 'NA-EAST-1', countryCode: 'US', avgLatency: 120, errorRate: 0.2, trafficShare: 100, health: 'healthy' as const },
            ];
        }

=======
        return {
            avgLoadTime: getAvg(siteId, 'pageLoadTime') || 0,
            p95LoadTime: (getAvg(siteId, 'pageLoadTime') || 0) * 1.25, // Mocked P95
            ttfb: getAvg(siteId, 'ttfb') || 0,
            fcp: getAvg(siteId, 'fcp') || 0,
            lcp: getAvg(siteId, 'lcp') || 0,
            uptime: 99.98,
            cls: 0.05,
            fid: 24,
        };
    }

    static async getRegionalPerformance(filters: MetricFilterDto) {
        // Mocking realistic regional data as requested
        const regions = [
            { name: 'US / North America', lcp: 1200, ttfb: 150, errorRate: 0.2, share: 45 },
            { name: 'Europe (UK/EU)', lcp: 1450, ttfb: 280, errorRate: 0.4, share: 30 },
            { name: 'India', lcp: 2100, ttfb: 450, errorRate: 0.8, share: 15 },
            { name: 'Southeast Asia', lcp: 1900, ttfb: 410, errorRate: 0.6, share: 7 },
            { name: 'Middle East', lcp: 1850, ttfb: 390, errorRate: 0.5, share: 3 },
        ];
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
        return regions;
    }

    static async getDeviceSegmentation(filters: MetricFilterDto) {
<<<<<<< HEAD
        const { siteId } = filters;
        
        const metrics = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'usersByDevice' },
            select: { device: true }
        });
        
        const deviceMap: Record<string, number> = {};
        metrics.forEach(m => {
            const device = m.device || 'Other';
            deviceMap[device] = (deviceMap[device] || 0) + 1;
        });

        const total = Object.values(deviceMap).reduce((a, b) => a + b, 0) || 1;
        return Object.entries(deviceMap).map(([name, count]) => ({
            name,
            value: Math.round((count / total) * 100),
            color: name === 'Desktop' ? 'var(--accent-blue)' : name === 'Mobile' ? 'var(--accent-green)' : 'var(--accent-purple)'
        }));
=======
        return [
            { name: 'Mobile', value: 62, color: 'var(--accent-blue)' },
            { name: 'Desktop', value: 35, color: 'var(--accent-green)' },
            { name: 'Tablet', value: 3, color: 'var(--accent-purple)' },
        ];
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }

    static async getResourceBreakdown(filters: MetricFilterDto) {
        return [
            { name: 'Images', value: 1.2, unit: 'MB' },
            { name: 'JavaScript', value: 0.8, unit: 'MB' },
            { name: 'CSS', value: 0.15, unit: 'MB' },
            { name: 'Fonts', value: 0.08, unit: 'MB' },
            { name: 'Other', value: 0.04, unit: 'MB' },
        ];
    }

    static async getPerformanceTrends(filters: MetricFilterDto) {
        const { siteId } = filters;
<<<<<<< HEAD
        
        const records = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'pageLoadTime' },
            orderBy: { timestamp: 'desc' },
            take: 12,
            select: { timestamp: true, metricValue: true }
        });
        
        if (records.length === 0) {
            const avg = 2500;
            return ['12:00', '12:10', '12:20', '12:30', '12:40', '12:50'].map(label => {
                const time = new Date();
                time.setHours(parseInt(label.split(':')[0]), parseInt(label.split(':')[1]));
                return {
                    timestamp: time.toISOString(),
                    pageLoadTime: avg,
                    ttfb: avg * 0.3,
                    fcp: avg * 0.6,
                    lcp: avg * 1.2
                };
            });
        }

        return records.map(r => ({
            timestamp: r.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            pageLoadTime: Number(r.metricValue),
            ttfb: Number(r.metricValue) * 0.15,
            fcp: Number(r.metricValue) * 0.35,
            lcp: Number(r.metricValue) * 0.75,
=======
        // Mocking trend data for the last 6 points
        const labels = ['12:00', '12:10', '12:20', '12:30', '12:40', '12:50'];
        const avg = getAvg(siteId, 'pageLoadTime') || 2500;
        
        return labels.map((label, i) => ({
            timestamp: label,
            pageLoadTime: avg + (Math.random() * 200 - 100),
            ttfb: (avg * 0.2) + (Math.random() * 50 - 25),
            fcp: (avg * 0.4) + (Math.random() * 100 - 50),
            lcp: (avg * 0.8) + (Math.random() * 150 - 75),
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
        }));
    }

    static async getSlowestPages(filters: MetricFilterDto) {
        const { siteId } = filters;
<<<<<<< HEAD
        const records = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'pageLoadTime' },
            select: { route: true, metricValue: true }
        });
        
        const urlMap: Record<string, { total: number, count: number }> = {};
        records.forEach(r => {
            const url = r.route || '/unknown';
            if (!urlMap[url]) urlMap[url] = { total: 0, count: 0 };
            urlMap[url].total += Number(r.metricValue);
=======
        const records = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === 'pageLoadTime');
        
        // Group by URL and average
        const urlMap: Record<string, { total: number, count: number }> = {};
        records.forEach(r => {
            const url = r.dimensions?.url || '/unknown';
            if (!urlMap[url]) urlMap[url] = { total: 0, count: 0 };
            urlMap[url].total += r.value;
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
            urlMap[url].count += 1;
        });

        return Object.entries(urlMap)
            .map(([url, data]) => ({
<<<<<<< HEAD
                route: url,
                method: url.startsWith('/api') ? 'POST' : 'GET',
                p95: Math.round(data.total / data.count * 1.2),
                p99: Math.round(data.total / data.count * 1.5),
                avgLoadTime: Math.round(data.total / data.count),
                errorRate: 0.1,
                calls: data.count,
=======
                url,
                avgLoadTime: Math.round(data.total / data.count),
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
                status: (data.total / data.count) > 4000 ? 'critical' : (data.total / data.count) > 3000 ? 'warning' : 'healthy'
            }))
            .sort((a, b) => b.avgLoadTime - a.avgLoadTime)
            .slice(0, 5);
    }

    static async getUserActivitySummary(filters: MetricFilterDto) {
        const { siteId } = filters;
<<<<<<< HEAD
        
        const metrics = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'activeUsers' },
            select: { device: true }
        });

        const sessions = metrics.length;
        const users = await prisma.user.count({ where: { projectAccess: { some: { projectId: siteId } } } });

        return {
            totalUsers: (sessions || 0) * 12,
            activeUsers: sessions || 0,
            identifiedRatio: sessions > 0 ? Math.round((users / sessions) * 100) : 0,
            newVsReturning: 38,
            sessions: sessions * 1.5,
            avgSessionDuration: 12.5,
            bounceRate: 34.2,
        };
    }

    static async getCustomerIntelligence(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        const customers = await prisma.user.findMany({
            where: { 
                projectAccess: { some: { projectId: siteId } },
                role: 'USER'
            },
            take: 5,
            select: {
                id: true,
                name: true,
                email: true,
                lastLoginAt: true
            }
        });

        const orders = await prisma.canonicalOrder.count({
            where: { siteId }
        });

        const sessions = await prisma.performanceMetric.count({
            where: { siteId, metricName: 'sessionStart' }
        }) || 1;

        const views = await prisma.performanceMetric.count({
            where: { siteId, metricName: 'pageView' }
        });

        return {
            funnel: [
                { stage: 'Visit', count: sessions, percent: 100 },
                { stage: 'Product View', count: views, percent: Math.round((views / sessions) * 100) },
                { stage: 'Purchase', count: orders, percent: Math.round((orders / sessions) * 100) }
            ],
            segments: [
                { name: 'Identified Customers', size: customers.length, active: customers.length, conversion: Math.round((orders / (customers.length || 1)) * 100), growth: 0 },
                { name: 'Anonymous Guests', size: Math.max(0, sessions - customers.length), active: 0, conversion: 0, growth: 0 }
            ],
            topAttribution: [
                { source: 'Direct / Organic', sessions: sessions, conversion: Math.round((orders / sessions) * 100) }
            ],
            recentIdentities: customers.map(c => ({
                id: c.id,
                name: c.name || '',
                email: c.email,
                state: 'Active',
                sessions: 1,
                lastActive: c.lastLoginAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || 'N/A'
            }))
=======
        const activeUsersCount = new Set(
            GlobalMemoryStore.metrics
                .filter(m => m.siteId === siteId && m.kpiName === 'activeUsersIncrement' && m.dimensions?.action === 'active')
                .map(m => m.dimensions?.sessionId)
        ).size;

        const totalSessions = getCount(siteId, 'sessionsPerMinuteIncrement');

        return {
            activeUsers: activeUsersCount || 0,
            totalSessions: totalSessions || 0,
            avgSessionDuration: 12.5, // Mocked minutes
            bounceRate: 34.2, // Mocked percentage
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
        };
    }

    static async getUserTrends(filters: MetricFilterDto) {
        const { siteId } = filters;
<<<<<<< HEAD
        
        const sessionCount = await prisma.performanceMetric.count({
            where: { siteId, metricName: 'sessionStart' }
        });

        const pageViewCount = await prisma.performanceMetric.count({
            where: { siteId, metricName: 'pageView' }
        });

        const metrics = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'sessionStart' },
            select: { device: true }
        });

        const userCount = new Set(metrics.map(e => e.device || 'session')).size;

        return {
            sessions: sessionCount,
            activeUsers: userCount,
            pageViews: pageViewCount,
            avgSessionDuration: '4m 12s',
            bounceRate: '32%',
            topDevices: [
                { name: 'Desktop', share: 0.65 },
                { name: 'Mobile', share: 0.30 },
                { name: 'Tablet', share: 0.05 }
            ]
        };
    }

=======
        const labels = ['12:00', '12:10', '12:20', '12:30', '12:40', '12:50'];
        const sessionsBase = getCount(siteId, 'sessionsPerMinuteIncrement') || 10;
        
        return labels.map((label) => ({
            timestamp: label,
            sessions: sessionsBase + Math.floor(Math.random() * 5),
            activeUsers: (sessionsBase * 2.5) + Math.floor(Math.random() * 10),
            pageViews: (sessionsBase * 4) + Math.floor(Math.random() * 20),
        }));
    }


>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    static async getUserAnalytics(filters: MetricFilterDto) {
        const { siteId } = filters;
        const now = Date.now();
        const activeWindow = 5 * 60 * 1000; // 5 minutes

<<<<<<< HEAD
        const sessions = await prisma.userSession.findMany({
            where: { user: { projectAccess: { some: { projectId: siteId } } } },
            select: { createdAt: true, expiresAt: true }
        });

        const activeSessions = sessions.filter(s => s.expiresAt.getTime() > now);

        // Estimate device/browser breakdown from performance metrics
        const metrics = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'userAgent' },
            take: activeSessions.length,
            select: { device: true, browser: true }
=======
        const allSessions = Array.from(GlobalMemoryStore.sessions.values())
            .filter(s => s.siteId === siteId);

        const activeSessions = allSessions.filter(s => {
            const lastActive = new Date(s.lastActiveAt).getTime();
            return (now - lastActive) <= activeWindow;
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
        });

        const deviceBreakdown: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 };
        const browserBreakdown: Record<string, number> = { chrome: 0, safari: 0, edge: 0, firefox: 0, other: 0 };
        
<<<<<<< HEAD
        metrics.forEach(m => {
            const device = (m.device || 'desktop').toLowerCase();
            if (deviceBreakdown[device] !== undefined) deviceBreakdown[device]++;
            else deviceBreakdown.desktop++;

            const browser = (m.browser || 'chrome').toLowerCase();
            if (browserBreakdown[browser] !== undefined) browserBreakdown[browser]++;
            else browserBreakdown.other++;
        });

        const total = Math.max(activeSessions.length, 1);

        return {
            activeUsers: activeSessions.length,
            totalCustomers: activeSessions.length,
            activeVisitors: 0,
            deviceBreakdown: {
                desktop: { count: deviceBreakdown.desktop, percentage: Math.round((deviceBreakdown.desktop / total) * 100) },
                mobile:  { count: deviceBreakdown.mobile,  percentage: Math.round((deviceBreakdown.mobile / total) * 100) },
                tablet:  { count: deviceBreakdown.tablet,  percentage: Math.round((deviceBreakdown.tablet / total) * 100) }
=======
        let activeCustomers = 0;
        let activeVisitors = 0;

        activeSessions.forEach(s => {
            // Device
            const device = (s.deviceType || 'desktop').toLowerCase();
            if (deviceBreakdown[device] !== undefined) deviceBreakdown[device]++;
            else deviceBreakdown.desktop++;

            // Browser
            const browser = (s.browser || 'chrome').toLowerCase();
            if (browserBreakdown[browser] !== undefined) browserBreakdown[browser]++;
            else browserBreakdown.other++;

            // Customer type
            if (s.isCustomer) activeCustomers++;
            else activeVisitors++;
        });

        return {
            activeUsers: activeSessions.length,
            totalCustomers: activeCustomers, // Active Authenticated
            activeVisitors: activeVisitors,   // Active Anonymous
            deviceBreakdown: {
                desktop: { count: deviceBreakdown.desktop, percentage: activeSessions.length ? Math.round((deviceBreakdown.desktop / activeSessions.length) * 100) : 0 },
                mobile:  { count: deviceBreakdown.mobile,  percentage: activeSessions.length ? Math.round((deviceBreakdown.mobile / activeSessions.length) * 100) : 0 },
                tablet:  { count: deviceBreakdown.tablet,  percentage: activeSessions.length ? Math.round((deviceBreakdown.tablet / activeSessions.length) * 100) : 0 }
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
            },
            browserBreakdown: Object.entries(browserBreakdown).map(([name, count]) => ({
                name,
                count,
<<<<<<< HEAD
                percentage: Math.round((count / total) * 100)
=======
                percentage: activeSessions.length ? Math.round((count / activeSessions.length) * 100) : 0
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
            })).sort((a,b) => b.count - a.count)
        };
    }


    static async getTopPages(filters: MetricFilterDto) {
        const { siteId } = filters;
<<<<<<< HEAD
        
        const records = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'pageView' },
            select: { route: true }
        });
        
        const urlMap: Record<string, number> = {};
        records.forEach(r => {
            const url = r.route || '/';
=======
        const records = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === 'userPageViewCount');
        
        const urlMap: Record<string, number> = {};
        records.forEach(r => {
            const url = r.dimensions?.url || '/';
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
            urlMap[url] = (urlMap[url] || 0) + 1;
        });

        return Object.entries(urlMap)
            .map(([url, count]) => ({ url, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }

<<<<<<< HEAD
    static async getFunnelData(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        const orders = await prisma.canonicalOrder.findMany({
            where: { siteId },
            select: { id: true, normalizedStatus: true }
        });

        const sessionCount = await prisma.performanceMetric.count({
            where: { siteId, metricName: 'sessionStart' }
        }) || orders.length * 8;

        const stages = [
            { step: 'Landing Page', count: sessionCount },
            { step: 'Product View', count: Math.round(sessionCount * 0.65) },
            { step: 'Add to Cart', count: Math.round(sessionCount * 0.22) },
            { step: 'Checkout', count: orders.filter(o => ['placed','paid','shipped','delivered'].includes((o.normalizedStatus || '').toLowerCase())).length || Math.round(sessionCount * 0.12) },
            { step: 'Purchase', count: orders.filter(o => ['paid','shipped','delivered'].includes((o.normalizedStatus || '').toLowerCase())).length || Math.round(sessionCount * 0.08) }
        ];
        const top = stages[0].count || 1;
        return stages.map(s => ({ ...s, percentage: Math.round((s.count / top) * 100) }));
=======
    static async getFunnelData(_filters: MetricFilterDto) {
        // Mocked funnel for visualization
        return [
            { step: 'Landing Page', count: 1200, percentage: 100 },
            { step: 'Product View', count: 850, percentage: 70 },
            { step: 'Add to Cart', count: 320, percentage: 26 },
            { step: 'Checkout', count: 180, percentage: 15 },
            { step: 'Purchase', count: 110, percentage: 9 }
        ];
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }

    /**
     * Collates complex order aggregation metrics including delays, channels, and total volumes.
<<<<<<< HEAD
     * Hardened against null data, invalid dates, and empty datasets.
     */
    static async getOrderSummary(filters: MetricFilterDto) {
        const { siteId } = filters;
        const analytics = await AnalyticsEngine.getSummaryKpis(siteId, filters);
        
        const allOrders = await prisma.canonicalOrder.findMany({
            where: { siteId },
            select: { id: true, normalizedStatus: true, totalAmount: true, createdAt: true, lifecycleState: true }
        });
        
        const failedCount = allOrders.filter(o => (o.normalizedStatus || '').toUpperCase() === 'FAILED').length;
        const delayedCount = allOrders.filter(o => (o.lifecycleState || '').toUpperCase() === 'PROCESSING').length;
        const mismatches = allOrders.filter(o => (o.normalizedStatus || '').toUpperCase() === 'MISMATCH').length;
        
        const now = Date.now();
        const hourAgo = now - 3600000;
        const ordersThisHour = allOrders.filter(o => o.createdAt.getTime() > hourAgo).length;
        
        const stages = [
            { stage: 'Placed', count: allOrders.filter(o => (o.normalizedStatus || '').toUpperCase() === 'PLACED').length, color: '#3b82f6' },
            { stage: 'Processing', count: allOrders.filter(o => (o.lifecycleState || '').toUpperCase() === 'PROCESSING').length, color: '#f59e0b' },
            { stage: 'Shipped', count: allOrders.filter(o => (o.normalizedStatus || '').toUpperCase() === 'SHIPPED').length, color: '#10b981' },
            { stage: 'Delivered', count: allOrders.filter(o => (o.normalizedStatus || '').toUpperCase() === 'DELIVERED').length, color: '#059669' },
            { stage: 'Cancelled', count: allOrders.filter(o => (o.normalizedStatus || '').toUpperCase() === 'CANCELLED').length, color: '#ef4444' },
        ];

        return {
            totalOrders: analytics.orderCount,
            totalRevenue: analytics.revenue,
            averageOrderValue: analytics.aov,
            taxTotal: analytics.taxTotal,
            ordersThisHour,
            failedCount,
            delayedCount,
            mismatches,
            ordersPerMinute: (ordersThisHour / 60).toFixed(2),
            stages,
            metadata: analytics.metadata
=======
     */
    static async getOrderSummary(filters: MetricFilterDto) {
        const { siteId } = filters;
        const orders = Array.from(GlobalMemoryStore.orders.values()).filter(o => o.siteId === siteId);
        
        const total = orders.length;
        const onlineCount = orders.filter(o => o.orderSource === 'online' || !o.orderSource).length;
        const offlineCount = orders.filter(o => o.orderSource === 'offline').length;
        const delayedCount = orders.filter(o => o.status === 'placed' && (Date.now() - new Date(o.createdAt).getTime()) > 10 * 60 * 1000).length;
        const failedCount = orders.filter(o => o.status === 'failed' || o.paymentStatus === 'failed').length;

        return {
            totalOrders: total,
            ordersThisHour: orders.filter(o => (Date.now() - new Date(o.createdAt).getTime()) < 3600000).length,
            onlineSplit: total > 0 ? Math.round((onlineCount / total) * 100) : 0,
            offlineSplit: total > 0 ? Math.round((offlineCount / total) * 100) : 0,
            delayedCount,
            failedCount,
            ordersPerMinute: (total / 60).toFixed(2)
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
        };
    }

    static async getOrderTrends(filters: MetricFilterDto) {
        const { siteId } = filters;
<<<<<<< HEAD
        
        const orders = await prisma.canonicalOrder.findMany({
            where: { siteId },
            select: { id: true, createdAt: true, channel: true }
        });

        const now = Date.now();
        const buckets: Record<string, { online: number; offline: number }> = {};

        for (let i = 5; i >= 0; i--) {
            const t = new Date(now - i * 3600000);
            const label = `${t.getHours().toString().padStart(2, '0')}:00`;
            buckets[label] = { online: 0, offline: 0 };
        }

        orders.forEach(o => {
            const label = `${o.createdAt.getHours().toString().padStart(2, '0')}:00`;
            if (buckets[label]) {
                if (o.channel === 'POS') buckets[label].offline++;
                else buckets[label].online++;
            }
        });

        return Object.entries(buckets).map(([timestamp, counts]) => ({ timestamp, ...counts }));
=======
        const labels = Array.from({ length: 6 }, (_, i) => `${10 + i}:00`);
        const base = 50;
        
        return labels.map((label, i) => ({
            timestamp: label,
            online: base + Math.floor(Math.random() * 20) + (i === 4 ? -30 : 0), // Drop in 12:40 for RCA demo
            offline: 15 + Math.floor(Math.random() * 10)
        }));
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }

    static async getOrderRCA(filters: MetricFilterDto) {
        const { siteId } = filters;
        const anomalies = [];
        
        // 1. Check for Performance Correlation
<<<<<<< HEAD
        const perfMetrics = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'pageLoadTime' },
            select: { metricValue: true }
        });

        const avgLatency = perfMetrics.length > 0 
            ? perfMetrics.reduce((acc, m) => acc + Number(m.metricValue), 0) / perfMetrics.length 
            : 0;
=======
        const p95Latency = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === 'pageLoadTime');
        const avgLatency = p95Latency.reduce((acc, m) => acc + m.value, 0) / (p95Latency.length || 1);
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
        
        if (avgLatency > 3000) {
            anomalies.push({
                type: 'Performance Degradation',
                metric: 'Page Load Time',
                value: `${Math.round(avgLatency)}ms`,
                impact: 'High correlation with checkout abandonment',
                confidence: 0.85
            });
        }

        // 2. Check for Integration Failures
<<<<<<< HEAD
        const syncFailures = await prisma.connectorLifecycleEvent.count({
            where: { projectId: siteId, severity: 'ERROR' }
        });

        if (syncFailures > 0) {
            anomalies.push({
                type: 'Integration Failure',
                metric: 'OMS Sync Health',
                value: `${syncFailures} failed attempts`,
=======
        const syncFailures = GlobalMemoryStore.integrationSyncs.filter(s => s.siteId === siteId && s.status === 'failure');
        if (syncFailures.length > 0) {
            anomalies.push({
                type: 'Integration Failure',
                metric: 'OMS Sync Health',
                value: `${syncFailures.length} failed attempts`,
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
                impact: 'Offline order ingestion blocked',
                confidence: 0.95
            });
        }

        // 3. Check for JS Errors
<<<<<<< HEAD
        const jsErrors = await prisma.performanceMetric.count({
            where: { siteId, metricName: 'jsError' }
        });

        if (jsErrors > 3) {
            anomalies.push({
                type: 'Frontend Stability',
                metric: 'JS Error Rate',
                value: `${jsErrors} spikes`,
=======
        const jsErrors = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === 'errorRateIncrement');
        if (jsErrors.length > 3) {
            anomalies.push({
                type: 'Frontend Stability',
                metric: 'JS Error Rate',
                value: `${jsErrors.length} spikes`,
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
                impact: 'Potential breakage in Add to Cart / Checkout flow',
                confidence: 0.7
            });
        }

        return {
            status: anomalies.length > 0 ? 'alert' : 'healthy',
            anomalies,
            analyzedAt: new Date().toISOString()
        };
    }

    static async getRecommendations(filters: MetricFilterDto) {
        const rca = await this.getOrderRCA(filters);
        const recommendations = [];

        for (const anomaly of rca.anomalies) {
            if (anomaly.type === 'Performance Degradation') {
                recommendations.push({
                    title: 'Optimize Checkout Assets',
                    action: 'Investigate LCP on /checkout page. Heavy script or image blocking render.',
                    priority: 'Critical'
                });
            }
            if (anomaly.type === 'Integration Failure') {
                recommendations.push({
                    title: 'Restart OMS Connector',
                    action: 'Verify API credentials and connectivity for OMS-1 system.',
                    priority: 'High'
                });
            }
            if (anomaly.type === 'Frontend Stability') {
                recommendations.push({
                    title: 'Check Payment Gateway Hook',
                    action: 'Frequent "ReferenceError" detected in payment script handler.',
                    priority: 'High'
                });
            }
        }

        if (recommendations.length === 0) {
            recommendations.push({
                title: 'No Action Required',
                action: 'System operating within normal baseline parameters.',
                priority: 'Low'
            });
        }

        return recommendations;
    }

    static async getDelayedOrders(filters: MetricFilterDto) {
        const { siteId } = filters;
<<<<<<< HEAD
        const orders = Array.from(GlobalMemoryStore.orders.entries()) as Array<[string, any]>;
        return orders
            .filter(([_, o]: [string, any]) => o.siteId === siteId && o.status === 'placed')
            .map(([orderId, o]: [string, any]) => {
                // seed uses `createdAt`; future adapters may use `placedAt`
                const placedAt = o.placedAt || o.createdAt;
                return {
                    orderId,
                    placedAt,
                    channel: o.channel,
                    minutesDelayed: placedAt
                        ? Math.floor((Date.now() - new Date(placedAt).getTime()) / 60000)
                        : 1
                };
            })
=======
        return Array.from(GlobalMemoryStore.orders.entries())
            .filter(([_, o]) => o.siteId === siteId && o.status === 'placed')
            .map(([orderId, o]) => ({
                orderId,
                placedAt: o.placedAt,
                channel: o.channel,
                minutesDelayed: Math.floor((new Date().getTime() - new Date(o.placedAt).getTime()) / 60000) || 1
            }))
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
            .slice(0, 10);
    }

    static async getOrderSourceBreakdown(filters: MetricFilterDto) {
        const { siteId } = filters;
<<<<<<< HEAD
        const orders = (Array.from(GlobalMemoryStore.orders.values()) as any[]).filter((o: any) => o.siteId === siteId);
        
        const channels: Record<string, number> = { 'Web': 0, 'Mobile': 0, 'POS': 0, 'API': 0 };
        orders.forEach((o: any) => {
=======
        const orders = Array.from(GlobalMemoryStore.orders.values()).filter(o => o.siteId === siteId);
        
        const channels: Record<string, number> = { 'Web': 0, 'Mobile': 0, 'POS': 0, 'API': 0 };
        orders.forEach(o => {
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
            const ch = o.channel.charAt(0).toUpperCase() + o.channel.slice(1);
            channels[ch] = (channels[ch] || 0) + 1;
        });

        return Object.entries(channels).map(([name, value]) => ({ name, value }));
    }

    static async getIntegrationHealthSummary(filters: MetricFilterDto) {
        const { siteId } = filters;
<<<<<<< HEAD
        const totalSuccessful = GlobalMemoryStore.metrics.filter((m: any) => m.siteId === siteId && m.kpiName === 'syncSuccessPing').length;
        const totalFailed = GlobalMemoryStore.metrics.filter((m: any) => m.siteId === siteId && m.kpiName === 'syncFailurePing').length;
        const total = totalSuccessful + totalFailed;

        const latencyRecords = GlobalMemoryStore.metrics.filter((m: any) => m.siteId === siteId && m.kpiName === 'syncLatency');
        const avgLatency = latencyRecords.length > 0
            ? Math.round(latencyRecords.reduce((s: number, r: any) => s + Number(r.value || 0), 0) / latencyRecords.length)
            : 0;
        const successRate = total > 0 ? Math.round((totalSuccessful / total) * 100) : 100;

        return {
            successRate,
            failureCount24h: totalFailed,
            avgOmsLatency: avgLatency,
            healthScore: Math.max(0, Math.min(100, successRate - (totalFailed * 2))),
=======
        const totalSuccessful = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === 'syncSuccessPing').length || 450;
        const totalFailed = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === 'syncFailurePing').length || 12;
        const total = totalSuccessful + totalFailed;
        
        return {
            successRate: total > 0 ? Math.round((totalSuccessful / total) * 100) : 98,
            failureCount24h: totalFailed,
            avgOmsLatency: 420, // Mocked ms
            healthScore: 95, // Mocked percentage
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
        };
    }

    static async getSyncTrends(filters: MetricFilterDto) {
        const { siteId } = filters;
<<<<<<< HEAD
        const now = Date.now();
        const buckets: Record<string, { success: number; failure: number }> = {};

        for (let i = 5; i >= 0; i--) {
            const t = new Date(now - i * 600000); // 10-min buckets
            const label = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`;
            buckets[label] = { success: 0, failure: 0 };
        }

        GlobalMemoryStore.metrics
            .filter((m: any) => m.siteId === siteId && (m.kpiName === 'syncSuccessPing' || m.kpiName === 'syncFailurePing'))
            .forEach((m: any) => {
                const d = new Date(m.timestamp);
                const label = `${d.getHours().toString().padStart(2, '0')}:${(Math.floor(d.getMinutes() / 10) * 10).toString().padStart(2, '0')}`;
                if (buckets[label]) {
                    if (m.kpiName === 'syncSuccessPing') buckets[label].success++;
                    else buckets[label].failure++;
                }
            });

        return Object.entries(buckets).map(([timestamp, counts]) => ({ timestamp, ...counts }));
=======
        const labels = ['12:00', '12:10', '12:20', '12:30', '12:40', '12:50'];
        
        return labels.map((label) => ({
            timestamp: label,
            success: 80 + Math.floor(Math.random() * 20),
            failure: Math.floor(Math.random() * 5),
        }));
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }

    static async getFailedSyncs(filters: MetricFilterDto) {
        const { siteId } = filters;
        return GlobalMemoryStore.metrics
<<<<<<< HEAD
            .filter((m: any) => m.siteId === siteId && m.kpiName === 'syncFailurePing')
            .map((m: any, idx: number) => ({
=======
            .filter(m => m.siteId === siteId && m.kpiName === 'syncFailurePing')
            .map((m, idx) => ({
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
                id: `f_${idx}_${m.timestamp?.slice(11, 19)?.replace(/:/g, '') || Math.random().toString(36).slice(2, 7)}`,
                system: m.dimensions?.systemName || 'OMS',
                error: m.dimensions?.details || 'Connection timed out',
                timestamp: m.timestamp || new Date().toISOString()
            }))
            .slice(0, 5);
    }

<<<<<<< HEAD
    static async getOrders(filters: MetricFilterDto) {
        const { siteId } = filters;
        return (Array.from(GlobalMemoryStore.orders.values()) as any[]).filter((o: any) => o.siteId === siteId);
    }

    static async getIntegrationSystemBreakdown(filters: MetricFilterDto) {
        const { siteId } = filters;
        const connectors = (GlobalMemoryStore.projectIntegrations.get(siteId) || [])
            .filter((c: any) => c.siteId === siteId || c.projectId === siteId || true); // projectIntegrations already filtered by key

        if (connectors.length === 0) return [];

        return connectors.map((c: any) => {
            const syncMetrics = GlobalMemoryStore.metrics.filter(
                (m: any) => m.siteId === siteId && m.dimensions?.connectorId === c.id
            );
            const avgLat = syncMetrics.length > 0
                ? Math.round(syncMetrics.reduce((s: number, m: any) => s + Number(m.value || 0), 0) / syncMetrics.length)
                : 0;
            return {
                name: c.label || c.name || c.id,
                status: c.status === 'ACTIVE' ? 'Active' : c.status === 'DEGRADED' ? 'Degraded' : 'Offline',
                latency: avgLat > 0 ? `${avgLat}ms` : 'N/A',
                health: c.healthScore ?? (c.status === 'ACTIVE' ? 100 : 0),
            };
        });
    }

    static async getMetricsCatalog(filters: MetricFilterDto) {
        const { siteId } = filters;
        const kpiNames = new Set<string>(GlobalMemoryStore.metrics.filter((m: any) => m.siteId === siteId).map((m: any) => m.kpiName));

        const catalogDef: Record<string, { name: string; category: string; type: string; unit: string }> = {
            pageLoadTime:     { name: 'Page Load Time',    category: 'Performance',  type: 'latency',    unit: 'ms' },
            errorRatePct:     { name: 'JS Error Rate',     category: 'Performance',  type: 'percentage', unit: '%' },
            activeUsers:      { name: 'Active Users',      category: 'Audience',     type: 'count',      unit: 'users' },
            totalOrders:      { name: 'Total Orders',      category: 'Business',     type: 'count',      unit: 'orders' },
            delayedOrders:    { name: 'Delayed Orders',    category: 'Business',     type: 'count',      unit: 'orders' },
            syncSuccessRate:  { name: 'Sync Success Rate', category: 'Integrations', type: 'percentage', unit: '%' },
            syncSuccessPing:  { name: 'Sync Success Ping', category: 'Integrations', type: 'count',      unit: 'pings' },
            syncFailurePing:  { name: 'Sync Failure Ping', category: 'Integrations', type: 'count',      unit: 'pings' },
            sessionStart:     { name: 'Session Starts',    category: 'Audience',     type: 'count',      unit: 'sessions' },
            lcp:              { name: 'Largest Contentful Paint', category: 'Performance', type: 'latency', unit: 'ms' },
            fcp:              { name: 'First Contentful Paint',   category: 'Performance', type: 'latency', unit: 'ms' },
        };

        return Array.from(kpiNames).map((id: string) => ({
            id,
            ...(catalogDef[id] || { name: id, category: 'Custom', type: 'gauge', unit: '' })
        }));
=======
    static async getIntegrationSystemBreakdown(_filters: MetricFilterDto) {
        // Mocked system list for visualization
        return [
            { name: 'Order Management (OMS)', status: 'Active', latency: '420ms', health: 98 },
            { name: 'ERP Sync (SAP)', status: 'Active', latency: '1200ms', health: 100 },
            { name: 'CRM Connector', status: 'Degraded', latency: '3500ms', health: 82 },
            { name: 'Payment Gateway', status: 'Active', latency: '150ms', health: 100 },
            { name: 'Email Provider', status: 'Offline', latency: 'N/A', health: 0 },
        ];
    }

    static async getMetricsCatalog(filters: MetricFilterDto) {
        return [
            { id: 'pageLoadTime', name: 'Page Load Time', category: 'Performance', type: 'latency', unit: 'ms' },
            { id: 'errorRatePct', name: 'JS Error Rate', category: 'Performance', type: 'percentage', unit: '%' },
            { id: 'activeUsers', name: 'Active Users', category: 'Audience', type: 'count', unit: 'users' },
            { id: 'totalOrders', name: 'Total Orders', category: 'Business', type: 'count', unit: 'orders' },
            { id: 'delayedOrders', name: 'Delayed Orders', category: 'Business', type: 'count', unit: 'orders' },
            { id: 'syncSuccessRate', name: 'Sync Success Rate', category: 'Integrations', type: 'percentage', unit: '%' }
        ];
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }

    static async getMetricsSeries(filters: MetricFilterDto & { kpi: string; range: string }) {
        const { siteId, kpi, range } = filters;
<<<<<<< HEAD
        const now = Date.now();
        const windowMs = range === '1h' ? 3600000 : 86400000 * 7;
        const bucketMs = range === '1h' ? 600000 : 86400000; // 10min or 1day

        const records = GlobalMemoryStore.metrics
            .filter((m: any) => m.siteId === siteId && m.kpiName === kpi && new Date(m.timestamp).getTime() > now - windowMs)
            .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        if (records.length === 0) return [];

        const buckets: Record<string, number[]> = {};
        records.forEach((r: any) => {
            const t = new Date(r.timestamp);
            const key = range === '1h'
                ? `${t.getHours().toString().padStart(2, '0')}:${(Math.floor(t.getMinutes() / 10) * 10).toString().padStart(2, '0')}`
                : t.toLocaleDateString('en-US', { weekday: 'short' });
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(r.value);
        });

        return Object.entries(buckets).map(([timestamp, vals]) => ({
            timestamp,
            value: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
        }));
    }

    static async getGovernanceConfig(filters: MetricFilterDto) {
        const { siteId } = filters;

        // Pull governance config from store if it exists
        const storedConfig = (GlobalMemoryStore as any).governanceConfigs
            ? (GlobalMemoryStore as any).governanceConfigs[siteId]
            : undefined;

        // Pull tenant/project metadata from the projects store
        const project = (GlobalMemoryStore as any).projects
            ? Object.values((GlobalMemoryStore as any).projects as any[]).find((p: any) => p.siteId === siteId || p.id === siteId)
            : undefined;

        // Pull users from store
        const users = (GlobalMemoryStore as any).tenantUsers
            ? (GlobalMemoryStore as any).tenantUsers.filter((u: any) => u.siteId === siteId || u.projectId === siteId)
            : [];

        // Pull API keys
        const apiKeys = (GlobalMemoryStore as any).apiKeys
            ? (GlobalMemoryStore as any).apiKeys.filter((k: any) => k.siteId === siteId)
            : [];

        // Pull latest audit log for versioning context
        const latestAudit = (GlobalMemoryStore.governanceAuditLogs || [])
            .filter((l: any) => l.siteId === siteId)
            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

        return storedConfig || {
            project: {
                id: siteId,
                name: (project as any)?.name || siteId,
                region: (project as any)?.region || 'Default',
                retentionDays: (project as any)?.retentionDays || 90,
                environments: (project as any)?.environments || ['production']
            },
            rbac: {
                roles: users.length > 0
                    ? Array.from(new Set(users.map((u: any) => u.role))).map((role: any) => ({
                        name: role,
                        scopes: role === 'ADMIN' ? ['read:all', 'write:all', 'manage:users'] : ['read:all'],
                        users: users.filter((u: any) => u.role === role).length
                    }))
                    : [],
                users: users.map((u: any) => ({
                    id: u.id,
                    name: u.name || u.email || u.id,
                    role: u.role,
                    lastActive: u.lastActive || 'Unknown'
                }))
            },
            security: {
                apiKeys: apiKeys.map((k: any) => ({
                    id: k.id,
                    name: k.name || k.label,
                    created: k.createdAt || k.created,
                    status: k.status || 'active'
                })),
                mfaRequired: (project as any)?.mfaRequired ?? false,
                allowedIps: (project as any)?.allowedIps || []
            },
            versioning: {
                currentVersion: latestAudit ? `v${latestAudit.version || '1.0.0'}` : 'v1.0.0',
                lastChange: latestAudit ? {
                    who: latestAudit.actor,
                    timestamp: new Date(latestAudit.timestamp).toLocaleString(),
                    change: latestAudit.action
                } : null
            }
        };
    }

    static async updateGovernanceConfig(siteId: string, section: string, data: any) {
        console.log(`[GOVERNANCE] Updating ${section} for site ${siteId}`, data);
        const latestAudit = (GlobalMemoryStore.governanceAuditLogs || [])
            .filter((l: any) => l.siteId === siteId)
            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
        
        return { success: true, updatedVersion: latestAudit ? `v${latestAudit.version || '1.0.0'}` : 'v1.0.0' };
    }

    static async getIncidents(filters: MetricFilterDto) {
        const { siteId } = filters;
        const { IncidentService } = require('./incident.service');
        const incidents = IncidentService.getActiveIncidents(siteId);
        
        return incidents.map((inc: any) => ({
            id: inc.id,
            title: inc.title,
            status: inc.status,
            severity: inc.severity,
            createdAt: inc.createdAt,
            impact: inc.impact || 'Detected by signal analysis',
            owner: inc.owner || 'On-Call Rotation'
        }));
    }
}
=======
        // Mocking generic series data based on requested KPI and range
        const labels = range === '1h' 
            ? ['12:00', '12:10', '12:20', '12:30', '12:40', '12:50']
            : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        
        let avg = 100;
        if (kpi === 'pageLoadTime') avg = getAvg(siteId, 'pageLoadTime') || 2500;
        if (kpi === 'errorRatePct') avg = 2.5;

        return labels.map((label) => ({
            timestamp: label,
            value: avg + (Math.random() * (avg * 0.2) - (avg * 0.1))
        }));
    }
}
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
