# Operational Alerts

In a production environment, you must monitor the health of the Platform infrastructure itself alongside the tenants' KPIs. The following operational alerts should be configured in an external observability system (e.g. Prometheus + Alertmanager, or Datadog).

## Critical Alerts
- **Kafka Pub/Sub Failure Rate (`kpi_stream_publish_failures_total`)**: 
  - Triggers if > 1% of incoming events fail to route to Kafka. 
  - Impact: Hard data loss for customer dashboards.
- **Relational DB Down**:
  - Triggers if `api` healthcheck drops. 
  - Impact: Authentication and RBAC resolution completely stall.

## High Severity
- **Processor Dead Letter Queue (`kpi_dlq_events_total`)**:
  - Triggers if > 500 records sit unacknowledged in the `dlq.browser_events` topic within a 5-minute window.
  - Impact: Malformed data injections or unhandled code exceptions inside KPI Handlers.
- **API Error Spikes (HTTP 5xx)**:
  - Triggers if `http_requests_total{status="5xx"}` spikes > 2% per minute.
  - Impact: Service degradation across the dashboard API.

## Warning
- **Ingestion Latency**: 
  - Triggers if `http_request_duration_seconds{route="/api/v1/i/browser"}` P95 exceeds 500ms.
  - Impact: Slower event routing, potential queue backpressure emerging.
