import { encryptEmail } from '@kpi-platform/db';
import crypto from 'crypto';

/**
 * IdentityResolver — the CDP identity-resolution core (Phase 1).
 * See docs/CDP-IMPLEMENTATION-PLAN.md §4.
 *
 * Collapses the many identifiers a shopper is seen under (anonymous `visitorId`,
 * per-visit `sessionId`, `emailHash`, platform `externalId`) into ONE persistent
 * `CustomerProfile` (the golden record), and maintains the `identity_links` graph
 * that records every identifier → profile edge.
 *
 * Three match strengths:
 *   - deterministic (emailHash / externalId, confidence 1.0) — strong, wins on conflict
 *   - phone (phoneHash, confidence 0.9) — the primary join key for offline/POS orders,
 *     strong enough to identify but never allowed to merge two emailed profiles
 *   - probabilistic (visitorId / sessionId, confidence < 1.0) — stitches anonymous behavior
 *
 * Both the live ingest path (storefront-tracking) and the batch sync path
 * (shopify-*-sync) call `resolve()` so identity is computed identically everywhere.
 *
 * `db` is the tenant data-plane Prisma client (from getDataPlaneClient); typed as
 * `any` to match the convention in the sync services (which avoid importing the
 * generated tenant client type).
 */

const CONF_DETERMINISTIC = 1.0;
/**
 * Phone sits between deterministic and probabilistic. It is a strong join key for
 * offline/POS orders (often the ONLY identifier a till captures), but phone numbers
 * are shared far more than email addresses — households, and POS staff who key in
 * their own number for a walk-in. So it identifies confidently, yet is not allowed
 * to merge two profiles that each already carry a different email (see resolve()).
 */
const CONF_PHONE = 0.9;
const CONF_PROBABILISTIC = 0.5;

export type IdentifierType = 'email_hash' | 'external_id' | 'phone_hash' | 'visitor_id' | 'session_id';

export interface ResolveScope {
  siteId: string;
  connectorInstanceId: string;
}

export interface ResolveSignals {
  /** Deterministic: SHA-256 email hash (see @kpi-platform/db hashEmail). */
  emailHash?: string | null;
  /** Reversible encrypted email envelope for dashboard display (never plaintext). */
  emailEncrypted?: string | null;
  /** Strong-but-shareable: SHA-256 phone hash (see @kpi-platform/db hashPhone). */
  phoneHash?: string | null;
  /** Deterministic: platform customer id, e.g. Shopify numeric id. */
  externalId?: string | number | null;
  /** Which platform the externalId belongs to (external_ids JSON key). */
  platform?: string | null;
  /** Probabilistic: stable per-browser id. */
  visitorId?: string | null;
  /** Probabilistic: per-visit id. */
  sessionId?: string | null;
  /** Optional lifecycle hint when creating (e.g. 'RETURNING' for a known customer). */
  lifecycleHint?: string | null;
  /** Free-form provenance recorded in profile.metadata on create. */
  source?: string | null;
}

export interface ResolveResult {
  profileId: string;
  created: boolean;
  /** Strongest identifier that matched an existing profile, or null if newly created. */
  matchedBy: IdentifierType | null;
  /** True if a probabilistic profile was upgraded/merged into a deterministic one. */
  stitched: boolean;
  /**
   * True when a phone hash matched a DIFFERENT profile that already holds its own
   * email, so the two were deliberately left unmerged (shared-phone ambiguity).
   * Callers surface this for human review rather than guessing.
   */
  phoneConflict: boolean;
}

export class IdentityResolver {
  /**
   * Resolve a set of observed identifiers to a single CustomerProfile id,
   * creating/stitching/merging as needed, and record every identifier edge.
   */
  static async resolve(db: any, scope: ResolveScope, signals: ResolveSignals): Promise<ResolveResult> {
    const { siteId, connectorInstanceId } = scope;
    const externalIdStr = signals.externalId != null ? String(signals.externalId) : null;
    const platform = (signals.platform || 'shopify').toLowerCase();

    // Ordered strongest→weakest so the deterministic profile becomes canonical.
    const identifiers: Array<{ type: IdentifierType; value: string; confidence: number }> = [];
    if (signals.emailHash) identifiers.push({ type: 'email_hash', value: signals.emailHash, confidence: CONF_DETERMINISTIC });
    if (externalIdStr) identifiers.push({ type: 'external_id', value: externalIdStr, confidence: CONF_DETERMINISTIC });
    if (signals.phoneHash) identifiers.push({ type: 'phone_hash', value: signals.phoneHash, confidence: CONF_PHONE });
    if (signals.visitorId) identifiers.push({ type: 'visitor_id', value: signals.visitorId, confidence: CONF_PROBABILISTIC });
    if (signals.sessionId) identifiers.push({ type: 'session_id', value: signals.sessionId, confidence: CONF_PROBABILISTIC });

    // 1) Find candidate profiles for each identifier (graph first, then direct
    //    customer_profiles lookup so profiles created before identity_links match too).
    const matches: Array<{ type: IdentifierType; profileId: string; confidence: number }> = [];
    for (const idf of identifiers) {
      const link = await db.identityLink.findUnique({
        where: {
          connectorInstanceId_identifierType_identifierValue: {
            connectorInstanceId,
            identifierType: idf.type,
            identifierValue: idf.value,
          },
        },
        select: { customerProfileId: true },
      });
      if (link) {
        matches.push({ type: idf.type, profileId: link.customerProfileId, confidence: idf.confidence });
        continue;
      }
      // Fallback to the golden-record columns for deterministic identifiers.
      if (idf.type === 'email_hash') {
        const p = await db.customerProfile.findFirst({
          where: { connectorInstanceId, emailHash: idf.value },
          select: { id: true },
        });
        if (p) matches.push({ type: idf.type, profileId: p.id, confidence: idf.confidence });
      } else if (idf.type === 'external_id') {
        // Compare as a string: every customer-sync service writes String(id) into
        // external_ids, while order payloads carry the id as a number. A JSON
        // equality check is type-sensitive, so normalize or the lookup silently
        // misses and a duplicate profile gets created.
        const p = await db.customerProfile.findFirst({
          where: { siteId, externalIds: { path: [platform], equals: externalIdStr as any } },
          select: { id: true },
        });
        if (p) matches.push({ type: idf.type, profileId: p.id, confidence: idf.confidence });
      } else if (idf.type === 'phone_hash') {
        // Golden-record fallback: profiles written by the customer-sync services
        // carry phone_hash directly, often before any identity_link edge exists.
        const p = await db.customerProfile.findFirst({
          where: { connectorInstanceId, phoneHash: idf.value },
          select: { id: true },
        });
        if (p) matches.push({ type: idf.type, profileId: p.id, confidence: idf.confidence });
      }
    }

    // 1b) Shared-phone guard. A phone hash is a strong hint but a weak identity:
    //     families share a number and POS staff key in their own for walk-ins. So a
    //     phone match is DISCARDED (and flagged for review) whenever it points at a
    //     person who demonstrably has a different email — either different from the
    //     email arriving on this very order, or different from the profile a stronger
    //     identifier already matched. A phone match to a profile with no email of its
    //     own is kept: that is the POS-only shopper we are trying to unify.
    let phoneConflict = false;
    let effectiveMatches = matches;
    const phoneMatch = matches.find((m) => m.type === 'phone_hash');
    if (phoneMatch) {
      const phoneProfile = await db.customerProfile.findUnique({
        where: { id: phoneMatch.profileId },
        select: { emailHash: true },
      });
      const phoneProfileEmail = phoneProfile?.emailHash || null;
      const strongerMatch = matches.find((m) => m.type === 'email_hash' || m.type === 'external_id');
      const conflictsWithIncomingEmail = Boolean(
        signals.emailHash && phoneProfileEmail && signals.emailHash !== phoneProfileEmail,
      );
      const conflictsWithStrongerMatch = Boolean(
        strongerMatch && strongerMatch.profileId !== phoneMatch.profileId && phoneProfileEmail,
      );
      if (conflictsWithIncomingEmail || conflictsWithStrongerMatch) {
        phoneConflict = true;
        effectiveMatches = matches.filter((m) => m !== phoneMatch);
      }
    }

    // 2) Pick the canonical profile and decide create vs. stitch vs. merge.
    const distinctProfileIds = [...new Set(effectiveMatches.map((m) => m.profileId))];
    let profileId: string;
    let created = false;
    let stitched = false;
    let matchedBy: IdentifierType | null = null;

    if (distinctProfileIds.length === 0) {
      // No match anywhere → create a fresh profile (deterministic id when possible
      // so re-runs of the batch path reuse the same row). Scoped by connector so
      // the same email under two connectors yields two profiles (§3.5.2 isolation).
      profileId = this.deriveProfileId(
        connectorInstanceId,
        platform,
        externalIdStr,
        signals.emailHash ?? null,
        signals.phoneHash ?? null,
        signals.visitorId ?? null,
      );
      try {
        created = await this.createProfile(db, profileId, scope, signals, platform);
      } catch (err) {
        // Lost the unique(connector, emailHash) race → adopt the winning profile.
        if (err instanceof ProfileRaceResolved) {
          profileId = err.profileId;
          created = false;
          await this.enrichProfile(db, profileId, signals, platform);
        } else {
          throw err;
        }
      }
    } else {
      // Canonical = the profile carrying the strongest identifier (matches is ordered).
      const strongest = effectiveMatches[0];
      profileId = strongest.profileId;
      matchedBy = strongest.type;

      // Any OTHER profiles that also matched are the same person → merge into canonical.
      const toMerge = distinctProfileIds.filter((id) => id !== profileId);
      for (const fromId of toMerge) {
        await this.mergeProfiles(db, connectorInstanceId, fromId, profileId, `resolve:${strongest.type}`);
        stitched = true;
      }
      // Enrich the canonical profile with any newly-observed deterministic identity.
      await this.enrichProfile(db, profileId, signals, platform);
    }

    // 3) Upsert every observed identifier as an edge to the canonical profile. A
    //    conflicted phone edge is left exactly where it is — re-pointing it would
    //    make the number ping-pong between profiles on every ingest.
    for (const idf of identifiers) {
      if (idf.type === 'phone_hash' && phoneConflict) continue;
      await this.upsertLink(db, scope, profileId, idf.type, idf.value, idf.confidence);
    }

    // 4) Back-fill this visitor's prior anonymous sessions/events to the profile.
    if (signals.visitorId) {
      await this.backfillVisitor(db, connectorInstanceId, signals.visitorId, profileId);
    }

    return { profileId, created, matchedBy, stitched, phoneConflict };
  }

  /** Stamp customerProfileId onto a visitor's storefront sessions/events (idempotent). */
  static async backfillVisitor(db: any, connectorInstanceId: string, visitorId: string, profileId: string): Promise<void> {
    await db.storefrontSession.updateMany({
      where: { connectorInstanceId, visitorId, customerProfileId: null },
      data: { customerProfileId: profileId },
    });
    await db.storefrontEvent.updateMany({
      where: { connectorInstanceId, visitorId, customerProfileId: null },
      data: { customerProfileId: profileId },
    });
  }

  private static async upsertLink(
    db: any,
    scope: ResolveScope,
    profileId: string,
    type: IdentifierType,
    value: string,
    confidence: number,
  ): Promise<void> {
    try {
      await db.identityLink.upsert({
        where: {
          connectorInstanceId_identifierType_identifierValue: {
            connectorInstanceId: scope.connectorInstanceId,
            identifierType: type,
            identifierValue: value,
          },
        },
        create: {
          siteId: scope.siteId,
          connectorInstanceId: scope.connectorInstanceId,
          customerProfileId: profileId,
          identifierType: type,
          identifierValue: value,
          confidence,
        },
        update: { customerProfileId: profileId, lastSeenAt: new Date() },
      });
    } catch {
      // A concurrent writer created the same edge — the unique constraint held.
      // The row now points somewhere valid; nothing else to do.
    }
  }

  private static async createProfile(
    db: any,
    profileId: string,
    scope: ResolveScope,
    signals: ResolveSignals,
    platform: string,
  ): Promise<boolean> {
    const strongIdentity = Boolean(signals.emailHash || signals.externalId);
    // A phone-only shopper (the typical POS walk-in) is a known customer, just a
    // less certain one — not an anonymous guest.
    const hasIdentity = strongIdentity || Boolean(signals.phoneHash);
    // Stored as a string to match the customer-sync services (see the external_id
    // lookup in resolve() — JSON equality is type-sensitive).
    const externalIds = signals.externalId != null ? { [platform]: String(signals.externalId) } : {};
    try {
      await db.customerProfile.create({
        data: {
          id: profileId,
          siteId: scope.siteId,
          connectorInstanceId: scope.connectorInstanceId,
          externalIds,
          emailHash: signals.emailHash || undefined,
          emailEncrypted: signals.emailEncrypted || undefined,
          phoneHash: signals.phoneHash || undefined,
          lifecycleState: signals.lifecycleHint || (hasIdentity ? 'RETURNING' : 'NEW_GUEST'),
          identityConfidence: strongIdentity ? CONF_DETERMINISTIC : hasIdentity ? CONF_PHONE : CONF_PROBABILISTIC,
          metadata: { source: signals.source || 'identity-resolver', connectorInstanceId: scope.connectorInstanceId },
        },
      });
      return true;
    } catch (err: any) {
      // Lost a create race (unique on connector+emailHash). Fall back to the existing row.
      if (err?.code === 'P2002' && signals.emailHash) {
        const existing = await db.customerProfile.findFirst({
          where: { connectorInstanceId: scope.connectorInstanceId, emailHash: signals.emailHash },
          select: { id: true },
        });
        if (existing) {
          // Caller will link to profileId; make links point to the winning row instead.
          // Return false (not created) and let enrich/link use the existing id via a rethrow-free path.
          throw new ProfileRaceResolved(existing.id);
        }
      }
      throw err;
    }
  }

  /** Fill in newly-observed identity on an existing profile without overwriting known values. */
  private static async enrichProfile(db: any, profileId: string, signals: ResolveSignals, platform: string): Promise<void> {
    const profile = await db.customerProfile.findUnique({
      where: { id: profileId },
      select: { emailHash: true, emailEncrypted: true, phoneHash: true, externalIds: true, lifecycleState: true },
    });
    if (!profile) return;

    const data: Record<string, any> = { lastSeenAt: new Date() };
    if (!profile.emailHash && signals.emailHash) data.emailHash = signals.emailHash;
    if (!profile.emailEncrypted && signals.emailEncrypted) data.emailEncrypted = signals.emailEncrypted;
    if (!profile.phoneHash && signals.phoneHash) data.phoneHash = signals.phoneHash;
    if (signals.externalId != null) {
      const merged = { ...(profile.externalIds || {}), [platform]: String(signals.externalId) };
      data.externalIds = merged;
    }
    if (profile.lifecycleState === 'NEW_GUEST' && (signals.emailHash || signals.externalId || signals.phoneHash)) {
      data.lifecycleState = signals.lifecycleHint || 'RETURNING';
      data.identityConfidence = signals.emailHash || signals.externalId ? CONF_DETERMINISTIC : CONF_PHONE;
    }
    await db.customerProfile.update({ where: { id: profileId }, data });
  }

  /**
   * Merge `fromId` into `intoId`: re-point all references, union identity, and write
   * a reversible audit row. `intoId` is the canonical (usually deterministic) profile.
   */
  static async mergeProfiles(db: any, connectorInstanceId: string, fromId: string, intoId: string, reason: string): Promise<void> {
    if (fromId === intoId) return;

    const [from, into] = await Promise.all([
      db.customerProfile.findUnique({ where: { id: fromId } }),
      db.customerProfile.findUnique({ where: { id: intoId } }),
    ]);
    if (!from || !into) return;

    // Re-point identity graph edges. A duplicate edge (same identifier already on
    // `into`) violates the unique constraint, so delete those instead of moving.
    const fromLinks = await db.identityLink.findMany({ where: { customerProfileId: fromId } });
    for (const link of fromLinks) {
      try {
        await db.identityLink.update({ where: { id: link.id }, data: { customerProfileId: intoId } });
      } catch {
        await db.identityLink.delete({ where: { id: link.id } });
      }
    }

    // Re-point live behavior + any customer sessions/events to the surviving profile.
    await db.storefrontSession.updateMany({ where: { connectorInstanceId, customerProfileId: fromId }, data: { customerProfileId: intoId } });
    await db.storefrontEvent.updateMany({ where: { connectorInstanceId, customerProfileId: fromId }, data: { customerProfileId: intoId } });
    // Order history follows the survivor too — otherwise the absorbed profile's
    // orders (often the offline ones that triggered the merge) point at a row that
    // is about to be deleted, and silently drop out of every customer total.
    await db.canonicalOrder
      .updateMany({ where: { connectorInstanceId, customerProfileId: fromId }, data: { customerProfileId: intoId } })
      .catch(() => {});
    await db.customerSession.updateMany({ where: { customerId: fromId }, data: { customerId: intoId } }).catch(() => {});
    await db.customerEvent.updateMany({ where: { customerId: fromId }, data: { customerId: intoId } }).catch(() => {});

    // Union identity onto the survivor (never overwrite an existing strong value).
    const mergedExternalIds = { ...(from.externalIds || {}), ...(into.externalIds || {}) };
    await db.customerProfile.update({
      where: { id: intoId },
      data: {
        externalIds: mergedExternalIds,
        emailHash: into.emailHash || from.emailHash || undefined,
        emailEncrypted: into.emailEncrypted || from.emailEncrypted || undefined,
        phoneHash: into.phoneHash || from.phoneHash || undefined,
        totalLtv: this.sumDecimal(into.totalLtv, from.totalLtv),
        firstSeenAt: this.earliest(into.firstSeenAt, from.firstSeenAt),
        lastSeenAt: this.latest(into.lastSeenAt, from.lastSeenAt),
      },
    });

    // Audit with a reversible snapshot of the absorbed profile before deleting it.
    await db.profileMerge.create({
      data: {
        connectorInstanceId,
        fromProfileId: fromId,
        intoProfileId: intoId,
        reason,
        payload: { from, movedLinkCount: fromLinks.length },
      },
    });

    await db.customerProfile.delete({ where: { id: fromId } }).catch(() => {});
  }

  private static deriveProfileId(
    connectorInstanceId: string,
    platform: string,
    externalId: string | null,
    emailHash: string | null,
    phoneHash: string | null,
    visitorId: string | null,
  ): string {
    const seed = externalId
      ? `cust:${connectorInstanceId}:${platform}:${externalId}`
      : emailHash
      ? `email:${connectorInstanceId}:${emailHash}`
      : phoneHash
      ? `phone:${connectorInstanceId}:${phoneHash}`
      : visitorId
      ? `visitor:${connectorInstanceId}:${visitorId}`
      : `anon:${connectorInstanceId}:${crypto.randomUUID()}`;
    return stableUuid(seed);
  }

  private static sumDecimal(a: any, b: any): any {
    const na = a != null ? Number(a) : 0;
    const nb = b != null ? Number(b) : 0;
    const sum = na + nb;
    return sum || undefined;
  }
  private static earliest(a: Date, b: Date): Date {
    return a && b ? (a < b ? a : b) : a || b;
  }
  private static latest(a: Date, b: Date): Date {
    return a && b ? (a > b ? a : b) : a || b;
  }
}

/** Signals that a create lost a unique race and the caller should use this id. */
export class ProfileRaceResolved extends Error {
  constructor(public readonly profileId: string) {
    super('profile create race resolved to existing profile');
    this.name = 'ProfileRaceResolved';
  }
}

/** Re-export the deterministic id helper used across the sync services. */
export function stableUuid(input: string): string {
  const hash = crypto.createHash('sha1').update(input).digest('hex');
  return [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join('-');
}

export { encryptEmail };
