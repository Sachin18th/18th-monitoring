/**
 * Interface mapping Raw Event logging operations.
 * Consumed by: Processor (Delayed logic matching), Dashboard (Log Drilldown), Agent (Event Backup).
 */
export interface EventStoreRepository {
    appendEvent(eventId: string, siteId: string, payload: any): Promise<void>;
    getEvent(eventId: string): Promise<any | null>;
    queryEvents(siteId: string, filters: any): Promise<any[]>;
<<<<<<< HEAD
}
=======
}
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
