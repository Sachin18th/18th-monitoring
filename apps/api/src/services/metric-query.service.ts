import { metricCatalogService } from './metric-catalog.service';
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { cache, TTL } from '../../../../packages/cache/src';

export class MetricQueryService {
    /**
     * Executes a dynamic query against the EventStore/Memory map 
     * based on the metric definition.
     * Results are cached for TTL.KPI_QUERY (default 30s).
     */
    public async queryMetric(siteId: string, metricKey: string) {
        const CACHE_KEY = `kpi_query:${siteId}:${metricKey}`;
        const hit = await cache.get<any>(CACHE_KEY);
        if (hit) return hit;

        const definition = metricCatalogService.getMetricByKey(metricKey);
        if (!definition) throw new Error(`Metric ${metricKey} not found in catalog.`);

        // For MVP, we query the GlobalMemoryStore directly
        let values: any[] = [];
        
        if (metricKey.startsWith('ORDER_') || metricKey.startsWith('REVENUE_')) {
            const allOrders = Array.from(GlobalMemoryStore.orders.values());
            values = allOrders.filter((o: any) => o.siteId === siteId);
        }

        // Apply filters
        if (definition.filters) {
            for (const [field, allowedValues] of Object.entries(definition.filters)) {
                values = values.filter(o => allowedValues.includes(o[field]));
            }
        }

        // Apply aggregations
        let resultValue = 0;
        if (definition.type === 'count') {
            resultValue = values.length;
        } else if (definition.type === 'value' && definition.field) {
            const nums = values.map(o => Number(o[definition.field] || 0));
            if (definition.aggregation === 'sum') resultValue = nums.reduce((a, b) => a + b, 0);
            if (definition.aggregation === 'avg') resultValue = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
            if (definition.aggregation === 'max') resultValue = Math.max(...nums);
            if (definition.aggregation === 'min') resultValue = Math.min(...nums);
        }

        // Apply groupBy (MVP stub)
        let breakdown: any = null;
        if (definition.groupBy && definition.groupBy.length > 0) {
            breakdown = {};
            const groupField = definition.groupBy[0];
            for (const item of values) {
                const key = item[groupField] || 'unknown';
                if (!breakdown[key]) breakdown[key] = 0;
                
                if (definition.type === 'count') {
                    breakdown[key] += 1;
                } else if (definition.type === 'value' && definition.field) {
                    breakdown[key] += Number(item[definition.field] || 0);
                }
            }
        }

        const result = {
            metricKey,
            siteId,
            timestamp: new Date().toISOString(),
            value: resultValue,
            unit: definition.unit,
            breakdown
        };

        await cache.set(CACHE_KEY, result, TTL.KPI_QUERY);
        return result;
    }

    public async getSourceBreakdown(siteId: string) {
        const allOrders = Array.from(GlobalMemoryStore.orders.values()).filter((o: any) => o.siteId === siteId);
        
        const breakdown: Record<string, { count: number, revenue: number }> = {
            online: { count: 0, revenue: 0 },
            offline: { count: 0, revenue: 0 }
        };

        for (const order of allOrders) {
            const source = ['online', 'offline'].includes(order.source as string) ? order.source as string : 'online';
            breakdown[source].count += 1;
            breakdown[source].revenue += Number(order.amount || order.value || 0); // Handle amount if it was passed via normalization
        }

        return breakdown;
    }
}

export const metricQueryService = new MetricQueryService();
