import { prisma } from '@kpi-platform/db';
import { HardenedIngestionService } from './hardened-ingestion.service';

export class ReplayService {
    /**
     * Replays a single failed event.
     * Requirement 6 (Safe replay with idempotency)
     */
    static async replayEvent(eventId: string) {
        const event = await prisma.ingestionEvent.findUnique({ where: { id: eventId } });
        if (!event) throw new Error('Event not found');
        console.log(`[ReplayService] Replaying event ${eventId} for connector ${event.integrationId}`);

        // Re-trigger the ASYNC processing step (Step 2 of the ingestion flow)
        // This is safe because Step 2 handles idempotency and ordering
        // In our current mock implementation, we access processAsync via public exposure or internal call
        // For this hardening, we'll manually re-invoke the ingestion logic or a dedicated replay path
        
        return HardenedIngestionService.ingest({
            siteId: event.projectId,
            connectorId: event.integrationId || 'unknown',
            sourceSystem: 'replay',
            eventType: 'REPLAY',
            payload: ((event.validationReport as any)?.rawPayload) || {},
            sourceEventId: event.id,
            metadata: {
                correlationId: event.correlationId,
                provenance: { replayedAt: new Date().toISOString() }
            }
        });
    }

    /**
     * Replays a batch of events based on filter criteria.
     * Requirement 6 (Batch replay)
     */
    static async replayBatch(filters: { connectorId?: string; siteId: string; start?: Date; end?: Date; status?: string }) {
        const events = await prisma.ingestionEvent.findMany({
            where: {
                projectId: filters.siteId,
                ...(filters.connectorId ? { integrationId: filters.connectorId } : {}),
                status: filters.status || 'FAILED',
                ...(filters.start || filters.end
                    ? {
                        receivedAt: {
                            ...(filters.start ? { gte: filters.start } : {}),
                            ...(filters.end ? { lte: filters.end } : {})
                        }
                    }
                    : {})
            }
        });
        console.log(`[ReplayService] Triggering replay for ${events.length} events...`);

        const results = {
            triggered: 0,
            failed: 0
        };

        for (const event of events) {
            try {
                await this.replayEvent(event.id);
                results.triggered++;
            } catch (err) {
                console.error(`[ReplayService] Failed to trigger replay for ${event.id}:`, err);
                results.failed++;
            }
        }

        return results;
    }
}
