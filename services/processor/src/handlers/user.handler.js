"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserHandler = void 0;
const kpi_engine_1 = require("../engine/kpi-engine");
class UserHandler {
    static async handle(event) {
        const { siteId, eventType, sessionId, metadata } = event.value;
        if (!sessionId)
            return;
        // Update stateful session tracking
        await kpi_engine_1.KpiEngine.updateSessionState(siteId, sessionId, {
            userId: metadata.userId,
            isCustomer: !!metadata.userId,
            deviceType: metadata.deviceType || 'desktop',
            browser: metadata.browser || 'chrome'
        });
        switch (eventType) {
            case 'session_start':
                await kpi_engine_1.KpiEngine.recordSessionActivity(siteId, sessionId, 'start');
                break;
            case 'session_end':
                await kpi_engine_1.KpiEngine.recordSessionActivity(siteId, sessionId, 'end');
                break;
            case 'page_view':
                await kpi_engine_1.KpiEngine.recordPageViewForUser(siteId, sessionId, metadata.url);
                await kpi_engine_1.KpiEngine.recordSessionActivity(siteId, sessionId, 'active');
                break;
            case 'click':
                await kpi_engine_1.KpiEngine.recordClick(siteId, sessionId, metadata.elementId || 'unknown');
                await kpi_engine_1.KpiEngine.recordSessionActivity(siteId, sessionId, 'active');
                break;
            case 'user_activity':
            case 'session_heartbeat':
                await kpi_engine_1.KpiEngine.recordSessionActivity(siteId, sessionId, 'active');
                break;
            default:
                await kpi_engine_1.KpiEngine.recordSessionActivity(siteId, sessionId, 'active');
                break;
        }
    }
}
exports.UserHandler = UserHandler;
