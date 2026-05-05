# Data Integrity & Reconciliation Engine Reference

This document describes the backend engine responsible for ensuring data trust, accuracy, and auditability across the platform.

## 1. Multi-Stage Validation Engine
The platform uses a centralized `ValidationEngine` that runs at every layer of the ingestion pipeline.

### Validation Categories
- **STRUCTURAL**: Schema integrity, required field presence.
- **TEMPORAL**: Realism of timestamps, ordering sanity, and stale data detection.
- **IDENTITY**: Uniqueness checks (Deduplication) and natural key validity.
- **BUSINESS**: Financial consistency (totals, taxes), status transition legality.
- **QUALITY**: Minimum completeness standards and confidence scoring.

### Data Quality States
Every record is assigned a quality state stored in its metadata:
- `VALID`: Passed all critical and high-severity rules.
- `WARNING`: Passed critical rules but triggered non-blocking warnings.
- `REJECTED`: Failed critical rules; halted before normalization.
- `QUARANTINED`: Suspicious data held for review or revalidation.

---

## 2. Reconciliation Engine (Job-Based)
The `ReconciliationEngine` performs proactive auditing by comparing data across different layers and sources.

### Reconciliation Dimensions
- **Count Reconciliation**: Comparing source fetch counts against internal processed and normalized counts.
- **Field Reconciliation**: Verifying specific field totals (e.g., Grand Totals) match between API and Platform.
- **Freshness Reconciliation**: Detecting drift between expected sync cadence and actual data availability.
- **Gap Detection**: Identifying missing sequences in order IDs or event streams.

### Mismatch Taxonomy
Discrepancies are classified for automated recovery or manual review:
- `MISSING_RECORD`, `DUPLICATE_RECORD`, `STALE_RECORD`, `COUNT_MISMATCH`, `FIELD_MISMATCH`, `SEQUENCE_GAP`.

---

## 3. Confidence & Trust Scoring
Beyond pass/fail, the system generates a **Confidence Score (0.0 - 1.0)** for every ingestion event and reconciliation run.
- **High Trust (> 0.95)**: Data is reliable for automated KPI reporting.
- **Medium Trust (0.70 - 0.95)**: Used for general monitoring but highlighted for discrepancies.
- **Low Trust (< 0.70)**: Flagged for manual audit; excluded from high-stakes financial reporting.

---

## 4. Operational Workflows
- **Revalidation**: Triggered after rule updates to re-evaluate quarantined or warning records.
- **Reprocessing**: Ability to selective re-normalize and re-aggregate data after mapping fixes.
- **Job Tracing**: Every reconciliation run and validation decision is traceable via its `jobId` and `correlationId`.

## Domain Foundations
The engine includes specialized rule-sets for:
- **Orders**: Source validity, tax consistency, status flow.
- **Performance**: Latency realism, project mapping.
- **Customer**: Identity integrity, session completeness.
- **Integrations**: SLA adherence, checkpoint drift.
