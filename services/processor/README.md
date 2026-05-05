# Stream Processor Service

The heavy lifter of the platform, responsible for KPI computation and event routing.

## 1. Overview

The Processor Service is a background worker that subscribes to the telemetry stream, computes complex KPIs in real-time, and aggregates data for the persistence layer. It transforms transient events into durable, actionable metrics.

## 2. Responsibilities

- **Stream Consumption**: Subscribes to browser and server event topics on the `MemoryBus`.
- **Event Routing**: Directs normalized events to specific handlers based on their `eventType`.
- **KPI Aggregation**: Computes averages, counts, and rates (e.g., Page Load Time, Error Rate).
- **Metric Handoff**: Passes computed metrics to the `packages/db` layer for storage.
- **Alert Triggering**: Initiates the evaluation of alert rules for every newly computed KPI.

## 3. How It Fits in Architecture

- **Upstream Dependencies**: Consumes data from **packages/streaming** (MemoryBus).
- **Downstream Consumers**:
  - Writes metrics to **packages/db** (In-Memory TSDB).
  - Triggers evaluation in **services/alert-engine**.
- **Data Flow Interaction**:
  1. `Message Received` -> `EventRegistry` -> `KPI Aggregation`.
  2. `KPI Computed` -> `DB Insert` -> `AlertEngine.evaluate()`.

## 4. Key Components

- **`src/consumer/`**: Implementation of the stream listener (Mock Kafka consumer).
- **`src/registry/`**: `EventRegistry` that maps event types to processing logic.
- **`src/engine/`**: 
  - `aggregation.service.ts`: Core logic for computing metrics and checking alert thresholds.
- **`src/handlers/`**: Specific logic for various event types (Performance, Errors, OMS).

## 5. Input / Output

- **Input**: `StandardEvent` stream from browser/server ingest.
- **Output**: 
  - `MetricRecord` entries in the Time-Series database.
  - Log output for real-time observability.

## 6. Aggregation Logic

The service utilizes a non-blocking computation model:
- **Counts**: Sum of occurrences over a rolling window.
- **Averages**: Rolling average for continuous values like `pageLoadTime`.
- **States**: Health derived from current counts vs. established thresholds.

## 7. Local Development

Typically run as part of the overall platform startup:
```bash
npm run dev
```

## 8. Future Improvements

- **Sliding Windows**: Implement truly reactive sliding windows (e.g., moving average over 10m).
- **State Partitioning**: Support for partitioned stream processing (scaling by `siteId`).
- **Idempotency**: Ensure KPI computations are idempotent even if events are redelivered.
