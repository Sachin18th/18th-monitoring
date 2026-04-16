$basePath = "c:\kpi monitoring"
cd $basePath

function Write-File {
    param([string]$Path, [string]$Content)
    $dir = Split-Path $Path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Set-Content -Path $Path -Value  $Content.Trim() -Encoding UTF8
}

Write-File "packages/streaming/src/types.ts" @"
export interface PublishMessage {
    key: string; // Used for partitioning (e.g. siteId)
    value: any; // The normalized event JSON
}

export interface MessagePublisher {
    connect(): Promise<void>;
    publishBatch(topic: string, messages: PublishMessage[]): Promise<boolean>;
    disconnect(): Promise<void>;
}
"@

Write-File "packages/streaming/src/kafka-adapter.ts" @"
import { MessagePublisher, PublishMessage } from './types';

export class KafkaPublisherAdapter implements MessagePublisher {
    private isConnected = false;

    // TODO: implement real kafka connection here (e.g. using kafkajs client)

    async connect(): Promise<void> {
        // TODO: Real broker connection
        this.isConnected = true;
        console.log('[KafkaAdapter] Connected to broker');
    }

    async publishBatch(topic: string, messages: PublishMessage[]): Promise<boolean> {
        if (!this.isConnected) await this.connect();

        try {
            // TODO: Ensure delivery guarantees (e.g., acks: -1 or 'all')
            // TODO: Partitioning strategy: keys map to specific partitions
            // TODO: Consumer group configurations applied at processor level
            console.log(`[KafkaAdapter] Published \${messages.length} messages to topic '\${topic}'`);
            
            // Mocking successful publish
            return true;
        } catch (error) {
            console.error(`[KafkaAdapter] Failed to publish \${messages.length} messages to '\${topic}'`, error);
            // TODO: Implement sophisticated retry strategy with backoff
            return false;
        }
    }

    async disconnect(): Promise<void> {
        this.isConnected = false;
        console.log('[KafkaAdapter] Disconnected from broker');
    }
}
"@

Write-File "packages/streaming/src/index.ts" @"
export * from './types';
export * from './kafka-adapter';
"@

Write-File "apps/api/src/config/topics.ts" @"
// Dedicated mapping for Kafka-style routing
export const TOPICS = {
    BROWSER_EVENTS: 'browser-events-stream-v1', // High-throughput telemetry
    SERVER_EVENTS: 'server-events-stream-v1',   // Critical Order/OMS events
    DEAD_LETTER: 'dead-letter-events-stream-v1' // Failed payloads
};
"@

Write-File "apps/api/src/services/transformer.service.ts" @"
import { BaseEvent } from '../../../../packages/shared-types/src';
import { PublishMessage } from '../../../../packages/streaming/src';

export class EventTransformer {
    /**
     * Normalizes a raw BaseEvent payload into a standard streaming payload.
     * Injects system-level timestamps and sets up partitioning strategy.
     */
    static normalize(siteId: string, event: BaseEvent): PublishMessage {
        // 1. Add ingestion timestamp for latency monitoring
        const enrichedEvent = {
            ...event,
            siteId,                     // Enforce explicit tagging
            ingestedAt: new Date().toISOString()
        };

        // 2. Select partitioning key 
        // Using siteId enforces strict ordering of events per environment in Kafka
        const partitionKey = siteId;

        return {
            key: partitionKey,
            value: enrichedEvent
        };
    }

    static normalizeBatch(siteId: string, events: BaseEvent[]): PublishMessage[] {
        return events.map(e => this.normalize(siteId, e));
    }
}
"@

Write-File "apps/api/src/services/ingestion.service.ts" @"
import { BaseEvent } from '../../../../packages/shared-types/src';
import { KafkaPublisherAdapter } from '../../../../packages/streaming/src';
import { EventTransformer } from './transformer.service';
import { TOPICS } from '../config/topics';

// Initialize singleton publisher adapter
// Can easily swap with PubSubPublisherAdapter in the future
const publisher = new KafkaPublisherAdapter();

export class IngestionService {
    
    /**
     * Normalizes and hands off browser batch events to streaming pipeline
     */
    static async processBrowserEvents(siteId: string, events: BaseEvent[]) {
        try {
            // 1. Normalize events & extract partitioning keys
            const messages = EventTransformer.normalizeBatch(siteId, events);

            // 2. Publish batch to Broker
            const success = await publisher.publishBatch(TOPICS.BROWSER_EVENTS, messages);

            if (!success) {
                // 3. Fallback strategy
                console.warn(`[IngestionService] Fallback to dead-lettering for site: \${siteId}`);
                await publisher.publishBatch(TOPICS.DEAD_LETTER, messages);
            }

            console.log(`[IngestionService] Handed off \${events.length} browser events (Site: \${siteId})`);
            return { success, processedCount: events.length, topic: TOPICS.BROWSER_EVENTS };
            
        } catch (err) {
            console.error('[IngestionService] Fatal pipeline error processing browser events', err);
            throw err; // Throw upwards to allow Controller to return HTTP 500
        }
    }

    /**
     * Normalizes and hands off mission-critical server integration events
     */
    static async processServerEvents(siteId: string, events: BaseEvent[]) {
        try {
            const messages = EventTransformer.normalizeBatch(siteId, events);

            const success = await publisher.publishBatch(TOPICS.SERVER_EVENTS, messages);

            if (!success) {
                console.warn(`[IngestionService] Server events failed publish. Sending to DLQ. 
Site: \${siteId}`);
                // TODO: Since these are critical (orders) we might want an active retry buffer/Db stash
                await publisher.publishBatch(TOPICS.DEAD_LETTER, messages);
            }

            console.log(`[IngestionService] Handed off \${events.length} server events (Site: \${siteId})`);
            return { success, processedCount: events.length, topic: TOPICS.SERVER_EVENTS };
            
        } catch (err) {
            console.error('[IngestionService] Fatal pipeline error processing server events', err);
            throw err;
        }
    }
}
"@
