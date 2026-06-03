# Implementation Plan — Completing the Platform

Derived from `.doc-verification-results.md`. Ordered by dependency. Start at Phase 0 and go top-to-bottom.
Effort estimates assume 1–2 engineers. ▶ = start here.

## Critical path (the spine everything hangs off)
Phase 0 (Security) → Phase 1 (Schema + real persistence) → Phase 2 (Durable queue) → Phase 3 (Connectors) → Phase 5 (KPIs). Phases 4/6/7/8/9/10/11 attach to that spine; Phase 12 is optional/last.

---

## ▶ PHASE 0 — Security & correctness blockers  (~1 week) — DO FIRST, release-gating
These are exploitable today; nothing should ship until they're closed.
- [ ] Remove hardcoded `Demo@1234!` superadmin auto-creation — `apps/api/src/services/auth.service.ts:57`. Replace with a seed script run only in dev.
- [ ] Encrypt connector credentials — wire the existing AES-256-GCM `VaultService`; pull key from env/KMS; replace plaintext `JSON.stringify` write at `integration.controller.ts:182`. Migrate existing rows.
- [ ] Authenticate webhook ingress — implement per-provider HMAC verification in `webhook.controller.ts` (`handleInbound`); reject missing/invalid signature; add timestamp/nonce replay guard.
- [ ] Enforce query-level tenant scoping — add a Prisma client extension (or repository guard) that injects `tenantId` into every query; stop relying on middleware alone. Audit `dashboard.service.ts`, `metric-query.service.ts`.
- [ ] Add roleGuard to integration create/sync routes — `routes/integrations.ts:19-30`.
- [ ] Auth hardening — implement password reset handler, brute-force lockout (replace TODO), enable MFA path (TOTP) instead of hardcoded `mfaRequired:false`.
- [ ] CI security — add `npm audit` + Dependabot/Snyk; enable HSTS; tighten CORS allow-all.
**Exit:** no plaintext secrets, no unauthenticated mutations, no cross-tenant read possible, no backdoor.

## PHASE 1 — Data persistence backbone  (~2 weeks) — UNBLOCKS most ⚠️ items
The single highest-leverage phase. Until canonical data is in Postgres, KPIs/freshness/reconciliation can't be real.
- [ ] Expand canonical schema (`packages/db/prisma/schema.prisma` + migration):
  - New tables: `order_item`, `payment_transaction`, `refund`, `shipment`, `inventory_snapshot`, `cart/checkout`, `reconciliation_issue`, `channel`, `store`.
  - Add `Order → Customer` FK; add Order→OrderItem/Payment/Shipment relations.
  - Add cross-platform metadata columns to every canonical entity: `source_platform`, `source_system_type`, `source_account_identifier`, `source_entity_id`, `ingestion_timestamp`, `source_updated_at`, `timezone`, `normalized_status`, `currency`.
  - Add order classification: `order_source_type` (online/offline), `sales_channel`, `import_mode` (webhook/polling/csv/manual).
- [ ] Make transformation pipeline persist to Postgres — `transformation-pipeline.service.ts:132` writes to Prisma, not `GlobalMemoryStore`. Retire `in-memory.adapter.js` for canonical data.
- [ ] Backfill `tenant_id` onto child/time-series tables (order_events, snapshots, rollups, health metrics, system_logs).
**Exit:** an ingested order produces a fully-related canonical record in Postgres with source attribution.

## PHASE 2 — Durable queue  (~1 week)
Replace the in-process `MemoryBus` with a real broker (see detailed KafkaJS/Redpanda guide already provided).
- [ ] Add `kafkajs`; run Redpanda locally (docker-compose); add MSK/SQS to Terraform for prod.
- [ ] Implement `RealKafkaPublisher` behind existing `MessagePublisher` interface; add `createPublisher()` factory (env `QUEUE_DRIVER`).
- [ ] Rewrite consumer (`services/processor/.../kafka-consumer.ts`) with real consumer groups; deploy `services/processor` as its own ECS service (uncomment worker in `infra/docker-compose.yml:55`).
- [ ] Make DLQ real — publish failures to `dead-letter` topic + write `DeadLetterQueue` rows; finish `dlq.worker` reprocess body.
**Exit:** kill the API process mid-sync, restart, no events lost; workers scale independently.

## PHASE 3 — Connector framework completion  (~2–3 weeks)
- [ ] Unify the two conflicting `BaseConnector` definitions into one 12-method contract (`packages/connector-framework`).
- [ ] Implement the contract methods that are stubs/missing: `connect, authorize, initialBackfill, incrementalSync, subscribeEvents, handleWebhook, reconcile, disconnect`.
- [ ] Make incremental sync actually read the stored checkpoint (currently stored-but-ignored, `shopify-order-sync.service.ts`); add rate-limit-aware execution (429 + Retry-After handling); add the hybrid (poll+webhook+reconcile) path.
- [ ] New connectors (priority order from roadmap): Payment (Stripe → Razorpay → PayPal/Adyen) → Shipping → ERP/OMS → CRM → Custom API (config-driven endpoints/auth).
- [ ] Finish CSV import (uncomment/complete parser `csv-import.service.ts:20`); add SFTP ingestion.
- [ ] Shopify: add OAuth flow + GraphQL Admin API + webhook topic handlers.
**Exit:** at least Payment + one more category live end-to-end through the 12-method contract.

## PHASE 4 — Sync orchestration hardening  (~1 week)
- [ ] Replace `setInterval` with real cron scheduling; add dependency sequencing (discovery→mapping→backfill→KPI).
- [ ] Implement initial backfill (configurable windows) + resumable checkpoints.
- [ ] Replace generic `SyncEngine.runBatch` mock (`sync-engine.service.ts:103`) with real fetch.
- [ ] Per-workload worker pools + concurrency controls (per tenant/connector/job-type).
**Exit:** scheduled + manual + backfill + incremental all run real fetches with ordering guarantees.

## PHASE 5 — KPI engine completion  (~2 weeks)
- [ ] Consolidate the 3 fragmented engines into one that writes `KpiValue` rows in Postgres; wire (or merge) the dead `AnalyticsEngine`.
- [ ] Implement missing formulas: net/gross revenue, refund rate, return rate, repeat-customer rate, LTV, conversion rate, cart abandonment, payment success rate, on-time delivery, inventory turnover, ROAS, gross margin, channel contribution.
- [ ] Implement PERCENTAGE/AVERAGE aggregation types (currently skipped, `engine.ts:56`).
- [ ] Wire pre-aggregation — schedule `RollupService`; implement `recomputeAggregates`; add rollup/materialized tables for trends.
- [ ] Build full dynamic KPI activation matrix (Commerce→Revenue, Payment→Payment, Shipping→Fulfillment, ERP→Omnichannel, CRM→Attribution, SDK→Experience).
- [ ] Real multi-dimensional GROUP BY (project/channel/source/region/time_bucket).
**Exit:** dashboards read real, persisted, multi-dimensional KPIs computed from canonical Postgres data.

## PHASE 6 — Freshness & reconciliation  (~1 week)
- [ ] Add `freshness_status` + `last_updated` columns to `KpiValue`; standardize the 6-state model (live/delayed/stale/syncing/failed/+timestamp) across all endpoints; add per-source SLA thresholds.
- [ ] Reconciliation: replace hardcoded `isStale:false`; write `reconciliation_issue` rows; implement repair execution (targeted resync) + connector-health-score update.
**Exit:** every KPI/connector shows accurate freshness; mismatches auto-trigger repair.

## PHASE 7 — Reliability & resilience  (~1 week)
- [ ] Circuit breakers (stop calling failing sources), bulkheads (isolate workloads), backpressure (queue depth limits).
- [ ] Per-error-type retry policies; finish DLQ reprocess flow.
**Exit:** a failing source/connector can't cascade; failures land in DLQ and are replayable.

## PHASE 8 — Observability  (~1 week)
- [ ] Fill empty `packages/logger` (pino) + fix `packages/ops/src/logging.ts`; structured logs everywhere with correlation IDs.
- [ ] Add Prometheus metrics + OpenTelemetry tracing across services.
- [ ] Build internal health dashboards (service / ingestion / sync / connector / tenant-error-concentration).
**Exit:** queue depth, processing latency, failure rate, DLQ size all observable + alertable.

## PHASE 9 — UI gap closure  (~1–2 weeks)
- [ ] Build the 7-step onboarding wizard (create→business context→select integrations→credentials→validate→discover→map→activate) with progress indicator.
- [ ] Auto-provision defaults on project create (default dashboards/KPIs/alert templates/namespace).
- [ ] Unlock Settings placeholders: API keys, alert rules, KPI preferences.
- [ ] Wire CSV/PDF export (component exists, unwired); wire alert ack/resolve buttons.
- [ ] Use freshness indicator across all cards (currently one page).
- [ ] (Optional) make Executive/Operational/Investigation switchable modes, not just sections.
**Exit:** a non-technical user can self-serve onboard a project and act on alerts end-to-end.

## PHASE 10 — Governance & compliance  (~1 week)
- [ ] Immutable audit log (append-only / hash-chained); audit all session-auth mutations.
- [ ] Retention enforcement jobs (logs 90d, KPI 2yr, raw payloads archived); make the static UI real.
- [ ] GDPR workflows: data export, delete-on-request, field anonymization.
**Exit:** audit is tamper-evident; retention + GDPR are enforced, not just displayed.

## PHASE 11 — Performance & scale  (~1 week)
- [ ] Time-based table partitioning (orders, events, sync logs, KPI records, audit logs).
- [ ] Tenant-aware cache keys (currently siteId-only); fix global `metric_catalog:all`.
- [ ] Object storage (S3) for raw payloads + report exports; CDN for frontend assets.
**Exit:** queries stay fast as data grows; raw payloads + exports durable + cheap.

## PHASE 12 — Advanced (doc Phase 4/5)  — optional / last
- [ ] Anomaly detection (replace `anomaly-detector.ts` stub) + forecasting.
- [ ] SSO/SAML, billing/rate-based pricing, SLA controls, partner ecosystem.

---

## Suggested track parallelization (if >1 engineer)
- Backend Eng A: Phase 0 → 1 → 2 → 4 → 7 (the data/queue/reliability spine).
- Backend Eng B: Phase 3 (connectors) → 5 (KPIs) → 6 (freshness) after Phase 1 lands.
- Frontend Eng: Phase 9 (UI) — can start onboarding wizard early; export/settings after Phase 5.
- Platform/DevOps: Phase 8 (observability) + 11 (scale infra) + Phase 2 infra.

## Rough total
Phases 0–11 ≈ **13–18 weeks** for 2 engineers; Phase 12 additional. Phases 0–5 (≈8–9 wks) get you to "honestly functional + secure"; 6–11 get you to "matches the documentation."
