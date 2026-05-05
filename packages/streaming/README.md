# Streaming Package

The message bus abstraction providing the event backbone for the platform.

## 1. Overview

The Streaming package abstracts the communication between ingestion and processing services. It implements a non-blocking `MemoryBus` that mimics the behavior of a message broker like Apache Kafka or RabbitMQ.

## 2. Responsibilities

- **Abstraction**: Provide a standard `Publisher` and `Consumer` interface.
- **Topic Management**: Handle message routing to specific logical channels.
- **Asynchronous Handoff**: Decouple publishers (API) from consumers (Processor).
- **Graceful Failure**: handle sub-tier errors without losing data (retry logic).

## 3. How It Fits in Architecture

- **Backbone**: It is the "glue" that connects **apps/api** (Publisher) to **services/processor** (Consumer).
- **Core Contract**: Every event batch ingested is published to a topic defined in this package.

## 4. Key Components

- **`src/`**:
  - `memory-bus.ts`: The central `EventEmitter` based implementation of the message bus.
  - `kafka-adapter.ts`: (Future) The provider for real Kafka clusters.

## 5. Main Interfaces

```typescript
export interface Publisher {
  publishBatch(topic: string, messages: PublishMessage[]): Promise<boolean>;
}

export interface Consumer {
  subscribe(topic: string, onMessage: (msg: any) => Promise<void>): void;
}
```

## 6. Implementation Notes

- **Current Implementation**: Uses Node.js `EventEmitter` to pass messages in-process for the MVP.
- **Production Path**: Switch the dependency injection in `DatabaseFactory` (or equivalent) to use the `KafkaPublisher` for cluster environments.

## 7. Local Development

Tests and local development use the `MemoryBus` by default. No external broker (Docker Kafka) is required for the core MVP loop.

## 8. Future Improvements

- **Persistence**: Add persistent queueing (e.g., BullMQ or Redis) for the local bus.
- **DLQ (Dead Letter Queue)**: Automatically move failed events to a separate topic for debugging.
- **Schema Registry**: Integrate with `packages/schemas` to ensure only valid messages are published.
