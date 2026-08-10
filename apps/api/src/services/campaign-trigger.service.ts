import { decryptEmail } from '@kpi-platform/db';
import { RecommendationService } from './recommendation.service';
import { PitchService } from './pitch.service';
import { BehavioralFusionService } from './behavioral-fusion.service';

/**
 * CampaignTriggerService — the Phase 4/5 activation layer (docs/CDP-IMPLEMENTATION-PLAN.md §6.2).
 *
 * Turns a target into a personalized, ready-to-send email draft: resolve the
 * customer → pull recommendations + history (+ real cart for recovery) → generate
 * a pitch (PitchService). Guards: per-customer/trigger COOLDOWN and marketing
 * CONSENT. Drafts persist as CampaignMessage (status GENERATED) for approval —
 * nothing is auto-sent here. Two entry points share one generator:
 *   - runForConnector — fused-segment triggers (Phase 4)
 *   - runForProfiles  — an explicit set of customers with a chosen goal, e.g. a
 *                       user-defined customer group (Phase 5)
 *
 * `db` is the tenant data-plane Prisma client; typed `any` per convention.
 */

// Which fused segment fires which campaign, highest priority first.
const TRIGGERS: Array<{ segment: string; goal: string }> = [
  { segment: 'HIGH_VALUE_ABANDONER', goal: 'cart_recovery' },
  { segment: 'CART_ABANDONER', goal: 'cart_recovery' },
  { segment: 'LAPSED_REACTIVATING', goal: 'win_back' },
  { segment: 'NEW_HIGH_INTENT', goal: 'welcome_offer' },
  { segment: 'LOYAL_ACTIVE', goal: 'vip_appreciation' },
];

const DAY = 86_400_000;

export interface RunResult {
  generated: number;
  skipped: number;
  byTrigger: Record<string, number>;
  reasons: Record<string, number>;
}

interface GenCtx {
  siteId: string;
  connectorInstanceId: string;
  storeName: string;
  storeUrl: string | null;
}

export class CampaignTriggerService {
  /** Phase 4: evaluate fused-segment triggers and generate drafts for matches. */
  static async runForConnector(
    db: any,
    scope: { siteId: string; connectorInstanceId: string; storeName?: string; storeUrl?: string | null },
    opts: { cooldownDays?: number; now?: Date; customerProfileId?: string; segment?: string } = {},
  ): Promise<RunResult> {
    const ctx = toCtx(scope);
    const now = opts.now ?? new Date();

    // Refresh fused segments first so generation reflects the latest live behavior
    // (e.g. a cart added minutes ago), not a stale snapshot.
    await BehavioralFusionService.recomputeForConnector(db, { siteId: ctx.siteId, connectorInstanceId: ctx.connectorInstanceId }, now);

    const where: any = { connectorInstanceId: ctx.connectorInstanceId };
    if (opts.customerProfileId) where.customerProfileId = opts.customerProfileId;
    const snapshots: any[] = await db.customerBehaviorSnapshot.findMany({ where });

    const result = emptyResult();
    for (const snap of snapshots) {
      const fused: string[] = Array.isArray(snap.fusedSegments) ? snap.fusedSegments : [];
      // If a specific trigger was requested, only generate for customers who match
      // it (and use it as the trigger). Otherwise pick the highest-priority match.
      let trig: { segment: string; goal: string } | undefined;
      if (opts.segment) {
        if (!fused.includes(opts.segment)) continue;
        trig = TRIGGERS.find((t) => t.segment === opts.segment);
      } else {
        trig = TRIGGERS.find((t) => fused.includes(t.segment));
      }
      if (!trig) continue; // no triggerable segment for this customer
      const r = await this.generateForProfile(db, ctx, snap.customerProfileId, { goal: trig.goal, trigger: trig.segment }, { cooldownDays: opts.cooldownDays, now });
      applyOutcome(result, r, trig.segment);
    }
    return result;
  }

  /**
   * Phase 5: generate drafts for an explicit list of customers with a chosen goal
   * (e.g. a user-defined group). `trigger` is used as the cooldown key.
   */
  static async runForProfiles(
    db: any,
    scope: { siteId: string; connectorInstanceId: string; storeName?: string; storeUrl?: string | null },
    profileIds: string[],
    spec: { goal: string; trigger: string },
    opts: {
      cooldownDays?: number;
      now?: Date;
      onProgress?: (p: { processed: number; generated: number; skipped: number }) => void | Promise<void>;
    } = {},
  ): Promise<RunResult> {
    const ctx = toCtx(scope);
    const now = opts.now ?? new Date();
    const result = emptyResult();
    let processed = 0;
    for (const profileId of profileIds) {
      const r = await this.generateForProfile(db, ctx, profileId, spec, { cooldownDays: opts.cooldownDays, now });
      applyOutcome(result, r, spec.trigger);
      processed++;
      if (opts.onProgress) {
        try {
          await opts.onProgress({ processed, generated: result.generated, skipped: result.skipped });
        } catch { /* progress update best-effort */ }
      }
    }
    return result;
  }

  /**
   * Generate + persist one draft for one customer, honoring consent + cooldown.
   * Returns an outcome instead of throwing so a batch keeps going.
   */
  static async generateForProfile(
    db: any,
    ctx: GenCtx,
    profileId: string,
    spec: { goal: string; trigger: string },
    opts: { cooldownDays?: number; now?: Date } = {},
  ): Promise<{ status: 'generated' | 'skipped'; reason?: string }> {
    const cooldownDays = opts.cooldownDays ?? 7;
    const now = opts.now ?? new Date();
    const { connectorInstanceId, siteId, storeName, storeUrl } = ctx;

    const profile = await db.customerProfile.findUnique({ where: { id: profileId } });
    if (!profile) return { status: 'skipped', reason: 'no_profile' };

    // Consent: respect an explicit opt-out; default allow.
    const meta = (profile.metadata as any) || {};
    if (meta.acceptsMarketing === false) return { status: 'skipped', reason: 'no_consent' };

    // Cooldown: don't regenerate the same trigger for the same customer too soon.
    const cutoff = new Date(now.getTime() - cooldownDays * DAY);
    const recent = await db.campaignMessage.findFirst({
      where: { connectorInstanceId, customerProfileId: profileId, trigger: spec.trigger, createdAt: { gte: cutoff } },
      select: { id: true },
    });
    if (recent) return { status: 'skipped', reason: 'cooldown' };

    try {
      // For cart recovery, lead with the items the customer ACTUALLY left in their
      // cart (live add_to_cart events), then top up with recommendations.
      let recs = await RecommendationService.forCustomer(db, { connectorInstanceId }, profileId, 3);
      if (spec.goal === 'cart_recovery') {
        const cart = await RecommendationService.liveCartItems(db, { connectorInstanceId }, profileId, { limit: 3 });
        if (cart.length) {
          const cartIds = new Set(cart.map((c) => c.productId).filter(Boolean));
          const cartNames = new Set(cart.map((c) => (c.name || '').toLowerCase()));
          const fill = recs.filter((r) => !cartIds.has(r.productId) && !cartNames.has((r.name || '').toLowerCase()));
          recs = [...cart, ...fill].slice(0, 3);
        }
      }

      const [metrics, snap] = await Promise.all([
        db.customerMetrics.findUnique({
          where: { connectorInstanceId_customerProfileId: { connectorInstanceId, customerProfileId: profileId } },
          select: { segment: true, totalRevenue: true },
        }),
        db.customerBehaviorSnapshot.findUnique({
          where: { connectorInstanceId_customerProfileId: { connectorInstanceId, customerProfileId: profileId } },
          select: { recentCategories: true },
        }),
      ]);

      // Resolve product handles → storefront product-page URLs for the email
      // (RecItem carries imageUrl but not handle, which lives in product metadata).
      const prodIds = recs.map((r) => r.productId).filter(Boolean);
      const prodRows: any[] = prodIds.length
        ? await db.canonicalProduct.findMany({ where: { connectorInstanceId, productId: { in: prodIds } }, select: { productId: true, metadata: true } })
        : [];
      const handleById = new Map<string, string | null>(prodRows.map((p) => [String(p.productId), ((p.metadata as any)?.handle as string) ?? null]));
      const productUrl = (pid: string): string | null => {
        const h = handleById.get(String(pid));
        if (storeUrl && h) return `${storeUrl.replace(/\/$/, '')}/products/${h}`;
        return storeUrl || null;
      };

      const email = profile.emailEncrypted ? decryptEmail(profile.emailEncrypted) : null;
      const customerName = deriveName(meta, email);

      const pitch = await PitchService.generate({
        customerName,
        email,
        segment: metrics?.segment ?? null,
        totalLtv: profile.totalLtv != null ? Number(profile.totalLtv) : metrics?.totalRevenue != null ? Number(metrics.totalRevenue) : null,
        favoriteCategories: recs.map((r) => r.category).filter((c): c is string => !!c).slice(0, 3),
        browsingCategories: Array.isArray(snap?.recentCategories) ? snap.recentCategories.slice(0, 3) : [],
        goal: spec.goal,
        trigger: spec.trigger,
        storeName,
        storeUrl,
        recommendedProducts: recs.map((r) => ({ name: r.name, price: r.price, reason: r.reason, imageUrl: r.imageUrl, url: productUrl(r.productId) })),
      });

      await db.campaignMessage.create({
        data: {
          customerProfileId: profileId,
          siteId,
          connectorInstanceId,
          trigger: spec.trigger,
          goal: spec.goal,
          channel: 'email',
          subject: pitch.subject,
          body: pitch.body,
          recommendedProducts: recs.map((r) => ({ productId: r.productId, name: r.name, price: r.price, imageUrl: r.imageUrl, url: productUrl(r.productId) })),
          generator: pitch.generator,
          status: 'GENERATED',
        },
      });
      return { status: 'generated' };
    } catch (err: any) {
      console.error('[CampaignTriggerService] generation failed for profile', profileId, err?.message);
      return { status: 'skipped', reason: 'error' };
    }
  }
}

function toCtx(scope: { siteId: string; connectorInstanceId: string; storeName?: string; storeUrl?: string | null }): GenCtx {
  return { siteId: scope.siteId, connectorInstanceId: scope.connectorInstanceId, storeName: scope.storeName || 'our store', storeUrl: scope.storeUrl || null };
}

function emptyResult(): RunResult {
  return { generated: 0, skipped: 0, byTrigger: {}, reasons: {} };
}

function applyOutcome(result: RunResult, r: { status: 'generated' | 'skipped'; reason?: string }, trigger: string): void {
  if (r.status === 'generated') {
    result.generated++;
    result.byTrigger[trigger] = (result.byTrigger[trigger] || 0) + 1;
  } else {
    result.skipped++;
    const k = r.reason || 'skipped';
    result.reasons[k] = (result.reasons[k] || 0) + 1;
  }
}

function deriveName(meta: any, email: string | null): string {
  if (meta?.firstName) return String(meta.firstName);
  if (email) {
    const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return 'there';
}
