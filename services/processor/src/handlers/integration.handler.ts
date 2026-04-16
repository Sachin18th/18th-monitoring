import { KpiEngine } from '../engine/kpi-engine';

export class IntegrationHandler {
    static async handle(event: any) {
        const { siteId, eventType, metadata } = event.value;

        if (eventType === 'oms_sync') {
            await KpiEngine.recordOmsSync(siteId, true);
        } else if (eventType === 'oms_sync_failed') {
            await KpiEngine.recordOmsSync(siteId, false, metadata?.error);
        } else if (eventType === 'csv_upload') {
            await KpiEngine.recordCsvUpload(siteId, metadata?.success ?? true, metadata?.filename);
        } else if (eventType === 'api_failure') {
            await KpiEngine.recordApiLatency(siteId, metadata?.latencyMs || 0); // Simplified integration failure tracking
        }
    }
}
