import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';

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
        const orders = Array.from(GlobalMemoryStore.orders.values())
            .filter(o => o.siteId === siteId);

        // Apply Multi-Dimensional Filters
        const filteredOrders = orders.filter(o => {
            if (filters.channel && o.channel !== filters.channel) return false;
            if (filters.lifecycleState && o.lifecycleState !== filters.lifecycleState) return false;
            if (filters.startDate && new Date(o.placedAt) < new Date(filters.startDate)) return false;
            return true;
        });

        // 1. Revenue Computation (Transactional Truth)
        // NOTE: seed data uses `amount`; production adapters may use `totalAmount`
        const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.amount || o.totalAmount || 0), 0);
        
        // 2. AOV (Average Order Value)
        const aov = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0;
        
        // 3. Tax (optional field — zero if not present)
        const totalTax = filteredOrders.reduce((sum, o) => sum + (o.taxAmount || o.tax || 0), 0);

        return {
            revenue: Math.round(totalRevenue * 100) / 100,
            orderCount: filteredOrders.length,
            aov: Math.round(aov * 100) / 100,
            taxTotal: Math.round(totalTax * 100) / 100,
            metadata: {
                sampleSize: filteredOrders.length,
                filteredBy: Object.keys(filters)
            }
        };
    }

    /**
     * Internal Performance Telemetry (API & DB Latency)
     */
    public static async getSystemPerformance(siteId: string) {
        const metrics = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId);
        
        // Priority 1: Browser Page Load (The most direct User Experience KPI)
        const browserLoadTimes = metrics.filter(m => m.kpiName === 'pageLoadTime');
        const avgPageLoad = browserLoadTimes.length > 0 
            ? browserLoadTimes.reduce((s, m) => s + m.value, 0) / browserLoadTimes.length
            : 0;

        // Priority 2: API Gateway Latency (Back-of-house performance)
        const apiLatency = metrics.filter(m => ['api_request_duration', 'apiLatencyAverage'].includes(m.kpiName));
        const avgApiLatency = apiLatency.length > 0 
            ? apiLatency.reduce((s, m) => s + m.value, 0) / apiLatency.length 
            : 0;

        // Uptime: derived from health check pings
        const totalChecks = metrics.filter(m => ['healthCheckSuccess', 'healthCheckFail', 'syncSuccessPing', 'syncFailurePing'].includes(m.kpiName)).length;
        const failedChecks = metrics.filter(m => ['healthCheckFail', 'syncFailurePing'].includes(m.kpiName)).length;
        const uptime = totalChecks > 0 ? Math.round(((totalChecks - failedChecks) / totalChecks) * 10000) / 100 : 100;

        // Error rate: derived from error rate metrics or error count vs total
        const errorMetrics = metrics.filter(m => m.kpiName === 'errorRatePct');
        const errorRate = errorMetrics.length > 0
            ? Math.round(errorMetrics.reduce((s, m) => s + m.value, 0) / errorMetrics.length * 100) / 100
            : 0;

        return {
            avgLatencyMs: Math.round(avgPageLoad || avgApiLatency),
            uptime,
            errorRate
        };
    }
}
