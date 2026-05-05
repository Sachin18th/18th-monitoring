# Alerting, Auditability & Observability Backend Reference

This document describes the unified layer for monitoring system health, tracking actions, and managing operational alerts.

## 1. Structured Logging & Tracing
The system avoids plain-text logs in favor of JSON-structured entries that provide high-resolution context.

### Log Schema
- **Correlation ID**: Flows across API, Queue, and Processing boundaries to enable end-to-end tracing.
- **Module Context**: Clearly identifies the source (e.g., `INTEGRATIONS`, `VALIDATION`).
- **Metadata**: Structured payload capturing entity IDs (Order/Customer) and operational parameters.

---

## 2. Intelligent Alerting Framework
Monitoring is proactive, using a rule-based engine to detect and respond to failures.

### Alert Lifecycle
1. **TRIGGERED**: Anomalous condition or threshold breach detected.
2. **ACKNOWLEDGED**: Administrator has started investigation.
3. **IN_PROGRESS**: Active resolution or recovery.
4. **RESOLVED**: Normal conditions restored (Manual or Auto-resolved).

### Deduplication & Suppression
To prevent alert storms, the system groups similar active alerts and enforces cooldown windows between triggers.

---

## 3. Immutable Audit Trails
All critical backend actions are logged in a tamper-resistant audit store.

### Audited Actions
- **Configuration**: Changes to mapping rules, validation logic, or site settings.
- **Connectivity**: Authorization updates, connector creation, and credentials changes.
- **Data Ops**: Manual overrides, replays, re-processing triggers, and reconciliation repairs.

Each entry captures the **Actor**, the **Action**, and the **Diff** (Previous vs. New values).

---

## 4. System Health & Failure Detection
The `HealthMonitorService` performs continuous background audits of the platform's own metrics:
- **Error Rates**: Spikes in API or Processing failures above configured thresholds.
- **Lag & Freshness**: Identifying when ingestion or aggregation pipelines fall behind SLA.
- **Recovery Signals**: Detecting when systems return to health and auto-closing related alerts.

---

## 5. Multi-Tenant Isolation
Every log entry, audit record, and alert is strictly scoped to a `siteId` to ensure total data isolation in multi-tenant environments.
