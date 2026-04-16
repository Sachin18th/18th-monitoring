import { EventRegistry } from '../registry/event-registry';
import { MemoryBus } from '../../../../packages/streaming/src/memory-bus';

export class KafkaStreamConsumer {
    private isConsuming = false;

    async connectAndSubscribe(topics: string[]) {
        this.isConsuming = true;
        for (const t of topics) {
            MemoryBus.on(t, async (msg: any) => {
                console.log(`[Processor] Actively grabbed payload mapping: ${msg.value.eventType}`);
                await this.onMessage(msg);
            });
        }
        console.log(`[KafkaConsumer] Subscribed seamlessly linking memory channels to: ${topics.join(', ')}`);
    }

    async onMessage(rawPayload: any) {
        await EventRegistry.route(rawPayload);
    }
}
