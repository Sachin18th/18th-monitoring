<<<<<<< HEAD
// Dedicated mapping for Kafka-style routing
export const TOPICS = {
    BROWSER_EVENTS: 'browser-events-stream-v1', // High-throughput telemetry
    SERVER_EVENTS: 'server-events-stream-v1',   // Critical Order/OMS events
    BACKEND_METRICS: 'backend-metrics-stream-v1', // API Performance & Health
    DEAD_LETTER: 'dead-letter-events-stream-v1', // Failed payloads
    NOTIFICATIONS: 'outbound-notifications-v1'  // Outbound webhooks and alerts
=======
﻿// Dedicated mapping for Kafka-style routing
export const TOPICS = {
    BROWSER_EVENTS: 'browser-events-stream-v1', // High-throughput telemetry
    SERVER_EVENTS: 'server-events-stream-v1',   // Critical Order/OMS events
    DEAD_LETTER: 'dead-letter-events-stream-v1' // Failed payloads
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
};
