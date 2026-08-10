import { hashEmail } from '@kpi-platform/db';

/**
 * CustomerMetricsService — the Phase 2 "history" half of the CDP golden record
 * (docs/CDP-IMPLEMENTATION-PLAN.md §5.1). Computes transactional intelligence
 * (RFM / CLTV / churn / segment) per customer directly from canonical_orders and
 * persists it to customer_metrics, plus stamps totalLtv onto customer_profiles.
 *
 * Native TypeScript port of ai-agent-ecom's Python analytics (rfm / cltv_analysis
 * / churn_analysis / segmentation_service) — same formulas, no Python/infra.
 *
 * Orders carry the customer only inside metadata (no FK), so orders are mapped to
 * a profile by platform customer id (externalIds.<platform>) first, then email hash.
 *
 * `db` is the tenant data-plane Prisma client (getDataPlaneClient); typed `any` to
 * match the sync-service convention. (Distinct from the existing
 * CustomerAnalyticsService, which covers cohort/attribution over profiles.)
 */

const ASSUMED_LIFESPAN_YEARS = 2; // CLTV projection horizon (mirrors the source engine)

export interface RecomputeResult {
  profilesUpdated: number;
  ordersProcessed: number;
  ordersUnmatched: number;
}

interface Agg {
  profileId: string;
  orderCount: number;
  totalRevenue: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
}

export class CustomerMetricsService {
  /** Recompute metrics for every customer of a connector and persist them. */
  static async recomputeForConnector(
    db: any,
    scope: { siteId: string; connectorInstanceId: string },
    now: Date = new Date(),
  ): Promise<RecomputeResult> {
    const { siteId, connectorInstanceId } = scope;

    // 1) Profile lookup maps (platform id + email hash → profileId).
    const profiles: any[] = await db.customerProfile.findMany({
      where: { connectorInstanceId },
      select: { id: true, externalIds: true, emailHash: true },
    });
    const byExternalId = new Map<string, string>();
    const byEmailHash = new Map<string, string>();
    // Guards against an order still pointing at a profile that has since been merged
    // away — a stale link must fall through to the maps, not create a ghost customer.
    const liveProfileIds = new Set<string>(profiles.map((p: any) => p.id));
    for (const p of profiles) {
      for (const v of Object.values(p.externalIds || {})) {
        if (v != null) byExternalId.set(String(v), p.id);
      }
      if (p.emailHash) byEmailHash.set(p.emailHash, p.id);
    }

    // 2) Aggregate orders per profile.
    const orders: any[] = await db.canonicalOrder.findMany({
      where: { connectorInstanceId },
      select: { totalAmount: true, refundedAmount: true, placedAt: true, metadata: true, customerProfileId: true },
    });

    const aggs = new Map<string, Agg>();
    let ordersProcessed = 0;
    let ordersUnmatched = 0;
    for (const o of orders) {
      const meta = (o.metadata as any) || {};
      const customer = meta.customer;
      const extId = customer?.id != null ? String(customer.id) : null;
      // Prefer the explicit hash (post-scrub). Fall back to hashing a raw email
      // only if one is still present (pre-scrub rows); a scrubbed email is already
      // a hash (no "@") and is ignored here.
      const rawEmail = typeof customer?.email === 'string' ? customer.email : null;
      const emailHash = meta.customerEmailHash || (rawEmail && rawEmail.includes('@') ? hashEmail(rawEmail) : null);
      // The resolved column wins: it is the only signal that covers offline/POS rows
      // (matched on phone or loyalty id, which no email/external-id map can reach).
      // The in-memory maps stay as the fallback for orders written before the column
      // existed and never re-synced.
      const profileId =
        (o.customerProfileId && liveProfileIds.has(o.customerProfileId) ? o.customerProfileId : null) ||
        (extId && byExternalId.get(extId)) ||
        (emailHash && byEmailHash.get(emailHash)) ||
        null;
      if (!profileId) {
        ordersUnmatched++;
        continue;
      }
      ordersProcessed++;

      const revenue = Math.max(0, Number(o.totalAmount || 0) - Number(o.refundedAmount || 0));
      const placedAt = o.placedAt ? new Date(o.placedAt) : null;
      const a =
        aggs.get(profileId) ||
        ({ profileId, orderCount: 0, totalRevenue: 0, firstOrderAt: null, lastOrderAt: null } as Agg);
      a.orderCount += 1;
      a.totalRevenue += revenue;
      if (placedAt) {
        if (!a.firstOrderAt || placedAt < a.firstOrderAt) a.firstOrderAt = placedAt;
        if (!a.lastOrderAt || placedAt > a.lastOrderAt) a.lastOrderAt = placedAt;
      }
      aggs.set(profileId, a);
    }

    const list = [...aggs.values()];
    if (list.length === 0) return { profilesUpdated: 0, ordersProcessed, ordersUnmatched };

    // 3) Population distributions for RFM scoring + segment thresholds.
    const recencyDaysOf = (a: Agg) => (a.lastOrderAt ? daysBetween(a.lastOrderAt, now) : 9999);
    const revenues = list.map((a) => a.totalRevenue);
    const frequencies = list.map((a) => a.orderCount);
    const recencies = list.map((a) => recencyDaysOf(a));

    const revP = percentiles(revenues);
    const freqP = percentiles(frequencies);

    // 4) Per-customer metrics.
    let updated = 0;
    for (const a of list) {
      const recencyDays = recencyDaysOf(a);
      const aov = a.orderCount > 0 ? a.totalRevenue / a.orderCount : 0;
      // Tenure = first order → now (customer age), so a short burst of orders is
      // annualized over real elapsed time rather than a near-zero active window.
      const tenureMonths = a.firstOrderAt ? Math.max(1, monthsBetween(a.firstOrderAt, now)) : 1;
      const frequencyMonthly = a.orderCount / tenureMonths;

      // CLTV projection (mirrors ai-agent-ecom cltv_analysis). Frequency is capped
      // for the projection so a new customer's early burst can't explode the value.
      const projFrequency = Math.min(frequencyMonthly, 2);
      const cltv = aov * projFrequency * 12 * ASSUMED_LIFESPAN_YEARS;
      const cltvTier =
        cltv >= 50000 ? 'elite' : cltv >= 20000 ? 'high' : cltv >= 10000 ? 'medium' : cltv >= 5000 ? 'moderate' : 'standard';

      // RFM (1-5 via population percentile rank; recency inverted — recent = high).
      const rfmR = scoreInverted(recencyDays, recencies);
      const rfmF = score(a.orderCount, frequencies);
      const rfmM = score(a.totalRevenue, revenues);
      const rfmScore = rfmR + rfmF + rfmM;

      // Churn heuristic (mirrors customer_profile_analysis churn_risk).
      let churn = 0;
      if (recencyDays > 90) churn += 0.4;
      if (a.orderCount < 2) churn += 0.3;
      if (a.totalRevenue < 100) churn += 0.3;
      churn = Math.min(1, churn);
      const churnLevel = churn >= 0.7 ? 'critical' : churn >= 0.5 ? 'high' : churn >= 0.3 ? 'medium' : 'low';

      // Segment (mirrors segmentation_service rules; LTV = historical revenue).
      const segment = classifySegment(a.totalRevenue, a.orderCount, recencyDays, revP, freqP);

      const payload = {
        orderCount: a.orderCount,
        totalRevenue: round2(a.totalRevenue),
        avgOrderValue: round2(aov),
        firstOrderAt: a.firstOrderAt,
        lastOrderAt: a.lastOrderAt,
        recencyDays,
        frequencyMonthly: round2(frequencyMonthly),
        rfmRecency: rfmR,
        rfmFreq: rfmF,
        rfmMonetary: rfmM,
        rfmScore,
        cltv: round2(cltv),
        cltvTier,
        churnRisk: round3(churn),
        churnLevel,
        segment,
        computedAt: now,
      };

      await db.customerMetrics.upsert({
        where: { connectorInstanceId_customerProfileId: { connectorInstanceId, customerProfileId: a.profileId } },
        create: { customerProfileId: a.profileId, siteId, connectorInstanceId, ...payload },
        update: payload,
      });

      // Stamp the historical lifetime value onto the golden record.
      await db.customerProfile.update({
        where: { id: a.profileId },
        data: { totalLtv: round2(a.totalRevenue) },
      });
      updated++;
    }

    return { profilesUpdated: updated, ordersProcessed, ordersUnmatched };
  }
}

// ── segmentation (ai-agent-ecom segmentation_service rules) ──────────────────
function classifySegment(ltv: number, freq: number, recency: number, revP: Percentiles, freqP: Percentiles): string {
  if (recency > 180) return 'LOST';
  if (ltv >= revP.p75 && freq >= freqP.p75 && recency <= 30) return 'VIP';
  if (ltv >= revP.p75 && freq >= freqP.p50 && recency <= 60) return 'HIGH_VALUE';
  if (ltv >= revP.p50 && freq >= freqP.p25 && recency > 120 && recency <= 180) return 'AT_RISK';
  return 'REGULAR';
}

// ── numeric helpers ─────────────────────────────────────────────────────────
interface Percentiles {
  p25: number;
  p50: number;
  p75: number;
}
function percentiles(values: number[]): Percentiles {
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => {
    if (s.length === 0) return 0;
    const idx = (s.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };
  return { p25: q(0.25), p50: q(0.5), p75: q(0.75) };
}
/** 1-5 score by percentile rank within the population (higher value → higher score). */
function score(value: number, population: number[]): number {
  if (population.length <= 1) return 3;
  const below = population.filter((v) => v < value).length;
  const rank = below / (population.length - 1); // 0..1
  return Math.min(5, Math.max(1, Math.round(1 + rank * 4)));
}
/** 1-5 score where a LOWER value is better (recency). */
function scoreInverted(value: number, population: number[]): number {
  if (population.length <= 1) return 3;
  const above = population.filter((v) => v > value).length;
  const rank = above / (population.length - 1);
  return Math.min(5, Math.max(1, Math.round(1 + rank * 4)));
}
function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}
function monthsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (86_400_000 * 30.44);
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
