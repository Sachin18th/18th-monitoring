/**
 * Interface mapping Raw Event logging operations.
 * Consumed by: Processor (Delayed logic matching), Dashboard (Log Drilldown), Agent (Event Backup).
 */
export interface EventStoreRepository {
    appendEvent(eventId: string, siteId: string, payload: any): Promise<void>;
    getEvent(eventId: string): Promise<any | null>;
    queryEvents(siteId: string, filters: any): Promise<any[]>;
}
