# API Exposure Layer Documentation (v1)

The Monitoring Platform Exposure Layer provides a production-grade, secure, and versioned interface for external systems to consume KPIs, metrics, and operational insights.

## Core Features
- **API First**: Dedicated endpoints for different business domains.
- **Secure**: Authentication via API Keys with scope-based authorization.
- **Reliable**: Standardized response envelopes with trace IDs for observability.
- **Performant**: Built on Fastify with integrated rate-limiting and query optimization.

---

## Authentication

All requests to the Exposure Layer must include a valid API Key in the `X-API-KEY` header.

**Key Format**: `[prefix].[secret]` (e.g., `mk_live_8f7b.sk_live_master_seed`)

| Header | Value | Description |
|--------|-------|-------------|
| `X-API-KEY` | `your_api_key_here` | Required for all exposure endpoints. |

### Scopes
API Keys are restricted by scopes. If a key lacks the required scope, a `403 Forbidden` error is returned.
- `reporting`: Basic access to KPI and health summaries.
- `performance`: Access to detailed latency and regional data.
- `orders`: Access to order lifecycle and volume metrics.
- `customers`: Access to audience intelligence and behavior.
- `integrations`: Access to connector health and sync history.
- `admin`: Access to governance and audit configurations.

---

## Standard Response Format

Every response follows this envelope structure:

```json
{
  "status": "success | error",
  "data": { ... },
  "metadata": {
    "timestamp": "2026-04-20T12:00:00.000Z",
    "filters": { "siteId": "store_001" },
    "pagination": { "total": 100, "limit": 50, "offset": 0 }
  },
  "errors": [
    { "code": "ERROR_CODE", "message": "Human readable message" }
  ],
  "traceId": "tx_abc123"
}
```

---

## Endpoint Reference

### 1. Overview & Health
| Method | Endpoint | Description | Scope |
|--------|----------|-------------|-------|
| `GET` | `/api/v1/overview/kpis` | Fetch core KPIs (Page load, errors, orders). | `reporting` |
| `GET` | `/api/v1/overview/health` | Get system health score and active alerts. | `reporting` |
| `GET` | `/api/v1/overview/full` | Full overview including recent activity. | `reporting` |

### 2. Performance & Latency
| Method | Endpoint | Description | Scope |
|--------|----------|-------------|-------|
| `GET` | `/api/v1/performance/summary` | Latency percentiles (p50, p95, etc.). | `performance` |
| `GET` | `/api/v1/performance/regional` | Real-user monitoring by geographic region. | `performance` |
| `GET` | `/api/v1/performance/series` | Time-series data for a specific metric. | `performance` |

### 3. Orders & Business
| Method | Endpoint | Description | Scope |
|--------|----------|-------------|-------|
| `GET` | `/api/v1/orders/summary` | Online/Offline split, volume, and delays. | `orders` |
| `GET` | `/api/v1/orders` | List orders with status filters and pagination. | `orders` |
| `GET` | `/api/v1/orders/trends` | Order volume trends over time. | `orders` |

### 4. Audience & Intelligence
| Method | Endpoint | Description | Scope |
|--------|----------|-------------|-------|
| `GET` | `/api/v1/customers/analytics` | Device/Browser breakdown and active users. | `customers` |
| `GET` | `/api/v1/customers/intelligence` | Funnel data and segmentation cohorts. | `customers` |

### 5. Integrations & Connectors
| Method | Endpoint | Description | Scope |
|--------|----------|-------------|-------|
| `GET` | `/api/v1/integrations/summary` | Sync success rates and failure counts. | `integrations` |
| `GET` | `/api/v1/integrations/status` | Current status of all external connectors. | `integrations` |

---

## Example Usage (cURL)

### Fetch KPIs
```bash
curl -X GET "http://localhost:4000/api/v1/overview/kpis" \
     -H "X-API-KEY: mk_live_8f7b.sk_live_master_seed"
```

### Get Detailed Orders
```bash
curl -X GET "http://localhost:4000/api/v1/orders?status=shipped&limit=10" \
     -H "X-API-KEY: mk_live_8f7b.sk_live_master_seed"
```

### Error Handling Example
If an invalid key is provided:
```json
{
  "status": "error",
  "errors": [
    {
      "code": "UNAUTHORIZED_KEY_NOT_FOUND",
      "message": "The provided API Key prefix does not exist or the key is inactive."
    }
  ],
  "traceId": "tx_xyz789"
}
```

---

## Rate Limiting
- **Standard Keys**: 100 requests / minute.
- **VIP Keys**: 5,000 requests / minute.
- Exceeding limits will return a `429 Too Many Requests` status code.
