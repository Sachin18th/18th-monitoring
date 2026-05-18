"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KafkaStreamConsumer = void 0;
const event_registry_1 = require("../registry/event-registry");
const memory_bus_1 = require("../../../../packages/streaming/src/memory-bus");
class KafkaStreamConsumer {
    isConsuming = false;
    async connectAndSubscribe(topics) {
        this.isConsuming = true;
        for (const t of topics) {
            memory_bus_1.MemoryBus.on(t, async (msg) => {
                await this.onMessage(t, msg);
            });
        }
        console.log(`[KafkaConsumer] Subscribed seamlessly linking memory channels to: ${topics.join(', ')}`);
    }
    async onMessage(topic, rawPayload) {
        console.log(`[KafkaConsumer] Processing topic ${topic} with type ${rawPayload.value?.eventType || 'unknown'}`);
        await event_registry_1.EventRegistry.route(rawPayload);
    }
}
exports.KafkaStreamConsumer = KafkaStreamConsumer;
