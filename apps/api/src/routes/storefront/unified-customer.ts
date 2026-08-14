import { FastifyInstance } from 'fastify';
import { prisma, decryptEmail, hashEmail } from '@kpi-platform/db';
import { tenantAuthHandler } from '../../middlewares/auth.middleware';
import { successResponse, errorResponse } from '../../utils/response';
import { getDataPlaneClient } from '../../lib/tenant-prisma';
import { CustomerMetricsService } from '../../services/customer-metrics.service';
import { RecommendationService } from '../../services/recommendation.service';
import { BehavioralFusionService, FUSED_SEGMENTS } from '../../services/behavioral-fusion.service';
import { CampaignTriggerService } from '../../services/campaign-trigger.service';
import { CustomerGroupService, GROUP_FIELDS, normalizeRules } from '../../services/customer-group.service';
import { RevenuePulseService } from '../../services/revenue-pulse.service';
import { ProductAnalyticsService } from '../../services/product-analytics.service';
import { EmailService } from '../../services/email.service';

/**
 * Unified customer (CDP golden record) route — the payoff of Phase 1 identity
 * resolution (see docs/CDP-IMPLEMENTATION-PLAN.md §5). Given a resolved
 * CustomerProfile, returns ONE view that fuses:
 *   - the golden record (identity + transactional summary from history sync)
 *   - the identity graph (every identifier stitched to this person)
 *   - the LIVE journey (storefront sessions/events now bridged via customer_profile_id)
 *
 * This is what neither source system could show alone: a known customer's live
 * behavior joined to who they are.
 *
 * Auth mirrors session-journeys: tenantAuthHandler + per-connector tenant/project
 * authorization before any row is read.
 */

// Funnel ordering for computing the furthest stage a customer has reached live.
const STAGE_RANK: Record<string, number> = {
  visit: 0,
  product_view: 1,
  add_to_cart: 2,
  checkout: 3,
  purchase: 4,
};

export const unifiedCustomerRoutes = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', tenantAuthHandler);

  const authorizeConnector = async (
    req: any,
    reply: any,
    projectId: string | undefined,
    connectorInstanceId: string | undefined,
  ): Promise<string | null> => {
    if (!projectId) {
      reply.code(400).send(errorResponse('projectId is required', 'BAD_REQUEST'));
      return null;
    }
    if (!connectorInstanceId) {
      reply.code(400).send(errorResponse('connectorInstanceId is required', 'BAD_REQUEST'));
      return null;
    }
    const connector = await prisma.connectorInstance.findFirst({
      where: { id: connectorInstanceId, tenantId: req.tenantId, siteId: projectId },
      select: { id: true },
    });
    if (!connector) {
      reply.code(403).send(errorResponse('Unauthorized connector for this project', 'FORBIDDEN'));
      return null;
    }
    return connector.id;
  };

  // Never expose a raw email hash to the client; truncate for reference only.
  const maskIdentifier = (type: string, value: string): string =>
    type === 'email_hash' && value.length > 12 ? `${value.slice(0, 8)}…` : value;

  /**
   * GET /api/storefront/segments
   * Query: projectId, connectorInstanceId (required).
   * Counts per fused segment (live×historical) and per base segment (historical).
   */
  fastify.get('/segments', async (req: any, reply: any) => {
    const { projectId, connectorInstanceId } = req.query || {};
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;

    try {
      const db = await getDataPlaneClient(connectorId);
      const [snaps, baseGroups] = await Promise.all([
        db.customerBehaviorSnapshot.findMany({ where: { connectorInstanceId: connectorId }, select: { fusedSegments: true } }),
        db.customerMetrics.groupBy({ by: ['segment'], where: { connectorInstanceId: connectorId }, _count: { _all: true } }),
      ]);

      const fusedCounts: Record<string, number> = {};
      for (const s of FUSED_SEGMENTS) fusedCounts[s] = 0;
      for (const snap of snaps) {
        for (const seg of Array.isArray(snap.fusedSegments) ? snap.fusedSegments : []) {
          if (fusedCounts[seg as string] != null) fusedCounts[seg as string] += 1;
        }
      }

      const fused = FUSED_SEGMENTS.map((segment) => ({ segment, count: fusedCounts[segment] }));
      const base = baseGroups
        .filter((g: any) => g.segment)
        .map((g: any) => ({ segment: g.segment as string, count: g._count._all }))
        .sort((a: any, b: any) => b.count - a.count);

      return reply.code(200).send(successResponse({ fused, base }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[segments] failed');
      return reply.code(500).send(errorResponse('Failed to load segments', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * GET /api/storefront/customers/live
   * Query: projectId, connectorInstanceId (required); windowMinutes (default 5, max 60).
   * Visitors currently on the site (sessions active within the window), resolved to
   * their customer identity + segment + LTV via the Phase 1 customer_profile_id bridge.
   */
  fastify.get('/customers/live', async (req: any, reply: any) => {
    const { projectId, connectorInstanceId } = req.query || {};
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;

    const windowMinutes = Math.min(Math.max(Number(req.query.windowMinutes) || 5, 1), 60);
    const since = new Date(Date.now() - windowMinutes * 60_000);

    try {
      const db = await getDataPlaneClient(connectorId);
      const sessions = await db.storefrontSession.findMany({
        where: { connectorInstanceId: connectorId, lastActiveAt: { gte: since } },
        orderBy: { lastActiveAt: 'desc' },
        take: 100,
      });

      // Resolve identity for sessions bridged to a profile (one batched lookup).
      const profileIds = [...new Set(sessions.map((s: any) => s.customerProfileId).filter(Boolean))] as string[];
      const profiles = profileIds.length
        ? await db.customerProfile.findMany({ where: { id: { in: profileIds } }, include: { metrics: true } })
        : [];
      const pmap = new Map(profiles.map((p: any) => [p.id, p]));

      const iso = (d: any) => (d instanceof Date ? d.toISOString() : d ?? null);
      const visitors = sessions.map((s: any) => {
        const p = s.customerProfileId ? pmap.get(s.customerProfileId) : null;
        const m = p && Array.isArray(p.metrics) && p.metrics.length ? p.metrics[0] : null;
        return {
          sessionId: s.sessionId,
          visitorId: s.visitorId,
          customerProfileId: s.customerProfileId ?? null,
          identified: !!p,
          email: p?.emailEncrypted ? decryptEmail(p.emailEncrypted) : null,
          // Platforms that expose a name but no email (Magento) would otherwise
          // show as "Known customer" with nothing to identify them by.
          name: (() => {
            const meta = ((p as any)?.metadata as any) || {};
            return [meta.firstName, meta.lastName].filter(Boolean).join(' ').trim() || null;
          })(),
          segment: m?.segment ?? null,
          totalLtv: p?.totalLtv != null ? Number(p.totalLtv) : null,
          funnelStage: s.funnelStage,
          deviceType: s.deviceType,
          channel: s.channel,
          pageViewCount: Number(s.pageViewCount ?? 0),
          lastActiveAt: iso(s.lastActiveAt),
        };
      });

      const liveVisitors = new Set(sessions.map((s: any) => s.visitorId)).size;
      return reply.code(200).send(successResponse({ visitors, liveVisitors, windowMinutes, asOf: new Date().toISOString() }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[customers/live] failed');
      return reply.code(500).send(errorResponse('Failed to load live visitors', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * GET /api/storefront/customers
   * Query: projectId, connectorInstanceId (required); page (default 1), pageSize (default 30, max 100).
   * Server-side paginated customer list, most valuable first, with computed metrics.
   */
  fastify.get('/customers', async (req: any, reply: any) => {
    const { projectId, connectorInstanceId } = req.query || {};
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 30, 1), 100);
    const segment = String(req.query.segment || '').trim();

    try {
      const db = await getDataPlaneClient(connectorId);
      const where: any = { connectorInstanceId: connectorId };
      // Optional segment filter: fused segments live on the snapshot; base
      // segments (VIP/HIGH_VALUE/…) live on customer_metrics.
      if (segment) {
        if ((FUSED_SEGMENTS as readonly string[]).includes(segment)) {
          const snaps = await db.customerBehaviorSnapshot.findMany({
            where: { connectorInstanceId: connectorId, fusedSegments: { array_contains: segment } },
            select: { customerProfileId: true },
          });
          where.id = { in: snaps.map((s: any) => s.customerProfileId) };
        } else {
          where.metrics = { some: { segment } };
        }
      }
      const [total, rows] = await Promise.all([
        db.customerProfile.count({ where }),
        db.customerProfile.findMany({
          where,
          orderBy: [{ totalLtv: { sort: 'desc', nulls: 'last' } }, { lastSeenAt: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { metrics: true, behaviorSnapshots: true },
        }),
      ]);

      const iso = (d: any) => (d instanceof Date ? d.toISOString() : d ?? null);
      const customers = rows.map((p: any) => {
        const m = Array.isArray(p.metrics) && p.metrics.length ? p.metrics[0] : null;
        const snap = Array.isArray(p.behaviorSnapshots) && p.behaviorSnapshots.length ? p.behaviorSnapshots[0] : null;
        // Some platforms expose a name without an email — Magento's customer
        // section gives fullname but no address unless extended. Those shoppers
        // are identified, so surface the name rather than letting the UI fall
        // through to "Guest".
        const meta = (p.metadata && typeof p.metadata === 'object') ? p.metadata as any : {};
        const name = [meta.firstName, meta.lastName].filter(Boolean).join(' ').trim() || null;
        return {
          id: p.id,
          email: p.emailEncrypted ? decryptEmail(p.emailEncrypted) : null,
          name,
          lifecycleState: p.lifecycleState,
          externalIds: p.externalIds || {},
          totalLtv: p.totalLtv != null ? Number(p.totalLtv) : null,
          lastSeenAt: iso(p.lastSeenAt),
          segment: m?.segment ?? null,
          orderCount: m?.orderCount ?? 0,
          churnLevel: m?.churnLevel ?? null,
          fusedSegments: snap && Array.isArray(snap.fusedSegments) ? snap.fusedSegments : [],
        };
      });

      return reply.code(200).send(successResponse({ customers, total, page, pageSize }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[customers] list failed');
      return reply.code(500).send(errorResponse('Failed to load customers', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * GET /api/storefront/unified-customer
   * Query: projectId, connectorInstanceId (required); one of customerProfileId | email | emailHash (required).
   *        sessionLimit (default 20, max 100).
   *
   * `email` is hashed server-side with the canonical hashEmail (the identity join
   * key) so the client never has to hash — and it stays correct if a pepper is set.
   */
  fastify.get('/unified-customer', async (req: any, reply: any) => {
    const { projectId, connectorInstanceId, customerProfileId, email, emailHash } = req.query || {};
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;

    // Resolve the lookup key: explicit hash wins, else hash the provided email.
    const effectiveEmailHash = emailHash ? String(emailHash) : email ? hashEmail(String(email)) : null;

    if (!customerProfileId && !effectiveEmailHash) {
      return reply
        .code(400)
        .send(errorResponse('customerProfileId, email, or emailHash is required', 'BAD_REQUEST'));
    }
    const sessionLimit = Math.min(Math.max(Number(req.query.sessionLimit) || 20, 1), 100);

    try {
      const db = await getDataPlaneClient(connectorId);

      // 1) Golden record — by profile id, or resolved via the email-hash join key.
      const profile = customerProfileId
        ? await db.customerProfile.findUnique({ where: { id: String(customerProfileId) } })
        : await db.customerProfile.findFirst({
            where: { connectorInstanceId: connectorId, emailHash: String(effectiveEmailHash) },
          });

      if (!profile || profile.connectorInstanceId !== connectorId) {
        return reply.code(404).send(errorResponse('Customer profile not found', 'NOT_FOUND'));
      }

      // 2) Identity graph — every identifier stitched to this person.
      const links = await db.identityLink.findMany({
        where: { connectorInstanceId: connectorId, customerProfileId: profile.id },
        orderBy: [{ confidence: 'desc' }, { lastSeenAt: 'desc' }],
      });

      // 2b) Transactional intelligence (RFM / CLTV / churn / segment) from history.
      const metrics = await db.customerMetrics.findUnique({
        where: { connectorInstanceId_customerProfileId: { connectorInstanceId: connectorId, customerProfileId: profile.id } },
      });

      // 2c) Behavioral fusion — live signals + fused segments (Phase 3).
      const snapshot = await db.customerBehaviorSnapshot.findUnique({
        where: { connectorInstanceId_customerProfileId: { connectorInstanceId: connectorId, customerProfileId: profile.id } },
      });

      // 3) Live journey — storefront sessions bridged to this profile.
      const [sessionCount, sessions] = await Promise.all([
        db.storefrontSession.count({
          where: { connectorInstanceId: connectorId, customerProfileId: profile.id },
        }),
        db.storefrontSession.findMany({
          where: { connectorInstanceId: connectorId, customerProfileId: profile.id },
          orderBy: { startedAt: 'desc' },
          take: sessionLimit,
        }),
      ]);

      // Per-session event timeline — each page view / add-to-cart / checkout with
      // its own timestamp, in order. Fetched for the shown sessions in one query.
      const sessionIds = sessions.map((s: any) => s.sessionId);
      const events = sessionIds.length
        ? await db.storefrontEvent.findMany({
            where: { connectorInstanceId: connectorId, sessionId: { in: sessionIds } },
            orderBy: { occurredAt: 'asc' },
            select: { sessionId: true, eventType: true, canonicalStage: true, pageUrl: true, pageTitle: true, occurredAt: true },
            take: 2000,
          })
        : [];
      const eventsBySession = new Map<string, any[]>();
      for (const e of events) {
        const arr = eventsBySession.get(e.sessionId) || [];
        if (arr.length < 100) arr.push(e); // cap per session to keep the payload bounded
        eventsBySession.set(e.sessionId, arr);
      }

      let furthestStage = 'visit';
      let lastActiveAt: Date | null = null;
      for (const s of sessions) {
        if ((STAGE_RANK[s.funnelStage] ?? 0) > (STAGE_RANK[furthestStage] ?? 0)) furthestStage = s.funnelStage;
        if (!lastActiveAt || s.lastActiveAt > lastActiveAt) lastActiveAt = s.lastActiveAt;
      }

      const iso = (d: any) => (d instanceof Date ? d.toISOString() : d ?? null);

      // Recent order history for the Orders tab. Two sources, in priority order:
      //
      //  1. The resolved customer_profile_id column — an indexed direct lookup, and
      //     the ONLY way offline/POS orders surface here (they are matched on phone
      //     or loyalty id, which no email-hash scan can find).
      //  2. A scan of recent orders matched by email hash / platform customer id,
      //     which still covers rows written before the column existed.
      const ORDER_SELECT = {
        orderId: true,
        placedAt: true,
        totalAmount: true,
        currency: true,
        normalizedStatus: true,
        refundedAmount: true,
        channel: true,
        metadata: true,
      };
      const externalIdVals = profile.externalIds ? Object.values(profile.externalIds).map((v) => String(v)) : [];
      const [linkedOrderRows, recentOrderRows]: [any[], any[]] = await Promise.all([
        db.canonicalOrder.findMany({
          where: { connectorInstanceId: connectorId, customerProfileId: profile.id },
          orderBy: { placedAt: 'desc' },
          take: 25,
          select: ORDER_SELECT,
        }),
        db.canonicalOrder.findMany({
          where: { connectorInstanceId: connectorId },
          orderBy: { placedAt: 'desc' },
          take: 500,
          select: ORDER_SELECT,
        }),
      ]);

      const seenOrderIds = new Set<string>(linkedOrderRows.map((o) => String(o.orderId)));
      const legacyMatches = recentOrderRows.filter((o) => {
        if (seenOrderIds.has(String(o.orderId))) return false;
        const m = (o.metadata || {}) as any;
        if (profile.emailHash && m.customerEmailHash === profile.emailHash) return true;
        const cid = m.customer?.id != null ? String(m.customer.id) : null;
        return cid ? externalIdVals.includes(cid) : false;
      });

      const orders = [...linkedOrderRows, ...legacyMatches]
        .sort((a, b) => Number(new Date(b.placedAt)) - Number(new Date(a.placedAt)))
        .slice(0, 25)
        .map((o) => {
          const m = (o.metadata || {}) as any;
          return {
            orderId: o.orderId,
            placedAt: iso(o.placedAt),
            total: o.totalAmount != null ? Number(o.totalAmount) : 0,
            currency: o.currency || null,
            status: o.normalizedStatus,
            refunded: o.refundedAmount != null ? Number(o.refundedAmount) : 0,
            itemCount: Array.isArray(m.lineItems) ? m.lineItems.length : 0,
            // Lets the UI distinguish an in-store purchase from an online one.
            channel: o.channel || null,
            storeLocation: m.storeLocation || null,
          };
        });

      return reply.code(200).send(
        successResponse({
          orders,
          // Golden record: identity + transactional summary (LTV/lifecycle from history sync).
          profile: {
            id: profile.id,
            lifecycleState: profile.lifecycleState,
            identityConfidence: profile.identityConfidence != null ? Number(profile.identityConfidence) : null,
            email: profile.emailEncrypted ? decryptEmail(profile.emailEncrypted) : null, // in-memory only
            // Some platforms give a name but no email — without this the detail
            // header reads "Unknown customer" for a shopper we can actually name.
            name: (() => {
              const meta = (profile.metadata && typeof profile.metadata === 'object') ? profile.metadata as any : {};
              return [meta.firstName, meta.lastName].filter(Boolean).join(' ').trim() || null;
            })(),
            emailHashPreview: profile.emailHash ? `${String(profile.emailHash).slice(0, 8)}…` : null,
            externalIds: profile.externalIds || {},
            totalLtv: profile.totalLtv != null ? Number(profile.totalLtv) : null,
            firstSeenAt: iso(profile.firstSeenAt),
            lastSeenAt: iso(profile.lastSeenAt),
          },
          // Transactional intelligence computed from order history (Phase 2).
          history: metrics
            ? {
                orderCount: metrics.orderCount,
                totalRevenue: Number(metrics.totalRevenue),
                avgOrderValue: Number(metrics.avgOrderValue),
                firstOrderAt: iso(metrics.firstOrderAt),
                lastOrderAt: iso(metrics.lastOrderAt),
                recencyDays: metrics.recencyDays,
                frequencyMonthly: metrics.frequencyMonthly != null ? Number(metrics.frequencyMonthly) : null,
                rfm: { recency: metrics.rfmRecency, frequency: metrics.rfmFreq, monetary: metrics.rfmMonetary, score: metrics.rfmScore },
                cltv: metrics.cltv != null ? Number(metrics.cltv) : null,
                cltvTier: metrics.cltvTier,
                churnRisk: metrics.churnRisk != null ? Number(metrics.churnRisk) : null,
                churnLevel: metrics.churnLevel,
                segment: metrics.segment,
                computedAt: iso(metrics.computedAt),
              }
            : null,
          // Behavioral fusion: fused segments + live signals (Phase 3).
          fusion: snapshot
            ? {
                fusedSegments: Array.isArray(snapshot.fusedSegments) ? snapshot.fusedSegments : [],
                lastSessionAt: iso(snapshot.lastSessionAt),
                sessionsLast30d: snapshot.sessionsLast30d,
                liveFurthestStage: snapshot.liveFurthestStage,
                cartAbandonedAt: iso(snapshot.cartAbandonedAt),
                recentCategories: Array.isArray(snapshot.recentCategories) ? snapshot.recentCategories : [],
                signals: snapshot.signals || {},
                computedAt: iso(snapshot.computedAt),
              }
            : null,
          // Identity graph edges.
          identity: {
            linkCount: links.length,
            links: links.map((l: any) => ({
              type: l.identifierType,
              value: maskIdentifier(l.identifierType, String(l.identifierValue)),
              confidence: Number(l.confidence),
              firstSeenAt: iso(l.firstSeenAt),
              lastSeenAt: iso(l.lastSeenAt),
            })),
          },
          // Live behavior fused onto the known customer.
          liveJourney: {
            sessionCount,
            lastActiveAt: iso(lastActiveAt),
            furthestStage,
            recentSessions: sessions.map((s: any) => ({
              sessionId: s.sessionId,
              visitorId: s.visitorId,
              startedAt: iso(s.startedAt),
              lastActiveAt: iso(s.lastActiveAt),
              funnelStage: s.funnelStage,
              funnelStagesReached: Array.isArray(s.funnelStagesReached) ? s.funnelStagesReached : [],
              pageViewCount: Number(s.pageViewCount ?? 0),
              pageUrlsVisited: Array.isArray(s.pageUrlsVisited) ? s.pageUrlsVisited : [],
              productIdsViewed: Array.isArray(s.productIdsViewed) ? s.productIdsViewed : [],
              landingPage: s.landingPage ?? null,
              lastPageUrl: s.lastPageUrl ?? null,
              productViewed: Boolean(s.productViewed),
              addToCart: Boolean(s.addToCart),
              checkoutStarted: Boolean(s.checkoutStarted),
              purchaseCompleted: Boolean(s.purchaseCompleted),
              channel: s.channel,
              deviceType: s.deviceType,
              events: (eventsBySession.get(s.sessionId) || []).map((e: any) => ({
                eventType: e.eventType,
                canonicalStage: e.canonicalStage,
                pageUrl: e.pageUrl,
                pageTitle: e.pageTitle,
                occurredAt: iso(e.occurredAt),
              })),
            })),
          },
        }),
      );
    } catch (err: any) {
      req.log?.error?.({ err }, '[unified-customer] load failed');
      return reply.code(500).send(errorResponse('Failed to load unified customer', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * POST /api/storefront/unified-customer/recompute
   * Body/query: projectId, connectorInstanceId. Recomputes RFM/CLTV/churn/segment
   * for every customer of the connector from canonical_orders (Phase 2 analytics).
   */
  fastify.post('/unified-customer/recompute', async (req: any, reply: any) => {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const { projectId, connectorInstanceId } = src;
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;

    try {
      const db = await getDataPlaneClient(connectorId);
      const scope = { siteId: String(projectId), connectorInstanceId: connectorId };
      const result = await CustomerMetricsService.recomputeForConnector(db, scope);
      // Fusion depends on the just-computed metrics, so run it right after.
      const fusion = await BehavioralFusionService.recomputeForConnector(db, scope);
      return reply.code(200).send(successResponse({ ...result, fusion }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[unified-customer] recompute failed');
      return reply.code(500).send(errorResponse('Failed to recompute customer metrics', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * GET /api/storefront/unified-customer/recommendations
   * Query: projectId, connectorInstanceId, customerProfileId (required); limit (default 6).
   * Personalized product recommendations from the customer's purchase history
   * (falls back to trending for customers with no orders).
   */
  fastify.get('/unified-customer/recommendations', async (req: any, reply: any) => {
    const { projectId, connectorInstanceId, customerProfileId } = req.query || {};
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    if (!customerProfileId) {
      return reply.code(400).send(errorResponse('customerProfileId is required', 'BAD_REQUEST'));
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 6, 1), 24);

    try {
      const db = await getDataPlaneClient(connectorId);
      const items = await RecommendationService.forCustomer(
        db,
        { connectorInstanceId: connectorId },
        String(customerProfileId),
        limit,
      );
      return reply.code(200).send(successResponse({ items }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[unified-customer] recommendations failed');
      return reply.code(500).send(errorResponse('Failed to load recommendations', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * POST /api/storefront/campaigns/run
   * Query/body: projectId, connectorInstanceId. Evaluates fused segments and
   * generates personalized email drafts (Phase 4) — respecting cooldown + consent.
   */
  fastify.post('/campaigns/run', async (req: any, reply: any) => {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const { projectId, connectorInstanceId, customerProfileId } = src;
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;

    // Optional: restrict generation to one fused-segment trigger.
    const trigger = src.trigger ? String(src.trigger) : null;
    if (trigger && !FUSED_SEGMENTS.includes(trigger as any)) {
      return reply.code(400).send(errorResponse('Unknown trigger', 'BAD_REQUEST'));
    }

    try {
      const db = await getDataPlaneClient(connectorId);
      const conn = await prisma.connectorInstance.findFirst({ where: { id: connectorId }, select: { label: true, syncConfig: true } });
      const storeUrl = deriveStoreUrl(conn?.syncConfig);
      const result = await CampaignTriggerService.runForConnector(
        db,
        { siteId: String(projectId), connectorInstanceId: connectorId, storeName: conn?.label || 'our store', storeUrl },
        {
          ...(customerProfileId ? { customerProfileId: String(customerProfileId) } : {}),
          ...(trigger ? { segment: trigger } : {}),
        },
      );
      return reply.code(200).send(successResponse(result));
    } catch (err: any) {
      req.log?.error?.({ err }, '[campaigns] run failed');
      return reply.code(500).send(errorResponse('Failed to run campaigns', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * GET /api/storefront/campaigns
   * Query: projectId, connectorInstanceId; optional customerProfileId, status, limit.
   * Lists generated campaign messages (drafts + sent).
   */
  fastify.get('/campaigns', async (req: any, reply: any) => {
    const { projectId, connectorInstanceId, customerProfileId, status } = req.query || {};
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

    try {
      const db = await getDataPlaneClient(connectorId);
      const where: any = { connectorInstanceId: connectorId };
      if (customerProfileId) where.customerProfileId = String(customerProfileId);
      if (status) where.status = String(status);
      const rows = await db.campaignMessage.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });

      // Resolve a display identity per draft so the store-wide campaigns view can
      // show WHO each message is for (name + masked email — no plaintext PII).
      const pids = [...new Set(rows.map((r: any) => r.customerProfileId).filter(Boolean))];
      const profiles = pids.length
        ? await db.customerProfile.findMany({ where: { id: { in: pids } }, select: { id: true, emailEncrypted: true, metadata: true } })
        : [];
      const profById = new Map<string, any>(profiles.map((p: any) => [p.id, p]));

      const iso = (d: any) => (d instanceof Date ? d.toISOString() : d ?? null);
      const messages = rows.map((m: any) => {
        const prof = profById.get(m.customerProfileId);
        const email = prof?.emailEncrypted ? decryptEmail(prof.emailEncrypted) : null;
        const meta = (prof?.metadata as any) || {};
        const name =
          [meta.firstName, meta.lastName].filter(Boolean).join(' ').trim() ||
          (email ? email.split('@')[0] : '') ||
          'Unknown';
        return {
          id: m.id,
          customerProfileId: m.customerProfileId,
          customer: { name, email: maskEmail(email) },
          trigger: m.trigger,
          goal: m.goal,
          channel: m.channel,
          subject: m.subject,
          body: m.body,
          recommendedProducts: m.recommendedProducts || [],
          generator: m.generator,
          status: m.status,
          reason: m.reason,
          sentAt: iso(m.sentAt),
          createdAt: iso(m.createdAt),
        };
      });
      return reply.code(200).send(successResponse({ messages }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[campaigns] list failed');
      return reply.code(500).send(errorResponse('Failed to load campaigns', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * POST /api/storefront/campaigns/:id/send
   * Query/body: projectId, connectorInstanceId. Sends a generated draft via email.
   */
  fastify.post('/campaigns/:id/send', async (req: any, reply: any) => {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const { projectId, connectorInstanceId } = src;
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    const id = String(req.params?.id || '');

    try {
      const db = await getDataPlaneClient(connectorId);
      const msg = await db.campaignMessage.findUnique({ where: { id } });
      if (!msg || msg.connectorInstanceId !== connectorId) {
        return reply.code(404).send(errorResponse('Campaign message not found', 'NOT_FOUND'));
      }
      if (msg.status === 'SENT') {
        return reply.code(200).send(successResponse({ id, status: 'SENT', alreadySent: true }));
      }

      const profile = await db.customerProfile.findUnique({ where: { id: msg.customerProfileId }, select: { emailEncrypted: true } });
      const to = profile?.emailEncrypted ? decryptEmail(profile.emailEncrypted) : null;
      if (!to) {
        await db.campaignMessage.update({ where: { id }, data: { status: 'FAILED', reason: 'no recipient email' } });
        return reply.code(422).send(errorResponse('Customer has no email on file', 'NO_RECIPIENT'));
      }

      const sent = await EmailService.send({ to, subject: msg.subject, html: msg.body });
      await db.campaignMessage.update({
        where: { id },
        data: sent ? { status: 'SENT', sentAt: new Date() } : { status: 'FAILED', reason: 'email delivery failed' },
      });
      return reply.code(200).send(successResponse({ id, status: sent ? 'SENT' : 'FAILED' }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[campaigns] send failed');
      return reply.code(500).send(errorResponse('Failed to send campaign', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * PUT /api/storefront/campaigns/:id
   * Body: projectId, connectorInstanceId, subject?, body?. Edits a draft's subject
   * and/or HTML body. A SENT message can't be edited (409). Marks the generator
   * 'edited' so the UI can show it was human-modified.
   */
  fastify.put('/campaigns/:id', async (req: any, reply: any) => {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const { projectId, connectorInstanceId } = src;
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    const id = String(req.params?.id || '');
    try {
      const db = await getDataPlaneClient(connectorId);
      const msg = await db.campaignMessage.findUnique({ where: { id }, select: { id: true, connectorInstanceId: true, status: true } });
      if (!msg || msg.connectorInstanceId !== connectorId) {
        return reply.code(404).send(errorResponse('Campaign message not found', 'NOT_FOUND'));
      }
      if (msg.status === 'SENT') {
        return reply.code(409).send(errorResponse('A sent campaign cannot be edited', 'CONFLICT'));
      }
      const data: any = { generator: 'edited' };
      if (typeof src.subject === 'string') data.subject = src.subject.slice(0, 500);
      if (typeof src.body === 'string') data.body = src.body;
      // A previously FAILED draft becomes a fresh GENERATED draft once edited.
      if (msg.status === 'FAILED') { data.status = 'GENERATED'; data.reason = null; }
      await db.campaignMessage.update({ where: { id }, data });
      return reply.code(200).send(successResponse({ id, updated: true }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[campaigns] update failed');
      return reply.code(500).send(errorResponse('Failed to update campaign', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * DELETE /api/storefront/campaigns/:id
   * Query: projectId, connectorInstanceId. Removes a campaign message (draft or
   * otherwise) after verifying it belongs to this connector.
   */
  fastify.delete('/campaigns/:id', async (req: any, reply: any) => {
    const { projectId, connectorInstanceId } = req.query || {};
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    const id = String(req.params?.id || '');
    try {
      const db = await getDataPlaneClient(connectorId);
      const msg = await db.campaignMessage.findUnique({ where: { id }, select: { id: true, connectorInstanceId: true } });
      if (!msg || msg.connectorInstanceId !== connectorId) {
        return reply.code(404).send(errorResponse('Campaign message not found', 'NOT_FOUND'));
      }
      await db.campaignMessage.delete({ where: { id } });
      return reply.code(200).send(successResponse({ id, deleted: true }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[campaigns] delete failed');
      return reply.code(500).send(errorResponse('Failed to delete campaign', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * POST /api/storefront/campaigns/send-batch
   * Query/body: projectId, connectorInstanceId; optional `ids` (array) — else all
   * GENERATED drafts for the connector. Sends each and reports counts. Used by the
   * Campaigns management page's "Send all" action.
   */
  fastify.post('/campaigns/send-batch', async (req: any, reply: any) => {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const { projectId, connectorInstanceId } = src;
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    const ids: string[] | null = Array.isArray(src.ids) ? src.ids.map((x: any) => String(x)) : null;

    try {
      const db = await getDataPlaneClient(connectorId);
      const where: any = { connectorInstanceId: connectorId, status: 'GENERATED' };
      if (ids && ids.length) where.id = { in: ids };
      const drafts = await db.campaignMessage.findMany({ where });

      let sent = 0;
      let failed = 0;
      for (const msg of drafts) {
        try {
          const profile = await db.customerProfile.findUnique({ where: { id: msg.customerProfileId }, select: { emailEncrypted: true } });
          const to = profile?.emailEncrypted ? decryptEmail(profile.emailEncrypted) : null;
          if (!to) {
            await db.campaignMessage.update({ where: { id: msg.id }, data: { status: 'FAILED', reason: 'no recipient email' } });
            failed++;
            continue;
          }
          const ok = await EmailService.send({ to, subject: msg.subject, html: msg.body });
          await db.campaignMessage.update({
            where: { id: msg.id },
            data: ok ? { status: 'SENT', sentAt: new Date() } : { status: 'FAILED', reason: 'email delivery failed' },
          });
          ok ? sent++ : failed++;
        } catch (e: any) {
          failed++;
          try {
            await db.campaignMessage.update({ where: { id: msg.id }, data: { status: 'FAILED', reason: 'send error' } });
          } catch { /* best-effort */ }
        }
      }
      return reply.code(200).send(successResponse({ total: drafts.length, sent, failed }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[campaigns] send-batch failed');
      return reply.code(500).send(errorResponse('Failed to send campaigns', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * GET /api/storefront/revenue-pulse
   * Query: projectId, connectorInstanceId; optional period, start_date, end_date,
   * brand, category. Revenue Daily-Pulse aggregates (ported from ai-agent-ecom).
   */
  fastify.get('/revenue-pulse', async (req: any, reply: any) => {
    const q = req.query || {};
    const { projectId, connectorInstanceId } = q;
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    try {
      const db = await getDataPlaneClient(connectorId);
      const data = await RevenuePulseService.compute(db, { connectorInstanceId: connectorId }, {
        period: q.period ? String(q.period) : 'mtd',
        startDate: q.start_date ? String(q.start_date) : null,
        endDate: q.end_date ? String(q.end_date) : null,
        brand: q.brand ? String(q.brand) : null,
        category: q.category ? String(q.category) : null,
      });
      return reply.code(200).send(successResponse(data));
    } catch (err: any) {
      req.log?.error?.({ err }, '[revenue-pulse] failed');
      return reply.code(500).send(errorResponse('Failed to compute revenue pulse', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * GET /api/storefront/checkout-funnel
   * Query: projectId, connectorInstanceId; optional from, to (ISO).
   * Initiated checkouts vs completed (success) vs abandoned (failure), from
   * storefront_sessions checkout flags.
   */
  fastify.get('/checkout-funnel', async (req: any, reply: any) => {
    const q = req.query || {};
    const { projectId, connectorInstanceId } = q;
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    try {
      const db = await getDataPlaneClient(connectorId);
      const win = q.from || q.to ? { ...(q.from ? { gte: new Date(String(q.from)) } : {}), ...(q.to ? { lte: new Date(String(q.to)) } : {}) } : null;

      // Count by checkout_token (the true checkout identity) — NOT by session.
      // One real checkout produces two sessions (the on-domain tracker session +
      // the Web-Pixel session, whose id = the checkout token), so a session-based
      // count double-counts every checkout; token also collapses step-event
      // duplicates and retries of the same checkout.
      const evRows: any[] = await db.storefrontEvent.findMany({
        where: { connectorInstanceId: connectorId, eventType: { in: ['checkout_step', 'checkout_complete'] }, ...(win ? { occurredAt: win } : {}) },
        select: { eventType: true, properties: true },
      });
      const startedTokens = new Set<string>();
      const paidTokens = new Set<string>();
      const paymentTokens = new Set<string>();
      for (const e of evRows) {
        const p = (e.properties || {}) as any;
        const token = p?.checkout_token ? String(p.checkout_token) : null;
        if (!token) continue;
        if (e.eventType === 'checkout_complete') { paidTokens.add(token); startedTokens.add(token); }
        else { startedTokens.add(token); if (String(p?.step) === 'payment_info' || String(p?.step) === 'payment') paymentTokens.add(token); }
      }

      let initiated: number;
      let success: number;
      let paymentErrors = 0;

      if (startedTokens.size > 0) {
        // Token-based (Web Pixel present) — deduped, reconciles completion by token.
        initiated = startedTokens.size;
        success = [...paidTokens].filter((t) => startedTokens.has(t)).length;
        for (const t of paymentTokens) if (!paidTokens.has(t)) paymentErrors++;
      } else {
        // Fallback (no pixel / no tokens): session-based with visitor reconciliation.
        const rows: any[] = await db.storefrontSession.findMany({ where: { connectorInstanceId: connectorId, ...(win ? { startedAt: win } : {}) }, select: { visitorId: true, checkoutStarted: true, purchaseCompleted: true, startedAt: true } });
        const RECONCILE_MS = 24 * 60 * 60 * 1000;
        const purchaseTimesByVisitor = new Map<string, number[]>();
        for (const r of rows) if (r.purchaseCompleted && r.visitorId) { const a = purchaseTimesByVisitor.get(r.visitorId) || []; a.push(new Date(r.startedAt).getTime()); purchaseTimesByVisitor.set(r.visitorId, a); }
        let ini = 0; let suc = 0;
        for (const r of rows) {
          if (!(r.checkoutStarted || r.purchaseCompleted)) continue;
          ini++;
          const t = new Date(r.startedAt).getTime();
          if (r.purchaseCompleted || (purchaseTimesByVisitor.get(r.visitorId) || []).some((pt) => pt >= t - 60_000 && pt <= t + RECONCILE_MS)) suc++;
        }
        initiated = ini; success = suc;
      }

      // Fold in any on-domain checkout_error events as an additional failure signal.
      const errRows: any[] = await db.storefrontError.findMany({ where: { connectorInstanceId: connectorId, errorType: 'checkout_error', ...(win ? { occurredAt: win } : {}) }, select: { sessionId: true } });
      paymentErrors += new Set(errRows.map((e) => e.sessionId).filter(Boolean)).size;

      const failed = Math.max(0, initiated - success);
      const successRate = initiated ? Math.round((success / initiated) * 1000) / 10 : 0;
      const failureRate = initiated ? Math.round((failed / initiated) * 1000) / 10 : 0;
      return reply.code(200).send(successResponse({ initiated, success, failed, successRate, failureRate, paymentErrors }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[checkout-funnel] failed');
      return reply.code(500).send(errorResponse('Failed to compute checkout funnel', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * GET /api/storefront/product-analytics
   * Query: projectId, connectorInstanceId; optional period, start_date, end_date,
   * brand, category. Product funnel + brand + underrated (from storefront tracking).
   */
  fastify.get('/product-analytics', async (req: any, reply: any) => {
    const q = req.query || {};
    const { projectId, connectorInstanceId } = q;
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    try {
      const db = await getDataPlaneClient(connectorId);
      const data = await ProductAnalyticsService.compute(db, { connectorInstanceId: connectorId }, {
        period: q.period ? String(q.period) : 'last_30d',
        startDate: q.start_date ? String(q.start_date) : null,
        endDate: q.end_date ? String(q.end_date) : null,
        brand: q.brand ? String(q.brand) : null,
        category: q.category ? String(q.category) : null,
      });
      return reply.code(200).send(successResponse(data));
    } catch (err: any) {
      req.log?.error?.({ err }, '[product-analytics] failed');
      return reply.code(500).send(errorResponse('Failed to compute product analytics', 'INTERNAL_SERVER_ERROR'));
    }
  });

  // ── Customer groups (Phase 5 — user-defined dynamic segments) ──────────────

  /** GET /api/storefront/customer-groups/fields — rule builder field catalog. */
  fastify.get('/customer-groups/fields', async (_req: any, reply: any) => {
    return reply.code(200).send(successResponse({ fields: GROUP_FIELDS, goals: CAMPAIGN_GOALS }));
  });

  /**
   * GET /api/storefront/customer-groups
   * Query: projectId, connectorInstanceId. Lists groups with live member counts.
   */
  fastify.get('/customer-groups', async (req: any, reply: any) => {
    const { projectId, connectorInstanceId } = req.query || {};
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    try {
      const db = await getDataPlaneClient(connectorId);
      const groups = await db.customerGroup.findMany({ where: { connectorInstanceId: connectorId }, orderBy: { createdAt: 'desc' } });
      const iso = (d: any) => (d instanceof Date ? d.toISOString() : d ?? null);
      const out = [];
      for (const g of groups) {
        let memberCount = 0;
        try {
          memberCount = await CustomerGroupService.count(db, connectorId, g.rules);
        } catch { /* bad rules → 0 */ }
        out.push({
          id: g.id, name: g.name, description: g.description, color: g.color,
          rules: g.rules, memberCount, createdAt: iso(g.createdAt), updatedAt: iso(g.updatedAt),
        });
      }
      return reply.code(200).send(successResponse({ groups: out }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[customer-groups] list failed');
      return reply.code(500).send(errorResponse('Failed to load groups', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * POST /api/storefront/customer-groups/preview
   * Body: projectId, connectorInstanceId, rules. Returns the current member count
   * for unsaved rules (live feedback in the rule builder).
   */
  fastify.post('/customer-groups/preview', async (req: any, reply: any) => {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const { projectId, connectorInstanceId } = src;
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    try {
      const db = await getDataPlaneClient(connectorId);
      const memberCount = await CustomerGroupService.count(db, connectorId, normalizeRules(src.rules));
      return reply.code(200).send(successResponse({ memberCount }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[customer-groups] preview failed');
      return reply.code(500).send(errorResponse('Failed to preview group', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /** POST /api/storefront/customer-groups — create a group. */
  fastify.post('/customer-groups', async (req: any, reply: any) => {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const { projectId, connectorInstanceId } = src;
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    const name = String(src.name || '').trim();
    if (!name) return reply.code(400).send(errorResponse('name is required', 'BAD_REQUEST'));
    try {
      const db = await getDataPlaneClient(connectorId);
      const created = await db.customerGroup.create({
        data: {
          connectorInstanceId: connectorId,
          siteId: String(projectId),
          name,
          description: src.description ? String(src.description) : null,
          color: src.color ? String(src.color) : null,
          rules: normalizeRules(src.rules) as any,
        },
      });
      return reply.code(201).send(successResponse({ id: created.id }));
    } catch (err: any) {
      if (err?.code === 'P2002') return reply.code(409).send(errorResponse('A group with that name already exists', 'CONFLICT'));
      req.log?.error?.({ err }, '[customer-groups] create failed');
      return reply.code(500).send(errorResponse('Failed to create group', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /** PUT /api/storefront/customer-groups/:id — update a group. */
  fastify.put('/customer-groups/:id', async (req: any, reply: any) => {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const { projectId, connectorInstanceId } = src;
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    const id = String(req.params?.id || '');
    try {
      const db = await getDataPlaneClient(connectorId);
      const existing = await db.customerGroup.findUnique({ where: { id } });
      if (!existing || existing.connectorInstanceId !== connectorId) return reply.code(404).send(errorResponse('Group not found', 'NOT_FOUND'));
      const data: any = {};
      if (src.name != null) data.name = String(src.name).trim();
      if (src.description !== undefined) data.description = src.description ? String(src.description) : null;
      if (src.color !== undefined) data.color = src.color ? String(src.color) : null;
      if (src.rules !== undefined) data.rules = normalizeRules(src.rules) as any;
      await db.customerGroup.update({ where: { id }, data });
      return reply.code(200).send(successResponse({ id }));
    } catch (err: any) {
      if (err?.code === 'P2002') return reply.code(409).send(errorResponse('A group with that name already exists', 'CONFLICT'));
      req.log?.error?.({ err }, '[customer-groups] update failed');
      return reply.code(500).send(errorResponse('Failed to update group', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /** DELETE /api/storefront/customer-groups/:id — delete a group. */
  fastify.delete('/customer-groups/:id', async (req: any, reply: any) => {
    const { projectId, connectorInstanceId } = req.query || {};
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    const id = String(req.params?.id || '');
    try {
      const db = await getDataPlaneClient(connectorId);
      const existing = await db.customerGroup.findUnique({ where: { id } });
      if (!existing || existing.connectorInstanceId !== connectorId) return reply.code(404).send(errorResponse('Group not found', 'NOT_FOUND'));
      await db.customerGroup.delete({ where: { id } });
      return reply.code(200).send(successResponse({ id, deleted: true }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[customer-groups] delete failed');
      return reply.code(500).send(errorResponse('Failed to delete group', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * GET /api/storefront/customer-groups/:id/members
   * Query: projectId, connectorInstanceId; optional limit. Lists current members
   * with a display identity + key metrics.
   */
  fastify.get('/customer-groups/:id/members', async (req: any, reply: any) => {
    const { projectId, connectorInstanceId } = req.query || {};
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    const id = String(req.params?.id || '');
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    try {
      const db = await getDataPlaneClient(connectorId);
      const group = await db.customerGroup.findUnique({ where: { id } });
      if (!group || group.connectorInstanceId !== connectorId) return reply.code(404).send(errorResponse('Group not found', 'NOT_FOUND'));

      const memberIds = await CustomerGroupService.evaluate(db, connectorId, group.rules);
      const slice = memberIds.slice(0, limit);
      const [profiles, metrics] = await Promise.all([
        slice.length ? db.customerProfile.findMany({ where: { id: { in: slice } }, select: { id: true, emailEncrypted: true, metadata: true } }) : [],
        slice.length ? db.customerMetrics.findMany({ where: { connectorInstanceId: connectorId, customerProfileId: { in: slice } }, select: { customerProfileId: true, segment: true, totalRevenue: true, orderCount: true } }) : [],
      ]);
      const metById = new Map<string, any>(metrics.map((m: any) => [m.customerProfileId, m]));
      const members = slice.map((pid: string) => {
        const p = profiles.find((x: any) => x.id === pid);
        const email = p?.emailEncrypted ? decryptEmail(p.emailEncrypted) : null;
        const meta = (p?.metadata as any) || {};
        const m = metById.get(pid);
        return {
          customerProfileId: pid,
          name: [meta.firstName, meta.lastName].filter(Boolean).join(' ').trim() || (email ? email.split('@')[0] : '') || 'Unknown',
          email: maskEmail(email),
          segment: m?.segment ?? null,
          totalLtv: m?.totalRevenue != null ? Number(m.totalRevenue) : null,
          orderCount: m?.orderCount ?? 0,
        };
      });
      return reply.code(200).send(successResponse({ total: memberIds.length, members }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[customer-groups] members failed');
      return reply.code(500).send(errorResponse('Failed to load members', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * POST /api/storefront/customer-groups/:id/run
   * Body: projectId, connectorInstanceId, goal. Starts a BACKGROUND job that
   * generates drafts for every current member (cooldown key = group:<id>) and
   * returns a job id immediately; poll GET /campaign-jobs/:jobId for progress.
   */
  fastify.post('/customer-groups/:id/run', async (req: any, reply: any) => {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const { projectId, connectorInstanceId } = src;
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    const id = String(req.params?.id || '');
    const goal = String(src.goal || '').trim();
    if (!CAMPAIGN_GOALS.some((g) => g.key === goal)) {
      return reply.code(400).send(errorResponse('A valid goal is required', 'BAD_REQUEST'));
    }
    try {
      const db = await getDataPlaneClient(connectorId);
      const group = await db.customerGroup.findUnique({ where: { id } });
      if (!group || group.connectorInstanceId !== connectorId) return reply.code(404).send(errorResponse('Group not found', 'NOT_FOUND'));

      // Don't start a second run while one for this group is already in flight.
      const inflight = await db.campaignRunJob.findFirst({ where: { connectorInstanceId: connectorId, groupId: id, status: 'RUNNING' }, select: { id: true } });
      if (inflight) return reply.code(200).send(successResponse({ jobId: inflight.id, status: 'RUNNING', alreadyRunning: true }));

      const memberIds = await CustomerGroupService.evaluate(db, connectorId, group.rules);
      const conn = await prisma.connectorInstance.findFirst({ where: { id: connectorId }, select: { label: true, syncConfig: true } });
      const storeUrl = deriveStoreUrl(conn?.syncConfig);

      const job = await db.campaignRunJob.create({
        data: { connectorInstanceId: connectorId, siteId: String(projectId), kind: 'group', groupId: id, goal, label: group.name, status: 'RUNNING', total: memberIds.length },
      });

      // Fire-and-forget: generate in the background, updating the job row. The
      // process stays alive (long-running server), so this continues after reply.
      void runGroupJobInBackground(db, job.id, {
        siteId: String(projectId), connectorInstanceId: connectorId, storeName: conn?.label || 'our store', storeUrl,
      }, memberIds, goal, id, req.log);

      return reply.code(202).send(successResponse({ jobId: job.id, status: 'RUNNING', total: memberIds.length }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[customer-groups] run failed');
      return reply.code(500).send(errorResponse('Failed to start group campaign', 'INTERNAL_SERVER_ERROR'));
    }
  });

  /**
   * GET /api/storefront/campaign-jobs/:id — progress of a background run.
   * GET /api/storefront/campaign-jobs?groupId= — recent jobs (for last-run status).
   */
  fastify.get('/campaign-jobs/:id', async (req: any, reply: any) => {
    const { projectId, connectorInstanceId } = req.query || {};
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    try {
      const db = await getDataPlaneClient(connectorId);
      const job = await db.campaignRunJob.findUnique({ where: { id: String(req.params?.id || '') } });
      if (!job || job.connectorInstanceId !== connectorId) return reply.code(404).send(errorResponse('Job not found', 'NOT_FOUND'));
      return reply.code(200).send(successResponse({ job: serializeJob(job) }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[campaign-jobs] get failed');
      return reply.code(500).send(errorResponse('Failed to load job', 'INTERNAL_SERVER_ERROR'));
    }
  });

  fastify.get('/campaign-jobs', async (req: any, reply: any) => {
    const { projectId, connectorInstanceId, groupId } = req.query || {};
    const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
    if (!connectorId) return;
    try {
      const db = await getDataPlaneClient(connectorId);
      const where: any = { connectorInstanceId: connectorId };
      if (groupId) where.groupId = String(groupId);
      const jobs = await db.campaignRunJob.findMany({ where, orderBy: { startedAt: 'desc' }, take: 50 });
      return reply.code(200).send(successResponse({ jobs: jobs.map(serializeJob) }));
    } catch (err: any) {
      req.log?.error?.({ err }, '[campaign-jobs] list failed');
      return reply.code(500).send(errorResponse('Failed to load jobs', 'INTERNAL_SERVER_ERROR'));
    }
  });
};

/** Run a group campaign in the background, updating the job row as it goes. */
async function runGroupJobInBackground(
  db: any,
  jobId: string,
  scope: { siteId: string; connectorInstanceId: string; storeName: string; storeUrl: string | null },
  memberIds: string[],
  goal: string,
  groupId: string,
  log?: any,
): Promise<void> {
  try {
    await CampaignTriggerService.runForProfiles(db, scope, memberIds, { goal, trigger: `group:${groupId}` }, {
      onProgress: async (p) => {
        try {
          await db.campaignRunJob.update({ where: { id: jobId }, data: { processed: p.processed, generated: p.generated, skipped: p.skipped } });
        } catch { /* best-effort */ }
      },
    });
    await db.campaignRunJob.update({ where: { id: jobId }, data: { status: 'COMPLETED', finishedAt: new Date() } });
  } catch (err: any) {
    log?.error?.({ err }, '[campaign-jobs] background run failed');
    try {
      await db.campaignRunJob.update({ where: { id: jobId }, data: { status: 'FAILED', error: String(err?.message || err).slice(0, 500), finishedAt: new Date() } });
    } catch { /* best-effort */ }
  }
}

function serializeJob(j: any) {
  const iso = (d: any) => (d instanceof Date ? d.toISOString() : d ?? null);
  return {
    id: j.id, kind: j.kind, groupId: j.groupId, goal: j.goal, label: j.label,
    status: j.status, total: j.total, processed: j.processed, generated: j.generated, skipped: j.skipped,
    error: j.error, startedAt: iso(j.startedAt), finishedAt: iso(j.finishedAt),
  };
}

/** Campaign goals the UI can pick from (label + the PitchService goal key). */
const CAMPAIGN_GOALS: Array<{ key: string; label: string }> = [
  { key: 'cart_recovery', label: 'Cart recovery' },
  { key: 'win_back', label: 'Win back' },
  { key: 'welcome_offer', label: 'Welcome offer' },
  { key: 'vip_appreciation', label: 'VIP appreciation' },
];

/**
 * Storefront base URL for product links + the "Shop now" button in emails:
 * explicit syncConfig.storeUrl wins, else derive from the Shopify shopDomain.
 */
function deriveStoreUrl(syncConfig: any): string | null {
  const cfg = (syncConfig || {}) as Record<string, any>;
  const rawStoreUrl = String(cfg.storeUrl || '').trim();
  const shopDomain = String(cfg.shopDomain || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return rawStoreUrl || (shopDomain ? `https://${shopDomain}` : null);
}

/** Mask an email for internal display: `da***@domain.com` (null-safe). */
function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return null;
  const head = local.slice(0, 2);
  return `${head}${local.length > 2 ? '***' : '*'}@${domain}`;
}
