// import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { getSiteDataPlaneClient } from '../lib/tenant-prisma';

/**
 * AnalyticsEngine
 * 
 * Objective: 
 * Standardized computation of business KPIs from Canonical Data.
 * Supports multi-dimensional filtering (Region, Channel, etc.).
 */
export class AnalyticsEngine {
    
    /**
     * Calculates summary KPIs for a project with optional filters.
     */
    public static async getSummaryKpis(siteId: string, filters: any = {}) {
        // Determine date range
        let startDate = filters.startDate ? new Date(filters.startDate) : null;
        let endDate = filters.endDate ? new Date(filters.endDate) : new Date();

        if (filters.previousPeriod && startDate && endDate) {
            const duration = endDate.getTime() - startDate.getTime();
            endDate = new Date(startDate.getTime());
            startDate = new Date(startDate.getTime() - duration);
        }

        // Query CanonicalOrder from DB
        const whereClause: any = { siteId };
        if (filters.channel) whereClause.channel = filters.channel;
        if (filters.lifecycleState) whereClause.lifecycleState = filters.lifecycleState;
        if (startDate) whereClause.placedAt = { gte: startDate };
        if (endDate) whereClause.placedAt = { ...whereClause.placedAt, lte: endDate };

        const db = await getSiteDataPlaneClient(siteId);
        const orders = await db.canonicalOrder.findMany({
            where: whereClause,
            select: {
                totalAmount: true,
                taxAmount: true,
                channel: true,
                lifecycleState: true,
                placedAt: true
            }
        });

        // 1. Revenue Computation
        const totalRevenue = orders.reduce((sum: number, o: any) => sum + Number(o.totalAmount || 0), 0);

        // 2. AOV (Average Order Value)
        const aov = orders.length > 0 ? totalRevenue / orders.length : 0;

        // 3. Tax
        const totalTax = orders.reduce((sum: number, o: any) => sum + Number(o.taxAmount || 0), 0);

        return {
            revenue: Math.round(totalRevenue * 100) / 100,
            orderCount: orders.length,
            aov: Math.round(aov * 100) / 100,
            taxTotal: Math.round(totalTax * 100) / 100,
            metadata: {
                sampleSize: orders.length,
                filteredBy: Object.keys(filters)
            }
        };
    }

    /**
     * Internal Performance Telemetry (API & DB Latency)
     */
    public static async getSystemPerformance(siteId: string) {
        // Query KpiValue for performance metrics
        // kpiValue table removed — query neutralized
        const kpis: any[] = [];

        // Priority 1: Browser Page Load
        const browserLoadTimes = kpis.filter(m => m.kpiName === 'pageLoadTime');
        const avgPageLoad = browserLoadTimes.length > 0 
            ? browserLoadTimes.reduce((s, m) => s + Number(m.kpiValue), 0) / browserLoadTimes.length
            : 0;

        // Priority 2: API Gateway Latency
        const apiLatency = kpis.filter(m => ['api_request_duration', 'apiLatencyAverage'].includes(m.kpiName));
        const avgApiLatency = apiLatency.length > 0 
            ? apiLatency.reduce((s, m) => s + Number(m.kpiValue), 0) / apiLatency.length 
            : 0;

        // Uptime: from health-related KPIs
        const healthKpis = kpis.filter(m => ['healthCheckSuccess', 'healthCheckFail', 'syncSuccessPing', 'syncFailurePing'].includes(m.kpiName));
        const totalChecks = healthKpis.length;
        const failedChecks = kpis.filter(m => ['healthCheckFail', 'syncFailurePing'].includes(m.kpiName)).length;
        const uptime = totalChecks > 0 ? Math.round(((totalChecks - failedChecks) / totalChecks) * 10000) / 100 : 100;

        // Error rate
        const errorMetrics = kpis.filter(m => m.kpiName === 'errorRatePct');
        const errorRate = errorMetrics.length > 0
            ? Math.round(errorMetrics.reduce((s, m) => s + Number(m.kpiValue), 0) / errorMetrics.length * 100) / 100
            : 0;

        return {
            avgLatencyMs: Math.round(avgPageLoad || avgApiLatency),
            uptime,
            errorRate
        };
    }
}
