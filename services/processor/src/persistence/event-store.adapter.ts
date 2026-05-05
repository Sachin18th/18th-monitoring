<<<<<<< HEAD
﻿import { prisma } from '@kpi-platform/db';

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
=======
﻿export class EventStoreAdapter {
    // TODO: Implement raw event lookups bridging S3/Elasticsearch
    static async getEventById(eventId: string): Promise<any | null> {
        return null;
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
}
