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
    }

    static async getPerformanceSummary(filters: MetricFilterDto) {
        const { siteId } = filters;
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
        return regions;
    }

    static async getDeviceSegmentation(filters: MetricFilterDto) {
        return [
            { name: 'Mobile', value: 62, color: 'var(--accent-blue)' },
            { name: 'Desktop', value: 35, color: 'var(--accent-green)' },
            { name: 'Tablet', value: 3, color: 'var(--accent-purple)' },
        ];
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
        // Mocking trend data for the last 6 points
        const labels = ['12:00', '12:10', '12:20', '12:30', '12:40', '12:50'];
        const avg = getAvg(siteId, 'pageLoadTime') || 2500;
        
        return labels.map((label, i) => ({
            timestamp: label,
            pageLoadTime: avg + (Math.random() * 200 - 100),
            ttfb: (avg * 0.2) + (Math.random() * 50 - 25),
            fcp: (avg * 0.4) + (Math.random() * 100 - 50),
            lcp: (avg * 0.8) + (Math.random() * 150 - 75),
        }));
    }

    static async getSlowestPages(filters: MetricFilterDto) {
        const { siteId } = filters;
        const records = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === 'pageLoadTime');
        
        // Group by URL and average
        const urlMap: Record<string, { total: number, count: number }> = {};
        records.forEach(r => {
            const url = r.dimensions?.url || '/unknown';
            if (!urlMap[url]) urlMap[url] = { total: 0, count: 0 };
            urlMap[url].total += r.value;
            urlMap[url].count += 1;
        });

        return Object.entries(urlMap)
            .map(([url, data]) => ({
                url,
                avgLoadTime: Math.round(data.total / data.count),
                status: (data.total / data.count) > 4000 ? 'critical' : (data.total / data.count) > 3000 ? 'warning' : 'healthy'
            }))
            .sort((a, b) => b.avgLoadTime - a.avgLoadTime)
            .slice(0, 5);
    }

    static async getUserActivitySummary(filters: MetricFilterDto) {
        const { siteId } = filters;
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
        };
    }

    static async getUserTrends(filters: MetricFilterDto) {
        const { siteId } = filters;
        const labels = ['12:00', '12:10', '12:20', '12:30', '12:40', '12:50'];
        const sessionsBase = getCount(siteId, 'sessionsPerMinuteIncrement') || 10;
        
        return labels.map((label) => ({
            timestamp: label,
            sessions: sessionsBase + Math.floor(Math.random() * 5),
            activeUsers: (sessionsBase * 2.5) + Math.floor(Math.random() * 10),
            pageViews: (sessionsBase * 4) + Math.floor(Math.random() * 20),
        }));
    }


    static async getUserAnalytics(filters: MetricFilterDto) {
        const { siteId } = filters;
        const now = Date.now();
        const activeWindow = 5 * 60 * 1000; // 5 minutes

        const allSessions = Array.from(GlobalMemoryStore.sessions.values())
            .filter(s => s.siteId === siteId);

        const activeSessions = allSessions.filter(s => {
            const lastActive = new Date(s.lastActiveAt).getTime();
            return (now - lastActive) <= activeWindow;
        });

        const deviceBreakdown: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 };
        const browserBreakdown: Record<string, number> = { chrome: 0, safari: 0, edge: 0, firefox: 0, other: 0 };
        
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
            },
            browserBreakdown: Object.entries(browserBreakdown).map(([name, count]) => ({
                name,
                count,
                percentage: activeSessions.length ? Math.round((count / activeSessions.length) * 100) : 0
            })).sort((a,b) => b.count - a.count)
        };
    }


    static async getTopPages(filters: MetricFilterDto) {
        const { siteId } = filters;
        const records = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === 'userPageViewCount');
        
        const urlMap: Record<string, number> = {};
        records.forEach(r => {
            const url = r.dimensions?.url || '/';
            urlMap[url] = (urlMap[url] || 0) + 1;
        });

        return Object.entries(urlMap)
            .map(([url, count]) => ({ url, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }

    static async getFunnelData(_filters: MetricFilterDto) {
        // Mocked funnel for visualization
        return [
            { step: 'Landing Page', count: 1200, percentage: 100 },
            { step: 'Product View', count: 850, percentage: 70 },
            { step: 'Add to Cart', count: 320, percentage: 26 },
            { step: 'Checkout', count: 180, percentage: 15 },
            { step: 'Purchase', count: 110, percentage: 9 }
        ];
    }

    /**
     * Collates complex order aggregation metrics including delays, channels, and total volumes.
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
        };
    }

    static async getOrderTrends(filters: MetricFilterDto) {
        const { siteId } = filters;
        const labels = Array.from({ length: 6 }, (_, i) => `${10 + i}:00`);
        const base = 50;
        
        return labels.map((label, i) => ({
            timestamp: label,
            online: base + Math.floor(Math.random() * 20) + (i === 4 ? -30 : 0), // Drop in 12:40 for RCA demo
            offline: 15 + Math.floor(Math.random() * 10)
        }));
    }

    static async getOrderRCA(filters: MetricFilterDto) {
        const { siteId } = filters;
        const anomalies = [];
        
        // 1. Check for Performance Correlation
        const p95Latency = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === 'pageLoadTime');
        const avgLatency = p95Latency.reduce((acc, m) => acc + m.value, 0) / (p95Latency.length || 1);
        
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
        const syncFailures = GlobalMemoryStore.integrationSyncs.filter(s => s.siteId === siteId && s.status === 'failure');
        if (syncFailures.length > 0) {
            anomalies.push({
                type: 'Integration Failure',
                metric: 'OMS Sync Health',
                value: `${syncFailures.length} failed attempts`,
                impact: 'Offline order ingestion blocked',
                confidence: 0.95
            });
        }

        // 3. Check for JS Errors
        const jsErrors = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === 'errorRateIncrement');
        if (jsErrors.length > 3) {
            anomalies.push({
                type: 'Frontend Stability',
                metric: 'JS Error Rate',
                value: `${jsErrors.length} spikes`,
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
        return Array.from(GlobalMemoryStore.orders.entries())
            .filter(([_, o]) => o.siteId === siteId && o.status === 'placed')
            .map(([orderId, o]) => ({
                orderId,
                placedAt: o.placedAt,
                channel: o.channel,
                minutesDelayed: Math.floor((new Date().getTime() - new Date(o.placedAt).getTime()) / 60000) || 1
            }))
            .slice(0, 10);
    }

    static async getOrderSourceBreakdown(filters: MetricFilterDto) {
        const { siteId } = filters;
        const orders = Array.from(GlobalMemoryStore.orders.values()).filter(o => o.siteId === siteId);
        
        const channels: Record<string, number> = { 'Web': 0, 'Mobile': 0, 'POS': 0, 'API': 0 };
        orders.forEach(o => {
            const ch = o.channel.charAt(0).toUpperCase() + o.channel.slice(1);
            channels[ch] = (channels[ch] || 0) + 1;
        });

        return Object.entries(channels).map(([name, value]) => ({ name, value }));
    }

    static async getIntegrationHealthSummary(filters: MetricFilterDto) {
        const { siteId } = filters;
        const totalSuccessful = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === 'syncSuccessPing').length || 450;
        const totalFailed = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === 'syncFailurePing').length || 12;
        const total = totalSuccessful + totalFailed;
        
        return {
            successRate: total > 0 ? Math.round((totalSuccessful / total) * 100) : 98,
            failureCount24h: totalFailed,
            avgOmsLatency: 420, // Mocked ms
            healthScore: 95, // Mocked percentage
        };
    }

    static async getSyncTrends(filters: MetricFilterDto) {
        const { siteId } = filters;
        const labels = ['12:00', '12:10', '12:20', '12:30', '12:40', '12:50'];
        
        return labels.map((label) => ({
            timestamp: label,
            success: 80 + Math.floor(Math.random() * 20),
            failure: Math.floor(Math.random() * 5),
        }));
    }

    static async getFailedSyncs(filters: MetricFilterDto) {
        const { siteId } = filters;
        return GlobalMemoryStore.metrics
            .filter(m => m.siteId === siteId && m.kpiName === 'syncFailurePing')
            .map((m, idx) => ({
                id: `f_${idx}_${m.timestamp?.slice(11, 19)?.replace(/:/g, '') || Math.random().toString(36).slice(2, 7)}`,
                system: m.dimensions?.systemName || 'OMS',
                error: m.dimensions?.details || 'Connection timed out',
                timestamp: m.timestamp || new Date().toISOString()
            }))
            .slice(0, 5);
    }

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
    }

    static async getMetricsSeries(filters: MetricFilterDto & { kpi: string; range: string }) {
        const { siteId, kpi, range } = filters;
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
