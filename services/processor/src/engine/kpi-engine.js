"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KpiEngine = void 0;
const aggregation_service_1 = require("./aggregation.service");
const src_1 = require("../../../../packages/db/src");
/**
 * KPI Computation Service. Exposes clear APIs translating business logic inputs to metrics.
 *
 * TODO: Implement percentile-based metrics (P95, P99) for all performance KPIs.
 * TODO: Integrate Geo-performance segmentation based on IP/Region metadata.
 */
class KpiEngine {
    // --- Performance KPIs ---
    static async recordPageLoad(siteId, loadTimeMs, url) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'pageLoadTime', loadTimeMs, { url });
    }
    static async recordError(siteId, type, details) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'errorRateIncrement', 1, { type, details });
    }
    // --- User KPIs ---
    static async recordSessionActivity(siteId, sessionId, action) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'activeUsersIncrement', 1, { sessionId, action });
        if (action === 'start') {
            await aggregation_service_1.AggregationService.recordKpi(siteId, 'sessionsPerMinuteIncrement', 1);
        }
    }
    static async updateSessionState(siteId, sessionId, metadata) {
        const session = src_1.GlobalMemoryStore.sessions.get(sessionId) || {
            sessionId,
            siteId,
            createdAt: new Date().toISOString()
        };
        src_1.GlobalMemoryStore.sessions.set(sessionId, {
            ...session,
            ...metadata,
            lastActiveAt: new Date().toISOString()
        });
    }
    static async recordClick(siteId, sessionId, elementId) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'userClickCount', 1, { sessionId, elementId });
    }
    static async recordPageViewForUser(siteId, sessionId, url) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'userPageViewCount', 1, { sessionId, url });
    }
    static async recordBouncePlaceholder(siteId, sessionId) {
        // Placeholder for bounce calculation logic
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'bounceEvent', 1, { sessionId });
    }
    static async recordFunnelStep(siteId, sessionId, stepName) {
        // Placeholder for funnel tracking
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'funnelStepIncrement', 1, { sessionId, step: stepName });
    }
    static async recordOrder(siteId, orderId, success, channel = 'web') {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'ordersPerMinuteIncrement', 1, { success: String(success), orderId, channel });
    }
    static async recordOrderLifecycle(siteId, orderId, status) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'orderStatusTransition', 1, { orderId, status });
    }
    static async recordDelayedOrderCorrelation(siteId, orderId) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'delayedOrdersCount', 1, { orderId });
    }
    static async recordOrderSource(siteId, orderId, source) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'orderSourceTrack', 1, { orderId, source });
    }
    // --- Integration KPIs ---
    static async recordOmsSync(siteId, success, errorMessage) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, success ? 'syncSuccessPing' : 'syncFailurePing', 1, { details: errorMessage });
    }
    static async recordCsvUpload(siteId, success, filename) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'csvUploadStatus', success ? 1 : 0, { filename });
    }
    static async recordIntegrationLatency(siteId, latencyMs, systemName = 'OMS') {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'integrationLatencyMs', latencyMs, { systemName });
    }
    static async recordApiLatency(siteId, latencyMs) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'apiLatencyAverage', latencyMs);
    }
    static async recordTTFB(siteId, value) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'ttfb', value);
    }
    static async recordFCP(siteId, value) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'fcp', value);
    }
    static async recordLCP(siteId, value) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'lcp', value);
    }
    static async recordCLS(siteId, value) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'cls', value);
    }
    static async recordFID(siteId, value) {
        await aggregation_service_1.AggregationService.recordKpi(siteId, 'fid', value);
    }
}
exports.KpiEngine = KpiEngine;
