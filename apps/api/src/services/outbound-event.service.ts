import { OutboundDispatcherService } from './outbound-dispatcher.service';
import crypto from 'crypto';

export type OutboundEventType = 
    | 'order.delayed' | 'order.stuck' | 'order.mismatched' | 'order.reconciled'
    | 'alert.triggered' | 'alert.resolved'
    | 'performance.anomaly_detected' | 'performance.threshold_breached'
    | 'connector.failed' | 'connector.degraded'
    | 'config.changed';

export interface OutboundEventEnvelope<T = any> {
    id: string;
    type: OutboundEventType;
    version: string;
    siteId: string;
    timestamp: string;
    correlationId?: string;
    payload: T;
}

export class OutboundEventService {
    /**
     * Normalizes and emits an event to external subscribers.
     */
    static async emit<T>(params: {
        siteId: string,
        type: OutboundEventType,
        payload: T,
        correlationId?: string
    }) {
        const { siteId, type, payload, correlationId } = params;
        
        const envelope: OutboundEventEnvelope<T> = {
            id: `evt_${crypto.randomUUID().slice(0, 8)}`,
            type,
            version: '1.0',
            siteId,
            timestamp: new Date().toISOString(),
            correlationId,
            payload
        };

        // Fire and forget dispatch
        OutboundDispatcherService.dispatch(siteId, envelope).catch(err => {
            console.error('[OutboundEventService] Failed to dispatch event:', err);
        });

        return envelope.id;
    }
}
