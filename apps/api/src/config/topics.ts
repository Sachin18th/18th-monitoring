// Dedicated mapping for Kafka-style routing
export const TOPICS = {
    BROWSER_EVENTS: 'browser-events-stream-v1', // High-throughput telemetry
    SERVER_EVENTS: 'server-events-stream-v1',   // Critical Order/OMS events
    DEAD_LETTER: 'dead-letter-events-stream-v1' // Failed payloads
};
