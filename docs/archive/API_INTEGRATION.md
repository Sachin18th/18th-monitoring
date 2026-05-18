# API Integration Documentation

This document provides the exhaustive technical specification for the KPI Monitoring System API (v1). It is intended for developers, integration teams, and partners building or maintaining data pipelines into the platform.

---

## 🏗️ 1. Integration Architecture

The platform uses a hybrid ingestion model to accommodate various source systems:

*   **Telemetry Ingestion (Push)**: Real-time event streams from Browsers (RUM) and Servers (Orders/Heartbeats).
*   **Webhook Integration (Push)**: Inbound hooks from Shopify, Magento, etc.
*   **Managed Connectors (Pull)**: Scheduled polling of SAP, IBM Sterling, etc.
*   **Batch Reconciliation (Push)**: Manual CSV uploads for offline systems.

---

## 🔐 2. Authentication & Security Flow

The system enforces strict multi-tenant isolation and role-based access control (RBAC).

### A. Management API (User Login)
1.  **Login**: `POST /api/v1/auth/login` with email/password.
2.  **Bearer Token**: Server returns a JSON object with a `token`.
3.  **Usage**: Add header `Authorization: Bearer <token>` to all administrative and dashboard requests.
4.  **Expiry**: Tokens are valid for 1 hour. Re-authenticate upon receiving a `401 Unauthorized` response.

### B. Ingestion API (Site Key)
1.  **API Key**: Generated per `siteId` in the Governance Console.
2.  **Usage**: Add header `x-api-key: <your_key>` to telemetry and public read requests.

---

## 🛠️ 3. API Reference (Core Groups)

### A. Authentication Module

#### `POST /auth/login`
*   **Purpose**: Obtain a session token.
*   **Method**: `POST`
*   **Headers**: `Content-Type: application/json`
*   **Request Body**:
    *   `email` (string): User email.
    *   `password` (string): Plaintext password.
*   **Sample Request**:
    ```bash
    curl -X POST http://localhost:4000/api/v1/auth/login \
      -H "Content-Type: application/json" \
      -d '{"email": "superadmin@monitor.io", "password": "password123"}'
    ```
*   **Success Response (200 OK)**:
    ```json
    { "token": "abc123token", "user": { "id": "u-01", "role": "SUPER_ADMIN" } }
    ```

---

### B. User & Access Control APIs

#### `GET /api/v1/projects`
*   **Purpose**: List all projects assigned to the current user.
*   **Method**: `GET`
*   **Auth**: Bearer Token
*   **Success Response**: `Array<Project>`
*   **Validation**: Filtered by user role; SUPER_ADMIN handles all.

#### `POST /api/v1/p/:siteId/access-control/keys`
*   **Purpose**: Create a new Site API Key for telemetry.
*   **Method**: `POST`
*   **Path Params**: `siteId` (required).
*   **Body**: `{ "label": "Shopify Ingest Key" }`
*   **Validation**: Restricted to ADMIN/SUPER_ADMIN roles.

---

### C. Ingestion Module (Data Streams)

#### `POST /api/v1/i/server`
*   **Purpose**: High-throughput server-side event ingestion.
*   **Method**: `POST`
*   **Auth**: `x-api-key`
*   **Request Body**:
    ```json
    {
      "siteId": "tc_demo_004",
      "events": [
        {
          "eventId": "ord_999",
          "eventType": "order_placed",
          "timestamp": "2026-04-14T10:00:00Z",
          "metadata": {
            "orderId": "TX-12345",
            "amount": 149.99,
            "currency": "USD"
          }
        }
      ]
    }
    ```
*   **Field Explanation**:
    *   `eventId`: UUID string. Used for exactly-once processing (deduplication).
    *   `eventType`: Identifies the schema context. Valid: `order_placed`, `sync_failed`, `heartbeat`.
    *   `timestamp`: ISO-8601 UTC string. Must be within +/- 24h of current server time.
    *   `metadata`: Contextual key-value pairs. `amount` and `currency` are mandatory for `order_placed`.
*   **Validation Rules**: 
    *   Batch size restricted to 500 events per request.
    *   Unknown `siteId` values return a `404 Not Found`.
*   **Downstream Impact**: Events are published to the `KAFKA.SERVER_EVENTS` topic for asynchronous aggregation. Metrics refresh globally every 60 seconds.

---

### D. Metrics & Dashboard API

#### `GET /api/v1/dashboard/summaries`
*   **Purpose**: Retrieve KPI card data.
*   **Method**: `GET`
*   **Query Parameters**:
    *   `siteId` (string, required): The target project ID (e.g., `tc_demo_004`).
    *   `timeRange` (string, optional): Lookback window. Options: `1h` (default), `24h`, `7d`, `30d`.
    *   `limit` (number, optional): Max records to return for nested series data.
*   **Success Response**: `Array<KpiSummaryObject>`
*   **Business Logic Notes**: 
    *   **Health State Logic**: 
        *   `pageLoadTime`: `healthy` (<3s), `warning` (3-4s), `critical` (>4s).
        *   `errorRatePct`: `healthy` (<2%), `warning` (2-4%), `critical` (>4%).
        *   `syncSuccessRate`: `healthy` (>95%), `warning` (90-95%), `critical` (<90%).
    *   **Trend Calculation**: The `trendPct` represents a comparison between the current `timeRange` window and the immediately preceding period of equal length.

---

### E. Health, Status & Sync APIs

#### `GET /api/v1/projects/:siteId/integrations/status`
*   **Purpose**: Check health of all configured connectors.
*   **Success Response**:
    ```json
    {
      "connectors": [
        { "id": "sap_erp", "status": "active", "latency": "420ms" },
        { "id": "ibm_sterling", "status": "degraded", "error": "Timeout" }
      ]
    }
    ```

---

### F. Seed & Simulation APIs

#### `POST /api/v1/simulate`
*   **Purpose**: Trigger a traffic simulation for demo purposes.
*   **Payload**: `{ "siteId": "tc_demo_004", "type": "high_traffic" }`
*   **Business Logic**: Generates ~10 random order and performance events.

---

## 🔌 4. 3rd-Party Integration Flows

### Shopify / Magento (Webhooks)
1.  **Configure Hook**: Set endpoint to `http://api.monitor.io/api/v1/webhooks/<connector_id>`.
2.  **Verify Authentication**: Header `x-api-key` or shared secret verification.
3.  **Data Flow**: Inbound JSON → Normalization Service → Kafka Topic → KPI Processor.

### SAP / IBM Sterling / ERP (OMS)
1.  **Polling Setup**: Credentials stored in Vault.
2.  **Mapping**: Raw fields (e.g., `hdr_amt`) mapped to `amount`.
3.  **Governance**: All attempts logged in `GET /access-control/audit`.

---

## 🚨 5. Error Handling & Troubleshooting

| Status Code | Type | Logic / Meaning |
|---|---|---|
| **400** | Bad Request | Schema validation failure (Zod error). |
| **401** | Unauthorized | Bearer token or API key is invalid/expired. |
| **403** | Forbidden | Role restriction (Viewer cannot admin). |
| **404** | Not Found | siteId or connectorId does not exist. |
| **429** | Rate Limited | Exceeded 100 requests per minute. |

---

## 👨‍💻 6. Developer & Integration Notes

### Local Environment Setup
1.  Run `npm run dev` to start the API on port 4000.
2.  Run `npm run demo:seed` to populate the `tc_demo_004` project.
3.  Test paths with `curl` or Postman using the provided examples.

### Recommended Debugging
*   **Logs**: Check API server console for transformation details.
*   **Store**: View `GlobalMemoryStore` for in-memory state during debugging.

---
*Technical Reference · 18th Observability Platform 2026*
