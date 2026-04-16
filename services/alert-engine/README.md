# Alert Engine Service

The reactive guardian of the platform, responsible for detecting and managing incident lifecycles.

## 1. Overview

The Alert Engine is a reactive service that evaluates system health metrics against site-specific rules. When a KPI breaches a defined threshold, the engine creates an "Alert" which is visualized on the dashboard to notify stakeholders.

## 2. Responsibilities

- **Rule Evaluation**: Compare real-time metrics against thresholds.
- **Incident Lifecycle**: Manage the transition of alerts from `active` to `resolved`.
- **Filtering**: Apply site-specific logic to ignore noise or flapping metrics.
- **Notification Preparation**: Formatting alert data for external dispatch (e.g., Slack, Email).

## 3. How It Fits in Architecture

- **Upstream Trigger**: Called by the **services/processor** whenever a new KPI is recorded.
- **Downstream Persistence**: Writes alert states to **packages/db** (Relational adapter).
- **Data Flow Interaction**:
  1. Receives `evaluate(siteId, kpiName, value)`.
  2. Resolves rules via **packages/config**.
  3. If breach detected -> Saves incident meta to DB.

## 4. Key Components

- **`src/evaluator/`**:
  - `rule-evaluator.ts`: Logic for performing threshold comparisons (GT, LT, EQ).
- **`src/persistence/`**: 
  - `alert-storage.ts`: Abstraction for saving and retrieving alert incidents.
- **`src/dispatcher/`**: (Future) Plug-and-play adapters for external notification services.

## 5. Alert Lifecycle

1. **Trigger**: KPI breach detected.
2. **Active**: Alert is saved and visible prominently on the Dashboard.
3. **Recovery** (Manual/Auto): Triggered when metric returns to healthy range.
4. **Resolved**: Alert remains in history but is removed from active banners.

## 6. Configuration & Rules

Rules are dynamically derived from the `packages/config` layer using the `ConfigResolver`. This allows each store/brand to have unique performance SLAs:
- **store_us**: `pageLoadTime > 4000ms` -> Warning.
- **store_eu**: `pageLoadTime > 2500ms` -> Critical.

## 7. Local Development

Run as part of the core platform process:
```bash
npm run dev
```

## 8. Future Improvements

- **Deduplication**: Prevent multiple alerts for the same continuous breach.
- **Escalation Logic**: Increase severity if an alert remains active for > 30 minutes.
- **Dynamic Thresholds**: Use historical averages to auto-generate baseline thresholds.
- **Out-of-the-Box Dispatchers**: Built-in support for PagerDuty, Slack, and OpsGenie.
