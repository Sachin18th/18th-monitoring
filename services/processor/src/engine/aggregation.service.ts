import { DatabaseFactory, MetricRecord, GlobalMemoryStore } from '../../../../packages/db/src';
import { RuleEvaluator } from '../../../../services/alert-engine/src/evaluator/rule-evaluator';

const db = DatabaseFactory.getTimeSeriesDb();

export class AggregationService {
    private static buffer: MetricRecord[] = [];

    static async recordKpi(siteId: string, kpiName: string, value: number, dimensions: any = {}) {
        const metric: MetricRecord = {
            siteId,
            kpiName,
            value,
            timestamp:  new Date().toISOString(),
            dimensions: dimensions as Record<string, string>,
        };
        this.buffer.push(metric);
        
        // Compute "Current Running Value" for alerting
        // For 'pageLoadTime' we use the raw value. 
        // For counts, we use the total count in memory.
        let valToEvaluate = value;
        if (kpiName === 'errorRatePct' || kpiName === 'oms_sync_failed_count') {
            const records = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === kpiName);
            valToEvaluate = records.length + 1; // +1 because current metric isn't flushed yet
        }

        console.log(`[Processor:KPI] Recording ${kpiName} = ${value} (Site: ${siteId}, EvalVal: ${valToEvaluate})`);

        // Evaluate alert rules - do not let alerting failures block metric storage
        try {
            await RuleEvaluator.evaluate(siteId, kpiName, valToEvaluate, dimensions);
        } catch (e) {
            console.error(`[Processor:Alert] Alert evaluation failed for ${kpiName}:`, e);
        }

        // Flush to storage
        await this.flush();
    }

    static async flush() {
        if (this.buffer.length > 0) {
            await db.insertBatch(this.buffer);
            this.buffer = [];
        }
    }
}
