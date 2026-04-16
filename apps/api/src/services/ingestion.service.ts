import { BaseEvent } from '../../../../packages/shared-types/src';
import { KafkaPublisherAdapter } from '../../../../packages/streaming/src';
import { EventTransformer } from './transformer.service';
import { TOPICS } from '../config/topics';

const publisher = new KafkaPublisherAdapter();

export class IngestionService {
    static async processBrowserEvents(siteId: string, events: BaseEvent[]) {
        try {
            const messages = EventTransformer.normalizeBatch(siteId, events);
            const success = await publisher.publishBatch(TOPICS.BROWSER_EVENTS, messages);

            if (!success) {
                console.warn(`[IngestionService] Fallback to dead-lettering for site: ${siteId}`);
                await publisher.publishBatch(TOPICS.DEAD_LETTER, messages);
            }

            console.log(`[IngestionService] Handed off ${events.length} browser events (Site: ${siteId})`);
            return { success, processedCount: events.length, topic: TOPICS.BROWSER_EVENTS };
        } catch (err) {
            console.error('[IngestionService] Fatal pipeline error processing browser events', err);
            throw err;
        }
    }

    static async processServerEvents(siteId: string, events: BaseEvent[]) {
        try {
            const messages = EventTransformer.normalizeBatch(siteId, events);
            const success = await publisher.publishBatch(TOPICS.SERVER_EVENTS, messages);

            if (!success) {
                console.warn(`[IngestionService] Server events failed publish. Sending to DLQ. Site: ${siteId}`);
                await publisher.publishBatch(TOPICS.DEAD_LETTER, messages);
            }

            console.log(`[IngestionService] Handed off ${events.length} server events (Site: ${siteId})`);
            return { success, processedCount: events.length, topic: TOPICS.SERVER_EVENTS };
        } catch (err) {
            console.error('[IngestionService] Fatal pipeline error processing server events', err);
            throw err;
        }
    }
}
