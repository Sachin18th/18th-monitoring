# Backend Architecture Hardening Reference

This document provides a technical overview of the architectural changes implemented to ensure the platform is production-ready, reliable, and auditable.

## 1. Canonical Ingestion Architecture
We have unified all incoming data into a single, high-fidelity ingestion model.

- **Primary Entry Point**: `HardenedIngestionService.ingest()`
- **Storage**: `ingestion_events` table.
- **Metadata Captured**: Site/Tenant ID, Connector ID, Source System, Source Event ID, Ingestion Timestamp, Schema Version, Correlation ID, Trace ID, Provenance (IP, User Agent).

## 2. The 3-Layer Data Flow
The system now strictly separates data processing into three distinct layers to ensure truth and replayability.

1.  **Raw Layer**: Immutable storage of the exact payload in `ingestion_events.raw_payload`. This layer is never mutated and serves as the source of truth for all re-processing.
2.  **Normalized Layer**: Transformations from the Raw Layer into internal canonical schemas (e.g., `normalized_orders`).
3.  **Aggregated Layer**: Precomputed summaries and KPI-ready rollups for high-performance dashboarding.

## 3. Idempotency & Deduplication
- **Strategy**: Every record is tagged with a `sourceEventId` (from the originating system).
- **Enforcement**: The `ingestion_events` table uses a composite index on `(connector_id, source_event_id)` to prevent duplicate ingestion of the same record.

## 4. Backend Quality Gates (Validation)
Every ingested record passes through a validation engine before being normalized.

- **Status**: Records are marked as `VALID`, `WARNING`, `QUARANTINED`, or `REJECTED`.
- **Logic**: Critical failures (e.g., missing essential keys) result in `REJECTED` status, preventing downstream contamination.
- **Audit**: Detailed per-rule results are stored in `quality_gate_results`.

## 5. Async Processing & Resilience
- **Handoff**: The ingestion API performs absolute minimal processing (Save Raw -> Validate -> Publish).
- **Concurrency**: Normalization and heavy lifting are offloaded to background workers via Kafka topics (`TOPICS.SERVER_EVENTS`).
- **Retries**: The system supports structured retries with `retry_count` tracking in the database.

## 6. Observability
Internal system health is now monitored via the `system_health_metrics` table. Key metrics collected:
- `ingestion_count`: Total attempts per connector.
- `ingestion_failure_count`: Critical pipeline errors.
- `validationStatus` distribution: Identifying noisy or broken integrations.

## 7. Error Classification Model
Standardized error categories are now used across the backend:
- `AUTH_ERROR` / `PERMISSION_ERROR`: Security issues.
- `NETWORK_ERROR` / `TIMEOUT_ERROR`: External integration friction.
- `SCHEMA_ERROR` / `VALIDATION_ERROR`: Data quality issues.
- `TRANSFORMATION_ERROR`: Internal logic failures.

## 8. Multi-Tenant Isolation
Every record and query is strictly scoped by `siteId`. Data leakage is prevented via:
- Mandatory `siteId` on all ingestion requests.
- Storage partitioning (conceptual index-level partitioning for now).
- Scoped cache keys for background workers.

---

## Safe Migration Notes
- **Backward Compatibility**: Existing tables (`raw_payloads`, `normalized_orders`) remain intact. New logic pipes into the new tables first.
- **Transition**: New ingestion flows should migrate from `IngestionService` to `HardenedIngestionService`.

## Production Readiness Notes
- **Risks Removed**: Silent data duplication via webhook retries; metric inflation due to partial ingestion; lack of traceability for transformed records.
- **New Protections**: Mandatory validation gates; immutable source-of-truth storage; system-level health observability.
- **Next Steps**: Implement auto-reconciliation workers using the `triggerReconciliation` foundation; enable automated Dead-Letter Queue (DLQ) replay logic.
