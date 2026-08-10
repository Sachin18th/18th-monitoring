# Building a CDP: Fusing Live Behavior (18th-monitoring) with Customer History (ai-agent-ecom)

> **Goal:** Turn `18th-monitoring` into a **Customer Data Platform (CDP)** by fusing the **live behavioral data** it already captures (sessions, funnels, product views, drop-off) with the **historical transactional + AI/ML layer** from `ai-agent-ecom` (orders, RFM/CLTV/churn, recommendations, campaigns). The result: a single **golden customer record** that powers sharper analytics and behaviorally-triggered, ML-personalized campaigns.
>
> **Relationship to [`AI-AGENT-ECOM-INTEGRATION.md`](./AI-AGENT-ECOM-INTEGRATION.md):** that doc plans the *port* of ai-agent-ecom's ML/campaign/billing features. This doc adds the layer that makes it a real CDP — **identity resolution + a unified profile that live behavior writes into** — and re-sequences the phases around it. Read that doc for the feature-by-feature port matrix; read this one for the identity/fusion architecture.
>
> **Status:** Planning / blueprint · **Last updated:** 2026-07-17

---

## 1. The core idea (and why it's a CDP, not just a port)

A CDP is defined by one capability the two apps don't have on their own: **identity resolution** — collapsing many fragmented identifiers (anonymous visitor id, session id, email, platform customer id) into **one persistent person record**, then attaching every behavioral and transactional signal to it.

- **`18th-monitoring` knows what's happening _now_** — anonymous sessions, funnel stage, which products are being viewed, where people drop.
- **`ai-agent-ecom` knows who someone _is_ over time** — their orders, lifetime value, churn risk, category affinity, and how to pitch to them.

Neither can express *"a high-CLTV customer is abandoning a cart **right now**"* — because that fact requires a live signal and a historical profile joined on the same person. The join is the product.

```
                     ┌──────────────────────────────────────────────┐
   LIVE (18th)       │            GOLDEN CUSTOMER RECORD             │   HISTORY (ai-agent-ecom ML)
                     │           (CustomerProfile, enriched)          │
 web-pixel  ┐        │                                              │        ┌ orders / line items
 embed.js   ├─events─┤   identity graph:                            ├─sync───┤ customer records
 rum-sdk    ┘        │   visitorId ⇄ sessionId ⇄ emailHash ⇄        │        └ product catalog
   │                 │              externalIds.<platform>          │              │
   ▼                 │                                              │              ▼
 storefront_sessions │   BEHAVIORAL (live)     TRANSACTIONAL (batch)│         Python ML engine
 storefront_events   │   · funnel stage        · RFM / CLTV / churn │       (ALS, Qdrant, sklearn)
 (funnel, drop-off,  │   · cart abandon        · segment / premium  │              │
  product views)     │   · browse affinity     · category affinity  │              │
                     └────────────────────────┬─────────────────────┘              │
                                              ▼                                      │
                          FUSED SEGMENTS  +  BEHAVIORAL TRIGGER ENGINE ◀─────────────┘
                       (live signal × history × ML → personalized campaign)
```

---

## 2. Current-state reality (what we already have to build on)

The good news from a deep read of both codebases: **most of the CDP substrate already exists in `18th-monitoring`.** We are mostly *connecting* things, not inventing them.

### 2.1 Live behavioral capture — already persisted
- Clients: `agent/js-monitoring-agent/`, `packages/rum-sdk/`, and the Shopify **web pixel** `extensions/web-pixel/src/index.js`.
- The web pixel already sends, per event: `session_id` (checkout token), `visitor_id` (stable per browser `clientId`), and — critically — **`email`** on every checkout step and `checkout_complete` (plus `order_id`, `total_price`, etc.).
- Ingest: `POST /api/track` → `apps/api/src/services/storefront-tracking.service.ts` → persisted to the **tenant data plane**:
  - `StorefrontSession` (`storefront_sessions`) — unique `(connectorInstanceId, sessionId)`; carries the full live funnel: `funnelStage`, `funnelStagesReached`, `pageViewCount`, `productIdsViewed`, `addToCart`, `checkoutStarted`, `purchaseCompleted`, attribution, and a `metadata.identity` blob (`customer_id`, `customer_email_hash`, `customer_email_encrypted`).
  - `StorefrontEvent` (`storefront_events`) — append-only raw events with `canonicalStage`.
- Canonical funnel stages: `visit → product_view → add_to_cart → checkout → purchase` (`apps/api/src/lib/tracking/classifyEvent.ts`).

### 2.2 Identity spine — already exists (but not wired to live data)
- `CustomerProfile` (`customer_profiles`, tenant-data-plane Prisma at `packages/db/prisma/tenant/schema.prisma`) is a ready-made golden-record table:
  `externalIds` (JSON, e.g. `{shopify: "123"}`), `emailHash`, `emailEncrypted`, `phoneHash`, `lifecycleState`, `identityConfidence`, `firstSeenAt`, `lastSeenAt`, `totalLtv`, `metadata`.
- Populated today by sync: `apps/api/src/services/shopify-customer-sync.service.ts` (and BigCommerce/Adobe equivalents).

### 2.3 The join key — already deterministic and shared
- `packages/db/src/pii.ts` → `hashEmail(email) = SHA-256( PII_HASH_PEPPER + normalizeEmail(email) )`, `normalizeEmail = trim().toLowerCase()`.
- The **same** hash is computed by the sync path, the journey path, and the live storefront-ingest path. Reversible plaintext lives only in `emailEncrypted` (AES-256-GCM, key from `CONNECTOR_SECRET_KEY`).
- `ai-agent-ecom` computes `customers.email_hash = sha256(lower(strip(email)))` in `src/security/customer_pii.py` — **the same algorithm, minus the pepper** (see the pepper gotcha in §7.1).

### 2.4 The ML/campaign engine we're bringing in
- `ai-agent-ecom/ai-agent-recom/` (FastAPI). Keys everything on integer `customer_id`; the external-identity match point is `customers.email_hash`; cross-brand unification via `customer_360_id`.
- Batch tables it computes and reads: `customer_metrics` (LTV/recency/frequency/monetary/rfm/segment snapshots) and `customer_profile` (favorite_categories/brands, top_products, interest_tags — weighted JSONB).
- Recommendations (`src/services/recommendation_service.py`): `for_customer`, `similar_products` (Qdrant → SQL fallback), `trending`, `frequently_bought_together`, `for_segment`. The hybrid ranker reads `customer_profile.favorite_categories/brands/top_products`.
- Segmentation (`src/services/segmentation_service.py`): **batch only**, reads `customer_metrics` percentiles → `VIP/HIGH_VALUE/AT_RISK/LOST/REGULAR`.
- Campaigns (`src/campaigns/`, `src/services/campaign_service.py`): create → generate-pitches (OpenAI `gpt-4o-mini`) → approve → schedule → send → open/click tracking. Targeting by **segment OR explicit `customer_ids`**, with `override_recommended_products` to feature exact products. **Trigger is manual or scheduled-poll only — no behavioral trigger.**

### 2.5 The gaps that stand between us and a CDP (the actual work)
1. **The bridge is missing.** `storefront_sessions` (live) is **not** linked to `CustomerProfile` (identity). Live identity is only a JSON blob in `metadata.identity`. → **This is the #1 thing to build.**
2. **No identity uniqueness.** `CustomerProfile.emailHash` / `externalIds` have **no DB unique constraint**; dedup is app-level `findFirst` → duplicate-profile race risk, fatal for a golden record.
3. **Behavior never reaches the ML.** `ai-agent-ecom` segmentation & `for_customer` recs are driven purely by batch transactional tables; live browse/affinity/funnel signals have no path in.
4. **Campaigns can't fire on behavior.** No cart-abandon / re-engagement trigger exists.
5. **No product sync in 18th.** Recommendations need a product catalog; 18th syncs orders + customers but not products/categories yet (see integration doc §3.5.3).
6. **PII discipline gap.** `CanonicalOrder.metadata` stores **plaintext** `customerEmail` un-scrubbed (`shopify-order-sync.service.ts`), unlike the customer path.
7. **Schema shape mismatch.** The Python engine expects `customers/orders/products/product_categories` with `tenant_id/brand_id` columns; 18th's data plane uses `canonical_*` tables scoped by `connectorInstanceId/siteId` with no `tenant_id` column.

---

## 3. Target architecture

**Ownership rule (non-negotiable):** Fastify (`apps/api`) owns **ingestion + identity resolution**; the Python engine is **read-mostly ML** that computes `customer_metrics`/`customer_profile`/recommendations from data Fastify already landed. Never run both sync engines (avoids duplicate orders / races).

```
apps/api (Fastify) ── owns ──▶ ingestion, identity resolution, canonical tables, campaign orchestration
      │
      │  writes/reads (tenant data-plane DB, per connector)
      ▼
  customer_profiles (golden record)  ◀── identity graph ──▶  identity_links (NEW)
  storefront_sessions / _events (live behavior, now FK'd to profile)
  canonical_orders / canonical_products / canonical_product_categories
  customer_behavior_snapshot (NEW: rolling live signals per profile)
      │
      │  read model (SQL views OR projection) exposing the shape the engine expects
      ▼
services/ai-engine (Python FastAPI, ported, GA4 removed)
  · reads canonical + behavior snapshot  · writes customer_metrics, customer_profile
  · recommendations (ALS + Qdrant per tenant/brand)  · pitch generation (Claude/OpenAI)
      ▲
      │  Fastify proxy routes inject scope (tenantId/siteId/storeId → tenant_id/brand_id)
      │
  behavioral trigger engine (NEW) ── live signal → target customer_ids + rec products → campaign send
```

**Scope reconciliation:** 18th's data plane is DB-per-tenant with no `tenant_id` column, scoped by `connectorInstanceId`/`siteId`. The Python engine wants `tenant_id`/`brand_id` query params routing to a per-tenant DB. Map at the proxy boundary: `siteId (project) → tenant_id`, `storeId/connectorInstanceId → brand_id`. (See integration doc §3.5.2 for the `Store` layer; `brand_id ≡ storeId`.)

---

## 4. Identity resolution — the heart of the CDP

This is the layer neither app has. It maintains the graph `visitorId ⇄ sessionId ⇄ emailHash ⇄ externalIds.<platform>` and resolves every event/session/order to a single `CustomerProfile.id`.

### 4.1 The identity graph
Add an **`identity_links`** table (tenant data plane) — an append-only edge log the resolver reads/writes:

| column | purpose |
|---|---|
| `id` | pk |
| `siteId`, `connectorInstanceId` | scope (data-plane convention) |
| `customerProfileId` | FK → `customer_profiles.id` (the resolved person) |
| `identifierType` | `visitor_id` \| `session_id` \| `email_hash` \| `external_id` |
| `identifierValue` | the value (hashed for email/phone; never plaintext) |
| `confidence` | 0–1 (deterministic email match = 1.0; visitor-only = lower) |
| `firstSeenAt`, `lastSeenAt` | edge recency |

- **Unique** `(connectorInstanceId, identifierType, identifierValue)` — an identifier maps to exactly one profile at a time.
- Also add the missing **unique constraints on `customer_profiles`**: unique `(connectorInstanceId, emailHash)` and a unique path on `externalIds.<platform>` (enforced via a generated column or an app-level upsert with a DB constraint). Fixes gap §2.5(2).

### 4.2 Resolution algorithm (runs in Fastify, in the ingest + sync paths)
On every identified signal (checkout email, `updateUser`, order sync, customer sync):
1. **Deterministic match first** — if `email_hash` (or `external_id`) already links to a profile, use it. This is the strong, high-confidence edge.
2. **Probabilistic stitch** — else if the `visitor_id`/`session_id` of this event already links to a profile (from a prior identified session), attach the new identifier to that same profile and **back-fill** all of that visitor's prior anonymous `storefront_sessions`/`storefront_events` to the profile.
3. **Create** — else create a new `CustomerProfile` (`lifecycleState = NEW_GUEST`, low `identityConfidence`) and seed its links.
4. **Merge** — if a later signal reveals two profiles are the same person (e.g. two visitor ids that both later resolve to one email), merge: re-point links, sum `totalLtv`, union `externalIds`, keep earliest `firstSeenAt`, write a `profile_merges` audit row. Merges must be idempotent and reversible.

> **Where it hooks in:** extend `storefront-tracking.service.ts` (live path) and `shopify-journey-sync.service.ts`'s `resolveCustomerProfileId` (batch path) to call one shared `IdentityResolver.resolve(scope, identifiers) → customerProfileId`. Today the live path only stashes identity in `metadata.identity` — that becomes a real FK write.

### 4.3 Link live sessions to the profile
- Add `customerProfileId` (nullable) to `StorefrontSession` and `StorefrontEvent`.
- On resolve, set it; on a later stitch, back-fill prior rows for that `visitorId`.
- Now `customer_profiles → storefront_sessions` is a real relation: the golden record can read a person's entire live journey.

---

## 5. The unified profile (golden record)

Fuse behavioral + transactional onto `CustomerProfile`. Two signal families:

### 5.1 Transactional (batch, from history) — mostly reuse
- Keep `CustomerProfile.totalLtv`, `lifecycleState` from sync.
- The Python engine computes `customer_metrics` (RFM/CLTV/segment) and `customer_profile` (favorite_categories/brands, top_products) from `canonical_orders`/`canonical_products`. Reuse as-is; just feed it the resolved `customer_id`.

### 5.2 Behavioral (live, new) — `customer_behavior_snapshot`
Add a rolling snapshot table (tenant data plane), one current row per `customerProfileId`, updated by the processor/ingest as live events arrive:

| field | source | example use |
|---|---|---|
| `lastSessionAt`, `sessionsLast30d` | `storefront_sessions` | recency/frequency of *visits* (vs. purchases) |
| `liveFunnelStage`, `furthestStage` | session funnel | "reached checkout, didn't buy" |
| `cartAbandonedAt`, `abandonedValue` | `checkout_abandon` | trigger source |
| `productIdsViewedRecent` (JSON) | `storefront_events` | live affinity |
| `categoryAffinityLive` (JSON weighted) | product views → category | **fed into rec ranker** |
| `browseButNoBuyCategories` (JSON) | views minus orders | re-engagement targeting |

### 5.3 Push behavioral signals into the ML (closing gap §2.5(3))
The rec ranker and segmentation read JSONB signals — that's the clean insertion point:
- **Recommendations:** blend `categoryAffinityLive` into `customer_profile.favorite_categories`/`interest_tags` (weighted merge) so `personalized_ranked_for_customer` reflects *today's* browsing, not just past orders.
- **Segmentation:** write live signals into `customer_metrics.metrics` (JSONB) and extend `SegmentationService` rules to consider them (e.g. `AT_RISK` + `sessionsLast30d = 0` → stronger churn flag; `VIP` + `cartAbandonedAt < 1h` → hot lead). Keep it additive so the batch job still works standalone.

---

## 6. Fused segments & behavioral-trigger campaigns

### 6.1 Fused (real-time × historical) segments
New segment definitions expressible only after fusion, e.g.:
- **`HIGH_VALUE_ABANDONER`** = `customer_metrics.segment ∈ {VIP, HIGH_VALUE}` **AND** `customer_behavior_snapshot.cartAbandonedAt` within N hours.
- **`LAPSED_REACTIVATING`** = `recency_days > 90` (history) **AND** `sessionsLast30d ≥ 1` (live) — they're back, strike now.
- **`BROWSING_UNCONVERTED_CATEGORY`** = repeat views of a category with no order in it.

Implement as either extended `SegmentationService` rules (batch + live JSONB) or a thin real-time segment matcher in Fastify over `customer_behavior_snapshot` joined to `customer_metrics`.

### 6.2 Behavioral trigger engine (closing gap §2.5(4)) — net-new
A rule-driven engine (Fastify service, fed by the processor's live event stream) that fires campaigns on behavior:

```
live event (checkout_abandon / repeat product_view / re-visit after lapse)
   ▼  trigger rule matches (segment + cooldown + consent)
IdentityResolver → customerProfileId → customer_id
   ▼
ai-engine: recommendations.for_customer(customer_id) → override_recommended_products
   ▼
campaign create (customer_ids=[that one]) → generate-pitches (Claude/OpenAI, history-aware) → send
```

- **Reuse the ported campaign backend as-is** — `create_campaign(customer_ids=...)`, `generate_pitches_for_campaign(override_recommended_products=...)`, `send_campaign`. The engine already accepts an explicit customer list and exact products; we just drive it from a live trigger instead of a manual click.
- Add: trigger rule model, per-customer **cooldown/frequency caps**, **consent/marketing-opt-in** check (respect `accepts_marketing`), and an audit trail.
- Reuse 18th's existing `services/alert-engine` rule-evaluation patterns for the trigger DSL rather than inventing one.

### 6.3 Personalization gets sharper
Pitch generation (`build_pitch_prompt`) already takes `favorite_categories`, `days_inactive`, purchase history. Feed it the **live** context too (the abandoned cart's products, the category they're browsing) via `override_recommended_products` + extra `format_vars`. The email now references what they were *just* looking at, backed by what they've *historically* bought.

---

## 7. Critical technical decisions & gotchas

### 7.1 ⚠️ Email-hash pepper mismatch (BLOCKING for the join) — ✅ VERIFIED 2026-07-17
- `18th`: `hashEmail = SHA-256( PII_HASH_PEPPER + normalizeEmail )` — optional pepper.
- `ai-agent-ecom`: `sha256( normalizeEmail )` — **no pepper**.
- **Empirically confirmed** by running both codebases' real hashers over shared vectors:
  - **Email join key MATCHES today** (all cases: casing, whitespace, unicode, empty) — because `PII_HASH_PEPPER` is unset everywhere (grep-confirmed in both repos). Setting a pepper makes **every** email hash differ → the whole join fails silently (hashes still generate, just never match).
  - **Bonus finding — phone hashing already DIVERGES** regardless of pepper: 18th `hashPhone` keeps `+` (`/[^0-9+]/g`); Python `generate_mobile_hash` strips to digits only (`\D`). So `+1…` hashes differ. Phone-based stitching is NOT safe until aligned.
- **Decision:** standardize the hash. Keep `PII_HASH_PEPPER` empty (18th already warns it must stay empty unless all hashes are re-computed) and have the ported engine reuse 18th's exact hashing; if a pepper is ever required, apply the *same* pepper in the engine's `customer_pii.py`, and align phone normalization to keep `+`.
- **Guard in place:** `apps/api/src/identity-hash-contract.test.ts` pins the canonical cross-system hex (golden vectors) + the pepper-empty invariant + the documented phone divergence. When the engine is ported (Phase 2), add a mirror Python golden-vector test asserting the same hex. (Reference parity harness in the session scratchpad `hash-parity/`.)

### 7.2 Identity uniqueness must be enforced in the DB
App-level `findFirst` dedup races under concurrent ingest → duplicate golden records. Add the unique constraints in §4.1 and switch writes to upserts. Non-negotiable for a CDP.

### 7.3 Schema reconciliation — read model, not parallel tables
The engine wants `customers/orders/products/product_categories` (+ `tenant_id/brand_id`); 18th has `canonical_*` (+ `connectorInstanceId/siteId`, no `tenant_id`).
- **Decision (recommended):** expose **SQL views / a thin repository mapping** in each tenant DB that presents the canonical tables in the engine's expected shape, injecting `tenant_id = siteId`, `brand_id = storeId`. Keeps one source of truth (integration doc §6 Option 1).
- The engine still **owns** its computed tables (`customer_metrics`, `customer_profile`) and the Qdrant collections — those are ML outputs, not ingestion.

### 7.4 PII everywhere
- Fix `CanonicalOrder.metadata` to scrub plaintext email (route through `scrubEmails`/`encryptEmail` like the customer path) — gap §2.5(6).
- The identity graph stores **hashed** identifiers only; plaintext email stays in `emailEncrypted`, decrypted in-memory for display/send only.
- Consent: campaigns must honor `accepts_marketing`; the trigger engine checks it before every send.

### 7.5 The Kafka processor is currently neutralized
`services/processor` runs on an in-memory `GlobalMemoryStore` and its DB writes are no-ops; the real persisted live path is `StorefrontTrackingService`. **Decision:** build the behavior snapshot + trigger evaluation off the **storefront ingest path** (which persists), not the neutralized Kafka handlers — unless/until the processor is repointed at the data plane. Revisit if real streaming is stood up (integration doc notes Kafka is TODO).

### 7.6 Python isn't an npm workspace
`services/ai-engine` won't join `npm run build --workspaces`; wire it via `infra/docker` + root `dev:ai` script + its own venv. Needs **Qdrant** + **Redis** added to `infra/docker/docker-compose.yml`.

---

## 8. Phased implementation plan

Each phase is independently shippable and ordered so value lands early and risky foundations come first.

### Phase 0 — Foundations & decisions (no user-facing change)
- Lock the decisions in §7: **pepper policy** (§7.1), **read-model vs parallel tables** (§7.3), **Fastify = sync source of truth**, **`brand_id ≡ storeId`** mapping.
- Stand up `services/ai-engine/` skeleton (ported Python, GA4 stripped) + **Qdrant + Redis** in `infra/docker`. Add `AI_ENGINE_URL` config + health ping in `apps/api`.
- ✅ **DONE** — hash-parity verified + guarded by `apps/api/src/identity-hash-contract.test.ts` (golden vectors, pepper invariant, phone-divergence note). See §7.1.

### Phase 0.5 — Platform prerequisites (BLOCKING — from integration doc §3.5)
- **Tenancy on project create** (doc §3.5.1): atomic `Tenant + Project + access` provisioning; make `tenant-isolation.middleware` fail-closed.
- **`Store` layer** (doc §3.5.2): `Store` model + `storeId` on connectors/orders/customers/products; store switcher. (`brand_id ≡ storeId`.)
- **Resilient multi-entity sync incl. products + categories** (doc §3.5.3): add `shopify-product-sync` + `product-category-sync` (and Adobe/BigCommerce), unified orchestrator with per-entity error isolation. **Recommendations depend on a product catalog — this unblocks Phase 3.**

### Phase 1 — Identity resolution (THE core CDP layer) — ✅ IMPLEMENTED 2026-07-17
- ✅ `identity_links` table + `profile_merges` + **unique constraints** on `customer_profiles` (`(connector, emailHash)`) and `identity_links` (`(connector, type, value)`). Tenant schema + idempotent migration `20260717120000_cdp_identity_resolution`. (§4.1, §7.2)
- ✅ Shared `IdentityResolver.resolve(db, scope, signals)` — `apps/api/src/services/identity-resolver.service.ts` (deterministic match → probabilistic visitor stitch → create → merge-on-conflict → link upkeep → visitor session/event back-fill, with unique-race handling). (§4.2)
- ✅ Wired into `storefront-tracking.service.ts` (live) and `shopify-journey-sync.service.ts` (batch).
- ✅ `customerProfileId` bridge column on `StorefrontSession`/`StorefrontEvent`; back-filled on stitch.
- ✅ Profile **merge** + reversible audit (`profile_merges`).
- ✅ **Tests:** `apps/api/src/services/identity-resolver.test.ts` (vitest, against an in-memory data plane enforcing the real unique constraints) — stitch+back-fill, no-duplicate, merge, connector isolation. Proven 21/21 via tsx harness (vitest runner unavailable in the sandbox). Caught + fixed a real bug: deterministic profile id must be connector-scoped.
- ✅ **Ships:** `GET /api/storefront/unified-customer` (accepts `email` — hashed server-side — `emailHash`, or `customerProfileId`) **+ the Customer 360 dashboard page** (`app/project/[projectId]/observability/customer-360/page.tsx`, nav + page-access `observability/customer-360` registered for all roles that see Journey Intel): search a customer by email → golden record + identity graph + live journey in one view. **Phase 1 complete.**
- ℹ️ **Rollout note:** the new `unique(connector, emailHash)` fails on tenant DBs that already hold duplicate email-hash profiles (old app-level dedup races). **Not yet in production** (2026-07-17), so the migration applies cleanly on fresh/dev DBs and the dedup backfill is deferred until there is real data to reconcile.

### Phase 2 — Customer analytics — ✅ ANALYTICS IMPLEMENTED 2026-07-17 (native TS; recommendations deferred)
**Decision:** rather than porting the Python engine + Qdrant + Redis, the analytics (RFM/CLTV/churn/segmentation) were implemented **natively in the Fastify API** over the canonical tables — no new infrastructure. The Python recommendation engine (ALS/embeddings/Qdrant) is deferred to a later sub-phase, added only when vector recommendations are wanted.
- ✅ `customer_metrics` table (tenant schema) + idempotent migration `20260717140000_cdp_customer_metrics`, applied to the dev tenant DB.
- ✅ `CustomerMetricsService` (`apps/api/src/services/customer-metrics.service.ts`) — RFM (population-percentile 1-5), CLTV (projection, capped), churn (heuristic), segmentation (VIP/HIGH_VALUE/AT_RISK/LOST/REGULAR), computed from `canonical_orders`, mapped to profiles by platform id → email hash. Stamps `totalLtv` onto the golden record.
- ✅ `POST /api/storefront/unified-customer/recompute` + metrics folded into the `GET /unified-customer` response (`history` block).
- ✅ Customer 360 page shows a "Customer intelligence" card (segment, CLTV, churn, RFM, orders, AOV, recency) + a Recompute button.
- ✅ **Verified against real Postgres:** recompute processed 16/16 orders, produced sensible differentiated metrics (VIP RFM 15 vs REGULAR 9/3), `totalLtv` populated.
- ✅ **PII scrub DONE (§7.4):** all three order-sync services (Shopify/BigCommerce/Adobe) now compute `customerEmailHash` + `customerEmailEncrypted` and run the whole `metadata` through `scrubEmails()` (no plaintext email persisted). Existing rows backfilled + verified on the dev DB (17/17 orders scrubbed, 0 raw-email leaks, metrics still map 17/17). Live-journey now also renders a full event-by-event timeline from `storefront_events`.
- ✅ **Recommendations DONE (native SQL, 2026-07-17):** `RecommendationService` (`apps/api/src/services/recommendation.service.ts`) — for-customer (favorite categories/vendors from order history), frequently-bought-together (co-purchase + lift), trending, similar-by-content (shared category/vendor). Reads line items from `canonical_orders.metadata.lineItems`. `GET /api/storefront/unified-customer/recommendations` + a "Recommended for this customer" card on Customer 360. Verified on real DB (personalized picks with reasons, trending, co-purchase all sensible). ALS + semantic embeddings (Qdrant) still deferred — add only if content/co-purchase recs prove insufficient.

### Phase 3 — Behavioral fusion — ✅ IMPLEMENTED 2026-07-17 (verified on real DB)
- ✅ `customer_behavior_snapshots` table + idempotent migration `20260717160000_cdp_behavioral_fusion` (GIN index on `fused_segments` for fast membership), applied to the dev DB.
- ✅ `BehavioralFusionService` (`apps/api/src/services/behavioral-fusion.service.ts`) — derives live signals per customer (last session, sessions/30d, live furthest stage, cart-abandon, recent categories) from `storefront_sessions`, fuses with `customer_metrics`, and persists snapshots. **Fused segments:** `HIGH_VALUE_ABANDONER`, `LAPSED_REACTIVATING`, `NEW_HIGH_INTENT`, `LOYAL_ACTIVE` (each needs a live signal AND a historical fact).
- ✅ Runs on the recompute endpoint + event-driven after each sync (`connector-resync`).
- ✅ Endpoints: `fusion` block in `GET /unified-customer`; `GET /api/storefront/segments` (fused + base counts); customer list `?segment=` filter (fused via snapshot `array_contains`, base via metrics).
- ✅ Customer 360 shows fused-segment badges + a live-signal summary; the list has **segment filter chips** + fused badges per row.
- ✅ **Verified on real DB:** the VIP fired `HIGH_VALUE_ABANDONER` (VIP + reached checkout, no purchase); segment filter + counts correct.
- ⏳ Not done (optional): merging live category affinity back into the *recommendation* ranker (recs still purely historical). Deferrable.

### Phase 4 — Behavioral trigger → campaign engine — ✅ IMPLEMENTED 2026-07-17 (verified on real DB)
- ✅ `campaign_messages` table + idempotent migration `20260717180000_cdp_triggered_campaigns`, applied to the dev DB.
- ✅ `PitchService` (`apps/api/src/services/pitch.service.ts`) — subject + HTML email via Claude (Anthropic **Messages API over HTTPS**, `claude-opus-4-8`, gated on `ANTHROPIC_API_KEY`) with a deterministic **template fallback** (works with no key). *(Production: switch to `@anthropic-ai/sdk` — not installed here.)*
- ✅ `CampaignTriggerService` — fused segment → goal (HIGH_VALUE_ABANDONER→cart_recovery, LAPSED_REACTIVATING→win_back, NEW_HIGH_INTENT→welcome_offer, LOYAL_ACTIVE→vip_appreciation) → recs + history → draft. Guards: per-(customer,trigger) **cooldown** + marketing **consent**. Drafts persist (GENERATED); not auto-sent.
- ✅ Endpoints: `POST /api/storefront/campaigns/run`, `GET /api/storefront/campaigns`, `POST /api/storefront/campaigns/:id/send` (via existing `EmailService`). Customer 360 **Campaigns tab** (list, HTML preview, Generate + Send).
- ✅ **Verified on real DB:** generated a `LOYAL_ACTIVE → vip_appreciation` draft with real products; second run correctly skipped (cooldown).
- ⏳ Follow-ups: SMTP config for real sends; approval workflow; scheduled/auto trigger runs (currently manual); PitchService → Anthropic SDK.

### Phase A — Offline / POS order identity — ✅ IMPLEMENTED 2026-07-27
Retailers who also sell in physical stores need those purchases on the same customer as the online ones. The CSV/Excel offline import already existed; what was missing was identity.
- ✅ **Phone is now an identity edge.** `IdentifierType` gains `phone_hash` (confidence **0.9**), with a golden-record fallback lookup on `customer_profiles.phone_hash`. Phone is the only identifier most tills capture. (§4.1)
- ✅ **Shared-phone guard.** A phone match is discarded (and reported as `phoneConflict`) when it points at someone with a *different* email — either the email on the incoming order, or the profile a stronger identifier already matched. Families share numbers and POS staff key in their own; a wrong merge is expensive to undo. A phone match to a profile with no email of its own is kept — that is the POS-only shopper being unified.
- ✅ **`canonical_orders.customer_profile_id`** (nullable, indexed `(connector, profile)`) — migration `20260727120000_offline_order_identity`. Deliberately no FK: profiles are deleted on merge and order history must outlive that. `mergeProfiles()` re-points orders onto the survivor.
- ✅ **Every order writer resolves identity** through `linkOrderToCustomer()` (`order-customer-link.service.ts`): the Shopify / BigCommerce / Adobe Commerce order syncs and the offline CSV import. One column, same meaning, whatever the source.
- ✅ **CSV import**: new `customer_phone`, `loyalty_id`, `store_location` columns (auto-matched by alias); email/phone are **hashed at normalization** — the plaintext no longer reaches the DB, matching the connector PII contract (§7.4). Loyalty id resolves as `external_ids.pos`.
- ✅ **Match report** returned per import (`OfflineIdentityReport`: customers matched / created, rows linked / unidentified, phone conflicts) and shown in the upload modal. Matching is only possible when the import targets an existing store — profiles are connector-scoped (§3.5.2) — and the UI says so when it is not.
- ✅ **Consumers** prefer the resolved column with the old metadata-hash join as fallback: `customer-metrics.service.ts` (so offline revenue lands in RFM/CLTV) and `GET /api/storefront/unified-customer` (so in-store orders appear in Customer 360, tagged with channel + store).
- ✅ **Backfill:** `npm --workspace @kpi-platform/api run backfill:order-customers -- [--connector=] [--site=] [--dry-run]` links pre-existing orders by external id → email hash → unambiguous phone.
- ✅ **Sample sheet:** `docs/samples/offline-pos-orders-sample.csv` (+ README) — 15 rows covering every match path, deliberately non-canonical headers so it also exercises the alias auto-matcher. Building it caught a real date bug: `parseFlexibleDate` built `DD/MM/YYYY` values with `new Date(y,m,d)` = **local** midnight, which in IST serialized back to the previous day (every POS order dated a day early), while date-only ISO rows in the same sheet were parsed as UTC. Now built with `Date.UTC(...)`, consistent with the ISO path and `toMagentoIso`.
- ✅ **Tests:** 6 new cases in `identity-resolver.test.ts` (phone-only match, offline-only profile creation, phone profile absorbed by email profile, shared-phone refusal ×2, order re-pointing on merge). Proven 10/10 via tsx harness — the vitest runner cannot start in this environment (missing rolldown native binding, fails on untouched tests too).
- ⏭️ **Not included:** OMS/ERP connector (still the `syncExternalSystem()` mock), and a review queue for the flagged phone conflicts.

### Phase 5 — Campaign UI, billing, polish
- Dashboard: campaigns (create/approve/schedule/send + trigger rules), customer intelligence, recommendations widgets — on `@kpi-platform/ui`.
- Stripe billing (greenfield, per-tenant) — integration doc §E.
- CSV import for products/customers; tests (isolation, RBAC, trigger cooldowns, webhook).

---

## 9. New/changed data model (summary)

| table | status | key columns |
|---|---|---|
| `identity_links` | **NEW** | `customerProfileId` FK, `identifierType`, `identifierValue`, `confidence`; unique `(connectorInstanceId, identifierType, identifierValue)` |
| `customer_profiles` | **CONSTRAINTS** | add unique `(connectorInstanceId, emailHash)` + `externalIds.<platform>` |
| `StorefrontSession` / `StorefrontEvent` | **ALTER** | add `customerProfileId` FK (nullable, back-filled) |
| `canonical_orders` | **ALTER** | add `customerProfileId` (nullable, **no FK** — survives profile merges); index `(connectorInstanceId, customerProfileId)`. Unifies online + offline/POS order history (Phase A) |
| `customer_behavior_snapshot` | **NEW** | one row / profile: live funnel, cart-abandon, live category affinity |
| `profile_merges` | **NEW** | merge audit (from, into, reason, reversible payload) |
| `customer_metrics`, `customer_profile` | **PORT** | ML-owned (RFM/CLTV/segment; favorite_categories/brands/top_products) |
| `Campaign*`, `TrainedModelRegistry` | **PORT** | per integration doc §5C |
| `canonical_products`, `canonical_product_categories` | **NEW SYNC** | product catalog (Phase 0.5) |

---

## 10. Environment / infra additions

| var | where | purpose |
|---|---|---|
| `AI_ENGINE_URL` | `apps/api` | base URL of Python engine |
| `PII_HASH_PEPPER` | shared | **must be identical (or empty) on both sides** (§7.1) |
| `CONNECTOR_SECRET_KEY` | shared | AES key for `emailEncrypted` (already used) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | `services/ai-engine` | pitch generation |
| `QDRANT_URL`, `REDIS_URL` | `services/ai-engine` | vectors + rec cache |
| `STRIPE_*` | `apps/api` | billing (Phase 5) |

Infra: add Qdrant + Redis to `infra/docker/docker-compose.yml`; add `dev:ai` root script.

---

## 11. Top risks

1. **Hash pepper mismatch silently breaks the join** (§7.1) — assert parity in CI.
2. **Duplicate golden records** without DB uniqueness (§7.2) — enforce before Phase 1 traffic.
3. **Two sync engines** double-counting orders — Fastify is the only sync owner (§3, integration doc §7).
4. **PII leakage** via un-scrubbed order metadata and plaintext in the graph (§7.4).
5. **Incorrect stitch merges** two real people — keep merges reversible + audited, bias toward high-confidence (deterministic email) edges.
6. **Neutralized processor** assumed live (§7.5) — build off the storefront ingest path that actually persists.
7. **Tenant/store scope drift** across the new tables — every new table carries `siteId`/`connectorInstanceId`; add isolation regression tests.

---

### One-line summary of what's actually new vs. ported
- 🆕 **Identity resolution** (`identity_links` + resolver + session back-fill + merges) — the CDP core.
- 🆕 **Behavioral fusion** (`customer_behavior_snapshot` → rec ranker + segmentation) — makes live data improve the ML.
- 🆕 **Behavioral trigger engine** — live signal → personalized, history-aware campaign.
- 🟡 **Ported** (per integration doc): Python ML engine, recommendations/analytics, campaign backend, billing.
- 🟢 **Reused**: 18th's auth, tenancy, connectors, PII, `CustomerProfile`, storefront ingest, email.
- 🔴 **Skipped**: GA4.
