# Performance Analytics Intelligence Backend Reference

This document describes the high-fidelity performance intelligence pipeline for RUM and system observability.

## 1. Unified Performance Data Model
The system ingests signals from both front-end (Real User Monitoring) and back-end (System/API) layers into a canonical schema.

### Core Signal (Raw)
- **Category**: `RUM`, `SYSTEM`, `API`, `INFRASTRUCTURE`.
- **Metrics**: `LCP`, `INP`, `CLS` (Web Vitals) | `API_LATENCY`, `DB_LATENCY`, `QUEUE_LAG`.
- **Dimensions**: Region, Device, Browser, Route, Release Version, Feature Flags.
- **Traceability**: Correlation with `traceId` and `correlationId` across distributed boundaries.

---

## 2. High-Resolution Aggregation (Rollups)
The engine automatically computes time-series rollups to balance query speed with historical resolution.

### Rollup Buckets
- **Real-Time**: 1-minute and 5-minute resolution for operational monitoring.
- **Historical**: Hourly and Daily buckets for trend analysis and SLA reporting.

### Statistical Fidelity (Percentiles)
Unlike basic monitoring, the engine uses percentile-based metrics to identify late-tail latency:
- `p50` (Median), `p75`, `p90`, `p95`, `p99`.

---

## 3. Anomaly & Regression Detection
The backend provides intelligence to identify performance shifts:
- **Percentile Shifts**: Detecting when p99 latency spikes even if the average remains stable.
- **Release Correlation**: Automatically tagging metrics with `release_version` to identify performance regressions exactly when a new deployment occurs.
- **Dependency Tracking**: Monitoring latencies of third-party APIs (Payment Gateways, Shipping Providers) to isolate external vs. internal bottlenecks.

---

## 4. Multi-Dimensional Segmentation
All performance data is indexed for high-cardinality analysis:
- **User Segmentation**: Performance by Country, ISP, Browser, OS, and Connection Type.
- **Infrastructure Segmentation**: Latency by Cloud Region, Availability Zone, and Microservice.
- **Environment Segmentation**: Stability checks across `production`, `staging`, and `development`.

---

## 5. Scalability & Correctness
- **Twin-Table Architecture**: Raw signals move to `performance_metrics` for debugging, while `performance_rollups` serve rapid analytical queries.
- **Freshness**: Ingestion lag and aggregation drift are monitored to ensure metrics represent the true current state.
- **Replay**: Raw data can be re-aggregated to correct historical metrics after logic or threshold updates.
