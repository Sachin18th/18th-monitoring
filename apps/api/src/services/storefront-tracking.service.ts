import { prisma } from '@kpi-platform/db';
import { reserveTrackingBudget } from '../utils/track-rate-limit';

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
  'element_click',
  'checkout_step',
  'checkout_abandon',
  'checkout_complete',
] as const;

export type StorefrontEventType = (typeof STOREFRONT_EVENT_TYPES)[number];
const VALID_EVENT_TYPES = new Set<string>(STOREFRONT_EVENT_TYPES);

const VALID_DEVICE_TYPES = new Set(['mobile', 'desktop', 'tablet']);

// Funnel stages, in order. Abandonment is measured at the checkout step.
const FUNNEL_STAGES: StorefrontEventType[] = ['product_view', 'checkout_step', 'checkout_complete'];

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

    return {
      sessionId: sessionId.slice(0, 255),
      visitorId: visitorId.slice(0, 255),
      eventType: eventType as StorefrontEventType,
      pageUrl: pageUrl ? String(pageUrl).slice(0, 2000) : null,
      pageTitle: pageTitle ? String(pageTitle).slice(0, 500) : null,
      occurredAt,
      properties,
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
  }): Promise<{ accepted: number; rejected: number }> {
    const events = Array.isArray(input.events) ? input.events : [];
    const total = events.length;
    if (!input.connectorInstanceId || total === 0) return { accepted: 0, rejected: total };

    try {
      // 1) Validate connector by lookup; derive tenant_id for scoping.
      const found = await prisma.$queryRaw<Array<{ id: string; tenant_id: string }>>`
        SELECT id, tenant_id FROM connector_instances WHERE id = ${String(input.connectorInstanceId)} LIMIT 1
      `;
      const connector = found[0];
      if (!connector) return { accepted: 0, rejected: total };

      const connectorInstanceId = connector.id;
      const tenantId = connector.tenant_id;

      // 2) Normalize + validate events (malformed events are rejected, not fatal).
      const normalized: NormalizedEvent[] = [];
      let rejected = 0;
      for (const raw of events) {
        const ev = this.normalizeEvent(raw);
        if (ev) normalized.push(ev);
        else rejected += 1;
      }
      if (normalized.length === 0) return { accepted: 0, rejected };

      // 3) Per-connector sliding-window rate limit (1,000 events/min).
      const budget = reserveTrackingBudget(connectorInstanceId, normalized.length);
      if (budget < normalized.length) {
        rejected += normalized.length - budget;
        normalized.length = budget; // drop the overflow
      }
      if (normalized.length === 0) return { accepted: 0, rejected };

      // 4) Upsert one session row per distinct session_id in the batch.
      const deviceType = VALID_DEVICE_TYPES.has(String(input.deviceType))
        ? String(input.deviceType)
        : this.detectDeviceType(input.userAgent);

      const sessions = new Map<string, NormalizedEvent[]>();
      for (const ev of normalized) {
        const list = sessions.get(ev.sessionId);
        if (list) list.push(ev);
        else sessions.set(ev.sessionId, [ev]);
      }

      for (const [sessionId, sessionEvents] of sessions) {
        const first = sessionEvents[0];
        const lastActive = sessionEvents.reduce(
          (max, e) => (e.occurredAt > max ? e.occurredAt : max),
          sessionEvents[0].occurredAt,
        );
        const referrer = (first.properties?.referrer as string | undefined) ?? null;
        await this.upsertSession({
          connectorInstanceId,
          tenantId,
          sessionId,
          visitorId: first.visitorId,
          lastActiveAt: lastActive,
          userAgent: input.userAgent ?? null,
          referrer,
          landingPage: first.pageUrl,
          deviceType,
        });
      }

      // 5) Bulk-insert the accepted events.
      await this.insertEvents(connectorInstanceId, tenantId, normalized);

      return { accepted: normalized.length, rejected };
    } catch (err) {
      console.error('[TRACK] ingest failed', err);
      return { accepted: 0, rejected: total };
    }
  }

  private static async upsertSession(s: {
    connectorInstanceId: string;
    tenantId: string;
    sessionId: string;
    visitorId: string;
    lastActiveAt: Date;
    userAgent: string | null;
    referrer: string | null;
    landingPage: string | null;
    deviceType: string | null;
  }): Promise<void> {
    // started_at / landing_page / referrer / device_type are set on first sight
    // and preserved on conflict; last_active_at always advances (never rewinds).
    await prisma.$executeRawUnsafe(
      `INSERT INTO storefront_sessions
         (connector_instance_id, tenant_id, session_id, visitor_id, last_active_at,
          user_agent, referrer, landing_page, device_type)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7, $8, $9)
       ON CONFLICT (connector_instance_id, session_id) DO UPDATE SET
         last_active_at = GREATEST(storefront_sessions.last_active_at, EXCLUDED.last_active_at),
         user_agent     = COALESCE(storefront_sessions.user_agent, EXCLUDED.user_agent),
         referrer       = COALESCE(storefront_sessions.referrer, EXCLUDED.referrer),
         landing_page   = COALESCE(storefront_sessions.landing_page, EXCLUDED.landing_page),
         device_type    = COALESCE(storefront_sessions.device_type, EXCLUDED.device_type)`,
      s.connectorInstanceId,
      s.tenantId,
      s.sessionId,
      s.visitorId,
      s.lastActiveAt.toISOString(),
      s.userAgent,
      s.referrer,
      s.landingPage,
      s.deviceType,
    );
  }

  private static async insertEvents(
    connectorInstanceId: string,
    tenantId: string,
    events: NormalizedEvent[],
  ): Promise<void> {
    // Single multi-row INSERT (9 columns). id + received_at use column defaults.
    const cols = 9;
    const placeholders: string[] = [];
    const params: any[] = [];

    events.forEach((ev, i) => {
      const b = i * cols;
      placeholders.push(
        `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}::timestamptz, $${b + 9}::jsonb)`,
      );
      params.push(
        connectorInstanceId,
        tenantId,
        ev.sessionId,
        ev.visitorId,
        ev.eventType,
        ev.pageUrl,
        ev.pageTitle,
        ev.occurredAt.toISOString(),
        JSON.stringify(ev.properties ?? {}),
      );
    });

    const sql =
      `INSERT INTO storefront_events
         (connector_instance_id, tenant_id, session_id, visitor_id, event_type, page_url, page_title, occurred_at, properties)
       VALUES ` + placeholders.join(', ');

    await prisma.$executeRawUnsafe(sql, ...params);
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
   * Checkout funnel: distinct sessions reaching each stage
   * (product_view → checkout_step → checkout_complete), within the window.
   * Abandonment is measured at checkout: sessions that entered checkout but did
   * not complete.
   */
  static async funnel(input: {
    tenantId: string;
    connectorInstanceId: string;
    from?: Date | null;
    to?: Date | null;
  }) {
    const to = input.to ?? new Date();
    const from = input.from ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRaw<Array<{ event_type: string; sessions: bigint }>>`
      SELECT event_type, COUNT(DISTINCT session_id)::bigint AS sessions
      FROM storefront_events
      WHERE tenant_id = ${input.tenantId}
        AND connector_instance_id = ${input.connectorInstanceId}
        AND occurred_at >= ${from} AND occurred_at <= ${to}
        AND event_type IN ('product_view', 'checkout_step', 'checkout_complete', 'checkout_abandon')
      GROUP BY event_type
    `;

    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.event_type] = Number(r.sessions);

    const stages = FUNNEL_STAGES.map((stage, idx) => {
      const sessions = counts[stage] ?? 0;
      const top = counts[FUNNEL_STAGES[0]] ?? 0;
      const prev = idx === 0 ? sessions : counts[FUNNEL_STAGES[idx - 1]] ?? 0;
      return {
        stage,
        sessions,
        // % of sessions that entered the funnel (reached the first stage).
        conversion_from_top: top > 0 ? Number(((sessions / top) * 100).toFixed(2)) : 0,
        // % retained from the immediately previous stage.
        conversion_from_prev: prev > 0 ? Number(((sessions / prev) * 100).toFixed(2)) : 0,
      };
    });

    const enteredCheckout = counts['checkout_step'] ?? 0;
    const completed = counts['checkout_complete'] ?? 0;
    const abandonment_rate =
      enteredCheckout > 0 ? Number((((enteredCheckout - completed) / enteredCheckout) * 100).toFixed(2)) : 0;

    return {
      window: { from: from.toISOString(), to: to.toISOString() },
      stages,
      checkout: {
        entered_checkout: enteredCheckout,
        completed_checkout: completed,
        // Sessions that entered checkout but never completed it.
        abandoned: Math.max(0, enteredCheckout - completed),
        // Explicit checkout_abandon beacons captured on unload (may differ from
        // the derived `abandoned` count above).
        abandon_events: counts['checkout_abandon'] ?? 0,
        abandonment_rate,
      },
    };
  }
}
