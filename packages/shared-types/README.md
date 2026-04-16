# Shared Types Package

The single source of truth for domain models and type definitions.

## 1. Overview

This package defines the core TypeScript interfaces and contracts used throughout the platform. By centralizing these definitions, we ensure strong typing and contract consistency between the Ingestion API, Processor, and Dashboard.

## 2. Responsibilities

- **Domain Modeling**: Define the shape of Events, KPIs, Metrics, and Alerts.
- **Contract Enforcement**: provide types for API requests/responses.
- **Shared Enums**: Centralize status codes, event types, and severities.

## 3. How It Fits in Architecture

- **Foundation Module**: Every other module in the workspace (`apps`, `services`, `packages`) depends on this package.
- **Consumer Interaction**: Used by the API for payload validation and by the Dashboard for state management.

## 4. Key Components

- **`src/`**:
  - `event.types.ts`: Base interfaces for Browser and Server events.
  - `kpi.types.ts`: Definitions for Metric records and Summary sets.
  - `alert.types.ts`: Rule and Incident schema definitions.
  - `config.types.ts`: The shape of the Global and Site configuration objects.

## 5. Main Interfaces

```typescript
// Example: Standard Event Contract
export interface BaseEvent {
  eventId: string;
  eventType: string;
  siteId: string;
  timestamp: string;
  sessionId: string;
  metadata?: Record<string, any>;
}
```

## 6. Local Development

This is a types-only / logic-light package. To build:
```bash
npm run build --workspace=@kpi/shared-types
```

## 7. Future Improvements

- **JSON Schema Export**: Automatically generate JSON schemas from TS interfaces for AJV validation.
- **Zod Integration**: Add Zod schemas for runtime validation alongside type definitions.
- **Documentation Generation**: Use TypeDoc to generate a browsable API reference.
