import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';

/**
 * RollupService
 * 
 * Objective: 
 * Pre-aggregates high-volume raw data into time-series buckets.
 * Dramatically reduces query time for dashboard charts.
 */
export class RollupService {
    
    /**
     * Periodically runs to aggregate orders into hourly buckets.
     */
    public static async generateRollups() {
        const sites = Array.from(GlobalMemoryStore.projects.keys());
        console.log(`[ROLLUP] Aggregating data for ${sites.length} projects.`);

        for (const siteId of sites) {
            await this.rollupProject(siteId);
        }
    }

    private static async rollupProject(siteId: string) {
        const orders = Array.from(GlobalMemoryStore.orders.values())
            .filter(o => o.siteId === siteId);

        // Group by Hour (Truncated timestamp)
        const hourlyBuckets: Record<string, { revenue: number, count: number }> = {};

        orders.forEach(o => {
            const date = new Date(o.placedAt);
            const hourKey = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()} ${date.getHours()}:00`;
            
            if (!hourlyBuckets[hourKey]) hourlyBuckets[hourKey] = { revenue: 0, count: 0 };
            
            hourlyBuckets[hourKey].revenue += (o.totalAmount || 0);
            hourlyBuckets[hourKey].count += 1;
        });

        // Store Rollups (In real DB, this goes to 'performance_rollups' table)
        if (!GlobalMemoryStore.metrics) GlobalMemoryStore.metrics = [];
        
        Object.entries(hourlyBuckets).forEach(([bucket, data]) => {
            GlobalMemoryStore.metrics.push({
                siteId,
                kpiName: 'hourly_revenue_rollup',
                value: data.revenue,
                timestamp: new Date(bucket).toISOString(),
                dimensions: { count: String(data.count), interval: '1h' }
            });
        });

        console.log(`[ROLLUP] Generated ${Object.keys(hourlyBuckets).length} hourly buckets for ${siteId}`);
    }
}
