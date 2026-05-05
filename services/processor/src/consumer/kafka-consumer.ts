import { EventRegistry } from '../registry/event-registry';
import { MemoryBus } from '../../../../packages/streaming/src/memory-bus';

export class KafkaStreamConsumer {
    private isConsuming = false;

    async connectAndSubscribe(topics: string[]) {
        this.isConsuming = true;
        for (const t of topics) {
            MemoryBus.on(t, async (msg: any) => {
<<<<<<< HEAD
                await this.onMessage(t, msg);
=======
                console.log(`[Processor] Actively grabbed payload mapping: ${msg.value.eventType}`);
                await this.onMessage(msg);
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
            });
        }
        console.log(`[KafkaConsumer] Subscribed seamlessly linking memory channels to: ${topics.join(', ')}`);
    }

<<<<<<< HEAD
    async onMessage(topic: string, rawPayload: any) {
        console.log(`[KafkaConsumer] Processing topic ${topic} with type ${rawPayload.value?.eventType || 'unknown'}`);
=======
    async onMessage(rawPayload: any) {
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
        await EventRegistry.route(rawPayload);
    }
}
