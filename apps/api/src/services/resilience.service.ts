import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';

/**
 * ResilienceService (Retry & DLQ Management)
 * 
 * Objective: 
 * Background-process events from 'ingestionLogs'.
 * Handle failures with exponential backoff / retries.
 * Move persistent failures to the Dead Letter Queue (DLQ).
 */
export class ResilienceService {
    private static MAX_RETRIES = 3;

    /**
     * Simulates the background worker loop.
     * Finds 'PENDING' or 'RETRYING' events and attempts processing.
     */
    static async processPendingEvents() {
        const pendingEvents = GlobalMemoryStore.ingestionLogs.filter(
            e => e.processingStatus === 'PENDING' || e.processingStatus === 'RETRYING'
        );

        console.log(`[RESILIENCE] Found ${pendingEvents.length} events for processing.`);

        for (const event of pendingEvents) {
            await this.handleEvent(event);
        }
    }

    private static async handleEvent(event: any) {
        try {
            // Mock Processing Logic (Normalizing + Storing)
            // In reality, this calls 'NormalizationService.normalize()'
            console.log(`[RESILIENCE] Processing event ${event.eventId} (CID: ${event.correlationId})`);
            
            // Randomly simulate a failure to demonstrate DLQ
            if (Math.random() > 0.8) {
                throw new Error('504 Network Timeout during mapping');
            }

            // Success Path
            event.processingStatus = 'PROCESSED';
            event.processedAt = new Date().toISOString();
            
        } catch (err: any) {
            console.warn(`[RESILIENCE] Processing failed for ${event.eventId}: ${err.message}`);
            
            const retries = (event.retryCount || 0) + 1;
            event.retryCount = retries;
            event.lastError = err.message;

            if (retries >= this.MAX_RETRIES) {
                event.processingStatus = 'DLQ';
                console.error(`[RESILIENCE] event ${event.eventId} MOVED TO DEAD LETTER QUEUE (DLQ)`);
            } else {
                event.processingStatus = 'RETRYING';
            }
        }
    }

    /**
     * Retries an event manually from the DLQ (triggered by admin UI).
     */
    static async replayFromDLQ(eventId: string) {
        const event = GlobalMemoryStore.ingestionLogs.find(e => e.eventId === eventId);
        if (!event || event.processingStatus !== 'DLQ') {
            throw new Error('Event not found in DLQ');
        }

        event.processingStatus = 'RETRYING';
        event.retryCount = 0;
        console.log(`[RESILIENCE] Manual replay triggered for event ${eventId}`);
        return this.handleEvent(event);
    }
}
