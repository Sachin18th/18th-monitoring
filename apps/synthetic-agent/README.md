# Synthetic Monitoring Agent (`apps/synthetic-agent`)

A Playwright-based automated test agent that validates critical user journeys every 4 hours, on both desktop and mobile browsers, and ingests results into the KPI Monitoring API.

---

## 🎯 What It Tests

| Journey | Desktop | Mobile | Notes |
|---------|---------|--------|-------|
| Homepage Load | ✅ | ✅ | Measures TTFB, LCP on page load |
| Login Flow | ✅ | ✅ | Fills form, submits, checks navigation |
| Protected Route Access | ✅ | ✅ | Validates unauthorized redirect to /login |

---

## 🧱 Architecture

```
index.ts (Cron Scheduler: 0 */4 * * *)
    └── fetchAgentToken()      → POST /api/v1/auth/login  → JWT token
    └── runHomepageJourney()   → Playwright Desktop + Mobile
    └── runLoginJourney()      → Playwright Desktop + Mobile
    └── runProtectedAccessJourney() → Playwright Desktop + Mobile
    └── ingestResult()         → POST /api/v1/dashboard/synthetic/run-results
```

---

## 🚀 Setup & Running

```bash
# Install dependencies
npm install --prefix apps/synthetic-agent

# Install Playwright browser (Chromium only)
npx --prefix apps/synthetic-agent playwright install chromium

# Run once immediately (for testing)
npm run synthetic:run

# Run with watcher (dev mode)
npm run dev:synthetic
```

---

## ⚙️ Environment Variables

Create `apps/synthetic-agent/.env` (optional — defaults work for local dev):

```env
# URL to run tests against
TARGET_URL=http://localhost:3000

# API base for ingesting results
API_BASE=http://localhost:4000

# Project to tag run results under
SITE_ID=store_001

# Service account credentials
AGENT_EMAIL=superadmin@monitor.io
AGENT_PASS=password123
```

---

## 📊 What Gets Captured Per Run

Each journey step captures:
- **`success_status`** — pass/fail boolean
- **`execution_time`** — total time in ms
- **`step_name`** — which step failed (if applicable)
- **`error_logs`** — browser error message on failure
- **`metrics.lcp`** — Largest Contentful Paint (ms)
- **`metrics.ttfb`** — Time To First Byte (ms)
- **`metrics.cls`** — Cumulative Layout Shift

---

## 🔔 Alerts Triggered

The agent triggers automatic alerts when:
- Any journey `success_status` is `false` → **Critical** alert in dashboard
- LCP > 3000ms → **High** alert
- Success rate across 24h drops below 95% → **High** alert

---

## 🗓️ Cron Schedule

Default: `0 */4 * * *` — runs every 4 hours (midnight, 4am, 8am, 12pm, 4pm, 8pm UTC)

To change: edit the cron expression in `src/index.ts`:
```ts
cron.schedule('0 */4 * * *', () => { runAllJourneys(); });
```
