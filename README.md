# E-Commerce KPI Monitoring Platform

> **Status: Production-Grade Synthetic Monitoring + Observability Layer Active**

A production-grade observability, alerting, and synthetic monitoring platform for multi-tenant e-commerce environments. Provides real-time KPI ingestion, Core Web Vitals, automated synthetic journey validation, and deep ERP/OMS integration monitoring with strict tenant isolation.

---

## 🚀 Key Modules

### 1. 🧪 Synthetic Monitoring Agent (NEW)
Automated Playwright-based monitoring that runs every **4 hours** against real desktop and mobile browser contexts.

- **Journey Coverage**: Homepage Load, Login Flow, Signup Flow, Protected Route Access, Navigation
- **Device Emulation**: Full Chromium desktop + iPhone 13 mobile simulation
- **Metrics Captured per Run**:
  - Step-level pass/fail results
  - LCP, TTFB, CLS Core Web Vitals
  - Execution time per journey
  - Console errors & network failures
  - Screenshots on failure
  - Final journey success rate
- **Cron Schedule**: `0 */4 * * *` — runs at midnight, 4am, 8am, 12pm, 4pm, 8pm

### 2. 📊 Performance & Real User Monitoring (RUM) (ENHANCED)
High-fidelity tracking of frontend health using standardized Google metrics.

- **Page Load Metrics**: TTFB, FCP, LCP, Full Load Time, P95 Load Time
- **Rendering Metrics**: CLS, FID/INP, visual stability
- **Segmentation**: Desktop vs Mobile, Browser-level (Chrome/Safari/Edge/Firefox), Region-based
- **Resource Analysis**: JS, CSS, Images, Fonts weight breakdown

### 3. 🌍 Integration & ERP Governance
Real-time monitoring of the data supply chain.

- **Connectivity Map**: Visual status of SAP, Shopify, and Legacy system synchronization.
- **Sync Success Trends**: Area-chart tracking of ingestion health over the last 24 hours.
- **Manual Ingestion**: Operational controls for CSV reconciliation and manual sync triggers.

### 4. 📦 KPI Aggregation Engine
High-throughput event streaming and normalization.

- **Order Reconciliation**: Tracking delayed or stuck orders across the supply chain.
- **Revenue Monitoring**: Real-time sales tracking with anomaly detection.
- **Customer Intelligence**: Dynamic segmentation of active user sessions.

---

## 🏗️ Technical Architecture

```
Browser/Mobile → Playwright Agent → POST /synthetic/run-results
                                          ↓
Source: Shopify/SAP → Ingestion Layer → Stream Processor → KPI Aggregation → API Layer → Next.js Dashboard
                                                                                  ↑
                                                              In-Memory Store (GlobalMemoryStore)
```

---

## 🛠️ Local Development Setup

### Prerequisites
- Node.js 18+

### Quick Start
```bash
# 1. Install all dependencies (including synthetic agent)
npm install
npm install --prefix apps/synthetic-agent

# 2. Install Playwright browsers
npx --prefix apps/synthetic-agent playwright install chromium

# 3. Start API + Dashboard (in one terminal)
npm run dev

# 4. (Optional) Start Synthetic Agent (in separate terminal)
npm run dev:synthetic
```

### Environment Variables

**API** (`apps/api/.env.local`):
```
PORT=4000
JWT_SECRET=your_secret_here
```

**Synthetic Agent** (`apps/synthetic-agent/.env`):
```
TARGET_URL=http://localhost:3000    # Dashboard URL to test against
API_BASE=http://localhost:4000      # API base URL for ingestion
SITE_ID=store_001
AGENT_EMAIL=superadmin@monitor.io
AGENT_PASS=password123
```

---

## 📡 Core API Endpoints

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | Login, returns Bearer token |
| GET | `/api/v1/user/me` | Authenticated user profile |

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/dashboard/performance/summary` | RUM metrics summary |
| GET | `/api/v1/dashboard/performance/trends` | Web Vitals over time |
| GET | `/api/v1/dashboard/performance/regional` | Regional latency comparison |
| GET | `/api/v1/dashboard/performance/device` | Device segmentation |
| GET | `/api/v1/dashboard/performance/resources` | Frontend resource weight |
| GET | `/api/v1/dashboard/performance/slowest-pages` | Slowest page paths |

### Synthetic Monitoring (NEW)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/dashboard/synthetic/run-results` | Ingest synthetic test run |
| GET | `/api/v1/dashboard/synthetic/dashboard` | Journey success rate summary |
| GET | `/api/v1/dashboard/synthetic/history` | Recent run history |
| GET | `/api/v1/dashboard/synthetic/failures` | Failure log with error details |

All endpoints support query params: `siteId`, `timeRange`, `device`, `browser`.

---

## 🔐 Security & Compliance
- **Tenant Isolation**: Strict middleware enforcement — User A cannot see Site B's data
- **Bearer JWT Auth**: All dashboard + synthetic endpoints require `Authorization: Bearer <token>`
- **Rate Limiting**: 100 requests/min per IP

---

## 🔔 Alerts

The alert engine triggers on:
| Event | Severity |
|-------|----------|
| Synthetic journey failure | Critical |
| LCP > 3000ms | High |
| Login / signup flow fails | Critical |
| Success rate < 95% | High |
| OMS sync failure | Critical |
| Error rate > 4% | High |

---

## 📖 Extended Documentation
- [API Synthetic Endpoints](./apps/api/README.md) - Full payload reference
- [Dashboard README](./apps/dashboard/README.md) - Component tree
- [Synthetic Agent README](./apps/synthetic-agent/README.md) - Playwright setup

---
*Architecture: Antigravity Production Observability Platform · 2026*
