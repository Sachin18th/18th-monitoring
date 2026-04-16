# Backend API (`apps/api`)

Built on **Fastify** for high-throughput JSON routing, with strict tenant isolation and RBAC guard chains.

---

## 🌐 All Endpoints

### Auth
| Method | Path | Auth | Payload |
|--------|------|------|---------|
| POST | `/api/v1/auth/login` | None | `{ email, password }` |
| GET | `/api/v1/user/me` | Bearer | — |
| GET | `/api/v1/projects` | Bearer + ADMIN | — |

### Performance Dashboard
| Method | Path | Auth | Query Params |
|--------|------|------|--------------|
| GET | `/api/v1/dashboard/performance/summary` | Bearer | `siteId` |
| GET | `/api/v1/dashboard/performance/trends` | Bearer | `siteId` |
| GET | `/api/v1/dashboard/performance/regional` | Bearer | `siteId` |
| GET | `/api/v1/dashboard/performance/device` | Bearer | `siteId` |
| GET | `/api/v1/dashboard/performance/resources` | Bearer | `siteId` |
| GET | `/api/v1/dashboard/performance/slowest-pages` | Bearer | `siteId` |

### Synthetic Monitoring *(NEW)*
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/dashboard/synthetic/run-results` | Bearer | Ingest one synthetic journey run |
| GET | `/api/v1/dashboard/synthetic/dashboard` | Bearer | Summary per journey (success %, avg time) |
| GET | `/api/v1/dashboard/synthetic/history` | Bearer | Last 50 run records |
| GET | `/api/v1/dashboard/synthetic/failures` | Bearer | Failed runs with error logs + screenshot URLs |

#### POST `/api/v1/dashboard/synthetic/run-results` — Payload
```json
{
  "journey_name": "Login Flow",
  "device_type": "mobile",
  "browser": "chromium",
  "success_status": false,
  "step_name": "Form Submission",
  "execution_time": 12400,
  "error_logs": "Timeout waiting for selector '#dashboard'",
  "screenshot_url": "/screenshots/login_fail_mobile.png",
  "region": "US-East",
  "metrics": {
    "lcp": 2800,
    "cls": 0.12,
    "ttfb": 620
  }
}
```

#### GET `/api/v1/dashboard/synthetic/dashboard` — Response
```json
[
  { "journey": "Homepage Load", "successRate": 99.8, "avgTime": 1200 },
  { "journey": "Login Flow",    "successRate": 98.5, "avgTime": 2400 },
  { "journey": "Signup Flow",   "successRate": 99.1, "avgTime": 3100 }
]
```

#### GET `/api/v1/dashboard/synthetic/failures` — Response
```json
[
  {
    "runId": "syn_ab12c3",
    "timestamp": "2026-04-14T06:00:00Z",
    "journey_name": "Signup Flow",
    "step_name": "Submit Form",
    "device_type": "mobile",
    "browser": "webkit",
    "error_logs": "Timeout waiting for selector '#success-message'",
    "screenshot_url": "/screenshots/mock_failure.png",
    "execution_time": 15000
  }
]
```

---

## 🔐 Authentication
All dashboard and synthetic endpoints require:
```
Authorization: Bearer <jwt_token>
```

Obtain token via `POST /api/v1/auth/login`.

---

## 🏃 Running Locally
```bash
tsx apps/api/src/server.ts
# Listens on :4000 by default
```

### Environment Variables
```
PORT=4000
JWT_SECRET=min_64_char_random_secret
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000
```
