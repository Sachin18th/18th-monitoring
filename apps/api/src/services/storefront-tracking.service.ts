import { prisma, encryptEmail, hashEmail, scrubEmails } from '@kpi-platform/db';
import { getDataPlaneClient } from '../lib/tenant-prisma';
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

const isUnavailableLiveTrackingStore = (err: any) => {
  const code = String(err?.code || '');
  const message = String(err?.message || err?.meta?.message || '').toLowerCase();
  return (
    code === 'P2021' ||
    code === 'P2022' ||
    code === '42P01' ||
    code === '42703' ||
    message.includes('storefront_sessions') ||
    message.includes('last_active_at') ||
    message.includes('has no active store database')
  );
};

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
  // Resolved shopper identity (latest non-null values seen across the session's
  // events). Email is the AES envelope + hash only — never plaintext.
  customerId: string | null;
  customerName: string | null;
  emailEncrypted: string | null;
  emailHash: string | null;
};

/**
 * The client-side identity cache each platform resolves from (sessionStorage):
 * Shopify __plat_shid / Adobe __plat_mid / BigCommerce __plat_bid. Persisted as
 * storefront_sessions.identity_meta.source so the origin is always traceable.
 */
function identityCacheKey(platform: string | null): string | null {
  switch (platform) {
    case 'shopify': return 'shid';
    case 'adobe_commerce': return 'mid';
    case 'bigcommerce': return 'bid';
    default: return null;
  }
}

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

      // DATABASE-PER-INTEGRATION: every storefront_sessions / storefront_events
      // statement below must land in this connector's physical store DB. Fails
      // closed (caught by the outer try) if the store DB is not active.
      const db = await getDataPlaneClient(connectorInstanceId);

      // 5) Collapse the batch into one aggregate per session, then upsert. Plain
      //    page_views never get their own event row — they only advance the
      //    session aggregate (storage-bloat fix).
      const sessions = new Map<string, NormalizedEvent[]>();
      for (const ev of normalized) {
        const list = sessions.get(ev.sessionId);
        if (list) list.push(ev);
        else sessions.set(ev.sessionId, [ev]);
      }

      // Identity resolved this batch, keyed by visitor — used to backfill the
      // visitor's OTHER sessions after the upserts (see below).
      const identityByVisitor = new Map<
        string,
        { customerId: string | null; customerName: string | null; emailEncrypted: string | null; emailHash: string | null }
      >();
      for (const [sessionId, sessionEvents] of sessions) {
        const aggregate = this.aggregateSession(sessionEvents);
        await this.upsertSession({
          db,
          connectorInstanceId,
          tenantId,
          sessionId,
          userAgent: input.userAgent ?? null,
          deviceType,
          platform: platform === 'unknown' ? null : platform,
          aggregate,
        });
        if (aggregate.customerId || aggregate.customerName || aggregate.emailEncrypted) {
          identityByVisitor.set(aggregate.visitorId, {
            customerId: aggregate.customerId,
            customerName: aggregate.customerName,
            emailEncrypted: aggregate.emailEncrypted,
            emailHash: aggregate.emailHash,
          });
        }
      }

      // visitor_id persists in localStorage across sessions, so a shopper we just
      // identified in one session is the same person in their earlier/other
      // sessions. Stamp their identity onto any of this visitor's sessions that
      // never captured one (e.g. the identity beacon was dropped while ngrok was
      // down) — filling nulls only, so an existing identity is never overwritten.
      for (const [visitorId, ident] of identityByVisitor) {
        await this.backfillVisitorIdentity(
          db,
          connectorInstanceId,
          visitorId,
          platform === 'unknown' ? null : platform,
          ident,
        );
      }

      // 6) Insert event rows per the dedup rule (dedicated milestone events,
      //    navigation page_views, clicks, custom). A page_view on a milestone
      //    page is skipped — only the session aggregate reflects it.
      const insertable = normalized.filter((ev) => ev.shouldInsert);
      if (insertable.length > 0) {
        await this.insertEvents(db, connectorInstanceId, tenantId, insertable);
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
    // Latest non-null identity seen this batch (events are ascending, so the last
    // assignment wins). normalizeEvent already turned any plaintext email into
    // email_encrypted/email_hash, so we only ever see the envelope here.
    let customerId: string | null = null;
    let customerName: string | null = null;
    let emailEncrypted: string | null = null;
    let emailHash: string | null = null;

    for (const ev of ordered) {
      if (ev.pageUrl && !pageUrls.includes(ev.pageUrl)) pageUrls.push(ev.pageUrl);

      const p = ev.properties as Record<string, unknown>;
      if (p) {
        if (p.customer_id != null && p.customer_id !== '' && p.customer_id !== '0') {
          customerId = String(p.customer_id).slice(0, 100);
        }
        if (typeof p.customer_name === 'string' && p.customer_name.trim()) {
          customerName = p.customer_name.trim().slice(0, 200);
        }
        if (typeof p.email_encrypted === 'string' && p.email_encrypted) {
          emailEncrypted = p.email_encrypted;
        }
        if (typeof p.email_hash === 'string' && p.email_hash) {
          emailHash = p.email_hash;
        }
      }

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
      customerId,
      customerName,
      emailEncrypted,
      emailHash,
    };
  }

  private static async upsertSession(s: {
    /** Data-plane client for this connector's store DB. */
    db: any;
    connectorInstanceId: string;
    tenantId: string;
    sessionId: string;
    userAgent: string | null;
    deviceType: string | null;
    platform: string | null;
    aggregate: SessionAggregate;
  }): Promise<void> {
    const a = s.aggregate;
    const hasIdentity = Boolean(a.customerId || a.customerName || a.emailEncrypted);
    const identitySource = hasIdentity ? s.platform : null;
    const identityMeta = hasIdentity
      ? JSON.stringify({
          customer_id: a.customerId,
          customer_name: a.customerName,
          source: identityCacheKey(s.platform),
        })
      : null;
    // First-sight columns (started_at / landing_page / referrer / device_type /
    // platform) are preserved on conflict; last_active_at only ever advances.
    // The funnel aggregate merges across batches:
    //   - page_view_count accumulates,
    //   - page_urls_visited / product_ids_viewed are order-preserving, deduped,
    //     capped at 50,
    //   - boolean flags are monotonic (OR — never revert to false),
    //   - funnel_stage holds the highest rank reached (compared in SQL),
    //   - funnel_stages_reached is the deduped union of all stages seen.
    await s.db.$executeRawUnsafe(
      `INSERT INTO storefront_sessions
         (connector_instance_id, tenant_id, session_id, visitor_id, last_active_at,
          user_agent, referrer, landing_page, device_type,
          page_view_count, page_urls_visited, funnel_stage, funnel_stages_reached,
          product_viewed, product_ids_viewed, add_to_cart, checkout_started, purchase_completed,
          last_page_url, last_page_title, platform,
          customer_id, customer_name, customer_email_encrypted, customer_email_hash,
          identity_source, identity_meta)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7, $8, $9,
               $10::int, $11::jsonb, $12, $13::jsonb,
               $14::bool, $15::jsonb, $16::bool, $17::bool, $18::bool,
               $19, $20, $21,
               $22, $23, $24, $25,
               $26, $27::jsonb)
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
         last_page_title = COALESCE(EXCLUDED.last_page_title, storefront_sessions.last_page_title),
         -- Identity: adopt a freshly-captured value, else keep what we already had
         -- (a later batch with no identity must never wipe a resolved shopper).
         customer_id              = COALESCE(EXCLUDED.customer_id, storefront_sessions.customer_id),
         customer_name            = COALESCE(EXCLUDED.customer_name, storefront_sessions.customer_name),
         customer_email_encrypted = COALESCE(EXCLUDED.customer_email_encrypted, storefront_sessions.customer_email_encrypted),
         customer_email_hash      = COALESCE(EXCLUDED.customer_email_hash, storefront_sessions.customer_email_hash),
         identity_source          = COALESCE(EXCLUDED.identity_source, storefront_sessions.identity_source),
         identity_meta            = COALESCE(EXCLUDED.identity_meta, storefront_sessions.identity_meta)`,
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
      a.customerId,
      a.customerName,
      a.emailEncrypted,
      a.emailHash,
      identitySource,
      identityMeta,
    );
  }

  /**
   * Propagate a resolved identity to every other session of the same visitor
   * that has none yet. COALESCE fills nulls only, so a session that already knows
   * its shopper is left untouched. Bounded by idx_storefront_session_visitor.
   */
  private static async backfillVisitorIdentity(
    db: any,
    connectorInstanceId: string,
    visitorId: string,
    platform: string | null,
    ident: { customerId: string | null; customerName: string | null; emailEncrypted: string | null; emailHash: string | null },
  ): Promise<void> {
    const identityMeta = JSON.stringify({
      customer_id: ident.customerId,
      customer_name: ident.customerName,
      source: identityCacheKey(platform),
    });
    try {
      await db.$executeRawUnsafe(
        `UPDATE storefront_sessions SET
           customer_id              = COALESCE(customer_id, $3),
           customer_name            = COALESCE(customer_name, $4),
           customer_email_encrypted = COALESCE(customer_email_encrypted, $5),
           customer_email_hash      = COALESCE(customer_email_hash, $6),
           identity_source          = COALESCE(identity_source, $7),
           identity_meta            = COALESCE(identity_meta, $8::jsonb)
         WHERE connector_instance_id = $1
           AND visitor_id = $2
           AND customer_id IS NULL
           AND customer_name IS NULL
           AND customer_email_encrypted IS NULL`,
        connectorInstanceId,
        visitorId,
        ident.customerId,
        ident.customerName,
        ident.emailEncrypted,
        ident.emailHash,
        platform,
        identityMeta,
      );
    } catch (err) {
      // Backfill is best-effort — a failure here must never fail ingest.
      console.error('[TRACK] visitor identity backfill failed', { visitorId }, err);
    }
  }

  private static async insertEvents(
    db: any,
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
      await db.$executeRawUnsafe(sql, ...params);
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
          await db.$executeRawUnsafe(
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

  // NOTE: The Purchase Journey Funnel is intentionally 100% session/event-derived
  // — each stage is the real count of storefront_sessions whose tracked events
  // reached it. Synced canonical_orders are deliberately NOT merged into the
  // funnel: order volume routinely exceeds tracked sessions (partial tracking +
  // off-domain Shopify/BigCommerce checkout), so clamping the stages up to the
  // order count flattened the whole funnel to a fake 100% conversion / 0%
  // drop-off and even made the visit stage read the raw order count. Authoritative
  // purchase/revenue figures live on the Orders page. A proper per-session order
  // attribution model can reintroduce an order signal later (see git history for
  // the previous orderPurchaseCount/mergeOrderPurchases helpers).

  /**
   * DATABASE-PER-INTEGRATION: group connector ids by the physical store-DB
   * client that owns their storefront rows. With the data plane disabled every
   * id maps to the shared control client (one group — pre-cutover behavior).
   * Connectors whose store DB is unavailable are skipped so a single
   * mid-provisioning integration can't fail a whole project's read aggregates.
   */
  private static async groupByDataPlaneClient(ids: string[]): Promise<Array<{ db: any; ids: string[] }>> {
    const groups: Array<{ db: any; ids: string[] }> = [];
    for (const id of ids) {
      let db: any;
      try {
        db = await getDataPlaneClient(id);
      } catch (err) {
        console.warn('[TRACK] skipping connector without active store DB', { connectorInstanceId: id });
        continue;
      }
      const existing = groups.find((g) => g.db === db);
      if (existing) existing.ids.push(id);
      else groups.push({ db, ids: [id] });
    }
    return groups;
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
    const db = await getDataPlaneClient(input.connectorInstanceId);

    const rows = await db.$queryRaw<any[]>`
      SELECT id, session_id, visitor_id, started_at, last_active_at, user_agent,
             referrer, landing_page, device_type, metadata
      FROM storefront_sessions
      WHERE tenant_id = ${input.tenantId}
        AND connector_instance_id = ${input.connectorInstanceId}
        AND started_at >= ${from} AND started_at <= ${to}
      ORDER BY last_active_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const totalRows = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM storefront_sessions
      WHERE tenant_id = ${input.tenantId}
        AND connector_instance_id = ${input.connectorInstanceId}
        AND started_at >= ${from} AND started_at <= ${to}
    `;

    return {
      sessions: rows.map((r: any) => ({
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
    const empty = {
      liveUsers: 0,
      liveSessions: 0,
      windowMinutes,
      asOf: new Date().toISOString(),
    };

    try {
      const db = await getDataPlaneClient(input.connectorInstanceId);
      const rows = await db.$queryRaw<Array<{ live_visitors: bigint; live_sessions: bigint }>>`
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
    } catch (err) {
      if (!isUnavailableLiveTrackingStore(err)) throw err;
      return empty;
    }
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
    const db = await getDataPlaneClient(input.connectorInstanceId);

    const rows = await db.$queryRaw<any[]>`
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
    const totalRows = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM storefront_events
      WHERE tenant_id = ${input.tenantId}
        AND connector_instance_id = ${input.connectorInstanceId}
        AND occurred_at >= ${from} AND occurred_at <= ${to}
        AND (${sessionId}::text IS NULL OR session_id = ${sessionId})
        AND (${eventType}::text IS NULL OR event_type = ${eventType})
    `;

    return {
      events: rows.map((r: any) => ({
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
    const db = await getDataPlaneClient(input.connectorInstanceId);

    const rows = await db.$queryRaw<
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

    // Funnel is purely session/event-derived: each stage reports the real number
    // of sessions whose tracked events reached that stage. Synced orders are NOT
    // merged in here — order volume routinely exceeds tracked sessions (partial
    // tracking + off-domain checkout), and clamping the stages up to it flattened
    // the funnel to a fake 100% conversion. Authoritative purchase/revenue counts
    // live on the Orders page. (orderPurchaseCount/mergeOrderPurchases are kept
    // for a future orders-attribution model but are no longer applied.)

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
    const db = await getDataPlaneClient(connectorInstanceId);

    const pct = (num: number, den: number) => (den > 0 ? Number(((num / den) * 100).toFixed(2)) : 0);

    const [aggRows, repeatRows, newReturningRows, platformRows, entryRows] = await Promise.all([
      db.$queryRaw<
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
      db.$queryRaw<Array<{ repeat_visitors: bigint; visitors: bigint }>>`
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
      db.$queryRaw<Array<{ new_sessions: bigint; returning_sessions: bigint }>>`
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
      db.$queryRaw<Array<{ platform: string | null; sessions: bigint; purchases: bigint }>>`
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
      db.$queryRaw<Array<{ entry_page: string | null; sessions: bigint }>>`
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
      by_platform: platformRows.map((p: any) => {
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
        .filter((e: any) => e.entry_page)
        .map((e: any) => ({ page: e.entry_page as string, sessions: Number(e.sessions) })),
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

    // DATABASE-PER-INTEGRATION: a project's connectors may live in different
    // physical store DBs — run the aggregates once per store client (over that
    // client's connector ids) and merge. With the flag off this is a single
    // group on the shared client, i.e. the pre-cutover behavior.
    const groups = await this.groupByDataPlaneClient(ids);
    if (groups.length === 0) return empty;

    const queryGroup = async (db: any, groupIds: string[]) => {
      const [funnelRows, agg, nvr, platformRows] = await Promise.all([
        // rows: { visit_count, product_view_count, add_to_cart_count,
        //         checkout_count, purchase_count } (bigint)
        db.$queryRawUnsafe(
          `SELECT
             COUNT(*)::bigint                                   AS visit_count,
             COUNT(*) FILTER (WHERE product_viewed)::bigint     AS product_view_count,
             COUNT(*) FILTER (WHERE add_to_cart)::bigint        AS add_to_cart_count,
             COUNT(*) FILTER (WHERE checkout_started OR purchase_completed)::bigint AS checkout_count,
             COUNT(*) FILTER (WHERE purchase_completed)::bigint AS purchase_count
           FROM storefront_sessions
           WHERE connector_instance_id = ANY($1::text[])
             AND started_at >= $2 AND started_at <= $3`,
          groupIds,
          from,
          to,
        ),
        // rows: { total_sessions, unique_visitors, avg_pages, cart_reached,
        //         cart_abandoned, checkout_reached, checkout_abandoned }
        db.$queryRawUnsafe(
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
          groupIds,
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
        // rows: { new_visitors: bigint, returning_visitors: bigint }
        db.$queryRawUnsafe(
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
          groupIds,
          from,
          to,
        ),
        // rows: { platform: string | null, sessions: bigint }
        db.$queryRawUnsafe(
          `SELECT platform, COUNT(*)::bigint AS sessions
           FROM storefront_sessions
           WHERE connector_instance_id = ANY($1::text[])
             AND started_at >= $2 AND started_at <= $3
           GROUP BY platform
           ORDER BY sessions DESC`,
          groupIds,
          from,
          to,
        ),
      ]);
      return { funnelRows, agg, nvr, platformRows };
    };
    const perGroup = await Promise.all(groups.map((g) => queryGroup(g.db, g.ids)));

    // Merge the per-store aggregates. Counts sum; avg pages/session is the
    // session-weighted mean; unique/new/returning visitors sum (visitor_id is a
    // per-store localStorage id, so cross-store overlap is not meaningful).
    const counts: Record<CanonicalFunnelStage, number> = {
      visit: 0,
      product_view: 0,
      add_to_cart: 0,
      checkout: 0,
      purchase: 0,
    };
    let totalSessions = 0;
    let uniqueVisitors = 0;
    let pageViewsWeighted = 0;
    let cartReached = 0;
    let cartAbandoned = 0;
    let checkoutReached = 0;
    let checkoutAbandoned = 0;
    let newVisitors = 0;
    let returningVisitors = 0;
    const platformSessions = new Map<string, number>();

    for (const g of perGroup) {
      const f = g.funnelRows[0];
      counts.visit += Number(f?.visit_count ?? 0);
      counts.product_view += Number(f?.product_view_count ?? 0);
      counts.add_to_cart += Number(f?.add_to_cart_count ?? 0);
      counts.checkout += Number(f?.checkout_count ?? 0);
      counts.purchase += Number(f?.purchase_count ?? 0);

      const a = g.agg[0];
      const sessions = Number(a?.total_sessions ?? 0);
      totalSessions += sessions;
      uniqueVisitors += Number(a?.unique_visitors ?? 0);
      pageViewsWeighted += Number(a?.avg_pages ?? 0) * sessions;
      cartReached += Number(a?.cart_reached ?? 0);
      cartAbandoned += Number(a?.cart_abandoned ?? 0);
      checkoutReached += Number(a?.checkout_reached ?? 0);
      checkoutAbandoned += Number(a?.checkout_abandoned ?? 0);

      newVisitors += Number(g.nvr[0]?.new_visitors ?? 0);
      returningVisitors += Number(g.nvr[0]?.returning_visitors ?? 0);

      for (const p of g.platformRows) {
        const key = p.platform ?? 'unknown';
        platformSessions.set(key, (platformSessions.get(key) ?? 0) + Number(p.sessions));
      }
    }

    // Funnel is purely session/event-derived — each stage is the real count of
    // sessions whose tracked events reached it. Synced orders are NOT merged in
    // (order volume exceeds tracked sessions and clamping flattened the funnel to
    // a fake 100%); authoritative purchases live on the Orders page.
    const visit = counts.visit;

    const funnel = CANONICAL_FUNNEL_STAGES.map((stage) => ({
      stage: FUNNEL_STAGE_LABELS[stage],
      canonical_stage: stage,
      count: counts[stage],
      percent: pct(counts[stage], visit) || (stage === 'visit' && visit > 0 ? 100 : 0),
    }));

    return {
      funnel,
      sessionIntelligence: {
        // Real tracked-session totals (storefront_sessions), independent of the
        // order-merged funnel. The "Total Sessions" KPI reads these — never the
        // funnel's visit stage, which the order merge can lift for off-domain
        // checkouts.
        total_sessions: totalSessions,
        unique_visitors: uniqueVisitors,
        avg_pages_per_session: totalSessions > 0 ? Number((pageViewsWeighted / totalSessions).toFixed(2)) : 0,
        sessions_per_visitor: uniqueVisitors > 0 ? Number((totalSessions / uniqueVisitors).toFixed(2)) : 0,
        cart_abandonment_rate: pct(cartAbandoned, cartReached),
        checkout_abandonment_rate: pct(checkoutAbandoned, checkoutReached),
        new_visitors: newVisitors,
        returning_visitors: returningVisitors,
        platform_breakdown: [...platformSessions.entries()]
          .sort((x, y) => y[1] - x[1])
          .map(([platform, sessions]) => ({ platform, sessions })),
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

    // DATABASE-PER-INTEGRATION: run every aggregate once per store client (over
    // that client's connector ids) and merge below. With the flag off this is a
    // single group on the shared client — the pre-cutover behavior.
    const groups = await this.groupByDataPlaneClient(ids);
    if (groups.length === 0) return blank;

    const queryGroup = async (db: any, groupIds: string[]) => {
      const [engagement, repeat, device, entry, exit, referrer, products, steps, productEng, ttp, friction] = await Promise.all([
        // rows: { total: bigint, bounced: bigint, avg_seconds: number | null }
        db.$queryRawUnsafe(
          `SELECT
             COUNT(*)::bigint                                                          AS total,
             COUNT(*) FILTER (WHERE page_view_count <= 1)::bigint                      AS bounced,
             AVG(EXTRACT(EPOCH FROM (last_active_at - started_at)))::float8            AS avg_seconds
           FROM storefront_sessions WHERE ${sessWhere}`,
          groupIds, from, to,
        ),
        // rows: { repeat_visitors: bigint, visitors: bigint }
        db.$queryRawUnsafe(
          `SELECT COUNT(*) FILTER (WHERE c > 1)::bigint AS repeat_visitors, COUNT(*)::bigint AS visitors
           FROM (SELECT visitor_id, COUNT(*) c FROM storefront_sessions WHERE ${sessWhere} GROUP BY visitor_id) v`,
          groupIds, from, to,
        ),
        // rows: { device: string | null, sessions: bigint }
        db.$queryRawUnsafe(
          `SELECT device_type AS device, COUNT(*)::bigint AS sessions
           FROM storefront_sessions WHERE ${sessWhere} GROUP BY device_type ORDER BY sessions DESC`,
          groupIds, from, to,
        ),
        // rows: { page: string | null, sessions: bigint }
        db.$queryRawUnsafe(
          `SELECT COALESCE(landing_page, page_urls_visited->>0) AS page, COUNT(*)::bigint AS sessions
           FROM storefront_sessions WHERE ${sessWhere} AND COALESCE(landing_page, page_urls_visited->>0) IS NOT NULL
           GROUP BY COALESCE(landing_page, page_urls_visited->>0) ORDER BY sessions DESC LIMIT 8`,
          groupIds, from, to,
        ),
        // rows: { page: string | null, sessions: bigint }
        db.$queryRawUnsafe(
          `SELECT last_page_url AS page, COUNT(*)::bigint AS sessions
           FROM storefront_sessions WHERE ${sessWhere} AND last_page_url IS NOT NULL
           GROUP BY last_page_url ORDER BY sessions DESC LIMIT 8`,
          groupIds, from, to,
        ),
        // rows: { referrer: string | null, sessions: bigint }
        db.$queryRawUnsafe(
          `SELECT COALESCE(NULLIF(referrer, ''), 'Direct / None') AS referrer, COUNT(*)::bigint AS sessions
           FROM storefront_sessions WHERE ${sessWhere}
           GROUP BY COALESCE(NULLIF(referrer, ''), 'Direct / None') ORDER BY sessions DESC LIMIT 8`,
          groupIds, from, to,
        ),
        // rows: { product: string | null, sessions: bigint }
        db.$queryRawUnsafe(
          `SELECT COALESCE(NULLIF(properties->>'product_name',''), NULLIF(properties->>'product_id',''), '(unknown)') AS product,
                  COUNT(DISTINCT session_id)::bigint AS sessions
           FROM storefront_events
           WHERE ${evtWhere} AND canonical_stage = 'product_view'
           GROUP BY 1 ORDER BY sessions DESC LIMIT 8`,
          groupIds, from, to,
        ),
        // rows: { step: string | null, sessions: bigint }
        db.$queryRawUnsafe(
          `SELECT COALESCE(NULLIF(properties->>'step',''), '(unspecified)') AS step,
                  COUNT(DISTINCT session_id)::bigint AS sessions
           FROM storefront_events
           WHERE ${evtWhere} AND event_type = 'checkout_step'
           GROUP BY 1 ORDER BY sessions DESC LIMIT 10`,
          groupIds, from, to,
        ),
        // Product engagement: views vs add-to-carts per product (cart-rate computed
        // in JS). Grouped by product_id, with product_name carried for display.
        // rows: { product_id, product_name, views: bigint, add_to_carts: bigint }
        db.$queryRawUnsafe(
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
          groupIds, from, to,
        ),
        // Time to purchase: seconds from session start to the first purchase event,
        // over sessions that actually converted. avg + median (NULL when none);
        // `converted` weights the cross-store merge.
        // rows: { avg_seconds, median_seconds, converted: bigint }
        db.$queryRawUnsafe(
          `SELECT
             AVG(secs)::float8                                          AS avg_seconds,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY secs)::float8  AS median_seconds,
             COUNT(*)::bigint                                           AS converted
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
          groupIds, from, to,
        ),
        // Friction signals: checkout abandonment by step (pct computed in JS).
        // rows: { step: string | null, abandon_count: bigint }
        db.$queryRawUnsafe(
          `SELECT COALESCE(NULLIF(properties->>'step',''), '(unspecified)') AS step,
                  COUNT(*)::bigint AS abandon_count
           FROM storefront_events
           WHERE ${evtWhere} AND event_type = 'checkout_abandon'
           GROUP BY 1 ORDER BY abandon_count DESC LIMIT 10`,
          groupIds, from, to,
        ),
      ]);
      return { engagement, repeat, device, entry, exit, referrer, products, steps, productEng, ttp, friction };
    };
    const perGroup = await Promise.all(groups.map((g) => queryGroup(g.db, g.ids)));

    // Merge the per-store results: scalar aggregates sum (durations are
    // session-weighted means), top-N lists merge by key, re-sort and re-cap.
    let total = 0;
    let bounced = 0;
    let durationWeighted = 0;
    let repeatVisitors = 0;
    let visitors = 0;
    const deviceMap = new Map<string, number>();
    const entryMap = new Map<string, number>();
    const exitMap = new Map<string, number>();
    const referrerMap = new Map<string, number>();
    const productMap = new Map<string, number>();
    const stepMap = new Map<string, number>();
    const prodEngMap = new Map<string, { product_name: string | null; views: number; add_to_carts: number }>();
    let ttpConverted = 0;
    let ttpAvgWeighted = 0;
    let ttpMedianWeighted = 0;
    const frictionMap = new Map<string, number>();

    const bump = (m: Map<string, number>, key: string, by: number) => m.set(key, (m.get(key) ?? 0) + by);

    for (const g of perGroup) {
      const eng = g.engagement[0];
      const t = Number(eng?.total ?? 0);
      total += t;
      bounced += Number(eng?.bounced ?? 0);
      durationWeighted += Number(eng?.avg_seconds ?? 0) * t;
      repeatVisitors += Number(g.repeat[0]?.repeat_visitors ?? 0);
      visitors += Number(g.repeat[0]?.visitors ?? 0);
      for (const d of g.device) bump(deviceMap, d.device ?? 'unknown', Number(d.sessions));
      for (const e of g.entry) bump(entryMap, e.page as string, Number(e.sessions));
      for (const e of g.exit) bump(exitMap, e.page as string, Number(e.sessions));
      for (const r of g.referrer) bump(referrerMap, r.referrer as string, Number(r.sessions));
      for (const p of g.products) bump(productMap, p.product as string, Number(p.sessions));
      for (const s of g.steps) bump(stepMap, s.step as string, Number(s.sessions));
      for (const p of g.productEng) {
        const key = (p.product_id as string) ?? '';
        const cur = prodEngMap.get(key) ?? { product_name: null, views: 0, add_to_carts: 0 };
        cur.product_name = cur.product_name ?? ((p.product_name as string) || null);
        cur.views += Number(p.views);
        cur.add_to_carts += Number(p.add_to_carts);
        prodEngMap.set(key, cur);
      }
      const ttpRow = g.ttp[0];
      const converted = Number(ttpRow?.converted ?? 0);
      ttpConverted += converted;
      ttpAvgWeighted += Number(ttpRow?.avg_seconds ?? 0) * converted;
      ttpMedianWeighted += Number(ttpRow?.median_seconds ?? 0) * converted;
      for (const f of g.friction) bump(frictionMap, f.step as string, Number(f.abandon_count));
    }

    const top = (m: Map<string, number>, n: number) =>
      [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, n);
    const totalAbandons = [...frictionMap.values()].reduce((sum, v) => sum + v, 0);

    return {
      bounce_rate: pct(bounced, total),
      avg_session_duration_seconds: total > 0 ? Math.round(durationWeighted / total) : 0,
      repeat_visitor_rate: pct(repeatVisitors, visitors),
      device_breakdown: [...deviceMap.entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([device, sessions]) => ({ device, sessions })),
      top_entry_pages: top(entryMap, 8).map(([page, sessions]) => ({ page, sessions })),
      top_exit_pages: top(exitMap, 8).map(([page, sessions]) => ({ page, sessions })),
      top_referrers: top(referrerMap, 8).map(([referrer, sessions]) => ({ referrer, sessions })),
      top_products: top(productMap, 8).map(([product, sessions]) => ({ product, sessions })),
      checkout_steps: top(stepMap, 10).map(([step, sessions]) => ({ step, sessions })),
      product_engagement: [...prodEngMap.entries()]
        .sort((x, y) => y[1].views - x[1].views || y[1].add_to_carts - x[1].add_to_carts)
        .slice(0, 20)
        .map(([product_id, p]) => ({
          product_id,
          product_name: p.product_name || product_id || '(unknown)',
          views: p.views,
          add_to_carts: p.add_to_carts,
          cart_rate: p.views > 0 ? Number(((p.add_to_carts / p.views) * 100).toFixed(1)) : 0,
        })),
      time_to_purchase: {
        // Session-weighted across stores; median-of-medians is approximate for
        // multi-store sites but exact for the common single-store case.
        avg_seconds: ttpConverted > 0 ? Math.round(ttpAvgWeighted / ttpConverted) : 0,
        median_seconds: ttpConverted > 0 ? Math.round(ttpMedianWeighted / ttpConverted) : 0,
      },
      friction_signals: top(frictionMap, 10).map(([step, abandon_count]) => ({
        step,
        abandon_count,
        pct: totalAbandons > 0 ? Number(((abandon_count / totalAbandons) * 100).toFixed(1)) : 0,
      })),
    };
  }
}
