"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationHandler = void 0;
const kpi_engine_1 = require("../engine/kpi-engine");
class IntegrationHandler {
    static async handle(event) {
        const { siteId, eventType, metadata } = event.value;
        if (eventType === 'oms_sync') {
            await kpi_engine_1.KpiEngine.recordOmsSync(siteId, true);
        }
        else if (eventType === 'oms_sync_failed') {
            await kpi_engine_1.KpiEngine.recordOmsSync(siteId, false, metadata?.error);
        }
        else if (eventType === 'csv_upload') {
            await kpi_engine_1.KpiEngine.recordCsvUpload(siteId, metadata?.success ?? true, metadata?.filename);
        }
        else if (eventType === 'api_failure') {
            await kpi_engine_1.KpiEngine.recordApiLatency(siteId, metadata?.latencyMs || 0); // Simplified integration failure tracking
        }
    }
}
exports.IntegrationHandler = IntegrationHandler;
