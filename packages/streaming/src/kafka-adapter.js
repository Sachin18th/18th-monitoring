"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KafkaPublisherAdapter = void 0;
const memory_bus_1 = require("./memory-bus");
class KafkaPublisherAdapter {
    async connect() { }
    async disconnect() { }
    async publishBatch(topic, messages) {
        for (const msg of messages) {
            try {
                // In production, this would be an actual Kafka/Redpanda call:
                // await kafkaProducer.send({ topic, messages: [{ value: JSON.stringify(msg.value) }] })
                console.log(`[Streaming] Validated and published ${msg.value.eventType} into '${topic}'`);
                await memory_bus_1.MemoryBus.emitAsync(topic, msg);
            }
            catch (err) {
                console.error(`[Streaming] Failed to publish ${msg.value?.eventType} to ${topic}`, err);
                // TODO (PROD): Dead Letter Queue (DLQ) & Retry Strategy
                // 1. Retry with exponential backoff
                // 2. If exhaust retries, push raw event to a topic like `dlq.browser_events`
                // 3. Increment Prometheus metric: `events_dropped_total{topic="${topic}"}`
                // return false to throw error back to API client (or true if async buffer)
                throw err;
            }
        }
        return true;
    }
}
exports.KafkaPublisherAdapter = KafkaPublisherAdapter;
