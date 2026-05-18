import { BaseEvent } from '../../../../packages/shared-types/src';
import { KafkaPublisherAdapter } from '../../../../packages/streaming/src';
import { EventTransformer } from './transformer.service';
import { AlertEngine } from './alert-engine.service';
import { IncidentService } from './incident.service';
import { NotificationService } from './notification.service';
import { TOPICS } from '../config/topics';

const publisher = new KafkaPublisherAdapter();

export class IngestionService {
    static async processBrowserEvents(siteId: string, events: BaseEvent[]) {
        try {
            const processedEvents = [];
            for (const event of events) {
                const message = EventTransformer.normalize(siteId, event);
                
                // Proactive Alerting & Incident Check
                const alert = await AlertEngine.evaluateEvent(message.value);
                if (alert) {
                    await IncidentService.handleAlert(alert);
                    await NotificationService.notify(alert);
                }
                processedEvents.push(message);
            }

            const success = await publisher.publishBatch(TOPICS.BROWSER_EVENTS, processedEvents);

            if (!success) {
                console.warn(`[IngestionService] Fallback to dead-lettering for site: ${siteId}`);
                await publisher.publishBatch(TOPICS.DEAD_LETTER, processedEvents);
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
            const processedEvents = [];
            for (const event of events) {
                const message = EventTransformer.normalize(siteId, event);
                
                // Proactive Alerting & Incident Check
                const alert = await AlertEngine.evaluateEvent(message.value);
                if (alert) {
                    await IncidentService.handleAlert(alert);
                    await NotificationService.notify(alert);
                }
                processedEvents.push(message);
            }

            const success = await publisher.publishBatch(TOPICS.SERVER_EVENTS, processedEvents);

            if (!success) {
                console.warn(`[IngestionService] Server events failed publish. Sending to DLQ. Site: ${siteId}`);
                await publisher.publishBatch(TOPICS.DEAD_LETTER, processedEvents);
            }

            console.log(`[IngestionService] Handed off ${events.length} server events (Site: ${siteId})`);
            return { success, processedCount: events.length, topic: TOPICS.SERVER_EVENTS };
        } catch (err) {
            console.error('[IngestionService] Fatal pipeline error processing server events', err);
            throw err;
        }
    }

    static async processBackendMetrics(siteId: string, events: BaseEvent[]) {
        try {
            const processedEvents = [];
            for (const event of events) {
                const message = EventTransformer.normalize(siteId, event);
                
                // Proactive Alerting & Incident Check
                const alert = await AlertEngine.evaluateEvent(message.value);
                if (alert) {
                    await IncidentService.handleAlert(alert);
                    await NotificationService.notify(alert);
                }
                processedEvents.push(message);
            }

            const success = await publisher.publishBatch(TOPICS.BACKEND_METRICS, processedEvents);

            if (!success) {
                // Silently fail or send to DLQ if critical
                await publisher.publishBatch(TOPICS.DEAD_LETTER, processedEvents);
            }

            return { success, processedCount: events.length, topic: TOPICS.BACKEND_METRICS };
        } catch (err) {
            console.error('[IngestionService] Failed to process backend metrics', err);
            return { success: false, error: (err as Error).message };
        }
    }
}
