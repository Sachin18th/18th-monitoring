import { KafkaStreamConsumer } from './consumer/kafka-consumer';

const topics = ['browser-events-stream-v1', 'server-events-stream-v1'];

async function bootstrap() {
    const consumer = new KafkaStreamConsumer();
    await consumer.connectAndSubscribe(topics);
    
    // Simulate workflow for logging
    await consumer.onMessage({
        key: 'store_001',
        value: {
            siteId: 'store_001',
            eventType: 'page_view',
            metadata: { loadTime: 1250, url: '/checkout' }
        }
    });
}

bootstrap().catch(console.error);
