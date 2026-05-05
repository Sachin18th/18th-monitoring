import { OutboundEventService, OutboundEventType } from './outbound-event.service';

export class OutboundBridge {
    /**
     * Translates internal system events (Alerts, Ingestion failures, etc.) 
     * into normalized outbound events for external subscribers.
     */
    static async handleInternalEvent(internalEvent: any) {
        console.log(`[OutboundBridge] Processing internal event: ${internalEvent.type || internalEvent.kpiName || 'generic'}`);

        let outboundType: OutboundEventType = 'config.changed'; // Default/Fallback
        let payload = internalEvent;

        // 1. Mapping Alert Engine Events
        if (internalEvent.alertId) {
            outboundType = internalEvent.status === 'resolved' ? 'alert.resolved' : 'alert.triggered';
            payload = {
                alertId: internalEvent.alertId,
                severity: internalEvent.severity,
                message: internalEvent.message,
                kpiName: internalEvent.kpiName,
                module: internalEvent.module,
                triggeredAt: internalEvent.triggeredAt
            };
        }

        // 2. Mapping Order/Business Events
        else if (internalEvent.eventType === 'order_delayed') {
            outboundType = 'order.delayed';
        }
        else if (internalEvent.eventType === 'order_mismatched') {
            outboundType = 'order.mismatched';
        }

        // 3. Mapping Ingestion/Integration Health
        else if (internalEvent.eventType === 'connector_failed') {
            outboundType = 'connector.failed';
        }

        // Emit to the Outbound Event Service (which calculates subscribers and dispatches)
        await OutboundEventService.emit({
            siteId: internalEvent.siteId || 'store_001',
            type: outboundType,
            payload,
            correlationId: internalEvent.correlationId || internalEvent.traceId
        });
    }
}
