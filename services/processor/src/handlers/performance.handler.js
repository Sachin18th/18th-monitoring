"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceHandler = void 0;
const kpi_engine_1 = require("../engine/kpi-engine");
/**
 * KPI Computation Service. Exposes clear APIs translating business logic inputs to metrics.
 * TODO: Implement percentile-based metrics (P95, P99) for all performance KPIs.
 * TODO: Integrate Geo-performance segmentation based on IP/Region metadata.
 */
class PerformanceHandler {
    static async handle(event) {
        const { siteId, eventType, metadata } = event.value;
        switch (eventType) {
            case 'page_view':
                if (metadata && metadata.loadTime) {
                    await kpi_engine_1.KpiEngine.recordPageLoad(siteId, metadata.loadTime, metadata.url || 'unknown');
                }
                break;
            case 'js_error':
                await kpi_engine_1.KpiEngine.recordError(siteId, 'js', metadata.errorMsg);
                break;
            case 'performance_metrics':
                // TODO: Implement Core Web Vitals enrichment and real-user monitoring (RUM) detailed reports
                if (metadata) {
                    if (metadata.ttfb)
                        await kpi_engine_1.KpiEngine.recordTTFB(siteId, metadata.ttfb);
                    if (metadata.fcp)
                        await kpi_engine_1.KpiEngine.recordFCP(siteId, metadata.fcp);
                    if (metadata.lcp)
                        await kpi_engine_1.KpiEngine.recordLCP(siteId, metadata.lcp);
                    if (metadata.cls)
                        await kpi_engine_1.KpiEngine.recordCLS(siteId, metadata.cls);
                    if (metadata.fid)
                        await kpi_engine_1.KpiEngine.recordFID(siteId, metadata.fid);
                    if (metadata.url)
                        await kpi_engine_1.KpiEngine.recordPageLoad(siteId, metadata.loadTime || 0, metadata.url);
                }
                break;
            // TODO: Add CDN/Backend correlation hooks here to enrich event context
            case 'api_failure':
                await kpi_engine_1.KpiEngine.recordError(siteId, 'api', metadata.endpoint);
                if (metadata.latency) {
                    await kpi_engine_1.KpiEngine.recordApiLatency(siteId, metadata.latency);
                }
                break;
        }
    }
}
exports.PerformanceHandler = PerformanceHandler;
