import { BaseEvent } from '../../../../packages/shared-types/src';
import { PublishMessage } from '../../../../packages/streaming/src';

export class EventTransformer {
    /**
     * Normalizes a raw BaseEvent payload into a standard streaming payload.
     * Injects system-level timestamps and sets up partitioning strategy.
     */
    static normalize(siteId: string, event: BaseEvent): PublishMessage {
        // 1. Add ingestion timestamp for latency monitoring
        const enrichedEvent = {
            ...event,
            siteId,                     // Enforce explicit tagging
            ingestedAt: new Date().toISOString()
        };

        // 2. Select partitioning key 
        // Using siteId enforces strict ordering of events per environment in Kafka
        const partitionKey = siteId;

        return {
            key: partitionKey,
            value: enrichedEvent
        };
    }

    static normalizeBatch(siteId: string, events: BaseEvent[]): PublishMessage[] {
        return events.map(e => this.normalize(siteId, e));
    }
}
