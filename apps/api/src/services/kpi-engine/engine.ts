import { KpiRegistry, KpiDefinition } from './registry';
import { GlobalMemoryStore } from '../../../../../packages/db/src/adapters/in-memory.adapter';
import crypto from 'crypto';

export class KpiEngine {

    /**
     * Executes an event-driven incremental KPI computation.
     * Normally triggered immediately after a Canonical Entity is successfully written via the PipelineWorker.
     */
    public static async computeEventTriggered(siteId: string, tenantId: string, canonicalEntity: string, payload: any) {
        
        // Find all active KPIs relevant to this entity type
        const relevantKpis = KpiRegistry.listDefinitions().filter(def => 
            def.active && def.canonicalEntity === canonicalEntity
        );

        if (relevantKpis.length === 0) return;
        
        console.log(`[KpiEngine] 📊 Triggering KPI computation for ${canonicalEntity} write (Site: ${siteId})`);

        for (const kpi of relevantKpis) {
            try {
                this.executeFormula(kpi, siteId, tenantId, payload);
            } catch (err: any) {
                console.error(`[KpiEngine] ⨯ Failed to compute ${kpi.key}:`, err.message);
            }
        }

        // Phase 8: Trigger alert evaluation after KPI update
        setImmediate(async () => {
            try {
                const { AlertEngine } = require('../alert-engine.service');
                await AlertEngine.evaluateProject(siteId, tenantId);
            } catch (err: any) {
                console.error('[KpiEngine] Alert evaluation failed:', err.message);
            }
        });
    }

    /**
     * Executes the formula and updates the Aggregate Table.
     * In a production environment with Drizzle, this does Upserts against `kpiValues`.
     */
    private static executeFormula(kpi: KpiDefinition, siteId: string, tenantId: string, payload: any) {
        let valueDelta = 0;

        switch (kpi.formula) {
            case 'SUM':
                if (!kpi.targetField || typeof payload[kpi.targetField] !== 'number') return;
                valueDelta = payload[kpi.targetField];
                break;
            case 'COUNT':
                valueDelta = 1;
                break;
            case 'PERCENTAGE':
            case 'AVERAGE':
                // For ratios/averages, we usually store the running numerator & denominator in Aggregation Layer
                // For MVP observation, we'll skip complex implementations
                return;
            default:
                return;
        }

        const now = new Date().toISOString();
        
        // Mock Dimensional Hashing (e.g., separating Web vs POS metrics)
        const dimensions = this.extractDimensions(kpi, payload);
        const dimHash = crypto.createHash('md5').update(JSON.stringify(dimensions)).digest('hex');

        // Locate existing live daily aggregate record
        let aggregateRecord = GlobalMemoryStore.metrics.find(m => 
            m.siteId === siteId && 
            m.kpiName === kpi.key && 
            m.timeWindow === 'daily' &&
            m.timestamp.startsWith(now.split('T')[0]) &&
            JSON.stringify(m.dimensions) === JSON.stringify(dimensions)
        );

        if (aggregateRecord) {
            aggregateRecord.value += valueDelta;
            aggregateRecord.lastUpdated = now;
            aggregateRecord.freshnessStatus = 'live';
        } else {
            GlobalMemoryStore.metrics.push({
                id: `kpi_${crypto.randomUUID()}`,
                siteId: siteId,
                tenantId: tenantId,
                kpiName: kpi.key,
                value: valueDelta,
                timeWindow: 'daily',
                timestamp: now,
                dimensions: dimensions,
                freshnessStatus: 'live',
                lastUpdated: now,
                _dimHash: dimHash 
            } as any);
        }

        console.log(`[KpiEngine] ✓ Updated ${kpi.key} (+${valueDelta}) | Dims: ${JSON.stringify(dimensions)}`);
    }

    private static extractDimensions(kpi: KpiDefinition, payload: any) {
        const dimensions: any = {};
        for (const dim of kpi.supportedDimensions) {
            if (payload[dim] !== undefined) {
                dimensions[dim] = payload[dim];
            }
        }
        return dimensions;
    }
}
