# Platform Architecture: KPI Monitoring & Ingestion

## 1. High-Level Data Flow
The platform is built on an **Event-Driven Architecture (EDA)** that distinguishes between "Real-time Telemetry" (Web Vitals) and "Batch Ingestion" (ERP/OMS Syncs).

### 1.1 KPI Ingestion Pipeline
1.  **Ingestion Layer**: A stateless API validates incoming event payloads (JSON or CSV).
2.  **Normalization Layer**: Events pass through the `OrderNormalizationService` or `MetricValidationService` to ensure schema consistency.
3.  **Streaming**: Normalized events are published to a `MemoryBus` (mapped to Redis Pub/Sub in production).
4.  **DLQ (Dead Letter Queue)**: Failed syncs are caught by the `dlqWorker`, allowing admins to replay failed orders after resolving connector issues.
5.  **Aggregation**: The `KPI Engine` performs time-series aggregation (minutely/hourly) for the dashboard.

## 2. Regional & Device Segmentation
To support global e-commerce deployments, the platform implements a multi-dimensional metric store:

| Dimension | Implementation | Purpose |
| :--- | :--- | :--- |
| **Region** | CloudFront Edge Header / GeoIP | Localized performance tracking (US vs EU vs Asia). |
| **Device** | User-Agent Parsing (Mobile/Tablet/Desktop) | Cross-device UI/UX optimization. |
| **Browser** | Core Web Vitals (LCP, FID, CLS) | Browser-specific performance debugging. |

## 3. Storage & Caching Strategy

### 3.1 Persistence (PostgreSQL)
- **Primary Cache**: Aggregated KPI summaries.
- **Relational Integrity**: Strictly strictly enforced site-to-user mappings.

### 3.2 Cache Layer (Redis)
- **Resolved Results**: Dashboard API responses are cached with a ttl of 300s.
- **Config Store**: Tenant-specific monitoring thresholds are cached for high-frequency access.
- **Invalidation**: Any change to `Project Settings` triggers a site-wide cache flush to ensure immediate policy enforcement.

## 4. Operational Recovery
- **DLQ Replay**: Administrative script `scripts/prod-ops.ts` allows re-processing of failed CSV rows.
- **Graceful Shutdown**: The API handles `SIGTERM` by finishing active DB transactions and flushing telemetry buffers before exiting.

---
*Technical Architecture Review v1.1.0*
