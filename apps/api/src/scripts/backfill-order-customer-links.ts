import path from 'path';
import dotenv from 'dotenv';

// Load apps/api/.env (same file the server loads) so DATABASE_URL and the
// per-tenant connection secrets are available when run standalone via tsx.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { prisma } from '@kpi-platform/db';
import { getStorePrismaClient, closeAllStorePrismaClients } from '../lib/tenant-prisma';

/**
 * Backfill `canonical_orders.customer_profile_id` across all per-tenant store
 * databases (CDP Phase A).
 *
 *   npm run backfill:order-customers -- [--connector=<id>] [--site=<siteId>] [--dry-run]
 *
 * Orders written before the column existed carry their identity only inside the
 * metadata JSON. This walks those rows and attaches each to the CustomerProfile
 * golden record, so historical online orders line up with newly imported offline /
 * POS ones on the same customer.
 *
 * Match keys, strongest first — the same order IdentityResolver uses:
 *   1. metadata.customer.id        → external_ids[platform]   (deterministic)
 *   2. metadata.customerEmailHash  → customer_profiles.email_hash
 *   3. metadata.customerPhoneHash  → customer_profiles.phone_hash, but ONLY where
 *      the order has no email of its own AND the phone maps to exactly one profile.
 *      A shared handset must not silently merge two people's order histories.
 *
 * Purely additive and re-runnable: rows that already have a customer_profile_id are
 * skipped, and no profiles are created — an order with no match stays NULL.
 */

const BATCH = 1000;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const DRY_RUN = flag('dry-run');
const ONLY_CONNECTOR = opt('connector');
const ONLY_SITE = opt('site');

const DDL = [
  `ALTER TABLE "canonical_orders" ADD COLUMN IF NOT EXISTS "customer_profile_id" VARCHAR(36)`,
  `CREATE INDEX IF NOT EXISTS "idx_order_customer_profile" ON "canonical_orders"("connector_instance_id", "customer_profile_id")`,
];

interface Stats {
  scanned: number;
  byExternalId: number;
  byEmail: number;
  byPhone: number;
  unmatched: number;
  phoneAmbiguous: number;
}

async function backfillStore(db: any, connectorId: string): Promise<Stats> {
  const stats: Stats = { scanned: 0, byExternalId: 0, byEmail: 0, byPhone: 0, unmatched: 0, phoneAmbiguous: 0 };

  // Ensure the column exists (no-op where the tenant migration already ran).
  if (!DRY_RUN) {
    for (const ddl of DDL) await db.$executeRawUnsafe(ddl);
  }

  // Profile lookup maps for this connector. Profile counts per connector are small
  // relative to orders, so one in-memory pass beats a query per order.
  const profiles: Array<{ id: string; external_ids: any; email_hash: string | null; phone_hash: string | null }> =
    await db.$queryRawUnsafe(
      `SELECT id, external_ids, email_hash, phone_hash FROM customer_profiles WHERE connector_instance_id = $1`,
      connectorId,
    );

  const byExternalId = new Map<string, string>();
  const byEmailHash = new Map<string, string>();
  // Phone → profiles. A phone shared by several profiles is ambiguous and skipped.
  const byPhoneHash = new Map<string, Set<string>>();
  for (const p of profiles) {
    for (const v of Object.values(p.external_ids || {})) {
      if (v != null) byExternalId.set(String(v), p.id);
    }
    if (p.email_hash) byEmailHash.set(p.email_hash, p.id);
    if (p.phone_hash) {
      const set = byPhoneHash.get(p.phone_hash) || new Set<string>();
      set.add(p.id);
      byPhoneHash.set(p.phone_hash, set);
    }
  }

  let offset = 0;
  for (;;) {
    // Offset paging is safe here: a matched row keeps its position (the filter is on
    // customer_profile_id, which only DRY_RUN leaves unchanged — see the offset bump).
    const rows: Array<{ id: string; metadata: any }> = await db.$queryRawUnsafe(
      `SELECT id, metadata
         FROM canonical_orders
        WHERE connector_instance_id = $1 AND customer_profile_id IS NULL
        ORDER BY id
        LIMIT ${BATCH} OFFSET ${offset}`,
      connectorId,
    );
    if (rows.length === 0) break;

    for (const row of rows) {
      stats.scanned += 1;
      const meta = row.metadata || {};
      const extId = meta?.customer?.id != null ? String(meta.customer.id) : null;
      const emailHash: string | null = meta?.customerEmailHash || null;
      const phoneHash: string | null = meta?.customerPhoneHash || null;

      let profileId: string | null = null;
      let matchedBy: keyof Stats | null = null;

      if (extId && byExternalId.has(extId)) {
        profileId = byExternalId.get(extId)!;
        matchedBy = 'byExternalId';
      } else if (emailHash && byEmailHash.has(emailHash)) {
        profileId = byEmailHash.get(emailHash)!;
        matchedBy = 'byEmail';
      } else if (phoneHash && !emailHash) {
        const candidates = byPhoneHash.get(phoneHash);
        if (candidates && candidates.size === 1) {
          profileId = [...candidates][0];
          matchedBy = 'byPhone';
        } else if (candidates && candidates.size > 1) {
          stats.phoneAmbiguous += 1;
        }
      }

      if (!profileId) {
        stats.unmatched += 1;
        continue;
      }
      stats[matchedBy!] += 1;

      if (!DRY_RUN) {
        await db.$executeRawUnsafe(`UPDATE canonical_orders SET customer_profile_id = $2 WHERE id = $1`, row.id, profileId);
      }
    }

    // A real run empties the NULL window as it goes, so keep reading from 0. A dry
    // run changes nothing, so it must page forward or it would loop on the same rows.
    if (DRY_RUN) offset += BATCH;
    else if (rows.length < BATCH) break;
  }

  return stats;
}

async function main() {
  console.log('[order-link-backfill] starting', {
    dryRun: DRY_RUN,
    connector: ONLY_CONNECTOR ?? 'all',
    site: ONLY_SITE ?? 'all',
  });

  const instances = await prisma.connectorInstance.findMany({
    where: {
      ...(ONLY_CONNECTOR ? { id: ONLY_CONNECTOR } : {}),
      ...(ONLY_SITE ? { siteId: ONLY_SITE } : {}),
    },
    select: { id: true, siteId: true, providerId: true, label: true },
    orderBy: { createdAt: 'asc' },
  });
  if (instances.length === 0) {
    console.log('[order-link-backfill] no connector instances matched — nothing to do');
    return;
  }

  const failures: string[] = [];
  const totals: Stats = { scanned: 0, byExternalId: 0, byEmail: 0, byPhone: 0, unmatched: 0, phoneAmbiguous: 0 };

  for (const instance of instances) {
    console.log(`\n[order-link-backfill] ── ${instance.id} (${instance.providerId} "${instance.label}", site ${instance.siteId})`);
    try {
      const db = await getStorePrismaClient(instance.id);
      const s = await backfillStore(db, instance.id);
      for (const k of Object.keys(totals) as Array<keyof Stats>) totals[k] += s[k];
      console.log(
        `[order-link-backfill]   scanned ${s.scanned} — linked ${s.byExternalId + s.byEmail + s.byPhone} ` +
          `(id ${s.byExternalId}, email ${s.byEmail}, phone ${s.byPhone}), unmatched ${s.unmatched}` +
          (s.phoneAmbiguous > 0 ? `, skipped ${s.phoneAmbiguous} shared-phone` : ''),
      );
    } catch (err: any) {
      // A store whose DB is not active yet is reported and skipped rather than
      // aborting the whole sweep.
      console.error(`[order-link-backfill]   FAILED — ${err?.message ?? err}`);
      failures.push(instance.id);
    }
  }

  console.log(
    `\n[order-link-backfill] done. ${instances.length - failures.length}/${instances.length} stores OK — ` +
      `${totals.byExternalId + totals.byEmail + totals.byPhone} of ${totals.scanned} orders linked` +
      (DRY_RUN ? ' (DRY RUN — nothing written)' : ''),
  );
  if (failures.length > 0) {
    console.error(`[order-link-backfill] stores with errors: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('[order-link-backfill] fatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAllStorePrismaClients();
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
