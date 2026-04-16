import { KpiEngine } from '../engine/kpi-engine';

export class UserHandler {
    static async handle(event: any) {
        const { siteId, eventType, sessionId, metadata } = event.value;
        if (!sessionId) return; 

                // Update stateful session tracking
        await KpiEngine.updateSessionState(siteId, sessionId, {
            userId: metadata.userId,
            isCustomer: !!metadata.userId,
            deviceType: metadata.deviceType || 'desktop',
            browser: metadata.browser || 'chrome'
        });

        switch (eventType) {
            case 'session_start':
                await KpiEngine.recordSessionActivity(siteId, sessionId, 'start');
                break;
            case 'session_end':
                await KpiEngine.recordSessionActivity(siteId, sessionId, 'end');
                break;
            case 'page_view':
                await KpiEngine.recordPageViewForUser(siteId, sessionId, metadata.url);
                await KpiEngine.recordSessionActivity(siteId, sessionId, 'active');
                break;
            case 'click':
                await KpiEngine.recordClick(siteId, sessionId, metadata.elementId || 'unknown');
                await KpiEngine.recordSessionActivity(siteId, sessionId, 'active');
                break;
            case 'user_activity':
            case 'session_heartbeat':
                await KpiEngine.recordSessionActivity(siteId, sessionId, 'active');
                break;
            default:
                await KpiEngine.recordSessionActivity(siteId, sessionId, 'active');
                break;
        }
    }
}
