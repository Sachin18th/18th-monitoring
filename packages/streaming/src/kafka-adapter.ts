import { MessagePublisher, PublishMessage } from './types';
import { MemoryBus } from './memory-bus';

export class KafkaPublisherAdapter implements MessagePublisher {
    async connect(): Promise<void> {}
    async disconnect(): Promise<void> {}

    async publishBatch(topic: string, messages: PublishMessage[]): Promise<boolean> {
        if (!messages || !Array.isArray(messages)) {
            console.warn(`[Streaming] Received invalid message batch for topic ${topic}`);
            return false;
        }

        const validMessages = messages.filter(msg => {
            if (!msg || !msg.value) {
                console.warn(`[Streaming] Skipping null or undefined message in topic ${topic}`);
                return false;
            }
            if (typeof msg.value.eventType !== 'string' || msg.value.eventType.length === 0) {
                console.warn(`[Streaming] Skipping message with missing or invalid eventType in topic ${topic}`);
                return false;
            }
            return true;
        });

        if (validMessages.length === 0 && messages.length > 0) {
            console.warn(`[Streaming] All ${messages.length} messages in batch were filtered out as invalid for topic ${topic}`);
            return true; // No-op success
        }

        for (const msg of validMessages) {
            try {
                // In production, this would be an actual Kafka/Redpanda call:
                // await kafkaProducer.send({ topic, messages: [{ value: JSON.stringify(msg.value) }] })
                console.log(`[Streaming] Validated and published ${msg.value.eventType} into '${topic}'`);
                await MemoryBus.emitAsync(topic, msg);
            } catch (err) {
                console.error(`[Streaming] Failed to publish ${msg.value?.eventType} to ${topic}`, err);
                throw err;
            }
        }
        return true;
    }
}
