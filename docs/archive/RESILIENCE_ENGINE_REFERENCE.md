# Webhook & Sync Engine Resilience Reference

This document describes the hardened execution layer for data ingestion and synchronization.

## 1. Durable Webhook Ingestion (Two-Step Pipeline)
The system separates the acceptance of data from its processing to ensure high availability and prevent data loss.

### Step 1: Ingestion (Durable & Fast)
- **Fast Ack**: Inbound webhooks are immediately acknowledged (202 Accepted) after baseline validation.
- **Idempotency Check**: Uses `connectorId` + `sourceEventId` to reject duplicates before storage.
- **Raw Layer Storage**: The full payload is persisted to `ingestion_events` before any transformation occurs.

### Step 2: Processing (Asynchronous)
- **Trigger**: Ingestion triggers a background process (normalized via TOPICS.SYNC_EVENTS).
- **Quality Gates**: Every event passes through a standard validation engine.
- **State Tracking**: Events move through `PENDING` -> `PROCESSING` -> `COMPLETED` | `FAILED` status.

---

## 2. Sync engine (Job-Based Orchestration)
The polling system is refactored into a formal engine that manages complex synchronization tasks.

### Sync Jobs
- Every sync (Scheduled, Manual, or Backfill) is an atomic `connectorSyncRun`.
- **Locking**: Prevents multiple overlapping syncs for the same connector/site combination using an active lock registry.
- **Metrics**: Jobs track `recordsFetched`, `recordsProcessed`, and `recordsRejected` individually.

### Checkpointing & Cursors
- **Persistence**: Progress is saved to `processing_checkpoints` after each successful batch.
- **Incremental Sync**: The engine automatically resumes from the last known checkpoint, minimizing API load and processing time.

---

## 3. Recovery & Fault Tolerance
The architecture assumes failure and provides tools for recovery.

### Dead-Letter Queue (DLQ)
- Events that fail processing repeatedly (Max 3 retries) are marked as `FAILED` and quarantined.
- Errors are classified into categories (e.g., `SCHEMA_ERROR`, `AUTH_ERROR`) for easier routing.

### Replay System
- **Manual Replay**: Administrators can trigger a replay of a single event via `POST /resilience/replay/:eventId`.
- **Batch Replay**: Support for re-running all failed events within a time range or for a specific connector.
- **Idempotency Safety**: Replayed events follow the same deduplication logic, ensuring no data corruption.

---

## 4. Observability & Tracing
- **Correlation IDs**: Propagated across the entire flow from initial webhook to final normalization.
- **Lag Monitoring**: Baseline support for tracking ingestion lag (time between receipt and final processing).
- **Health Metrics**: Real-time counters for `ingestion_duplicate_count`, `ingestion_ack_count`, and `ingestion_dlq_count`.

## Failure Scenarios & Recovery Paths
| Scenario | Detection | Recovery Path |
| :--- | :--- | :--- |
| External API Down | `Connectivity` health signal goes `false` | Sync engine uses exponential backoff; Job marked as `PARTIAL` |
| Duplicate Webhook | `Idempotency Check` matches `sourceEventId` | System returns 202/200; Payload ignored without processing |
| Validation Failure | Quality Gate returns `REJECTED` | Event marked `FAILED`; Error logged; Downstream flow halted |
| Sync Overlap | `Lock Registry` conflict | Second job skipped to prevent race conditions |
| Data Corruption | `Validation Engine` schema mismatch | Record quarantined to DLQ; Administrator triggers replay after fix |
