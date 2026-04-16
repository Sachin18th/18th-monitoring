import { AggregationService } from './aggregation.service';
import { GlobalMemoryStore } from '../../../../packages/db/src';

/**
 * KPI Computation Service. Exposes clear APIs translating business logic inputs to metrics.
 * 
 * TODO: Implement percentile-based metrics (P95, P99) for all performance KPIs.
 * TODO: Integrate Geo-performance segmentation based on IP/Region metadata.
 */
export class KpiEngine {
    
    // --- Performance KPIs ---
    static async recordPageLoad(siteId: string, loadTimeMs: number, url: string) {
        await AggregationService.recordKpi(siteId, 'pageLoadTime', loadTimeMs, { url });
    }

    static async recordError(siteId: string, type: 'js' | 'api', details: string) {
        await AggregationService.recordKpi(siteId, 'errorRateIncrement', 1, { type, details });
    }

    // --- User KPIs ---
    static async recordSessionActivity(siteId: string, sessionId: string, action: 'start' | 'end' | 'active') {
        await AggregationService.recordKpi(siteId, 'activeUsersIncrement', 1, { sessionId, action });
        if (action === 'start') {
            await AggregationService.recordKpi(siteId, 'sessionsPerMinuteIncrement', 1);
        }
    }

    static async updateSessionState(siteId: string, sessionId: string, metadata: any) {
        const session = GlobalMemoryStore.sessions.get(sessionId) || { 
            sessionId, 
            siteId, 
            createdAt: new Date().toISOString() 
        };

        GlobalMemoryStore.sessions.set(sessionId, {
            ...session,
            ...metadata,
            lastActiveAt: new Date().toISOString()
        });
    }


    static async recordClick(siteId: string, sessionId: string, elementId: string) {
        await AggregationService.recordKpi(siteId, 'userClickCount', 1, { sessionId, elementId });
    }

    static async recordPageViewForUser(siteId: string, sessionId: string, url: string) {
        await AggregationService.recordKpi(siteId, 'userPageViewCount', 1, { sessionId, url });
    }

    static async recordBouncePlaceholder(siteId: string, sessionId: string) {
        // Placeholder for bounce calculation logic
        await AggregationService.recordKpi(siteId, 'bounceEvent', 1, { sessionId });
    }

    static async recordFunnelStep(siteId: string, sessionId: string, stepName: string) {
        // Placeholder for funnel tracking
        await AggregationService.recordKpi(siteId, 'funnelStepIncrement', 1, { sessionId, step: stepName });
    }

    static async recordOrder(siteId: string, orderId: string, success: boolean, channel: string = 'web') {
        await AggregationService.recordKpi(siteId, 'ordersPerMinuteIncrement', 1, { success: String(success), orderId, channel });
    }

    static async recordOrderLifecycle(siteId: string, orderId: string, status: string) {
        await AggregationService.recordKpi(siteId, 'orderStatusTransition', 1, { orderId, status });
    }

    static async recordDelayedOrderCorrelation(siteId: string, orderId: string) {
        await AggregationService.recordKpi(siteId, 'delayedOrdersCount', 1, { orderId });
    }

    static async recordOrderSource(siteId: string, orderId: string, source: 'online' | 'offline') {
        await AggregationService.recordKpi(siteId, 'orderSourceTrack', 1, { orderId, source });
    }

    // --- Integration KPIs ---
    static async recordOmsSync(siteId: string, success: boolean, errorMessage?: string) {
        await AggregationService.recordKpi(siteId, success ? 'syncSuccessPing' : 'syncFailurePing', 1, { details: errorMessage });
    }

    static async recordCsvUpload(siteId: string, success: boolean, filename?: string) {
        await AggregationService.recordKpi(siteId, 'csvUploadStatus', success ? 1 : 0, { filename });
    }

    static async recordIntegrationLatency(siteId: string, latencyMs: number, systemName: string = 'OMS') {
        await AggregationService.recordKpi(siteId, 'integrationLatencyMs', latencyMs, { systemName });
    }

    static async recordApiLatency(siteId: string, latencyMs: number) {
        await AggregationService.recordKpi(siteId, 'apiLatencyAverage', latencyMs);
    }

    static async recordTTFB(siteId: string, value: number) {
        await AggregationService.recordKpi(siteId, 'ttfb', value);
    }

    static async recordFCP(siteId: string, value: number) {
        await AggregationService.recordKpi(siteId, 'fcp', value);
    }

    static async recordLCP(siteId: string, value: number) {
        await AggregationService.recordKpi(siteId, 'lcp', value);
    }

    static async recordCLS(siteId: string, value: number) {
        await AggregationService.recordKpi(siteId, 'cls', value);
    }

    static async recordFID(siteId: string, value: number) {
        await AggregationService.recordKpi(siteId, 'fid', value);
    }
}
