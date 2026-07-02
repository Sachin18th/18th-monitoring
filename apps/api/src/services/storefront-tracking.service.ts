import { prisma, encryptEmail, hashEmail, scrubEmails } from '@kpi-platform/db';
import { reserveTrackingBudget } from '../utils/track-rate-limit';
import {
  classifyEvent,
  STAGE_RANK,
  type CanonicalFunnelStage,
  type Platform,
} from '../lib/tracking/classifyEvent';

/**
 * Public storefront session/event ingest + analyst-facing queries.
 *
 * Ingest is intentionally defensive: a connector is validated by lookup (which
 * also yields the tenant_id used for scoping), the per-connector sliding-window
 * rate limit is applied, sessions are upserted and events bulk-inserted. The
 * ingest path never throws to the caller — the route reports accepted/rejected.
 *
 * Every read query filters by BOTH tenant_id and connector_instance_id.
 */

export const STOREFRONT_EVENT_TYPES = [
  'page_view',
  'product_view',
  'add_to_cart',
  'element_click',
  'checkout_step',
  'checkout_abandon',
  'checkout_complete',
] as const;

export type StorefrontEventType = (typeof STOREFRONT_EVENT_TYPES)[number];
const VALID_EVENT_TYPES = new Set<string>(STOREFRONT_EVENT_TYPES);

const VALID_DEVICE_TYPES = new Set(['mobile', 'desktop', 'tablet']);

// Canonical funnel stages, in order. The session-level funnel is computed from
// the boolean flags these map onto (product_viewed / add_to_cart / etc.).
const CANONICAL_FUNNEL_STAGES: CanonicalFunnelStage[] = [
  'visit',
  'product_view',
  'add_to_cart',
  'checkout',
  'purchase',
];

// Human-readable labels for the journey-intel funnel UI.
const FUNNEL_STAGE_LABELS: Record<CanonicalFunnelStage, string> = {
  visit: 'Visit',
  product_view: 'Product View',
  add_to_cart: 'Add to Cart',
  checkout: 'Checkout',
  purchase: 'Purchase',
};

/** Resolve the commerce platform from a connector's provider_id (the trusted source). */
function platformFromProviderId(providerId?: string | null): Platform {
  const p = String(providerId || '').toLowerCase();
  if (p.includes('shopify')) return 'shopify';
  if (p.includes('bigcommerce')) return 'bigcommerce';
  if (p.includes('adobe') || p.includes('magento')) return 'adobe_commerce';
  return 'unknown';
}

// Top-level keys consumed directly; everything else on an event folds into `properties`.
const RESERVED_EVENT_KEYS = new Set([
  'session_id', 'sessionId',
  'visitor_id', 'visitorId',
  'event_type', 'eventType',
  'page_url', 'pageUrl', 'page_path',
  'page_title', 'pageTitle',
  'occurred_at', 'occurredAt', 'timestamp',
  'project_token', 'source_platform',
  'properties', '_pf_attempts',
]);

type NormalizedEvent = {
  sessionId: string;
  visitorId: string;
  eventType: StorefrontEventType;
  pageUrl: string | null;
  pageTitle: string | null;
  occurredAt: Date;
  properties: Record<string, unknown>;
  /** Canonical funnel stage, assigned in ingestBatch once the platform is known. */
  canonicalStage: CanonicalFunnelStage;
  /** Whether this event gets its own storefront_events row (dedup rule). */
  shouldInsert: boolean;
};

/** Aggregate of a session's events within one batch, resolved before the upsert. */
type SessionAggregate = {
  visitorId: string;
  lastActiveAt: Date;
  landingPage: string | null;
  referrer: string | null;
  pageViewCount: number;
  pageUrls: string[];
  funnelStage: CanonicalFunnelStage;
  funnelStagesReached: CanonicalFunnelStage[];
  productViewed: boolean;
  productIds: string[];
  addToCart: boolean;
  checkoutStarted: boolean;
  purchaseCompleted: boolean;
  lastPageUrl: string | null;
  lastPageTitle: string | null;
};

export class StorefrontTrackingService {
  /** Best-effort device classification from a user-agent string. */
  static detectDeviceType(userAgent?: string | null): 'mobile' | 'desktop' | 'tablet' | null {
    if (!userAgent) return null;
    const ua = userAgent.toLowerCase();
    if (/ipad|tablet|(android(?!.*mobile))|kindle|silk|playbook/.test(ua)) return 'tablet';
    if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/.test(ua)) return 'mobile';
    return 'desktop';
  }

  private static normalizeEvent(raw: any): NormalizedEvent | null {
    if (!raw || typeof raw !== 'object') return null;

    const sessionId = String(raw.session_id ?? raw.sessionId ?? '').trim();
    const visitorId = String(raw.visitor_id ?? raw.visitorId ?? '').trim();
    const eventType = String(raw.event_type ?? raw.eventType ?? '').trim();

    if (!sessionId || !visitorId || !VALID_EVENT_TYPES.has(eventType)) return null;

    const occurredRaw = raw.occurred_at ?? raw.occurredAt ?? raw.timestamp;
    const occurredAt = occurredRaw ? new Date(occurredRaw) : new Date();
    if (isNaN(occurredAt.getTime())) return null;

    const pageUrl = raw.page_url ?? raw.pageUrl ?? raw.page_path ?? null;
    const pageTitle = raw.page_title ?? raw.pageTitle ?? null;

    // Fold any extra fields (and an explicit `properties` object) into properties.
    const properties: Record<string, unknown> = {};
    if (raw.properties && typeof raw.properties === 'object') {
      Object.assign(properties, raw.properties);
    }
    for (const key of Object.keys(raw)) {
      if (!RESERVED_EVENT_KEYS.has(key)) properties[key] = raw[key];
    }

    // Email must never be persisted in plaintext in storefront_events.properties —
    // only the AES-256-GCM envelope and the deterministic hash, mirroring
    // customer_profiles.email_encrypted/email_hash.
    if (typeof properties.email === 'string') {
      const rawEmail = properties.email;
      properties.email_encrypted = encryptEmail(rawEmail);
      properties.email_hash = hashEmail(rawEmail);
      delete properties.email;
    }
    // Defense-in-depth: scrub any raw email that may be nested inside another
    // property (e.g. a captured checkout_token object) so no plaintext address
    // can leak into storefront_events.properties through any other field.
    const scrubbedProperties = scrubEmails(properties);

    return {
      sessionId: sessionId.slice(0, 255),
      visitorId: visitorId.slice(0, 255),
      eventType: eventType as StorefrontEventType,
      pageUrl: pageUrl ? String(pageUrl).slice(0, 2000) : null,
      pageTitle: pageTitle ? String(pageTitle).slice(0, 500) : null,
      occurredAt,
      properties: scrubbedProperties,
      // Placeholders; resolved in ingestBatch once the connector's platform is known.
      canonicalStage: 'visit',
      shouldInsert: false,
    };
  }

  /**
   * Ingest a batch of events for a connector. Validates the connector, applies
   * the per-connector rate limit, upserts the session(s), and bulk-inserts the
   * accepted events. Never throws — returns counts.
   */
  static async ingestBatch(input: {
    connectorInstanceId?: string | null;
    events: any[];
    userAgent?: string | null;
    deviceType?: string | null;
  }): Promise<{ accepted: number; rejected: number; stored: number }> {
    const events = Array.isArray(input.events) ? input.events : [];
    const total = events.length;
    if (!input.connectorInstanceId || total === 0) return { accepted: 0, rejected: total, stored: 0 };

    try {
      // 1) Validate connector by lookup; derive tenant_id (scoping) + platform.
      const found = await prisma.$queryRaw<Array<{ id: string; tenant_id: string; provider_id: string | null }>>`
        SELECT id, tenant_id, provider_id FROM connector_instances WHERE id = ${String(input.connectorInstanceId)} LIMIT 1
      `;
      const connector = found[0];
      if (!connector) {
        // Most common silent-drop cause: the cid in the storefront script does
        // not match any connector_instances.id (stale/wrong id, wrong tenant).
        console.warn('[TRACK] reject: connector_instance_id not found', {
          received: String(input.connectorInstanceId),
          events: total,
        });
        return { accepted: 0, rejected: total, stored: 0 };
      }

      const connectorInstanceId = connector.id;
      const tenantId = connector.tenant_id;
      // Platform comes from connector_instances.provider_id (trusted). If it can't
      // be resolved, fall back to the tracker's properties.platform hint.
      let platform: Platform = platformFromProviderId(connector.provider_id);

      // 2) Normalize + validate events (malformed events are rejected, not fatal).
      const normalized: NormalizedEvent[] = [];
      let rejected = 0;
      const rejectSamples: any[] = [];
      for (const raw of events) {
        const ev = this.normalizeEvent(raw);
        if (ev) normalized.push(ev);
        else {
          rejected += 1;
          // Surface WHY an event was dropped (bad/missing event_type, missing
          // session_id/visitor_id, or invalid occurred_at) — capped to 3 samples.
          if (rejectSamples.length < 3 && raw && typeof raw === 'object') {
            rejectSamples.push({
              event_type: raw.event_type ?? raw.eventType ?? null,
              has_session_id: Boolean(raw.session_id ?? raw.sessionId),
              has_visitor_id: Boolean(raw.visitor_id ?? raw.visitorId),
              occurred_at: raw.occurred_at ?? raw.occurredAt ?? raw.timestamp ?? null,
            });
          }
        }
      }
      if (rejected > 0) {
        console.warn('[TRACK] reject: events failed normalization', {
          connectorInstanceId,
          rejected,
          accepted: normalized.length,
          samples: rejectSamples,
        });
      }
      if (normalized.length === 0) return { accepted: 0, rejected, stored: 0 };

      // 3) Per-connector sliding-window rate limit (1,000 events/min).
      const budget = reserveTrackingBudget(connectorInstanceId, normalized.length);
      if (budget < normalized.length) {
        rejected += normalized.length - budget;
        normalized.length = budget; // drop the overflow
      }
      if (normalized.length === 0) return { accepted: 0, rejected, stored: 0 };

      // Fall back to the tracker's platform hint only when provider_id was
      // inconclusive (provider_id remains authoritative when known).
      if (platform === 'unknown') {
        const hint = String(normalized[0]?.properties?.platform ?? '').toLowerCase();
        if (hint === 'shopify' || hint === 'bigcommerce' || hint === 'adobe_commerce') {
          platform = hint as Platform;
        }
      }

      // 4) Classify every event: canonical funnel stage + whether it earns its
      //    own storefront_events row (dedup — a page_view on a product/checkout/
      //    confirmation page is skipped since the dedicated event covers it).
      for (const ev of normalized) {
        const classified = classifyEvent({
          eventType: ev.eventType,
          pageUrl: ev.pageUrl ?? '',
          pageTitle: ev.pageTitle ?? '',
          properties: ev.properties as Record<string, any>,
          platform,
        });
        ev.canonicalStage = classified.canonicalStage;
        ev.shouldInsert = classified.shouldInsertRow;
      }

      const deviceType = VALID_DEVICE_TYPES.has(String(input.deviceType))
        ? String(input.deviceType)
        : this.detectDeviceType(input.userAgent);

      // 5) Collapse the batch into one aggregate per session, then upsert. Plain
      //    page_views never get their own event row — they only advance the
      //    session aggregate (storage-bloat fix).
      const sessions = new Map<string, NormalizedEvent[]>();
      for (const ev of normalized) {
        const list = sessions.get(ev.sessionId);
        if (list) list.push(ev);
        else sessions.set(ev.sessionId, [ev]);
      }

      for (const [sessionId, sessionEvents] of sessions) {
        const aggregate = this.aggregateSession(sessionEvents);
        await this.upsertSession({
          connectorInstanceId,
          tenantId,
          sessionId,
          userAgent: input.userAgent ?? null,
          deviceType,
          platform: platform === 'unknown' ? null : platform,
          aggregate,
        });
      }

      // 6) Insert event rows per the dedup rule (dedicated milestone events,
      //    navigation page_views, clicks, custom). A page_view on a milestone
      //    page is skipped — only the session aggregate reflects it.
      const insertable = normalized.filter((ev) => ev.shouldInsert);
      if (insertable.length > 0) {
        await this.insertEvents(connectorInstanceId, tenantId, insertable);
      }

      // `accepted` counts every admitted event (sessions are always updated);
      // `stored` reflects the rows actually written to storefront_events.
      return { accepted: normalized.length, rejected, stored: insertable.length };
    } catch (err) {
      console.error('[TRACK] ingest failed', err);
      return { accepted: 0, rejected: total, stored: 0 };
    }
  }

  /**
   * Reduce a session's events (within one batch) to the funnel aggregate the
   * upsert needs. Page URLs and product ids preserve first-seen order and are
   * de-duplicated; the funnel stage is the highest rank observed.
   */
  private static aggregateSession(events: NormalizedEvent[]): SessionAggregate {
    const ordered = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const first = ordered[0];
    const last = ordered[ordered.length - 1];

    const pageUrls: string[] = [];
    const productIds: string[] = [];
    const stagesReached = new Set<CanonicalFunnelStage>(['visit']);
    let highest: CanonicalFunnelStage = 'visit';
    let productViewed = false;
    let addToCart = false;
    let checkoutStarted = false;
    let purchaseCompleted = false;

    for (const ev of ordered) {
      if (ev.pageUrl && !pageUrls.includes(ev.pageUrl)) pageUrls.push(ev.pageUrl);

      const pid = ev.properties?.product_id ?? (ev.properties as any)?.productId;
      if (pid != null) {
        const id = String(pid);
        if (id && !productIds.includes(id)) productIds.push(id);
      }

      const stage = ev.canonicalStage;
      stagesReached.add(stage);
      if (STAGE_RANK[stage] > STAGE_RANK[highest]) highest = stage;

      if (stage === 'product_view') productViewed = true;
      else if (stage === 'add_to_cart') addToCart = true;
      else if (stage === 'checkout') checkoutStarted = true;
      else if (stage === 'purchase') purchaseCompleted = true;
    }

    // A purchase necessarily passed through checkout. On Shopify/BigCommerce the
    // checkout page is hosted off-domain (no tracker), so checkout_step often
    // never fires even though the session clearly checked out — the order
    // confirmation page (back on the merchant domain) is the only signal. Infer
    // checkout from purchase so the funnel can never show checkout < purchase.
    if (purchaseCompleted) {
      checkoutStarted = true;
      stagesReached.add('checkout');
    }

    return {
      visitorId: first.visitorId,
      lastActiveAt: last.occurredAt,
      landingPage: first.pageUrl,
      referrer: (first.properties?.referrer as string | undefined) ?? null,
      pageViewCount: ordered.length,
      pageUrls: pageUrls.slice(0, 50),
      funnelStage: highest,
      funnelStagesReached: Array.from(stagesReached),
      productViewed,
      productIds: productIds.slice(0, 50),
      addToCart,
      checkoutStarted,
      purchaseCompleted,
      lastPageUrl: last.pageUrl,
      lastPageTitle: last.pageTitle,
    };
  }

  private static async upsertSession(s: {
    connectorInstanceId: string;
    tenantId: string;
    sessionId: string;
    userAgent: string | null;
    deviceType: string | null;
    platform: string | null;
    aggregate: SessionAggregate;
  }): Promise<void> {
    const a = s.aggregate;
    // First-sight columns (started_at / landing_page / referrer / device_type /
    // platform) are preserved on conflict; last_active_at only ever advances.
    // The funnel aggregate merges across batches:
    //   - page_view_count accumulates,
    //   - page_urls_visited / product_ids_viewed are order-preserving, deduped,
    //     capped at 50,
    //   - boolean flags are monotonic (OR — never revert to false),
    //   - funnel_stage holds the highest rank reached (compared in SQL),
    //   - funnel_stages_reached is the deduped union of all stages seen.
    await prisma.$executeRawUnsafe(
      `INSERT INTO storefront_sessions
         (connector_instance_id, tenant_id, session_id, visitor_id, last_active_at,
          user_agent, referrer, landing_page, device_type,
          page_view_count, page_urls_visited, funnel_stage, funnel_stages_reached,
          product_viewed, product_ids_viewed, add_to_cart, checkout_started, purchase_completed,
          last_page_url, last_page_title, platform)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7, $8, $9,
               $10::int, $11::jsonb, $12, $13::jsonb,
               $14::bool, $15::jsonb, $16::bool, $17::bool, $18::bool,
               $19, $20, $21)
       ON CONFLICT (connector_instance_id, session_id) DO UPDATE SET
         last_active_at = GREATEST(storefront_sessions.last_active_at, EXCLUDED.last_active_at),
         user_agent     = COALESCE(storefront_sessions.user_agent, EXCLUDED.user_agent),
         referrer       = COALESCE(storefront_sessions.referrer, EXCLUDED.referrer),
         landing_page   = COALESCE(storefront_sessions.landing_page, EXCLUDED.landing_page),
         device_type    = COALESCE(storefront_sessions.device_type, EXCLUDED.device_type),
         platform       = COALESCE(storefront_sessions.platform, EXCLUDED.platform),
         page_view_count = storefront_sessions.page_view_count + EXCLUDED.page_view_count,
         page_urls_visited = COALESCE((
           SELECT jsonb_agg(url ORDER BY ord)
           FROM (
             SELECT url, MIN(ord) AS ord
             FROM (
               SELECT value AS url, ordinality AS ord
                 FROM jsonb_array_elements_text(storefront_sessions.page_urls_visited) WITH ORDINALITY
               UNION ALL
               SELECT value AS url, ordinality + 1000000 AS ord
                 FROM jsonb_array_elements_text(EXCLUDED.page_urls_visited) WITH ORDINALITY
             ) merged
             GROUP BY url
             ORDER BY MIN(ord)
             LIMIT 50
           ) deduped
         ), storefront_sessions.page_urls_visited),
         product_ids_viewed = COALESCE((
           SELECT jsonb_agg(pid ORDER BY ord)
           FROM (
             SELECT pid, MIN(ord) AS ord
             FROM (
               SELECT value AS pid, ordinality AS ord
                 FROM jsonb_array_elements_text(storefront_sessions.product_ids_viewed) WITH ORDINALITY
               UNION ALL
               SELECT value AS pid, ordinality + 1000000 AS ord
                 FROM jsonb_array_elements_text(EXCLUDED.product_ids_viewed) WITH ORDINALITY
             ) merged
             GROUP BY pid
             ORDER BY MIN(ord)
             LIMIT 50
           ) deduped
         ), storefront_sessions.product_ids_viewed),
         product_viewed     = storefront_sessions.product_viewed     OR EXCLUDED.product_viewed,
         add_to_cart        = storefront_sessions.add_to_cart        OR EXCLUDED.add_to_cart,
         checkout_started   = storefront_sessions.checkout_started   OR EXCLUDED.checkout_started,
         purchase_completed = storefront_sessions.purchase_completed OR EXCLUDED.purchase_completed,
         funnel_stage = CASE
           WHEN (CASE EXCLUDED.funnel_stage WHEN 'purchase' THEN 5 WHEN 'checkout' THEN 4 WHEN 'add_to_cart' THEN 3 WHEN 'product_view' THEN 2 WHEN 'visit' THEN 1 ELSE 0 END)
              > (CASE storefront_sessions.funnel_stage WHEN 'purchase' THEN 5 WHEN 'checkout' THEN 4 WHEN 'add_to_cart' THEN 3 WHEN 'product_view' THEN 2 WHEN 'visit' THEN 1 ELSE 0 END)
           THEN EXCLUDED.funnel_stage ELSE storefront_sessions.funnel_stage END,
         funnel_stages_reached = COALESCE((
           SELECT jsonb_agg(DISTINCT stage)
           FROM (
             SELECT jsonb_array_elements_text(storefront_sessions.funnel_stages_reached) AS stage
             UNION
             SELECT jsonb_array_elements_text(EXCLUDED.funnel_stages_reached) AS stage
           ) s
         ), storefront_sessions.funnel_stages_reached),
         last_page_url   = COALESCE(EXCLUDED.last_page_url, storefront_sessions.last_page_url),
         last_page_title = COALESCE(EXCLUDED.last_page_title, storefront_sessions.last_page_title)`,
      s.connectorInstanceId,
      s.tenantId,
      s.sessionId,
      a.visitorId,
      a.lastActiveAt.toISOString(),
      s.userAgent,
      a.referrer,
      a.landingPage,
      s.deviceType,
      a.pageViewCount,
      JSON.stringify(a.pageUrls),
      a.funnelStage,
      JSON.stringify(a.funnelStagesReached),
      a.productViewed,
      JSON.stringify(a.productIds),
      a.addToCart,
      a.checkoutStarted,
      a.purchaseCompleted,
      a.lastPageUrl,
      a.lastPageTitle,
      s.platform,
    );
  }

  private static async insertEvents(
    connectorInstanceId: string,
    tenantId: string,
    events: NormalizedEvent[],
  ): Promise<void> {
    // Single multi-row INSERT (10 columns). id + received_at use column defaults.
    // canonical_stage carries the normalized funnel stage; event_type is the raw
    // signal, kept for debugging/reference.
    const cols = 10;
    const placeholders: string[] = [];
    const params: any[] = [];

    events.forEach((ev, i) => {
      const b = i * cols;
      placeholders.push(
        `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}::timestamptz, $${b + 10}::jsonb)`,
      );
      params.push(
        connectorInstanceId,
        tenantId,
        ev.sessionId,
        ev.visitorId,
        ev.eventType,
        ev.canonicalStage,
        ev.pageUrl,
        ev.pageTitle,
        ev.occurredAt.toISOString(),
        JSON.stringify(ev.properties ?? {}),
      );
    });

    const sql =
      `INSERT INTO storefront_events
         (connector_instance_id, tenant_id, session_id, visitor_id, event_type, canonical_stage, page_url, page_title, occurred_at, properties)
       VALUES ` + placeholders.join(', ');

    try {
      await prisma.$executeRawUnsafe(sql, ...params);
    } catch (err) {
      // A single bad row (e.g. an event_type not yet allowed by the DB CHECK
      // constraint) would otherwise fail the whole multi-row INSERT and drop
      // every event in the batch. Fall back to per-row inserts so one rejected
      // row can't poison its neighbours; log the offenders for visibility.
      console.error('[TRACK] bulk event insert failed; retrying row-by-row', err);
      const rowSql =
        `INSERT INTO storefront_events
           (connector_instance_id, tenant_id, session_id, visitor_id, event_type, canonical_stage, page_url, page_title, occurred_at, properties)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::jsonb)`;
      for (const ev of events) {
        try {
          await prisma.$executeRawUnsafe(
            rowSql,
            connectorInstanceId,
            tenantId,
            ev.sessionId,
            ev.visitorId,
            ev.eventType,
            ev.canonicalStage,
            ev.pageUrl,
            ev.pageTitle,
            ev.occurredAt.toISOString(),
            JSON.stringify(ev.properties ?? {}),
          );
        } catch (rowErr) {
          console.error('[TRACK] dropped event row', { eventType: ev.eventType, sessionId: ev.sessionId }, rowErr);
        }
      }
    }
  }

  /**
   * Count authoritative *completed purchases* from synced orders for the given
   * connectors within the window. On Shopify/BigCommerce the checkout + order
   * confirmation pages are hosted off-domain, so the tracker can never emit
   * checkout_step / checkout_complete — the only truthful purchase signal is the
   * order that the connector syncs into canonical_orders. Cancelled/refunded/
   * pending/draft orders are excluded (they are not completed purchases).
   */
  private static async orderPurchaseCount(
    connectorInstanceIds: string[],
    from: Date,
    to: Date,
  ): Promise<number> {
    const ids = (connectorInstanceIds || []).filter(Boolean);
    if (ids.length === 0) return 0;
    try {
      // Synced orders are only merged into the funnel for platforms whose
      // checkout + confirmation are OFF-domain and therefore invisible to the
      // storefront tracker (Shopify, BigCommerce). For on-domain platforms
      // (Adobe Commerce / Magento) the tracked storefront_sessions already
      // capture checkout + purchase, so merging synced orders would re-add the
      // same buyers against a tracked-session base — clamping every funnel stage
      // up to the order count (visit=…=purchase) and forcing ~100% conversion
      // with 0% drop-off. Restrict the merge to off-domain connectors.
      const providers = await prisma.$queryRawUnsafe<Array<{ id: string; provider_id: string | null }>>(
        `SELECT id, provider_id FROM connector_instances WHERE id = ANY($1::text[])`,
        ids,
      );
      const offDomainIds = providers
        .filter((p) => {
          const platform = platformFromProviderId(p.provider_id);
          return platform === 'shopify' || platform === 'bigcommerce';
        })
        .map((p) => p.id);
      if (offDomainIds.length === 0) return 0;

      const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT COUNT(*)::bigint AS c
           FROM canonical_orders
          WHERE connector_instance_id = ANY($1::text[])
            AND placed_at >= $2 AND placed_at <= $3
            AND UPPER(normalized_status) NOT IN
                ('CANCELLED','CANCELED','REFUNDED','FAILED','PENDING','DRAFT','VOIDED')`,
        offDomainIds,
        from,
        to,
      );
      return Number(rows[0]?.c ?? 0);
    } catch (err) {
      // canonical_orders may be empty/absent for a connector — never break the funnel.
      console.warn('[TRACK] orderPurchaseCount failed', err);
      return 0;
    }
  }

  /**
   * Merge authoritative order purchases into the session-derived funnel counts.
   * A real order proves its buyer reached every funnel stage, so we clamp the
   * counts upward (purchase → checkout → add_to_cart → product_view → visit),
   * keeping the funnel monotonic. `max` (not sum) avoids double-counting buyers
   * the tracker already saw. This is what lets Shopify show checkout + purchase
   * even though its checkout/confirmation pages are off-domain and untrackable.
   *
   * The merge only fills the off-domain blind spot ON TOP OF a real tracked-
   * session base. When there are no storefront_sessions/events for the store
   * (counts.visit === 0), there is nothing to attribute the synced orders to —
   * clamping would fabricate a funnel where visit=…=purchase=order_count and
   * report a misleading 100% conversion / 0% drop-off. In that case we leave the
   * funnel purely session-derived (all zeros → honest empty state) and do NOT
   * fall back to order data.
   */
  private static mergeOrderPurchases(
    counts: Record<CanonicalFunnelStage, number>,
    orderPurchases: number,
  ): void {
    if (orderPurchases <= 0) return;
    if (counts.visit <= 0) return;
    counts.purchase = Math.max(counts.purchase, orderPurchases);
    counts.checkout = Math.max(counts.checkout, counts.purchase);
    counts.add_to_cart = Math.max(counts.add_to_cart, counts.checkout);
    counts.product_view = Math.max(counts.product_view, counts.add_to_cart);
    counts.visit = Math.max(counts.visit, counts.product_view);
  }

  // ── Analyst queries (always scoped by tenant_id + connector_instance_id) ────

  static async listSessions(input: {
    tenantId: string;
    connectorInstanceId: string;
    from?: Date | null;
    to?: Date | null;
    limit?: number | null;
    offset?: number | null;
  }) {
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
    const offset = Math.max(Number(input.offset) || 0, 0);
    const to = input.to ?? new Date();
    const from = input.from ?? new Date(to.getTime() - 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, session_id, visitor_id, started_at, last_active_at, user_agent,
             referrer, landing_page, device_type, metadata
      FROM storefront_sessions
      WHERE tenant_id = ${input.tenantId}
        AND connector_instance_id = ${input.connectorInstanceId}
        AND started_at >= ${from} AND started_at <= ${to}
      ORDER BY last_active_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const totalRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM storefront_sessions
      WHERE tenant_id = ${input.tenantId}
        AND connector_instance_id = ${input.connectorInstanceId}
        AND started_at >= ${from} AND started_at <= ${to}
    `;

    return {
      sessions: rows.map((r) => ({
        id: r.id,
        session_id: r.session_id,
        visitor_id: r.visitor_id,
        started_at: r.started_at instanceof Date ? r.started_at.toISOString() : r.started_at,
        last_active_at: r.last_active_at instanceof Date ? r.last_active_at.toISOString() : r.last_active_at,
        user_agent: r.user_agent,
        referrer: r.referrer,
        landing_page: r.landing_page,
        device_type: r.device_type,
        metadata: r.metadata,
      })),
      total: Number(totalRows[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  /**
   * Live user count — distinct visitors whose sessions are still active "right
   * now", i.e. their last_active_at falls within the trailing `windowMinutes`
   * (default 5). This is the real-time storefront presence count, distinct from
   * the historical session totals returned by listSessions / sessionKpis.
   */
  static async liveUsers(input: {
    tenantId: string;
    connectorInstanceId: string;
    windowMinutes?: number | null;
  }) {
    const windowMinutes = Math.min(Math.max(Number(input.windowMinutes) || 5, 1), 60);
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const rows = await prisma.$queryRaw<Array<{ live_visitors: bigint; live_sessions: bigint }>>`
      SELECT
        COUNT(DISTINCT visitor_id)::bigint AS live_visitors,
        COUNT(*)::bigint                   AS live_sessions
      FROM storefront_sessions
      WHERE tenant_id = ${input.tenantId}
        AND connector_instance_id = ${input.connectorInstanceId}
        AND last_active_at >= ${since}
    `;

    return {
      liveUsers: Number(rows[0]?.live_visitors ?? 0),
      liveSessions: Number(rows[0]?.live_sessions ?? 0),
      windowMinutes,
      asOf: new Date().toISOString(),
    };
  }

  static async listEvents(input: {
    tenantId: string;
    connectorInstanceId: string;
    sessionId?: string | null;
    eventType?: string | null;
    from?: Date | null;
    to?: Date | null;
    limit?: number | null;
    offset?: number | null;
  }) {
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
    const offset = Math.max(Number(input.offset) || 0, 0);
    const to = input.to ?? new Date();
    const from = input.from ?? new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const sessionId = input.sessionId ? String(input.sessionId) : null;
    const eventType = input.eventType && VALID_EVENT_TYPES.has(input.eventType) ? input.eventType : null;

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, session_id, visitor_id, event_type, page_url, page_title,
             occurred_at, received_at, properties
      FROM storefront_events
      WHERE tenant_id = ${input.tenantId}
        AND connector_instance_id = ${input.connectorInstanceId}
        AND occurred_at >= ${from} AND occurred_at <= ${to}
        AND (${sessionId}::text IS NULL OR session_id = ${sessionId})
        AND (${eventType}::text IS NULL OR event_type = ${eventType})
      ORDER BY occurred_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const totalRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM storefront_events
      WHERE tenant_id = ${input.tenantId}
        AND connector_instance_id = ${input.connectorInstanceId}
        AND occurred_at >= ${from} AND occurred_at <= ${to}
        AND (${sessionId}::text IS NULL OR session_id = ${sessionId})
        AND (${eventType}::text IS NULL OR event_type = ${eventType})
    `;

    return {
      events: rows.map((r) => ({
        id: r.id,
        session_id: r.session_id,
        visitor_id: r.visitor_id,
        event_type: r.event_type,
        page_url: r.page_url,
        page_title: r.page_title,
        occurred_at: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : r.occurred_at,
        received_at: r.received_at instanceof Date ? r.received_at.toISOString() : r.received_at,
        properties: r.properties,
      })),
      total: Number(totalRows[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  /**
   * Purchase Journey Funnel computed from storefront_sessions — the authoritative
   * funnel record per session. Stages: visit → product_view → add_to_cart →
   * checkout → purchase. Each session is counted once per stage via its monotonic
   * boolean flags (set by classifyEvent during ingest), so platform-specific
   * event names no longer cause stages to read 0. Synced orders are merged in so
   * off-domain checkouts (Shopify/BigCommerce) still show checkout + purchase.
   */
  static async funnel(input: {
    tenantId: string;
    connectorInstanceId: string;
    from?: Date | null;
    to?: Date | null;
  }) {
    const to = input.to ?? new Date();
    const from = input.from ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRaw<
      Array<{
        visit_count: bigint;
        product_view_count: bigint;
        add_to_cart_count: bigint;
        checkout_count: bigint;
        purchase_count: bigint;
      }>
    >`
      SELECT
        COUNT(*)::bigint                                       AS visit_count,
        COUNT(*) FILTER (WHERE product_viewed)::bigint         AS product_view_count,
        COUNT(*) FILTER (WHERE add_to_cart)::bigint            AS add_to_cart_count,
        COUNT(*) FILTER (WHERE checkout_started OR purchase_completed)::bigint AS checkout_count,
        COUNT(*) FILTER (WHERE purchase_completed)::bigint     AS purchase_count
      FROM storefront_sessions
      WHERE tenant_id = ${input.tenantId}
        AND connector_instance_id = ${input.connectorInstanceId}
        AND started_at >= ${from} AND started_at <= ${to}
    `;

    const r = rows[0];
    const counts: Record<CanonicalFunnelStage, number> = {
      visit: Number(r?.visit_count ?? 0),
      product_view: Number(r?.product_view_count ?? 0),
      add_to_cart: Number(r?.add_to_cart_count ?? 0),
      checkout: Number(r?.checkout_count ?? 0),
      purchase: Number(r?.purchase_count ?? 0),
    };

    // Merge authoritative synced-order purchases (off-domain checkouts).
    const orderPurchases = await this.orderPurchaseCount([input.connectorInstanceId], from, to);
    this.mergeOrderPurchases(counts, orderPurchases);

    const pct = (num: number, den: number) => (den > 0 ? Number(((num / den) * 100).toFixed(2)) : 0);

    const stages = CANONICAL_FUNNEL_STAGES.map((stage, idx) => {
      const sessions = counts[stage];
      const top = counts[CANONICAL_FUNNEL_STAGES[0]];
      const prev = idx === 0 ? sessions : counts[CANONICAL_FUNNEL_STAGES[idx - 1]];
      return {
        stage,
        sessions,
        // % of all sessions (top of funnel) that reached this stage.
        conversion_from_top: pct(sessions, top),
        // % retained from the immediately previous stage.
        conversion_from_prev: pct(sessions, prev),
      };
    });

    const enteredCheckout = counts.checkout;
    const completed = counts.purchase;

    return {
      window: { from: from.toISOString(), to: to.toISOString() },
      stages,
      // Stage drop-off / conversion rates (Part 5).
      rates: {
        product_view_rate: pct(counts.product_view, counts.visit),
        add_to_cart_rate: pct(counts.add_to_cart, counts.product_view),
        checkout_rate: pct(counts.checkout, counts.add_to_cart),
        purchase_rate: pct(counts.purchase, counts.checkout),
        overall_conversion: pct(counts.purchase, counts.visit),
      },
      checkout: {
        entered_checkout: enteredCheckout,
        completed_checkout: completed,
        // Sessions that entered checkout but never completed it.
        abandoned: Math.max(0, enteredCheckout - completed),
        // Sessions that added to cart but never purchased.
        cart_abandoned: Math.max(0, counts.add_to_cart - completed),
        abandonment_rate: pct(enteredCheckout - completed, enteredCheckout),
        cart_abandonment_rate: pct(counts.add_to_cart - completed, counts.add_to_cart),
      },
    };
  }

  /**
   * Session-derived KPIs unlocked by the funnel aggregate (Part 6): conversion &
   * drop-off rates, engagement (pages/session, repeat visitors, new vs returning),
   * abandonment, top entry pages and platform-wise conversion. All scoped by
   * tenant_id + connector_instance_id over the window.
   */
  static async sessionKpis(input: {
    tenantId: string;
    connectorInstanceId: string;
    from?: Date | null;
    to?: Date | null;
  }) {
    const to = input.to ?? new Date();
    const from = input.from ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const { tenantId, connectorInstanceId } = input;

    const pct = (num: number, den: number) => (den > 0 ? Number(((num / den) * 100).toFixed(2)) : 0);

    const [aggRows, repeatRows, newReturningRows, platformRows, entryRows] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          total_sessions: bigint;
          unique_visitors: bigint;
          avg_pages_per_session: number | null;
          product_view_sessions: bigint;
          add_to_cart_sessions: bigint;
          checkout_sessions: bigint;
          purchase_sessions: bigint;
          cart_abandoned: bigint;
          checkout_abandoned: bigint;
        }>
      >`
        SELECT
          COUNT(*)::bigint                                                        AS total_sessions,
          COUNT(DISTINCT visitor_id)::bigint                                      AS unique_visitors,
          AVG(page_view_count)::float8                                            AS avg_pages_per_session,
          COUNT(*) FILTER (WHERE product_viewed)::bigint                          AS product_view_sessions,
          COUNT(*) FILTER (WHERE add_to_cart)::bigint                             AS add_to_cart_sessions,
          COUNT(*) FILTER (WHERE checkout_started OR purchase_completed)::bigint   AS checkout_sessions,
          COUNT(*) FILTER (WHERE purchase_completed)::bigint                      AS purchase_sessions,
          COUNT(*) FILTER (WHERE add_to_cart AND NOT purchase_completed)::bigint  AS cart_abandoned,
          COUNT(*) FILTER (WHERE checkout_started AND NOT purchase_completed)::bigint AS checkout_abandoned
        FROM storefront_sessions
        WHERE tenant_id = ${tenantId}
          AND connector_instance_id = ${connectorInstanceId}
          AND started_at >= ${from} AND started_at <= ${to}
      `,
      prisma.$queryRaw<Array<{ repeat_visitors: bigint; visitors: bigint }>>`
        SELECT
          COUNT(*) FILTER (WHERE c > 1)::bigint AS repeat_visitors,
          COUNT(*)::bigint                      AS visitors
        FROM (
          SELECT visitor_id, COUNT(*) AS c
          FROM storefront_sessions
          WHERE tenant_id = ${tenantId}
            AND connector_instance_id = ${connectorInstanceId}
            AND started_at >= ${from} AND started_at <= ${to}
          GROUP BY visitor_id
        ) v
      `,
      // A session is "returning" when this visitor had an earlier session (any
      // time) on the same connector; otherwise it is "new".
      prisma.$queryRaw<Array<{ new_sessions: bigint; returning_sessions: bigint }>>`
        SELECT
          COUNT(*) FILTER (WHERE is_first)::bigint     AS new_sessions,
          COUNT(*) FILTER (WHERE NOT is_first)::bigint AS returning_sessions
        FROM (
          SELECT NOT EXISTS (
            SELECT 1 FROM storefront_sessions p
            WHERE p.connector_instance_id = s.connector_instance_id
              AND p.visitor_id = s.visitor_id
              AND p.started_at < s.started_at
          ) AS is_first
          FROM storefront_sessions s
          WHERE s.tenant_id = ${tenantId}
            AND s.connector_instance_id = ${connectorInstanceId}
            AND s.started_at >= ${from} AND s.started_at <= ${to}
        ) t
      `,
      prisma.$queryRaw<Array<{ platform: string | null; sessions: bigint; purchases: bigint }>>`
        SELECT
          platform,
          COUNT(*)::bigint                                  AS sessions,
          COUNT(*) FILTER (WHERE purchase_completed)::bigint AS purchases
        FROM storefront_sessions
        WHERE tenant_id = ${tenantId}
          AND connector_instance_id = ${connectorInstanceId}
          AND started_at >= ${from} AND started_at <= ${to}
        GROUP BY platform
      `,
      prisma.$queryRaw<Array<{ entry_page: string | null; sessions: bigint }>>`
        SELECT
          (page_urls_visited->>0) AS entry_page,
          COUNT(*)::bigint        AS sessions
        FROM storefront_sessions
        WHERE tenant_id = ${tenantId}
          AND connector_instance_id = ${connectorInstanceId}
          AND started_at >= ${from} AND started_at <= ${to}
          AND jsonb_array_length(page_urls_visited) > 0
        GROUP BY (page_urls_visited->>0)
        ORDER BY sessions DESC
        LIMIT 10
      `,
    ]);

    const a = aggRows[0];
    const totalSessions = Number(a?.total_sessions ?? 0);
    const uniqueVisitors = Number(a?.unique_visitors ?? 0);
    const productViewSessions = Number(a?.product_view_sessions ?? 0);
    const addToCartSessions = Number(a?.add_to_cart_sessions ?? 0);
    const checkoutSessions = Number(a?.checkout_sessions ?? 0);
    const purchaseSessions = Number(a?.purchase_sessions ?? 0);

    const repeatVisitors = Number(repeatRows[0]?.repeat_visitors ?? 0);
    const visitorsCount = Number(repeatRows[0]?.visitors ?? 0);

    return {
      window: { from: from.toISOString(), to: to.toISOString() },
      sessions: {
        total: totalSessions,
        unique_visitors: uniqueVisitors,
        avg_pages_per_session: Number((a?.avg_pages_per_session ?? 0).toFixed(2)),
        sessions_per_visitor: uniqueVisitors > 0 ? Number((totalSessions / uniqueVisitors).toFixed(2)) : 0,
      },
      conversion: {
        funnel_conversion_rate: pct(purchaseSessions, totalSessions),
        product_view_to_cart_rate: pct(addToCartSessions, productViewSessions),
        cart_to_checkout_rate: pct(checkoutSessions, addToCartSessions),
        checkout_to_purchase_rate: pct(purchaseSessions, checkoutSessions),
      },
      abandonment: {
        cart_abandonment_rate: pct(Number(a?.cart_abandoned ?? 0), addToCartSessions),
        checkout_abandonment_rate: pct(Number(a?.checkout_abandoned ?? 0), checkoutSessions),
        cart_abandoned: Number(a?.cart_abandoned ?? 0),
        checkout_abandoned: Number(a?.checkout_abandoned ?? 0),
      },
      visitors: {
        repeat_visitor_rate: pct(repeatVisitors, visitorsCount),
        repeat_visitors: repeatVisitors,
        new_sessions: Number(newReturningRows[0]?.new_sessions ?? 0),
        returning_sessions: Number(newReturningRows[0]?.returning_sessions ?? 0),
      },
      by_platform: platformRows.map((p) => {
        const sessions = Number(p.sessions);
        const purchases = Number(p.purchases);
        return {
          platform: p.platform ?? 'unknown',
          sessions,
          purchases,
          conversion_rate: pct(purchases, sessions),
        };
      }),
      top_entry_pages: entryRows
        .filter((e) => e.entry_page)
        .map((e) => ({ page: e.entry_page as string, sessions: Number(e.sessions) })),
    };
  }

  /**
   * Project-scoped Purchase Journey Funnel + Session Intelligence, computed from
   * storefront_sessions across ALL connector instances belonging to a project.
   * Powers the journey-intel page (which is scoped by project/site, not by a
   * single connector). Returns the 5-stage funnel in the {stage,count,percent}
   * shape the page already renders, plus the Session Intelligence KPIs.
   *
   * `percent` is conversion-from-top (share of all visits reaching the stage);
   * the page derives drop-off as 100 - percent.
   */
  static async journeyIntel(input: {
    connectorInstanceIds: string[];
    from?: Date | null;
    to?: Date | null;
  }) {
    const ids = (input.connectorInstanceIds || []).filter(Boolean);
    const empty = {
      funnel: CANONICAL_FUNNEL_STAGES.map((stage, idx) => ({
        stage: FUNNEL_STAGE_LABELS[stage],
        canonical_stage: stage,
        count: 0,
        percent: idx === 0 ? 100 : 0,
      })),
      sessionIntelligence: {
        avg_pages_per_session: 0,
        sessions_per_visitor: 0,
        cart_abandonment_rate: 0,
        checkout_abandonment_rate: 0,
        new_visitors: 0,
        returning_visitors: 0,
        platform_breakdown: [] as Array<{ platform: string; sessions: number }>,
        rates: {
          product_view_rate: 0,
          add_to_cart_rate: 0,
          checkout_rate: 0,
          purchase_rate: 0,
          overall_conversion: 0,
        },
      },
    };
    if (ids.length === 0) return empty;

    const to = input.to ?? new Date();
    const from = input.from ?? new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);

    const pct = (num: number, den: number) => (den > 0 ? Number(((num / den) * 100).toFixed(2)) : 0);

    const [funnelRows, agg, nvr, platformRows, orderPurchases] = await Promise.all([
      prisma.$queryRawUnsafe<
        Array<{
          visit_count: bigint;
          product_view_count: bigint;
          add_to_cart_count: bigint;
          checkout_count: bigint;
          purchase_count: bigint;
        }>
      >(
        `SELECT
           COUNT(*)::bigint                                   AS visit_count,
           COUNT(*) FILTER (WHERE product_viewed)::bigint     AS product_view_count,
           COUNT(*) FILTER (WHERE add_to_cart)::bigint        AS add_to_cart_count,
           COUNT(*) FILTER (WHERE checkout_started OR purchase_completed)::bigint AS checkout_count,
           COUNT(*) FILTER (WHERE purchase_completed)::bigint AS purchase_count
         FROM storefront_sessions
         WHERE connector_instance_id = ANY($1::text[])
           AND started_at >= $2 AND started_at <= $3`,
        ids,
        from,
        to,
      ),
      prisma.$queryRawUnsafe<
        Array<{
          total_sessions: bigint;
          unique_visitors: bigint;
          avg_pages: number | null;
          cart_reached: bigint;
          cart_abandoned: bigint;
          checkout_reached: bigint;
          checkout_abandoned: bigint;
        }>
      >(
        `SELECT
           COUNT(*)::bigint                                                           AS total_sessions,
           COUNT(DISTINCT visitor_id)::bigint                                         AS unique_visitors,
           AVG(page_view_count)::float8                                               AS avg_pages,
           COUNT(*) FILTER (WHERE add_to_cart)::bigint                                AS cart_reached,
           COUNT(*) FILTER (WHERE add_to_cart AND NOT purchase_completed)::bigint     AS cart_abandoned,
           COUNT(*) FILTER (WHERE checkout_started OR purchase_completed)::bigint      AS checkout_reached,
           COUNT(*) FILTER (WHERE checkout_started AND NOT purchase_completed)::bigint AS checkout_abandoned
         FROM storefront_sessions
         WHERE connector_instance_id = ANY($1::text[])
           AND started_at >= $2 AND started_at <= $3`,
        ids,
        from,
        to,
      ),
      // New vs returning, defined by session count within the window so it stays
      // consistent with repeat_visitor_rate (journeyInsights): a "returning"
      // visitor is one with more than one session (i.e. they came back) and a
      // "new" visitor has exactly one. This makes the three metrics agree —
      // returning_visitors == repeat visitors, and repeat_visitor_rate ==
      // returning_visitors / total_visitors — instead of the previous
      // first-seen-before-window definition, which could report 0 returning
      // visitors while repeat rate was 100% for the same multi-session visitor.
      prisma.$queryRawUnsafe<Array<{ new_visitors: bigint; returning_visitors: bigint }>>(
        `WITH per_visitor AS (
           SELECT visitor_id, COUNT(*) AS session_count
           FROM storefront_sessions
           WHERE connector_instance_id = ANY($1::text[])
             AND started_at >= $2 AND started_at <= $3
           GROUP BY visitor_id
         )
         SELECT
           COUNT(*) FILTER (WHERE session_count = 1)::bigint AS new_visitors,
           COUNT(*) FILTER (WHERE session_count > 1)::bigint AS returning_visitors
         FROM per_visitor`,
        ids,
        from,
        to,
      ),
      prisma.$queryRawUnsafe<Array<{ platform: string | null; sessions: bigint }>>(
        `SELECT platform, COUNT(*)::bigint AS sessions
         FROM storefront_sessions
         WHERE connector_instance_id = ANY($1::text[])
           AND started_at >= $2 AND started_at <= $3
         GROUP BY platform
         ORDER BY sessions DESC`,
        ids,
        from,
        to,
      ),
      this.orderPurchaseCount(ids, from, to),
    ]);

    const f = funnelRows[0];
    const counts: Record<CanonicalFunnelStage, number> = {
      visit: Number(f?.visit_count ?? 0),
      product_view: Number(f?.product_view_count ?? 0),
      add_to_cart: Number(f?.add_to_cart_count ?? 0),
      checkout: Number(f?.checkout_count ?? 0),
      purchase: Number(f?.purchase_count ?? 0),
    };
    // Merge authoritative synced-order purchases so off-domain checkouts
    // (Shopify/BigCommerce) still surface checkout + purchase in the funnel.
    this.mergeOrderPurchases(counts, orderPurchases);
    const visit = counts.visit;

    const funnel = CANONICAL_FUNNEL_STAGES.map((stage) => ({
      stage: FUNNEL_STAGE_LABELS[stage],
      canonical_stage: stage,
      count: counts[stage],
      percent: pct(counts[stage], visit) || (stage === 'visit' && visit > 0 ? 100 : 0),
    }));

    const a = agg[0];
    const totalSessions = Number(a?.total_sessions ?? 0);
    const uniqueVisitors = Number(a?.unique_visitors ?? 0);

    return {
      funnel,
      sessionIntelligence: {
        avg_pages_per_session: Number((a?.avg_pages ?? 0).toFixed(2)),
        sessions_per_visitor: uniqueVisitors > 0 ? Number((totalSessions / uniqueVisitors).toFixed(2)) : 0,
        cart_abandonment_rate: pct(Number(a?.cart_abandoned ?? 0), Number(a?.cart_reached ?? 0)),
        checkout_abandonment_rate: pct(Number(a?.checkout_abandoned ?? 0), Number(a?.checkout_reached ?? 0)),
        new_visitors: Number(nvr[0]?.new_visitors ?? 0),
        returning_visitors: Number(nvr[0]?.returning_visitors ?? 0),
        platform_breakdown: platformRows.map((p) => ({
          platform: p.platform ?? 'unknown',
          sessions: Number(p.sessions),
        })),
        rates: {
          product_view_rate: pct(counts.product_view, counts.visit),
          add_to_cart_rate: pct(counts.add_to_cart, counts.product_view),
          checkout_rate: pct(counts.checkout, counts.add_to_cart),
          purchase_rate: pct(counts.purchase, counts.checkout),
          overall_conversion: pct(counts.purchase, counts.visit),
        },
      },
    };
  }

  /**
   * Deeper engagement + content insights derived from storefront_sessions and
   * storefront_events for a project's connectors. Everything here is honestly
   * computable from the tracker data (no RUM/performance signals are invented):
   * engagement (bounce, session duration, repeat rate), acquisition (top entry
   * pages, referrers), exits, device/platform split, and content (top viewed
   * products, checkout-step distribution).
   */
  static async journeyInsights(input: {
    connectorInstanceIds: string[];
    from?: Date | null;
    to?: Date | null;
  }) {
    const ids = (input.connectorInstanceIds || []).filter(Boolean);
    const blank = {
      bounce_rate: 0,
      avg_session_duration_seconds: 0,
      repeat_visitor_rate: 0,
      device_breakdown: [] as Array<{ device: string; sessions: number }>,
      top_entry_pages: [] as Array<{ page: string; sessions: number }>,
      top_exit_pages: [] as Array<{ page: string; sessions: number }>,
      top_referrers: [] as Array<{ referrer: string; sessions: number }>,
      top_products: [] as Array<{ product: string; sessions: number }>,
      checkout_steps: [] as Array<{ step: string; sessions: number }>,
      product_engagement: [] as Array<{
        product_id: string;
        product_name: string;
        views: number;
        add_to_carts: number;
        cart_rate: number;
      }>,
      time_to_purchase: { avg_seconds: 0, median_seconds: 0 },
      friction_signals: [] as Array<{ step: string; abandon_count: number; pct: number }>,
    };
    if (ids.length === 0) return blank;

    const to = input.to ?? new Date();
    const from = input.from ?? new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
    const pct = (num: number, den: number) => (den > 0 ? Number(((num / den) * 100).toFixed(2)) : 0);

    // Session-scoped filter (reused), and event-scoped filter.
    const sessWhere = `connector_instance_id = ANY($1::text[]) AND started_at >= $2 AND started_at <= $3`;
    const evtWhere = `connector_instance_id = ANY($1::text[]) AND occurred_at >= $2 AND occurred_at <= $3`;

    const [engagement, repeat, device, entry, exit, referrer, products, steps, productEng, ttp, friction] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ total: bigint; bounced: bigint; avg_seconds: number | null }>>(
        `SELECT
           COUNT(*)::bigint                                                          AS total,
           COUNT(*) FILTER (WHERE page_view_count <= 1)::bigint                      AS bounced,
           AVG(EXTRACT(EPOCH FROM (last_active_at - started_at)))::float8            AS avg_seconds
         FROM storefront_sessions WHERE ${sessWhere}`,
        ids, from, to,
      ),
      prisma.$queryRawUnsafe<Array<{ repeat_visitors: bigint; visitors: bigint }>>(
        `SELECT COUNT(*) FILTER (WHERE c > 1)::bigint AS repeat_visitors, COUNT(*)::bigint AS visitors
         FROM (SELECT visitor_id, COUNT(*) c FROM storefront_sessions WHERE ${sessWhere} GROUP BY visitor_id) v`,
        ids, from, to,
      ),
      prisma.$queryRawUnsafe<Array<{ device: string | null; sessions: bigint }>>(
        `SELECT device_type AS device, COUNT(*)::bigint AS sessions
         FROM storefront_sessions WHERE ${sessWhere} GROUP BY device_type ORDER BY sessions DESC`,
        ids, from, to,
      ),
      prisma.$queryRawUnsafe<Array<{ page: string | null; sessions: bigint }>>(
        `SELECT COALESCE(landing_page, page_urls_visited->>0) AS page, COUNT(*)::bigint AS sessions
         FROM storefront_sessions WHERE ${sessWhere} AND COALESCE(landing_page, page_urls_visited->>0) IS NOT NULL
         GROUP BY COALESCE(landing_page, page_urls_visited->>0) ORDER BY sessions DESC LIMIT 8`,
        ids, from, to,
      ),
      prisma.$queryRawUnsafe<Array<{ page: string | null; sessions: bigint }>>(
        `SELECT last_page_url AS page, COUNT(*)::bigint AS sessions
         FROM storefront_sessions WHERE ${sessWhere} AND last_page_url IS NOT NULL
         GROUP BY last_page_url ORDER BY sessions DESC LIMIT 8`,
        ids, from, to,
      ),
      prisma.$queryRawUnsafe<Array<{ referrer: string | null; sessions: bigint }>>(
        `SELECT COALESCE(NULLIF(referrer, ''), 'Direct / None') AS referrer, COUNT(*)::bigint AS sessions
         FROM storefront_sessions WHERE ${sessWhere}
         GROUP BY COALESCE(NULLIF(referrer, ''), 'Direct / None') ORDER BY sessions DESC LIMIT 8`,
        ids, from, to,
      ),
      prisma.$queryRawUnsafe<Array<{ product: string | null; sessions: bigint }>>(
        `SELECT COALESCE(NULLIF(properties->>'product_name',''), NULLIF(properties->>'product_id',''), '(unknown)') AS product,
                COUNT(DISTINCT session_id)::bigint AS sessions
         FROM storefront_events
         WHERE ${evtWhere} AND canonical_stage = 'product_view'
         GROUP BY 1 ORDER BY sessions DESC LIMIT 8`,
        ids, from, to,
      ),
      prisma.$queryRawUnsafe<Array<{ step: string | null; sessions: bigint }>>(
        `SELECT COALESCE(NULLIF(properties->>'step',''), '(unspecified)') AS step,
                COUNT(DISTINCT session_id)::bigint AS sessions
         FROM storefront_events
         WHERE ${evtWhere} AND event_type = 'checkout_step'
         GROUP BY 1 ORDER BY sessions DESC LIMIT 10`,
        ids, from, to,
      ),
      // Product engagement: views vs add-to-carts per product (cart-rate computed
      // in JS). Grouped by product_id, with product_name carried for display.
      prisma.$queryRawUnsafe<Array<{ product_id: string | null; product_name: string | null; views: bigint; add_to_carts: bigint }>>(
        `SELECT
           COALESCE(NULLIF(properties->>'product_id',''), NULLIF(properties->>'product_name','')) AS product_id,
           MAX(NULLIF(properties->>'product_name',''))                                            AS product_name,
           COUNT(*) FILTER (WHERE canonical_stage = 'product_view')::bigint                       AS views,
           COUNT(*) FILTER (WHERE canonical_stage = 'add_to_cart')::bigint                        AS add_to_carts
         FROM storefront_events
         WHERE ${evtWhere}
           AND canonical_stage IN ('product_view', 'add_to_cart')
           AND COALESCE(NULLIF(properties->>'product_id',''), NULLIF(properties->>'product_name','')) IS NOT NULL
         GROUP BY 1
         ORDER BY views DESC, add_to_carts DESC
         LIMIT 20`,
        ids, from, to,
      ),
      // Time to purchase: seconds from session start to the first purchase event,
      // over sessions that actually converted. avg + median (NULL when none).
      prisma.$queryRawUnsafe<Array<{ avg_seconds: number | null; median_seconds: number | null }>>(
        `SELECT
           AVG(secs)::float8                                          AS avg_seconds,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY secs)::float8  AS median_seconds
         FROM (
           SELECT EXTRACT(EPOCH FROM (MIN(e.occurred_at) - s.started_at)) AS secs
           FROM storefront_sessions s
           JOIN storefront_events e
             ON e.connector_instance_id = s.connector_instance_id
            AND e.session_id = s.session_id
            AND e.canonical_stage = 'purchase'
           WHERE s.connector_instance_id = ANY($1::text[])
             AND s.started_at >= $2 AND s.started_at <= $3
             AND s.purchase_completed = true
           GROUP BY s.session_id, s.started_at
         ) t
         WHERE secs >= 0`,
        ids, from, to,
      ),
      // Friction signals: checkout abandonment by step (pct computed in JS).
      prisma.$queryRawUnsafe<Array<{ step: string | null; abandon_count: bigint }>>(
        `SELECT COALESCE(NULLIF(properties->>'step',''), '(unspecified)') AS step,
                COUNT(*)::bigint AS abandon_count
         FROM storefront_events
         WHERE ${evtWhere} AND event_type = 'checkout_abandon'
         GROUP BY 1 ORDER BY abandon_count DESC LIMIT 10`,
        ids, from, to,
      ),
    ]);

    const eng = engagement[0];
    const total = Number(eng?.total ?? 0);
    const ttpRow = ttp[0];
    const totalAbandons = friction.reduce((sum, f) => sum + Number(f.abandon_count), 0);

    return {
      bounce_rate: pct(Number(eng?.bounced ?? 0), total),
      avg_session_duration_seconds: Math.round(eng?.avg_seconds ?? 0),
      repeat_visitor_rate: pct(Number(repeat[0]?.repeat_visitors ?? 0), Number(repeat[0]?.visitors ?? 0)),
      device_breakdown: device.map((d) => ({ device: d.device ?? 'unknown', sessions: Number(d.sessions) })),
      top_entry_pages: entry.map((e) => ({ page: e.page as string, sessions: Number(e.sessions) })),
      top_exit_pages: exit.map((e) => ({ page: e.page as string, sessions: Number(e.sessions) })),
      top_referrers: referrer.map((r) => ({ referrer: r.referrer as string, sessions: Number(r.sessions) })),
      top_products: products.map((p) => ({ product: p.product as string, sessions: Number(p.sessions) })),
      checkout_steps: steps.map((s) => ({ step: s.step as string, sessions: Number(s.sessions) })),
      product_engagement: productEng.map((p) => {
        const views = Number(p.views);
        const carts = Number(p.add_to_carts);
        return {
          product_id: (p.product_id as string) ?? '',
          product_name: (p.product_name as string) || (p.product_id as string) || '(unknown)',
          views,
          add_to_carts: carts,
          cart_rate: views > 0 ? Number(((carts / views) * 100).toFixed(1)) : 0,
        };
      }),
      time_to_purchase: {
        avg_seconds: Math.round(Number(ttpRow?.avg_seconds ?? 0)),
        median_seconds: Math.round(Number(ttpRow?.median_seconds ?? 0)),
      },
      friction_signals: friction.map((f) => ({
        step: f.step as string,
        abandon_count: Number(f.abandon_count),
        pct: totalAbandons > 0 ? Number(((Number(f.abandon_count) / totalAbandons) * 100).toFixed(1)) : 0,
      })),
    };
  }
}