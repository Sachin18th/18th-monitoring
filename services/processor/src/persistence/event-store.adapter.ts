import { prisma } from '@kpi-platform/db';

export class EventStoreAdapter {
    // Migrated from Drizzle ORM to Prisma
    static async getEventById(eventId: string): Promise<any | null> {
        const event = await prisma.ingestionEvent.findUnique({
            where: { id: eventId },
        });

        if (!event) {
            return null;
        }

        return {
            ...event,
            eventId: event.id,
            siteId: event.projectId,
            payload: {
                mode: event.mode,
                status: event.status,
                sourceReferenceId: event.sourceReferenceId,
                correlationId: event.correlationId,
                validationReport: event.validationReport,
                dedupeKey: event.dedupeKey,
                error: event.error,
            },
        };
    }
}
