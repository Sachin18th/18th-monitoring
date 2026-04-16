# Dashboard (`apps/dashboard`)

The Next.js 15 (App Router) visualization layer for the KPI Monitoring Platform. Renders real-time observability, synthetic monitoring results, and integration health across tenant-scoped project boundaries.

---

## 📺 Pages

| Route | Description |
|-------|-------------|
| `/login` | Token-based authentication gateway |
| `/projects` | Multi-project portfolio view (SUPER_ADMIN) |
| `/project/[projectId]/overview` | Real-time primary KPIs |
| `/project/[projectId]/performance` | **Enhanced** — RUM + Synthetic monitoring |
| `/project/[projectId]/alerts` | Active alert log |
| `/project/[projectId]/integrations` | ERP/OMS sync health |
| `/project/[projectId]/customers` | User management (RBAC) |
| `/project/[projectId]/settings` | Alert threshold config |

---

## 🧩 UI Components

### Performance Module (New/Enhanced)

| Component | File | Description |
|-----------|------|-------------|
| `SyntheticJourneyWidget` | `SyntheticJourneyWidget.tsx` | Health overview card per journey with success rate + sparkbar |
| `SyntheticFailureLog` | `SyntheticFailureLog.tsx` | Expandable failure log with error text + screenshot links |
| `SyntheticHistoryChart` | `SyntheticHistoryChart.tsx` | 7-day line chart of journey success rates (line per flow) |
| `BrowserMatrix` | `BrowserMatrix.tsx` | Per-browser LCP + success rate table for desktop & mobile |
| `DeviceMobileComparison` | `DeviceMobileComparison.tsx` | Side-by-side bar comparison of key metrics across devices |
| `SlowPageTable` | `SlowPageTable.tsx` | Top 5 slowest user-facing pages with status classification |
| `RegionalBreakdown` | `RegionalBreakdown.tsx` | TTFB + LCP comparison bar chart per region |
| `ResourceBreakdown` | `ResourceBreakdown.tsx` | Frontend payload weight (JS/CSS/Images/Fonts) |

---

## 📡 Data Fetching (Performance Page)

The performance page fetches 8 endpoints in parallel via `Promise.allSettled`:

```
/api/v1/dashboard/performance/summary
/api/v1/dashboard/performance/trends
/api/v1/dashboard/performance/regional
/api/v1/dashboard/performance/device
/api/v1/dashboard/performance/resources
/api/v1/dashboard/performance/slowest-pages
/api/v1/dashboard/synthetic/dashboard      ← NEW
/api/v1/dashboard/synthetic/failures       ← NEW
```

All requests carry `Authorization: Bearer <token>` injected by `AuthContext.apiFetch()`.

---

## 🚀 Running

```bash
# From workspace root
npm run dev:dashboard

# OR directly
cd apps/dashboard
npm run dev
# Serves on http://localhost:3000
```

### Environment
```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## 🔐 Auth Flow

1. User logs in → API returns JWT token
2. `AuthContext` stores token in memory + localStorage
3. All `apiFetch()` calls inject `Authorization: Bearer <token>`
4. 401 responses trigger auto-logout redirect to `/login`

---

## 💡 Design System

- Variables defined in `globals.css`: `--bg-surface`, `--accent-blue`, `--text-primary`, etc.
- All components use inline styles with CSS variables for theme consistency
- Micro-animations via `transition: all 0.2s ease` + `transform: translateY(-Xpx)` on hover
- Color-coded states: `#10b981` (healthy) · `#f59e0b` (warning) · `#ef4444` (critical)
