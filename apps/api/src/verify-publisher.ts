import { KafkaPublisherAdapter } from '../../../packages/streaming/src/kafka-adapter';
import { TOPICS } from './config/topics';

async function testHardenPublisher() {
    const publisher = new KafkaPublisherAdapter();
    
    console.log('--- Testing Hardened Publisher ---');
    
    const mixedBatch: any = [
        { key: 'valid-1', value: { eventType: 'synthetic_run', data: 'ok' } },
        null,
        undefined,
        { key: 'invalid-1', value: null },
        { key: 'invalid-2', value: { noEventType: 'here' } },
        { key: 'valid-2', value: { eventType: 'api_metric', data: 'ok' } }
    ];

    try {
        console.log('Publishing mixed batch (valid and invalid)...');
        const success = await publisher.publishBatch(TOPICS.SERVER_EVENTS, mixedBatch);
        console.log(`Publish result: ${success ? 'SUCCESS (Safe)' : 'FAILED'}`);
    } catch (err) {
        console.error('CRASHED! Publisher hardening failed:', err);
    }
}

testHardenPublisher();
