"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregationService = void 0;
const src_1 = require("../../../../packages/db/src");
const rule_evaluator_1 = require("../../../../services/alert-engine/src/evaluator/rule-evaluator");
const db = src_1.DatabaseFactory.getTimeSeriesDb();
class AggregationService {
    static buffer = [];
    static async recordKpi(siteId, kpiName, value, dimensions = {}) {
        const metric = {
            siteId,
            kpiName,
            value,
            timestamp: new Date().toISOString(),
            dimensions: dimensions,
        };
        this.buffer.push(metric);
        // Compute "Current Running Value" for alerting
        // For 'pageLoadTime' we use the raw value. 
        // For counts, we use the total count in memory.
        let valToEvaluate = value;
        if (kpiName === 'errorRatePct' || kpiName === 'oms_sync_failed_count') {
            const records = src_1.GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === kpiName);
            valToEvaluate = records.length + 1; // +1 because current metric isn't flushed yet
        }
        console.log(`[Processor:KPI] Recording ${kpiName} = ${value} (Site: ${siteId}, EvalVal: ${valToEvaluate})`);
        // Evaluate alert rules - do not let alerting failures block metric storage
        try {
            await rule_evaluator_1.RuleEvaluator.evaluate(siteId, kpiName, valToEvaluate, dimensions);
        }
        catch (e) {
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
exports.AggregationService = AggregationService;
