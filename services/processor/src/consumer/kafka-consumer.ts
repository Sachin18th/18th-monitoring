import { EventRegistry } from '../registry/event-registry';
import { MemoryBus } from '../../../../packages/streaming/src/memory-bus';

export class KafkaStreamConsumer {
    private isConsuming = false;

    async connectAndSubscribe(topics: string[]) {
        this.isConsuming = true;
        for (const t of topics) {
            MemoryBus.on(t, async (msg: any) => {
                await this.onMessage(t, msg);
            });
        }
        console.log(`[KafkaConsumer] Subscribed seamlessly linking memory channels to: ${topics.join(', ')}`);
    }

    async onMessage(topic: string, rawPayload: any) {
        console.log(`[KafkaConsumer] Processing topic ${topic} with type ${rawPayload.value?.eventType || 'unknown'}`);
        await EventRegistry.route(rawPayload);
    }
}
