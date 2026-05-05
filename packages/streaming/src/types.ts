export interface PublishMessage {
    key: string; // Used for partitioning (e.g. siteId)
    value: any; // The normalized event JSON
}

export interface MessagePublisher {
    connect(): Promise<void>;
    publishBatch(topic: string, messages: PublishMessage[]): Promise<boolean>;
    disconnect(): Promise<void>;
<<<<<<< HEAD
}
=======
}
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
