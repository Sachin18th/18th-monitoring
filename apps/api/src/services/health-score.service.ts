import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';

/**
 * HealthScoreService
 * 
 * Objective: 
 * Calculates the Connector Health Index (CHI).
 * Aggregates signals: Sync Success Rate, Data Quality Score, Latency.
 */
export class HealthScoreService {
    
    public static async calculateInstanceHealth(siteId: string, providerId: string): Promise<number> {
        // 1. Sync Success Signal (40%)
        const syncs = GlobalMemoryStore.integrationSyncs.filter(s => s.siteId === siteId && s.system === providerId);
        const successRate = syncs.length > 0 
            ? syncs.filter(s => s.status === 'success').length / syncs.length 
            : 1;

        // 2. Data Quality Signal (40%)
        const orders = Array.from(GlobalMemoryStore.orders.values())
            .filter(o => o.siteId === siteId && o.sourceSystem === providerId);
        const avgQuality = orders.length > 0 
            ? orders.reduce((s, o) => s + (o.qualityScore || 100), 0) / orders.length 
            : 100;

        // 3. Freshness Signal (20%)
        const lastSync = syncs.length > 0 ? new Date(syncs[0].timestamp).getTime() : Date.now();
        const stalenessBonus = (Date.now() - lastSync) < 12 * 60 * 60 * 1000 ? 100 : 50;

        // Weighted Aggregation
        const score = (successRate * 40) + (avgQuality * 0.4) + (stalenessBonus * 0.2);
        
        return Math.round(score);
    }
}
