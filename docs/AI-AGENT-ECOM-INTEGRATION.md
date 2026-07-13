# Porting `ai-agent-ecom` into the KPI Monitoring Platform

> **Goal:** Bring the valuable features of the **`ai-agent-ecom`** app into the **`kpi monitoring`** platform — **everything except the GA4 implementation** — without duplicating infrastructure that KPI Monitoring already has (auth, multi-tenancy, connectors, DB, dashboard shell).
>
> **Status:** Planning / implementation blueprint
> **Scope owner:** _fill in_
> **Last updated:** 2026-07-10

---

## 1. The two projects at a glance

| | `ai-agent-ecom` (source) | `kpi monitoring` (target) |
|---|---|---|
| **What it is** | AI-driven e-commerce analytics + recommendations + marketing campaigns SaaS | Multi-tenant e-commerce observability / KPI monitoring platform |
| **Frontend** | Next.js 14 App Router (single app) | Next.js (App Router) — `apps/dashboard` |
| **Backend** | Next.js API routes + **Python FastAPI ML engine** (`ai-agent-recom/`) | **Fastify** monorepo API — `apps/api` |
| **Repo shape** | Single Next.js app + Python sub-project | npm-workspaces monorepo (`apps/*`, `packages/*`, `services/*`) |
| **DB** | Prisma + Postgres | Prisma + Postgres (`packages/db`) |
| **Auth** | NextAuth v5, email **OTP** | Custom **OTP + opaque session-token** (already built) |
| **Multi-tenancy** | `Tenant → Brand → Membership` | `Tenant → Project(siteId) → UserProjectAccess` (already built) |
| **Billing** | **Stripe** subscriptions | ❌ none (greenfield) |
| **Connectors** | Shopify / Magento / BigCommerce | Shopify / Adobe Commerce / BigCommerce (already built) |
| **AI/ML** | ALS collaborative filtering, embeddings (Qdrant), RandomForest analytics, OpenAI pitch generation | ❌ none |
| **GA4** | ✅ present (`shopifyGA4auth/`, `ga4_client.py`) | ❌ absent — **and staying out of scope** |

**Core takeaway:** The two apps overlap heavily on *plumbing* (auth, tenancy, connectors, Prisma, Next.js dashboard) but `ai-agent-ecom` adds a whole **AI/ML + marketing-campaign + billing** layer that KPI Monitoring does not have. That AI/ML/campaign/billing layer is what we port.

---

## 2. Guiding principle: **Reuse the foundation, port the differentiators**

KPI Monitoring already has production-grade auth, multi-tenancy, connectors, and a design system. Re-porting `ai-agent-ecom`'s versions of those would create conflicts and duplicate maintenance. So every feature falls into one of three buckets:

- 🟢 **REUSE** — KPI Monitoring already has an equivalent; adapt the ported feature to use it. (Do **not** port `ai-agent-ecom`'s version.)
- 🟡 **PORT** — genuinely new capability; bring it over and adapt it to KPI Monitoring's conventions.
- 🔴 **SKIP** — out of scope (GA4) or superseded.

---

## 3. Feature decision matrix

| # | `ai-agent-ecom` feature | Source files | Decision | Target in `kpi monitoring` |
|---|---|---|---|---|
| 1 | **Auth (NextAuth OTP)** | `auth.ts`, `auth.config.ts`, `lib/otp.ts`, `app/api/auth/*` | 🟢 REUSE | Existing OTP + `UserSession` (`apps/api/.../auth.service.ts`, `otp.controller.ts`) |
| 2 | **Multi-tenant scoping** | `lib/connector-scope.ts`, `lib/tenant/*`, `middleware.ts` | 🟡 **FIX + PORT** | Tenancy is **not fully wired on project creation** in KPI today — see **§3.5.1**. Map `Brand`→**`Store`** (a project can hold multiple stores) — see **§3.5.2** |
| 3 | **Connectors (Shopify/Magento/BigCommerce)** | `lib/connectors.ts`, `app/api/connectors/*`, `connector_sync_service.py` | 🟡 **FIX + EXTEND** | KPI sync is per-entity, sequential, all-or-nothing, and **has no product / product-category sync** — see **§3.5.3** |
| 4 | **Transactional email (OTP)** | `lib/email.ts`, `lib/smtp.ts` | 🟢 REUSE | `apps/api/.../email.service.ts` (nodemailer) |
| 5 | **AI Recommendation engine (Python)** | `ai-agent-recom/` (FastAPI, ALS, embeddings, Qdrant, Redis) | 🟡 PORT | New service: `services/ai-engine/` (or standalone Python svc) |
| 6 | **Recommendations API + UI** | `app/api/recommendations/*`, `components/dashboard/recommendations*` | 🟡 PORT | Fastify proxy routes + dashboard pages |
| 7 | **Customer intelligence / segmentation** (RFM, CLTV, churn, cohort, NBB, health-score, repeat-customers, affinity) | `app/api/{churn,cohort,nbb,metrics,profile,...}`, `components/dashboard/*` | 🟡 PORT | Python engine endpoints + Fastify proxy + dashboard pages |
| 8 | **AI marketing campaigns** (create, approve, schedule, send, OpenAI pitch gen, multi-channel) | `app/api/campaigns/*`, `src/campaigns/*`, Prisma `Campaign*` | 🟡 PORT | New Prisma models + Fastify routes + Python campaign service + dashboard pages |
| 9 | **Stripe billing / subscriptions** | `lib/stripe.ts`, `lib/subscription.ts`, `config/subscriptions.ts`, `actions/*stripe*`, `app/api/webhooks/stripe` | 🟡 PORT | New `billing` service in `apps/api` + Prisma models + dashboard billing page (`Tenant.plan` already exists) |
| 10 | **CSV data import** | `app/api/.../csv-import`, `csv_import_service.py` | 🟢 REUSE / EXTEND | KPI already has `orders/import/csv`; extend for products/customers |
| 11 | **ML model training/registry** | `src/ml/*`, Prisma `TrainedModelRegistry`, `ai-agent/setup` route | 🟡 PORT | Python engine + `TrainedModelRegistry` model + admin trigger endpoint |
| 12 | **Marketing site / blog / docs (Contentlayer)** | `app/(marketing)/*`, `content/*` | 🟡 PORT *(optional)* | Only if a public marketing site is wanted; low priority |
| 13 | **GA4 product analytics** | `shopifyGA4auth/`, `ga4_client.py`, `ga4_product_analytics.py`, `dashboard/product-analytics` | 🔴 **SKIP** | Explicitly excluded |

---

## 3.5 Platform gaps in KPI Monitoring to fix **first** (prerequisite work)

> These are pre-existing problems in `kpi monitoring` that must be fixed **before** (or alongside) the AI/ML port, because the ported features depend on correct tenancy, a store-level data partition, and a reliable multi-entity sync. `ai-agent-ecom` already solved all three — we port its approach.

### 3.5.1 Multi-tenancy is not enforced on project creation 🔴 → 🟢

**Problem (current):** Although the DB has `Tenant → Project`, creating a new project does **not** reliably establish tenant scoping — new projects can be created without a properly bound tenant context, so downstream queries are not guaranteed to be tenant-isolated.

**How `ai-agent-ecom` does it:** every tenant is provisioned through `lib/tenant/provision.ts` / `provision-core.ts`, which creates the `Tenant` + owner `Membership` atomically, and **every** backend call is stamped with `tenant_id` (+ `brand_id`) by `lib/connector-scope.ts` before it can touch data. Nothing reaches the data layer unscoped.

**What to implement in KPI:**
1. **Atomic provisioning on create** — when a project is created, in the same transaction: create/attach the `Tenant`, create the `Project`, and create the creator's `UserProjectAccess` (owner role). No project without a tenant + access row.
2. **Enforce scope at the boundary** — make `tenant-isolation.middleware.ts` **mandatory** on every project-scoped route (reject requests that resolve no `tenantId`), mirroring `connector-scope.ts`'s "fail closed" behaviour. Requests with no resolvable tenant → `403`, never a silent unscoped query.
3. **Scope every new AI/ML query** — all Python-engine calls and new Fastify routes must carry `tenantId` (see §4 data-flow). Add a regression test using the existing tenant-isolation harness that proves tenant A cannot read tenant B's data on the new endpoints.

### 3.5.2 A project must support **multiple stores**, kept isolated 🆕

**Requirement:** one project may contain **two (or more) stores**, and their data must stay **apart** (a store is the isolation unit for orders/customers/products within a project).

**Mapping decision (revises §1/§3):** `ai-agent-ecom`'s **`Brand`** concept → KPI's **`Store`**. The hierarchy becomes:

```
Tenant ──▶ Project ──▶ Store (1..n)  ──▶ Connector instance(s)
                                     └──▶ orders / customers / products / categories
```

**What to implement in KPI:**
1. **`Store` model** in `packages/db/prisma/schema.prisma` — `id`, `tenantId`, `projectId`, `name`, `status`, timestamps; unique `(projectId, name)`. Add `storeId` (nullable → backfill → required) to `ConnectorInstance`, `CanonicalOrder`, `CanonicalProduct`, `CustomerProfile`, and the other commerce/customer tables, each indexed `(tenantId, projectId, storeId)`.
2. **Scope key = `tenantId + projectId + storeId`** everywhere the old code used `tenantId + projectId`. This is exactly `ai-agent-ecom`'s `tenant_id + brand_id` pattern — reuse that shape.
3. **Store selector in the dashboard** — port the idea of `ai-agent-ecom`'s `tenant-switcher` / `project-switcher` (`components/dashboard/*`, `components/providers/tenant-provider.tsx`) as a **store switcher** within a project; carry the active store in a cookie/header like the existing project context, and validate membership server-side.
4. **Connectors bind to a store, not just a project** — connector create/verify (`connector-manager.service.ts`) must require a `storeId`; two stores in one project = two independent connector instances that never share rows.

### 3.5.3 Store sync is sequential, all-or-nothing, and incomplete 🔴 → 🟢

**Problem (current):** On connecting a store, KPI runs entity syncs as **separate services** — `shopify-order-sync.service.ts`, `shopify-customer-sync.service.ts` (+ `-journey-sync`) — fetched **sequentially**, and a failure in one **fails the whole sync**. There is **no product sync and no product-category sync** at all.

**How `ai-agent-ecom` does it:** `ai-agent-recom/src/services/connector_sync_service.py` has a **single unified `sync()`** that pulls **products, customers, orders (and product categories)** via an `entity_types` list, tracks a **per-entity count** (`products_synced`, `customers_synced`, `orders_synced`), and isolates entities so one can succeed/fail independently. Platform-specific fetchers (`_sync_shopify_products/_customers/_orders`, and Magento/BigCommerce equivalents) sit behind that one orchestrator.

**What to implement in KPI:**
1. **Add the missing entities** — build `shopify-product-sync.service.ts` and `product-category-sync` (and the Adobe/BigCommerce equivalents). Port the field mapping / normalizers from `connector_sync_service.py` + `src/data_pipeline/normalizers/`. Land into `CanonicalProduct` + a `ProductCategory` model (add if missing).
2. **Unified, resilient orchestrator** — extend `sync-orchestrator.service.ts` (or add a `store-sync.service.ts`) to run **all four entities** (products → categories → customers → orders, respecting dependency order) with **per-entity error isolation**: wrap each entity in try/catch, record a per-entity `SyncSummary` (`fetched/created/updated/failed` + status `success | partial | failed`), and **do not abort the run** when one entity fails. Return a combined report; surface partial success in the UI.
3. **Parallelise where safe** — products and categories can fetch concurrently; customers/orders can start once their dependencies exist. Keep the existing `sync-checkpoint.util.ts` (`since` cursors, `MAX_SYNC_PAGES`, page delays) per entity so retries resume, and record failures to the existing DLQ/`ConnectorSyncRun` tables.
4. **Store-scoped** — every synced row carries `storeId` (§3.5.2). Re-syncing store B never touches store A's rows.

**Target sync shape:**

```
POST /api/v1/.../stores/:storeId/sync   (entity_types?: [products,categories,customers,orders])
      ▼  store-sync.service.ts (orchestrator)
   ┌── products    ─┐
   ├── categories  ─┤  each: independent try/catch, own checkpoint, own SyncSummary
   ├── customers   ─┤  one failure ⇒ marked failed/partial, others still complete
   └── orders      ─┘
      ▼
   combined report { runId, perEntity: {status, fetched, created, updated, failed}, overall: partial|success|failed }
```

---

## 4. Target architecture after the port

```
kpi monitoring (monorepo)
├── apps/
│   ├── api/                 (Fastify)  ── existing +NEW routes:
│   │     /api/v1/.../recommendations/*   → proxy to AI engine
│   │     /api/v1/.../analytics/*         → proxy to AI engine
│   │     /api/v1/.../campaigns/*         → native + proxy
│   │     /api/v1/.../billing/*           → native (Stripe)
│   │     /api/v1/webhooks/stripe         → native (Stripe webhook)
│   │     /api/v1/.../ai/setup            → admin: trigger training
│   └── dashboard/           (Next.js)  ── existing +NEW pages under
│         app/project/[projectId]/{recommendations,customers,campaigns,billing,ai-setup}
├── packages/
│   ├── db/                  +NEW Prisma models (Campaign*, Subscription/Invoice,
│   │                          TrainedModelRegistry, enriched Product/Customer/Order)
│   └── shared-types/        +NEW page keys/roles for new pages
└── services/
    └── ai-engine/           🟡 NEW — the ported Python FastAPI ML engine
          (ALS CF, embeddings→Qdrant, RandomForest analytics, OpenAI pitches)
```

**Data flow for an AI feature (e.g. recommendations):**

```
Dashboard page ──axios /api/v1/.../recommendations/trending──▶ next.config rewrite
      ▼
apps/api (Fastify)  ── auth.middleware + tenant-isolation.middleware ──▶ recommendations.controller
      ▼  (inject tenantId + projectId as scope, like ai-agent-ecom's connector-scope)
services/ai-engine (Python FastAPI)  ── tenant-scoped query ──▶ Postgres / Qdrant / Redis
      ▼
JSON response ◀────────────────────────────────────────────────────────┘
```

> **Key adaptation:** in `ai-agent-ecom`, `lib/connector-scope.ts` + `/api/py/[...path]` proxy inject `tenant_id`/`brand_id` before calling Python. In KPI Monitoring the **Fastify layer** plays that role — `tenant-isolation.middleware.ts` resolves `tenantId`/`projectId`; new proxy controllers forward those (plus the new **`storeId`**) to the Python engine as scope. **`Brand` maps to `Store`** (§3.5.2), so the full scope key is `tenant_id + project_id + store_id`.

---

## 5. What to add — detailed, by area

### A. Python AI engine → `services/ai-engine/`

Bring `ai-agent-recom/` in as a workspace service (or a separately-deployed Python service; it is not a JS workspace so it won't be an npm workspace — add it to `docker-compose`/`infra` and the root run scripts).

**Port these (drop GA4):**
- `src/models/` — `collaborative_filter.py` (ALS), `embedding_model.py`, `vector_db.py` (Qdrant), recommendation cache (Redis).
- `src/agents/` — `ProductAgent`, `UserAgent`, `RankingAgent`.
- `src/services/` — `recommendation_service.py`, `customer_metrics_service.py`, `customer_profile_service.py`, `segmentation_service.py`, `csv_import_service.py`, `connector_sync_service.py` (reconcile with KPI's existing sync — see §6).
- `src/ml/` — `analytics_training.py` (RandomForest classifiers/regressors), `model_registry_db.py`.
- `src/campaigns/` — `service.py`, `scheduler.py`.
- `src/integrations/openai_client.py` — OpenAI pitch generation (use `claude` too if desired; see note below).
- Setup scripts: `migrate_db.py`, `embed_products.py`, `train_cf_model.py`.

**Do NOT port:** `src/integrations/ga4_client.py`, `src/services/ga4_product_analytics.py`, `/ga4/*` routes, and remove GA4 columns/params from `product-analytics`.

**Tenant scope:** the engine already applies a tenant-scope dependency on every endpoint (`tenant_vector_service.py`). Keep it; feed scope from Fastify (`tenant_id` + `project_id`, formerly `brand_id`).

> **Note on the LLM:** `ai-agent-ecom` uses OpenAI for pitch generation. Since this is an Anthropic environment, consider using a Claude model (e.g. `claude-opus-4-8` / `claude-haiku-4-5`) via the Anthropic SDK for pitch generation instead of / alongside OpenAI. Keep it behind the same `pitch` service interface so callers don't change.

### B. Fastify API additions → `apps/api/src/`

Follow KPI Monitoring's existing `routes/ → controllers/ → services/` pattern and register under the existing `/api/v1/tenants/:tenantId/projects/:siteId/...` prefix in `server.ts`.

New route groups:
- **`recommendations.routes.ts`** — `trending`, `recently-popular`, `similar/:productId`, `customer/:customerId`, `segment/:segment`, `frequently-bought-together/:productId`, `bulk`. Thin proxy → AI engine.
- **`analytics.routes.ts`** — `churn`, `cohort`, `nbb`, `metrics`, `profile`, `repeat-customers`, `affinity`, `health-score`, `dashboard/summary`. Thin proxy → AI engine.
- **`campaigns.routes.ts`** — native CRUD + lifecycle (`approve`, `reject`, `schedule`, `send`, `generate-pitches`, `create-from-recommendations`). Persists to new Prisma models; delegates pitch/send to AI engine.
- **`billing.routes.ts`** + **`webhooks/stripe`** — Stripe checkout/portal/webhook (see §E).
- **`ai-setup.controller.ts`** — admin-only: trigger `migrate/embed/train` on the Python engine (equivalent of `ai-agent-ecom`'s `app/api/ai-agent/setup`). Guard with existing `rbac.middleware.ts`.

Reuse the existing `auth.middleware`, `tenant-isolation.middleware`, `rbac.middleware`, `idempotency`, `rate-limiter`, `api-audit`.

Add config: `AI_ENGINE_URL` (default `http://127.0.0.1:8000`) + a `backend-health` style ping.

### C. Database additions → `packages/db/prisma/schema.prisma`

Add new models (all keyed with `tenantId` + `projectId` + `storeId` to match KPI Monitoring's isolation after §3.5.2, replacing `ai-agent-ecom`'s `tenantId`+`brandId`):

- **Campaigns:** `Campaign`, `CampaignRecipient`, `CampaignMessage`, `CampaignApproval`, `CampaignTemplate` (+ enums: channel `EMAIL/SMS/WHATSAPP`, status `DRAFT→PENDING_APPROVAL→APPROVED→SCHEDULED→SENT/FAILED`, `DeliveryStatus`).
- **ML:** `TrainedModelRegistry` (model_name+version, artifact_path, status, metrics JSON, is_active).
- **Billing:** `Subscription` / `Invoice` (or extend `Tenant` with `stripeCustomerId`, `stripeSubscriptionId`, `stripePriceId`, `currentPeriodEnd`; `Tenant.plan` already exists).
- **Commerce enrichment:** KPI already has `CanonicalProduct` / `CanonicalOrder` / `CustomerProfile`. Map the engine's expected `Product`/`Customer`/`Order` fields onto these rather than adding parallel tables — see §6. Add only missing columns the ML needs (e.g. `is_premium`, `premium_segment`, RFM fields) if not already present.

Generate a migration (`prisma migrate`) and update `packages/db` seeders if needed.

### D. Dashboard additions → `apps/dashboard/src/app/project/[projectId]/`

Port the React feature components (they are thin clients over the API) into KPI Monitoring's App Router, using the **`@kpi-platform/ui` design system + Recharts + Tailwind v4** (do not port `ai-agent-ecom`'s shadcn setup — restyle onto the existing UI kit).

New pages:
- `recommendations/` — trending / similar / per-customer / bulk widgets.
- `customers/` (extend existing) — customer intelligence, RFM, CLTV, churn, health-score, purchase history, profile, search.
- `campaigns/` — list, create modal, detail, approve/schedule/send, pitch preview.
- `billing/` — plan cards, subscription status, portal button.
- `ai-setup/` — admin wizard to run migrate/embed/train.

For each new page:
1. Add the page key + role rules in `@kpi-platform/shared-types` (`page-access`, `permissions`).
2. Ensure `apps/dashboard/middleware.ts` + `page-access.middleware.ts` allow the right roles.
3. Data access via `axios` to the new `/api/v1/...` routes (proxied by `next.config.mjs`).

### E. Stripe billing (greenfield) 

This is the cleanest port because KPI Monitoring has nothing here.

- Add `stripe` SDK to `apps/api`.
- Port `config/subscriptions.ts` plans (Starter free / Pro / Business) → a KPI config file; wire Stripe price IDs via env.
- Port the logic of `actions/generate-user-stripe.ts` (checkout for free→paid, portal for paid) and `open-customer-portal.ts` into a `billing.service.ts` + controller.
- Port `lib/subscription.ts::getUserSubscriptionPlan` → `billing.service.ts` (isPaid/isCanceled/interval from `stripePriceId` + `currentPeriodEnd`).
- Port the Stripe webhook (`app/api/webhooks/stripe`) → a Fastify route that syncs subscription fields onto `Tenant` (keyed by tenant, not the `ai-agent-ecom` per-`User` model — billing is per-tenant here).
- Dashboard billing page uses `@kpi-platform/ui` pricing cards.

Env: `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_*_PRICE_ID`.

### F. Reuse (no porting) — reconciliation notes

- **Auth:** keep KPI's OTP + `UserSession`. Discard `ai-agent-ecom`'s NextAuth entirely. Any ported page/route just relies on the existing session cookie / Bearer token.
- **Tenancy:** map `Brand → Project`. Everywhere the source used `brand_id`, use `projectId`.
- **Connectors:** keep KPI's `connector-framework` + `*-order-sync` services. The Python engine's `connector_sync_service.py` overlaps — **decide one owner**: preferred is that **KPI's Fastify connectors remain the sync source of truth** and the Python engine only *reads* the canonical tables. This avoids double-syncing (see §7 risks).
- **Email:** reuse `email.service.ts` (nodemailer). Campaign email delivery can call it, or keep the Python `smtp_service.py` for bulk campaign sends — pick one path.

---

## 6. Data model reconciliation (important)

`ai-agent-ecom`'s Python engine expects tables named `products`, `customers`, `orders` (line-item grain). KPI Monitoring already has `CanonicalProduct`, `CanonicalOrder`, `CustomerProfile`, `OrderSnapshot`, etc.

**Two options:**

1. **Adapter (recommended):** point the Python engine's queries at KPI's canonical tables via a thin SQL view or repository mapping. Keeps a single source of truth; connectors stay owned by Fastify.
2. **Parallel tables:** create the engine's own `products/customers/orders` tables and populate them from the canonical model on sync. Faster to port, but risks drift and double storage.

Start with **Option 1** unless the ML queries prove too coupled to the original schema, then fall back to Option 2 for just the ML-specific tables.

---

## 7. Risks, conflicts & gotchas

- **Two sync engines.** Both projects can sync Shopify/Magento/BigCommerce. Do **not** run both. Make Fastify connectors the source of truth; the Python engine reads canonical tables (§6). Otherwise you get duplicate orders and race conditions.
- **Tenant/store model mismatch.** `Tenant+Brand` (source) vs `Tenant+Project+Store` (target — after §3.5.2). Every ported query/route/component must be rewritten to KPI's `tenantId`+`projectId`+`storeId` scope key. This is the most error-prone part — do it consistently and add tests via `tenant-isolation.middleware`.
- **Tenancy not enforced on project create (§3.5.1)** and **incomplete/fragile sync (§3.5.3)** are pre-existing KPI defects — must be fixed in Phase 0.5 before the AI features can be trusted to be tenant/store isolated and fully fed with data.
- **Python is not an npm workspace.** `services/ai-engine` won't participate in `npm run build --workspaces`. Add it to `infra/docker` + root run scripts (`dev:ai`) and document its own venv/requirements.
- **New infra dependencies.** The engine needs **Qdrant** (vector DB) and **Redis** (cache) in addition to Postgres. Add to `infra/docker/docker-compose`. KPI's `@kpi-platform/cache` is in-process — the Python engine keeps its own Redis.
- **GA4 leakage.** When porting `product-analytics` / customer components, strip GA4 fields (pageviews, CVR, channel funnel) — those come only from GA4 and are out of scope. Keep the transactional half (sales, units, AOV, returns, stock).
- **Auth surface duplication.** Don't accidentally port `ai-agent-ecom`'s `/api/auth/*`, `middleware.ts`, or NextAuth config — they'll clash with KPI's auth.
- **LLM provider.** Swap/augment OpenAI with Claude (Anthropic SDK) per environment convention.
- **PII.** KPI's `packages/db` enforces PII hashing/encryption (`pii.ts`, `secret-cipher.ts`). Ported customer/campaign data with raw emails will be rejected — route through the existing PII helpers.

---

## 8. Phased implementation plan

**Phase 0 — Foundations & decisions (no user-facing change)**
- Confirm `Brand → Store` mapping; confirm connector ownership (Fastify = source of truth).
- Add `services/ai-engine/` skeleton (ported Python minus GA4); stand up Qdrant + Redis in `infra/docker`.
- Add `AI_ENGINE_URL` config + `apps/api` health-ping.

**Phase 0.5 — Fix KPI platform gaps first (§3.5) — BLOCKING prerequisite**
- **Tenancy on create (§3.5.1):** atomic `Tenant + Project + UserProjectAccess` provisioning; make `tenant-isolation.middleware` fail-closed on all project routes; add isolation regression test.
- **Store partition (§3.5.2):** add `Store` model + `storeId` on connectors/orders/customers/products/categories + migration + backfill; add store switcher in dashboard; bind connectors to a store.
- **Resilient multi-entity sync (§3.5.3):** add product + product-category sync services; build the unified `store-sync` orchestrator with per-entity error isolation and combined partial-success reporting.

**Phase 1 — Data & engine wiring**
- Add new Prisma models (Campaign*, TrainedModelRegistry, billing) + migration.
- Reconcile commerce tables (§6 Option 1) so the engine reads canonical data, tenant-scoped.
- Port `migrate/embed/train` scripts; wire the admin `ai/setup` route.

**Phase 2 — Recommendations & analytics (highest value)**
- Fastify proxy routes (`recommendations.*`, `analytics.*`) with tenant scope.
- Dashboard pages: recommendations widgets + customer intelligence / RFM / CLTV / churn / health-score (GA4 stripped).

**Phase 3 — AI marketing campaigns**
- Campaign models + Fastify lifecycle routes + Python pitch/send service (Claude/OpenAI).
- Dashboard campaigns UI (create → approve → schedule → send, per-customer pitch preview).

**Phase 4 — Billing**
- Stripe service + webhook + plans config (per-tenant); dashboard billing page.

**Phase 5 — Polish / optional**
- CSV import for products/customers (extend existing order CSV import).
- Optional marketing/docs/blog (Contentlayer) if a public site is wanted.
- Tests: tenant-isolation, RBAC page keys, billing webhook, recommendation smoke tests.

---

## 9. Environment variables to add

| Var | Where | Purpose |
|---|---|---|
| `AI_ENGINE_URL` | `apps/api` | Base URL of Python engine (default `http://127.0.0.1:8000`) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | `services/ai-engine` | Pitch generation LLM |
| `QDRANT_URL` | `services/ai-engine` | Vector DB |
| `REDIS_URL` | `services/ai-engine` | Recommendation cache |
| `STRIPE_API_KEY` | `apps/api` | Stripe SDK |
| `STRIPE_WEBHOOK_SECRET` | `apps/api` | Verify Stripe webhooks |
| `STRIPE_*_PRICE_ID` | `apps/api` / dashboard | Plan price IDs |
| (SMTP vars) | reuse existing `email.service.ts` | Campaign / OTP email |

---

## 10. Explicitly out of scope (GA4)

Do **not** port any of the following from `ai-agent-ecom`:
- `shopifyGA4auth/` (service account, `get-token.js`, `api.txt`, session notes)
- `ai-agent-recom/src/integrations/ga4_client.py`
- `ai-agent-recom/src/services/ga4_product_analytics.py`
- Any `/ga4/*` FastAPI endpoints
- The GA4-powered `dashboard/product-analytics` page and its GA4-only metrics (pageviews, CVR, channel funnel)

Everything else in this document is in scope.

---

### Quick reference — "what am I actually adding?"

0. 🛠️ **Fix KPI platform gaps first (§3.5, Phase 0.5):** enforce tenancy on project creation, add a **`Store`** layer (a project can hold multiple isolated stores), and replace the sequential all-or-nothing sync with a **unified, resilient multi-entity sync** (products + categories + customers + orders, per-entity error isolation).
1. 🟡 A **Python AI/ML engine** (`services/ai-engine`) — recommendations, embeddings, segmentation, RandomForest analytics, campaign pitches (GA4 removed).
2. 🟡 **Fastify proxy + native routes** for recommendations, analytics, campaigns, billing, ai-setup.
3. 🟡 **New Prisma models** — campaigns, model registry, billing/subscription; enriched commerce fields.
4. 🟡 **New dashboard pages** — recommendations, customer intelligence, campaigns, billing, ai-setup (on `@kpi-platform/ui`).
5. 🟡 **Stripe billing** (greenfield, per-tenant).
6. 🟢 **Reuse** KPI Monitoring's auth, tenancy, connectors, email — do not re-port them.
7. 🔴 **Skip** GA4 entirely.
