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
<<<<<<< HEAD
};
=======
};
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
