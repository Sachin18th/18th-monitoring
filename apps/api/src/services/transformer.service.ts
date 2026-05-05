<<<<<<< HEAD
import { BaseEvent } from '../../../../packages/shared-types/src';
import { PublishMessage } from '../../../../packages/streaming/src';
import { FailureClassifier } from '../utils/failure-classifier';
=======
﻿import { BaseEvent } from '../../../../packages/shared-types/src';
import { PublishMessage } from '../../../../packages/streaming/src';
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb

export class EventTransformer {
    /**
     * Normalizes a raw BaseEvent payload into a standard streaming payload.
     * Injects system-level timestamps and sets up partitioning strategy.
     */
    static normalize(siteId: string, event: BaseEvent): PublishMessage {
        // 1. Add ingestion timestamp for latency monitoring
<<<<<<< HEAD
        let enrichedEvent: any = {
=======
        const enrichedEvent = {
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
            ...event,
            siteId,                     // Enforce explicit tagging
            ingestedAt: new Date().toISOString()
        };

<<<<<<< HEAD
        // Phase 3: Apply failure intelligence if relevant
        if (event.eventType === 'js_error' || event.eventType === 'business_failure' || (event.eventType === 'backend_performance' && event.metadata?.status >= 400)) {
            const classification = FailureClassifier.classify(event.eventType, event.metadata);
            enrichedEvent = {
                ...enrichedEvent,
                failureIntelligence: classification
            };
        }

=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
        // 2. Select partitioning key 
        // Using siteId enforces strict ordering of events per environment in Kafka
        const partitionKey = siteId;

        return {
            key: partitionKey,
            value: enrichedEvent
        };
    }

<<<<<<< HEAD
    static transform(siteId: string, event: BaseEvent): any {
        return this.normalize(siteId, event).value;
    }

    static normalizeBatch(siteId: string, events: BaseEvent[]): PublishMessage[] {
        return events.map(e => this.normalize(siteId, e));
    }
}
=======
    static normalizeBatch(siteId: string, events: BaseEvent[]): PublishMessage[] {
        return events.map(e => this.normalize(siteId, e));
    }
}
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
