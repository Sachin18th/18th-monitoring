// Base event schema definition (e.g. using Zod or pure TS)
export const EventSchema = {
    // Scaffold definitions matching TRD section 4.1
    eventId: 'uuid',
    siteId: 'string',
    eventType: 'string',
    timestamp: 'ISO',
    sessionId: 'string',
    userId: 'string',
    metadata: {}
};
