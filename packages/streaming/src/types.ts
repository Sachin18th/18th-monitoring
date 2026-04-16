export interface PublishMessage {
    key: string; // Used for partitioning (e.g. siteId)
    value: any; // The normalized event JSON
}

export interface MessagePublisher {
    connect(): Promise<void>;
    publishBatch(topic: string, messages: PublishMessage[]): Promise<boolean>;
    disconnect(): Promise<void>;
}
