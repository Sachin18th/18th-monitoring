/**
 * BehavioralFusionService — the Phase 3 fusion layer (docs/CDP-IMPLEMENTATION-PLAN.md §5.2/§6.1).
 *
 * Combines LIVE behavioral signals (storefront_sessions/events, bridged to a
 * profile in Phase 1) with HISTORICAL metrics (customer_metrics, Phase 2) into
 * "fused segments" that require BOTH — the thing neither the live app nor the
 * history app could express alone. Persists one snapshot per customer so the
 * customer list and (Phase 4) campaign triggers can target these segments.
 *
 * `db` is the tenant data-plane Prisma client; typed `any` per convention.
 */

const STAGE_RANK: Record<string, number> = { visit: 0, product_view: 1, add_to_cart: 2, checkout: 3, purchase: 4 };

/** Fused segments — each needs a live signal AND a historical fact. */
export const FUSED_SEGMENTS = [
  'HIGH_VALUE_ABANDONER',
  'CART_ABANDONER',
  'LAPSED_REACTIVATING',
  'NEW_HIGH_INTENT',
  'LOYAL_ACTIVE',
] as const;
export type FusedSegment = (typeof FUSED_SEGMENTS)[number];

const DAY = 86_400_000;

export interface FusionResult {
  profilesSnapshotted: number;
  bySegment: Record<string, number>;
}

interface LiveAgg {
  lastSessionAt: Date | null;
  sessionsLast30d: number;
  furthestStage: string;
  cartAbandonedAt: Date | null;
  latestPurchaseAt: Date | null;
  purchasedRecently: boolean;
  productIds: Set<string>;
}

export class BehavioralFusionService {
  /** Recompute + persist behavioral snapshots (live signals + fused segments) for a connector. */
  static async recomputeForConnector(
    db: any,
    scope: { siteId: string; connectorInstanceId: string },
    now: Date = new Date(),
  ): Promise<FusionResult> {
    const { siteId, connectorInstanceId } = scope;

    // Historical metrics per profile.
    const metricsRows: any[] = await db.customerMetrics.findMany({
      where: { connectorInstanceId },
      select: { customerProfileId: true, segment: true, recencyDays: true, orderCount: true, lastOrderAt: true },
    });
    const metricsByProfile = new Map<string, any>(metricsRows.map((m) => [m.customerProfileId, m]));

    // Live sessions bridged to a profile.
    const sessions: any[] = await db.storefrontSession.findMany({
      where: { connectorInstanceId, customerProfileId: { not: null } },
      select: {
        customerProfileId: true,
        funnelStage: true,
        checkoutStarted: true,
        purchaseCompleted: true,
        startedAt: true,
        lastActiveAt: true,
        productIdsViewed: true,
      },
    });

    // product_id → category names (for live category affinity).
    const catRows: any[] = await db.canonicalProductCategory.findMany({
      where: { connectorInstanceId },
      select: { productId: true, categoryName: true },
    });
    const catByProduct = new Map<string, string[]>();
    for (const c of catRows) {
      if (!c.categoryName) continue;
      const arr = catByProduct.get(String(c.productId)) || [];
      arr.push(c.categoryName);
      catByProduct.set(String(c.productId), arr);
    }

    // Aggregate live signals per profile.
    const agg = new Map<string, LiveAgg>();
    const cutoff30 = new Date(now.getTime() - 30 * DAY);
    for (const s of sessions) {
      const pid = s.customerProfileId as string;
      const a =
        agg.get(pid) ||
        ({ lastSessionAt: null, sessionsLast30d: 0, furthestStage: 'visit', cartAbandonedAt: null, latestPurchaseAt: null, purchasedRecently: false, productIds: new Set<string>() } as LiveAgg);
      const lastActive = s.lastActiveAt ? new Date(s.lastActiveAt) : null;
      const started = s.startedAt ? new Date(s.startedAt) : null;
      if (lastActive && (!a.lastSessionAt || lastActive > a.lastSessionAt)) a.lastSessionAt = lastActive;
      if (started && started >= cutoff30) a.sessionsLast30d += 1;
      if ((STAGE_RANK[s.funnelStage] ?? 0) > (STAGE_RANK[a.furthestStage] ?? 0)) a.furthestStage = s.funnelStage;
      // Cart abandon = reached checkout, no purchase in that session.
      if (s.checkoutStarted && !s.purchaseCompleted && lastActive && (!a.cartAbandonedAt || lastActive > a.cartAbandonedAt)) {
        a.cartAbandonedAt = lastActive;
      }
      if (s.purchaseCompleted) {
        a.purchasedRecently = true;
        if (lastActive && (!a.latestPurchaseAt || lastActive > a.latestPurchaseAt)) a.latestPurchaseAt = lastActive;
      }
      for (const p of Array.isArray(s.productIdsViewed) ? s.productIdsViewed : []) a.productIds.add(String(p));
      agg.set(pid, a);
    }

    const bySegment: Record<string, number> = {};
    let count = 0;
    for (const [pid, a] of agg) {
      const m = metricsByProfile.get(pid) || null;
      const lastOrderAt = m?.lastOrderAt ? new Date(m.lastOrderAt) : null;

      // A checkout is only truly "abandoned" if there was NO completion at/after it —
      // either a live purchase session (pixel checkout_complete) OR a synced order
      // placed since. This is what stops a customer who actually bought (like a
      // completed Shopify order the theme script couldn't see) being called an abandoner.
      const completedAfterAbandon =
        !!a.cartAbandonedAt &&
        ((!!a.latestPurchaseAt && a.latestPurchaseAt >= a.cartAbandonedAt) ||
          (!!lastOrderAt && lastOrderAt >= a.cartAbandonedAt));
      const effectiveAbandonAt = a.cartAbandonedAt && !completedAfterAbandon ? a.cartAbandonedAt : null;
      const purchased =
        a.purchasedRecently || (!!lastOrderAt && (!a.cartAbandonedAt || lastOrderAt >= a.cartAbandonedAt));

      const fused = this.deriveFusedSegments(a, m, now, { effectiveAbandonAt, purchased });
      for (const f of fused) bySegment[f] = (bySegment[f] || 0) + 1;

      const recentCategories = this.topCategories(a.productIds, catByProduct, 5);
      const activeLast7d = a.lastSessionAt ? now.getTime() - a.lastSessionAt.getTime() <= 7 * DAY : false;

      const payload = {
        siteId,
        lastSessionAt: a.lastSessionAt,
        sessionsLast30d: a.sessionsLast30d,
        liveFurthestStage: a.furthestStage,
        cartAbandonedAt: effectiveAbandonAt,
        recentCategories,
        fusedSegments: fused,
        signals: {
          activeLast7d,
          purchased,
          purchasedRecently: a.purchasedRecently,
          historicalSegment: m?.segment ?? null,
          recencyDays: m?.recencyDays ?? null,
          orderCount: m?.orderCount ?? 0,
        },
        computedAt: now,
      };

      await db.customerBehaviorSnapshot.upsert({
        where: { connectorInstanceId_customerProfileId: { connectorInstanceId, customerProfileId: pid } },
        create: { customerProfileId: pid, connectorInstanceId, ...payload },
        update: payload,
      });
      count += 1;
    }

    return { profilesSnapshotted: count, bySegment };
  }

  /**
   * The fusion rules — every one needs a live signal AND a historical fact.
   * `ctx.effectiveAbandonAt` is the abandon time AFTER reconciling with any
   * completion (live purchase or synced order); `ctx.purchased` is whether the
   * customer completed a purchase since (so we don't mislabel actual buyers).
   */
  private static deriveFusedSegments(
    a: LiveAgg,
    m: any | null,
    now: Date,
    ctx: { effectiveAbandonAt: Date | null; purchased: boolean },
  ): FusedSegment[] {
    const out: FusedSegment[] = [];
    const seg = m?.segment ?? null;
    const orderCount = m?.orderCount ?? 0;
    const recencyDays = m?.recencyDays ?? null;
    const highValue = seg === 'VIP' || seg === 'HIGH_VALUE';
    const abandonedRecently = ctx.effectiveAbandonAt ? now.getTime() - ctx.effectiveAbandonAt.getTime() <= 7 * DAY : false;
    const activeLast7d = a.lastSessionAt ? now.getTime() - a.lastSessionAt.getTime() <= 7 * DAY : false;
    const reachedCartLive = (STAGE_RANK[a.furthestStage] ?? 0) >= STAGE_RANK.add_to_cart;

    // Whether they completed a purchase in their LIVE activity (not just historically).
    const purchasedLive = !!a.latestPurchaseAt || a.furthestStage === 'purchase';

    // High-value customer who abandoned a cart and has NOT completed since — hot recovery target.
    if (highValue && abandonedRecently) out.push('HIGH_VALUE_ABANDONER');
    // Any returning customer who added to cart live and didn't check out — general cart nudge.
    // Uses live-purchase status (a past order doesn't cancel a fresh, unfinished cart).
    else if (reachedCartLive && !purchasedLive && activeLast7d && orderCount > 0) out.push('CART_ABANDONER');
    // Lapsed buyer who has come back to browse — strike while they're here.
    if ((recencyDays != null && recencyDays > 90) || seg === 'LOST' || seg === 'AT_RISK') {
      if (a.sessionsLast30d >= 1) out.push('LAPSED_REACTIVATING');
    }
    // No purchase history and no completion yet, but strong live intent (reached cart/checkout).
    if (orderCount === 0 && !ctx.purchased && reachedCartLive && activeLast7d) out.push('NEW_HIGH_INTENT');
    // Engaged high-value customer active recently and not an open abandoner.
    if (highValue && a.sessionsLast30d >= 1 && !abandonedRecently) out.push('LOYAL_ACTIVE');

    return out;
  }

  private static topCategories(productIds: Set<string>, catByProduct: Map<string, string[]>, limit: number): string[] {
    const counts = new Map<string, number>();
    for (const pid of productIds) {
      for (const c of catByProduct.get(pid) || []) counts.set(c, (counts.get(c) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([c]) => c);
  }
}
