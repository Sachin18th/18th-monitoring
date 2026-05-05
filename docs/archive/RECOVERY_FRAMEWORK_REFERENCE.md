# Backfill, Replay & Recovery Framework Reference

This document describes the distributed recovery architecture for reprocessing historical data and repairing inconsistencies.

## 1. Raw Data Replay (Part 1)
The system maintains a full record of every raw payload received in `ingestion_events`. This serves as the "Source of Truth" for all replays.

### Replay Workflow
1. **Scope Selection**: Defining the replay by Site, Connector, Date Range, or Error Category.
2. **Batch Injection**: Raw payloads are re-fed into the normalized ingestion pipeline.
3. **Idempotent Upsert**: Normalization and storage layers use unique source IDs to ensure records are updated (repaired) rather than duplicated.

---

## 2. Historical Backfill (Part 2)
Large-scale historical data ingestion is managed via a dedicated background job framework.

### Reliability Features
- **Checkpointing**: Tracks progress to allow resumption after system restarts or worker failures.
- **Throttling**: Configurable rate limits to prevent backfills from impacting real-time performance signals.
- **Queue-Based**: Jobs are distributed across worker pools for parallel processing without blocking API traffic.

---

## 3. Recompute Engine (Part 3)
When logic changes (e.g., a new KPI formula or an updated validation rule), the system can recompute derived data.

### Dependency Chain
The recompute engine strictly follows the data dependency graph:
`Raw Payload` → `Normalized Record` → `Validated Entity` → `Intelligence Aggregate (Rollup/Cohort)`

A recompute of an aggregate automatically verifies that the upstream validated entities are current.

---

## 4. Operational Controls (Part 5)
Administrators can trigger recovery via the backend service for:
- **Dead-Letter Recovery**: Replaying events that previously failed due to transient infrastructure issues.
- **Bulk Correction**: Retroactively applying a fix to a range of records after a mapping bug is identified.
- **Data Refresh**: Rebuilding all aggregates for a site to ensure 100% alignment with raw truth.

---

## 5. Auditability & Observability (Part 9)
Every recovery job is fully traceable:
- **Audit Log**: Standard entry capturing Who, When, What, and Why.
- **Job Status**: Real-time progress monitoring (Total vs. Processed records).
- **Integrity Validation**: Post-recovery checks to ensure the system is in a healthy, reconciled state.
