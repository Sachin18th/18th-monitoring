import { PerformanceHandler } from '../handlers/performance.handler';
import { UserHandler } from '../handlers/user.handler';
import { OrderHandler } from '../handlers/order.handler';
import { IntegrationHandler } from '../handlers/integration.handler';

const processedEvents = new Map<string, number>();

// Clean up idempotency cache periodically to prevent OOM
setInterval(() => {
    const now = Date.now();
    for (const [id, timestamp] of processedEvents.entries()) {
        // Keep events for 10 minutes for deduping
        if (now - timestamp > 600 * 1000) processedEvents.delete(id);
    }
}, 60 * 1000);

export const EventRegistry = {
    async route(msg: any) {
        const payload = msg?.value;
        if (!payload?.eventType || !payload?.eventId) {
            console.warn('[EventRegistry] Skipping invalid message (missing type or id)');
            return;
        }

        // ── Idempotency Guard ──────────────────────────────────────────
        // (PROD): Use Redis for distributed deduplication across processor instances
        if (processedEvents.has(payload.eventId)) {
            console.warn(`[EventRegistry] Dropping duplicate event: ${payload.eventId}`);
            return;
        }
        processedEvents.set(payload.eventId, Date.now());

        const siteId = payload.siteId || 'unknown';
        console.log(`[EventRegistry] Routing: ${payload.eventType} → siteId:${siteId}`);

        switch (payload.eventType) {
            // ── Performance Domain ─────────────────────────────────────
            case 'js_error':
            case 'api_failure':
            case 'browser_metric':
                await PerformanceHandler.handle(msg);
                break;

            // ── page_view feeds BOTH performance + user activity ───────
            case 'page_view':
                await PerformanceHandler.handle(msg);   // Records loadTime KPI
                await UserHandler.handle(msg);          // Records activeUsers, pageViews
                break;

            // ── User Activity Domain ──────────────────────────────────
            case 'session_start':
            case 'session_end':
            case 'click':
            case 'user_activity':
                await UserHandler.handle(msg);
                break;

            // ── Order Monitoring Domain ───────────────────────────────
            case 'order_placed':
            case 'order_processed':
                await OrderHandler.handle(msg);
                break;

            // ── Integration monitoring Domain ─────────────────────────
            case 'oms_sync':
            case 'oms_sync_failed':
            case 'csv_upload':
                await IntegrationHandler.handle(msg);
                break;

            default:
                console.log(`[EventRegistry] Unhandled event type: ${payload.eventType}`);
                break;
        }
    }
};
