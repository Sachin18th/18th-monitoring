# Controlled Sync — Design Plan

Replacing the automatic full sync on store connect with user-selected entities, a
chosen date range, scheduled time windows, and pause/resume that survives restarts.

## The problem

Connecting a store immediately syncs orders, products and customers, all at once,
for all of history. That work runs in the API process, so on a store with real
volume it competes with request handling — the API slows, and on a large enough
catalogue it can stop responding. There is no way to stop a running sync, limit how
far back it reaches, or confine it to off-peak hours.

Some machinery already exists. Every sync service has a page loop (`while (nextUrl)`
driven by `extractNextLink()`, with an inter-page delay). Sync types are already
separated (`ORDER_RESYNC`, `CUSTOMER_RESYNC`, `PRODUCT_RESYNC`), and
`POST /:id/resync` already accepts a `syncTargets` array.

## The blocker: fetch-all-then-process

Before anything else in this plan can work, the sync loops must be restructured.

All three connectors accumulate **every page into a single in-memory array**, return
it, and only then process it:

```
shopify-order-sync:305         orders.push(...pageOrders)
adobe-commerce-order-sync:315  items.push(...pageItems)      → return items
bigcommerce-order-sync:248     allOrders.push(...pageOrders) → return allOrders
```

Target scale is lakhs of records per entity. At 500k orders and 2–5 KB of JSON each,
that is **1–2.5 GB resident** before a single row is written — on a 4 GB instance.
This is the most likely mechanism behind the API becoming unresponsive during a large
sync; it is a memory problem, not a CPU one.

It also blocks resumability at the root: there is nothing to checkpoint mid-fetch
because nothing is persisted until every page is in.

**Required change: invert to streaming.** Fetch one page → process and persist that
page → checkpoint → fetch the next. Memory then stays flat at one page (~250 records)
regardless of store size, and the checkpoint has something meaningful to record.

### Why there is no obstacle to this

Only two things consume the full array, and both become accumulators:

| Consumer | Example | Becomes |
|---|---|---|
| Record count | `recordsFetched: orders.length` (`shopify-order-sync:163`) | a counter |
| Checkpoint value | `computeMaxCheckpoint(orders, […])` (`:168`) | a running max, updated per page |

**Transactions are already per-record.** `db.$transaction` at `shopify-order-sync:432`
and `:443` sits *inside* the `for (const order of orders)` loop, not around it. So
streaming does not change transaction boundaries — the one thing that could have made
this hard does not apply.

The change per service:

```ts
// today
const orders = await fetchOrders(...);          // all pages into an array
for (const order of orders) await processOne(order);

// needed
let count = 0, maxSeen = null;
await fetchOrders(..., async (pageOrders, nextCursor) => {   // once per page
  for (const order of pageOrders) { await processOne(order); count++; }
  maxSeen = maxOf(maxSeen, pageOrders);
  await saveProgress(jobId, { pageCursor: nextCursor, count, maxSeen });
});
```

Same processing code, same transactions. The fetch loop gains a callback and two
array-derived values become accumulators — roughly 20–30 lines per service, identical
in shape across all seven. It is the prerequisite for everything else in this plan,
but it is contained work, not a rewrite.

## What exists today

| Capability | Status | Detail |
|---|---|---|
| Per-entity sync | Have | `POST /:id/resync` takes `syncTargets`; sync-type constants defined |
| Cursor pagination | Have | `extractNextLink()` parses Shopify's `Link` header; loop follows it |
| Incremental cursor | Have | `getSinceCursor()` tracks newest `updated_at` per connector per type, 1h overlap |
| Job records | Partial | `connector_resync_jobs` has targets + status; no cursor, date range, progress or schedule |
| Date range | Missing | Window derived automatically; first sync has no cursor so it attempts all history |
| Pause / resume | Missing | No control signal, no saved position |
| Scheduled windows | Missing | Jobs run immediately on enqueue |
| Process isolation | Missing | `setImmediate(() => runResyncJob())` runs in the API process; restart orphans it |
| Rate-limit handling | Missing | Fixed delay only; no 429 / `Retry-After` handling |
| Page cap | Remove | `MAX_SYNC_PAGES = 200` truncates real data — see below |
| Product sync | Missing (2 of 3) | Only Shopify has one. Adobe Commerce and BigCommerce have no product sync at all |

## Connector matrix

The three connectors paginate and filter differently. The design holds for all three,
but `page_cursor` must be treated as an **opaque per-connector string** — each
connector serialises and resumes its own position; the scheduler never interprets it.

| | Shopify | Adobe Commerce | BigCommerce |
|---|---|---|---|
| Pagination | Link-header cursor (`extractNextLink`) | `searchCriteria` `currentPage` / `totalPages` | `page` counter, loop until empty |
| Cursor stored | Full next URL | Page number | Page number |
| Terminates on | No `rel="next"` | `currentPage > totalPages` | Empty page |
| Date filter | `updated_at_min` (+ `created_at_min` to add) | `searchCriteria[filterGroups][0][filters][0]` on `updated_at`, `gt` | `min_date_modified` (+ `min_date_created` to add) |
| Orders | Yes | Yes | Yes |
| Customers | Yes | Yes | Yes |
| Products | Yes | **To build** | **To build** |
| Journeys | Yes | Yes | No |

Products, customers and orders are required for all three platforms, so
`adobe-commerce-product-sync` and `bigcommerce-product-sync` are in scope.

## Building the two missing product syncs

Cheaper than it looks, for two reasons.

**The target schema is already platform-neutral.** `CanonicalProduct` is keyed on
`(site_id, source_system, product_id)` and `CanonicalProductCategory` on
`(site_id, source_system, product_id, category_name)`. The new services write to the
same tables with `source_system` set to `adobe_commerce` or `bigcommerce`. **No
migration required.**

**The scaffolding exists per platform.** Each new service is that platform's existing
*order* sync with a different endpoint and field mapping — the auth, error handling,
pagination shape, checkpoint writes and sync-run bookkeeping are all already solved
there. Copy `adobe-commerce-order-sync.service.ts` and
`bigcommerce-order-sync.service.ts` rather than `shopify-product-sync.service.ts`;
matching the platform matters more than matching the entity.

| | Adobe Commerce | BigCommerce |
|---|---|---|
| Endpoint | `GET /rest/V1/products` with `searchCriteria` | `GET /v3/catalog/products` |
| Pagination | Same `currentPage`/`totalPages` as its order sync | Same `page` counter as its order sync |
| Date filter | `searchCriteria` filter on `updated_at` | `date_modified:min` |
| Categories | `extension_attributes.category_links` → resolve names via `/V1/categories` | `categories[]` ids → resolve via `/v3/catalog/categories` |

Category resolution is the only genuinely new logic: both platforms return category
**ids** on the product, so names require a second call. Fetch the category tree once
per sync run and cache it in memory rather than resolving per product — otherwise a
5,000-product sync becomes 5,000 extra API calls against a rate limit.

**Sequencing:** build these in P2, against the resumable loop contract, not before it.
Writing them in P1 means writing them twice.

## The core idea

One durable row per connector per entity. That row is the queue, the progress bar
and the remote control.

The worker runs pages and, after **every page**, does three things:

```ts
// end of each page iteration, in every sync service
await saveProgress(jobId, { pageCursor: nextUrl, pagesDone, recordsProcessed });

if (job.desiredState === 'PAUSE') return stop('PAUSED');
if (Date.now() > windowEndsAt)    return stop('WINDOW_CLOSED');
if (!stillHoldLease(jobId))       return stop('QUEUED');
```

Because the cursor is saved *before* the check, stopping is always safe and always
between pages — never mid-record. Resuming is re-entering the loop with
`nextUrl = job.pageCursor`.

Pause, window expiry, deploy and crash all become the same operation. That is why
this design stays small.

```
QUEUED → RUNNING → PAUSED / WINDOW_CLOSED → RUNNING → COMPLETED
```

## Schema

New table rather than extending `connector_resync_jobs`, because the grain changes:
one row per entity, not one row per multi-target job.

```
connector_sync_jobs
  id                     uuid pk
  connector_instance_id  fk
  project_id, tenant_id  fk

  -- what the user asked for
  entity                 ORDERS | PRODUCTS | CUSTOMERS
  date_from              timestamptz       -- backfill floor
  date_to                timestamptz null  -- null = up to now

  -- scheduling
  window_start_local     time              -- e.g. 02:00
  window_minutes         int               -- e.g. 240
  timezone               text              -- e.g. Asia/Kolkata

  -- control + position
  status                 QUEUED | RUNNING | PAUSED | WINDOW_CLOSED
                         | COMPLETED | FAILED | CANCELLED
  desired_state          RUN | PAUSE       -- cooperative stop signal
  page_cursor            text null         -- the resumability primitive

  -- progress + safety
  pages_done             int default 0
  records_processed      int default 0
  records_failed         int default 0
  lease_owner            text null
  lease_expires_at       timestamptz null
  attempts               int default 0
  last_error             jsonb null
  last_started_at, last_stopped_at, completed_at
```

- `page_cursor` makes resume-tomorrow-from-here possible.
- `desired_state` makes pause feel instant without killing anything mid-write.
- `lease_owner` / `lease_expires_at` stop two processes running the same job after a restart.

## Where the work runs

**Run the scheduler in a separate process.** The "app stopping" risk comes from sync
sharing an event loop with request handling. Add a second pm2 process — `kpi-worker`
— running the scheduler and sync loop against the same database. Same codebase, new
entrypoint.

No new infrastructure. There is no Redis and none is needed: the job row plus a lease
*is* the queue, and at this scale that is sufficient. A broker would add an
operational dependency for no benefit today.

The scheduler ticks once a minute: which jobs have `desired_state = RUN`, a status of
`QUEUED` or `WINDOW_CLOSED`, and a window currently open in their timezone? Take a
lease on those and run them with a strict concurrency cap — one job per connector, a
small number globally — so one large store cannot monopolise the worker.

> Note: `infra/docker/Dockerfile.worker` refers to `apps/processing-engine`, which
> does not exist in the repo. That file is stale; it is not a template for this.

## API

| Endpoint | Purpose |
|---|---|
| `POST /integrations/:id/sync-plan` | Create job rows. Body: `entities[]`, `dateFrom`, schedule. What the new screen submits. |
| `GET /integrations/:id/sync-jobs` | Status and progress per entity, for the UI to poll. |
| `POST /sync-jobs/:jobId/pause` | Sets `desired_state = PAUSE`; returns immediately. |
| `POST /sync-jobs/:jobId/resume` | Sets `desired_state = RUN`. |
| `POST /sync-jobs/:jobId/cancel` | Terminal stop; clears the cursor so a future run starts fresh. |

Pause returns immediately rather than blocking until the worker acknowledges — the UI
shows "Pausing…" and settles to "Paused" on the next poll. Anything else makes the
request hang for the length of a page fetch.

## Store creation changes

Remove the automatic sync trigger. On connect: create the integration, provision the
store database (**unchanged — that must stay automatic**), set
`metadata.initialSync = { status: 'AWAITING_PLAN' }`, and route the user to the sync
screen.

| Field | Suggested default | Reasoning |
|---|---|---|
| Entities | All three, individually toggleable | Run sequentially, not in parallel |
| Date range | Last 12 months | Enough for year-on-year; presets 3/6/12/24 months + all time |
| Window | 02:00, 4 hours, store timezone | Off-peak for most retail; also offer "run now, no window" |

**Entity ordering: customers → products → orders.** Orders reference both, so syncing
them last means identity resolution and line-item enrichment have something to attach
to on the first pass. Users can deselect entities; the order should not be theirs to
choose.

## Date range needs a deliberate answer

**`created_at` vs `updated_at` — decide before building.**

The Shopify order sync filters on `updated_at_min`. That is right for incremental
catch-up and wrong for a user-selected backfill: "last 6 months of orders" means
orders *placed* in the last 6 months, not orders *edited* then. A two-year-old order
refunded yesterday has a recent `updated_at`.

**Proposal:** the backfill leg filters on `created_at_min` from the user's
`date_from`; the ongoing incremental leg keeps using `updated_at_min` from the
checkpoint. Different jobs, different semantics, should not share a parameter.

Each connector needs its own mapping of this concept — Shopify, BigCommerce and Adobe
Commerce express date filters differently. That mapping belongs in the connector, not
the scheduler.

## Hardening that must ship with this

**Rate limits.** No 429 or `Retry-After` handling today, only a fixed inter-page
delay. A four-hour unattended window will hit Shopify's limits. On 429: read
`Retry-After`, sleep, retry *the same page* without advancing the cursor.
`X-Shopify-Shop-Api-Call-Limit` allows slowing down before being throttled.

**Remove `MAX_SYNC_PAGES` entirely.** A fixed page cap is a data limit pretending to
be a safety feature: at 200 pages it silently abandons real orders on any store past
roughly 50k records, and reports success. All three connectors hit it
(`shopify-order-sync:279`, `adobe-commerce-order-sync:273`, `bigcommerce-order-sync:226`,
`shopify-product-sync:224`) and only emit a `console.warn`. Delete the constant and
its four call sites. With windows and resume in place there is no need to bound a
sync by page count — a long sync is simply one that spans several nights.

What *does* need replacing is the thing the cap was accidentally protecting against: a
**runaway loop**. Guard the loop shape, not the data volume:

| Connector | Runaway condition to detect |
|---|---|
| Shopify | `nextUrl` identical to the previous page's, or unchanged after a fetch |
| Adobe Commerce | `currentPage` not advancing, or `totalPages` absent/implausible |
| BigCommerce | A non-empty page that yields zero new external ids |

On detection, fail the job loudly with `last_error` set — never stop quietly. That
distinction is the whole point: the old behaviour was indistinguishable from success.

**Orphan recovery.** A worker killed mid-page leaves a `RUNNING` row. Any job whose
`lease_expires_at` has passed returns to `QUEUED` and resumes from its cursor. The
existing `sync-run-reaper.ts` is the natural home for that sweep.

**Idempotency — convert check-then-act into real upserts.** Resume re-fetches the page
that was in flight when the worker stopped, so every write must tolerate being
repeated. Today the services do a `findFirst` and then branch to `update` or `create`
(`shopify-product-sync:320-340`, `shopify-order-sync:444`,
`shopify-customer-sync:341`). That is *logically* idempotent for a single worker, but:

- it is a check-then-act race, so two workers on the same job (a lease bug, a
  double-start) can both pass the existence check and both insert;
- it costs two database round-trips per record, which is significant when a sync is
  tens of thousands of records long.

The canonical tables already carry the unique keys needed to do this atomically —
`uq_product_source_ref` on `(site_id, source_system, product_id)`, and the equivalents
for orders and customers. Replace the branch with a single `upsert` on that key. It is
both the correctness fix for resume and a roughly 2× reduction in database calls on a
large backfill.

A duplicate-order bug surfaces as inflated revenue, which is expensive to notice late.

## Suggested phasing

Each phase is independently shippable.

**P1 — Stop the bleeding.** Remove auto-sync on connect. Add the sync-plan screen with
entity selection and date range, submitting to the existing resync endpoint extended
with `dateFrom`. No cursor persistence yet. *This alone removes the outage risk*,
because nothing large starts without a human choosing it.

**P2 — Restructure to streaming, then make it resumable.** By far the largest phase,
and the order within it matters:

1. **Invert fetch-all-then-process into a streaming loop** in each service. This is
   the prerequisite for everything else and the fix for the memory blowout.
2. Batch the per-page writes into one upsert statement per page, on the existing
   unique keys. Replaces the per-record `findFirst` → `update`/`create`.
3. Add `connector_sync_jobs`, the per-page checkpoint, and the `desired_state` check.
   Ship pause/resume at both entity and store level.
4. Remove `MAX_SYNC_PAGES`; add the per-connector runaway guards.

Covers **seven existing loops** — Shopify orders/customers/products, Adobe
orders/customers, BigCommerce orders/customers — plus the **two new product syncs**
(Adobe, BigCommerce) written against the contract from the start. Nine streaming,
resumable loops in total.

Worth splitting per platform so it ships incrementally: Shopify first (three
entities, most traffic), then BigCommerce, then Adobe.

**P3 — Schedule it.** Window fields, minute-tick scheduler, leases, and the separate
`kpi-worker` process. Resume-tomorrow-from-here falls out of P2's cursor almost free —
a closed window is a pause with a different reason.

**P4 — Harden.** 429/`Retry-After`, truncation reporting, orphan sweep via lease
expiry, progress in the UI with counts and last-activity time.

## Decisions

**Scale: lakhs of records per entity.** Consequences, all folded in above:

- Streaming is mandatory, not an optimisation (see the blocker section).
- Per-page checkpointing is *not* a concern at this scale — 500k records at 250 per
  page is 2,000 checkpoint writes across an entire sync. Negligible. No batching
  needed; ignore the earlier caution about it.
- **Per-record database round-trips are the real cost.** The current
  `findFirst` → `update`/`create` pattern is two queries per record: 1,000,000
  queries for a 500k-order backfill. Batch the upserts — one statement per page of
  ~250 rows — and that becomes ~2,000 statements. This matters far more than any
  other performance item in this document.
- A backfill of this size spans multiple nights by design. The UI must show
  "night 3 of ~5", not a spinner.

**Pause works at both levels.** Job rows stay per-entity, which is the finer grain and
supports everything. A store-level pause is a control that sets `desired_state` on
every job for that connector in one call — no schema change:

| Endpoint | Effect |
|---|---|
| `POST /sync-jobs/:jobId/pause` | One entity |
| `POST /integrations/:id/sync/pause` | Every entity for that store |

Resume mirrors it. A store-level resume only restarts entities that were not
individually cancelled, so a deliberate per-entity cancel is not undone by a bulk
resume.

**A window that finishes early rolls into the next entity.** If customers finish at
02:40 and the window runs to 06:00, start products immediately rather than waiting
for tomorrow. The window is a permission to use resources, not a per-entity
allocation. Progress reporting becomes slightly less predictable — an entity may
start at an odd hour on a later night — which the UI handles by showing actual start
times rather than a fixed schedule.

**Incremental sync keeps running while a backfill is paused.** These are two distinct
jobs: the *backfill* imports history (what the user scheduled), the *incremental*
keeps new data flowing so the dashboard stays current. Pausing a slow historical
import must not silently freeze today's orders. They write to the same tables via
idempotent upserts, so concurrent operation is safe. Only an explicit
disable-integration action stops incremental sync.
