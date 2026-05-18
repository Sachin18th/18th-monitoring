# Integrations Monitoring Framework Reference

This document describes the hardened backend framework for managing third-party integrations (connectors).

## 1. Unified Connector Framework
Every integration follows a standard lifecycle and metadata model, allowing the platform to manage them consistently.

- **Storage**: `connector_instances` table stores the configuration and current state.
- **Service**: `ConnectorManagerService` orchestrates state transitions and health computation.

## 2. Connector Lifecycle States
Connectors move through explicit states derived from real backend signals:
- `DRAFT`: Initial configuration.
- `AUTH_PENDING`: Waiting for credential verification.
- `CONNECTED`: Heartbeat successful but no data synced yet.
- `ACTIVE`: Syncing and healthy.
- `DEGRADED`: Syncing but with partial failures or schema warnings.
- `THROTTLED`: External provider is rate-limiting the connector.
- `STALE`: Data has not been updated within the required SLA/cadence.

## 3. Multi-Dimensional Health Model
Health is no longer a boolean. We track:
- **Connectivity**: Can we reach the API/Endpoint?
- **Authentication**: Are the tokens/keys still valid?
- **Sync**: Are the periodic polls succeeding?
- **Webhook**: Are inbound events being received and validated?
- **Freshness**: Is the data up-to-date according to the category-aware SLA?

## 4. Hardened Sync Orchestration
The sync engine (`ExternalSyncService`) has been refactored for reliability:
- **Sync Runs**: Every sync operation is registered in `connector_sync_runs` with start/end times and record counts.
- **Cursors**: Foundational support for incremental syncing using timestamps or numeric cursors.
- **Governance**: Polling intervals and rate-limits are enforced to prevent provider lockout.

## 5. Webhook Reliability subsystem
Inbound webhooks are processed via the `WebhookHardener`:
- **Verification**: Support for HMAC signature validation.
- **Idempotency**: Automatic extraction of source event IDs to prevent duplicate processing.
- **Archival**: Raw payloads are archived in the `ingestion_events` (Raw Layer) before processing.

## 6. Integration Error Taxonomy
Failures are classified into standard categories to improve debugging and automated recovery:
- `AUTH_ERROR`, `RATE_LIMIT_ERROR`, `SCHEMA_ERROR`, `NETWORK_ERROR`, `TRANSFORMATION_ERROR`.

---

## Connector Freshness SLAs
The system enforces different update cadences based on the integration category:
- **OMS / Webhook Source**: 5-15 Minutes.
- **CRM / Marketplace**: 1 Hour.
- **ERP / Analytics**: 24 Hours.

## Production Readiness Notes
- **Risks Removed**: Silent sync failures due to missing credentials; un-auditable manual sync triggers; overlapping sync runs corrupting state.
- **Next Steps**: Implement automated token refresh listeners; enable "Auto-Recover" mode for connectors in `DEGRADED` state; add detailed permission-scope validation during `AUTH_PENDING`.
