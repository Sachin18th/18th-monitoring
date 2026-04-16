# Events Package

The standard interface for all telemetry data passing through the platform.

## 1. Overview

The Events package provides the logic for event normalization and transformation. It ensures that disparate telemetry sources (Browser SDK, OMS Sync Logs, Checkout Services) are converted into a **StandardEvent** format before entering the message bus.

## 2. Responsibilities

- **Normalization**: Mapping various client-side payload formats to the internal base schema.
- **Enrichment**: Adding mandatory fields like `ingestedAt`, `siteId`, and `status`.
- **Validation Support**: Coordinating with `shared-types` to ensure schema compliance.

## 3. How It Fits in Architecture

- **Ingestion Interface**: Used directly by **apps/api** during the ingestion phase.
- **Pipeline Handoff**: Connects raw HTTP payloads to the standardized `MemoryBus` stream.

## 4. Key Components

- **`src/`**:
  - `transformer.ts`: The `EventTransformer` class that performs the mapping and enrichment logic.
  - `registry.ts`: (Future) Directory of all supported event types and their specific handlers.

## 5. Event Transformation Logic

```typescript
// Conceptual Transformation
RawEvent { type: 'lcp', val: 1200 } -> 
StandardEvent { 
  eventType: 'performance_metric', 
  kpiName: 'LCP', 
  value: 1200, 
  siteId: 'store_01', 
  ingestedAt: '...' 
}
```

## 6. Local Development

To build and verify transformations:
```bash
npm run build --workspace=@kpi/events
```

## 7. Future Improvements

- **Protobuf Support**: Transition to Protocol Buffers for more efficient, schema-enforced event serialization.
- **Semantic Mapping**: Add a configuration layer to allow non-developers to map raw client keys to KPI names.
- **Versioning**: support multiple versions of event schemas to handle rolling agent updates.
