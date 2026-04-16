export class EventStoreAdapter {
    // TODO: Implement raw event lookups bridging S3/Elasticsearch
    static async getEventById(eventId: string): Promise<any | null> {
        return null;
    }
}
