import path from 'path';
import dotenv from 'dotenv';

// Load apps/api/.env (same file the server loads) so DATABASE_URL and the
// per-tenant connection secrets are available when run standalone via tsx.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { prisma } from '@kpi-platform/db';
import { getStorePrismaClient, closeAllStorePrismaClients } from '../lib/tenant-prisma';
import { StorefrontTrackingService } from '../services/storefront-tracking.service';

/**
 * Backfill acquisition attribution (channel/source/medium/campaign) + client
 * identification (browser/os) onto existing storefront_sessions rows across all
 * per-tenant store databases.
 *
 *   npm run backfill:attribution -- [--connector=<id>] [--site=<siteId>] [--dry-run]
 *
 *  • Idempotently ensures the attribution columns + index exist on each store DB
 *    (ADD COLUMN IF NOT EXISTS), so this is safe even where the tenant migration
 *    has not been applied yet.
 *  • Classifies only rows where channel IS NULL, reusing the same
 *    classifyChannel/detectBrowser/detectOS logic the live ingest path uses.
 *    Existing rows carry no client utm/gclid beacon, so attribution is derived
 *    from the landing_page query string (utm params, gclid, fbclid) + referrer.
 *  • Re-runnable: already-classified rows (channel IS NOT NULL) are skipped.
 */

const BATCH = 500;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const DRY_RUN = flag('dry-run');
const ONLY_CONNECTOR = opt('connector');
const ONLY_SITE = opt('site');

const ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid', 'gbraid', 'wbraid'];

/** Parse utm params + click-ids out of a landing-page URL's query string. */
function attrFromUrl(url: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!url) return out;
  try {
    const sp = new URL(url).searchParams;
    for (const k of ATTR_KEYS) {
      const v = sp.get(k);
      if (v) out[k] = String(v).slice(0, 200);
    }
  } catch {
    /* unparseable URL → no signals */
  }
  return out;
}

const ATTR_DDL = [
  `ALTER TABLE "storefront_sessions" ADD COLUMN IF NOT EXISTS "channel" VARCHAR(20)`,
  `ALTER TABLE "storefront_sessions" ADD COLUMN IF NOT EXISTS "source" TEXT`,
  `ALTER TABLE "storefront_sessions" ADD COLUMN IF NOT EXISTS "medium" TEXT`,
  `ALTER TABLE "storefront_sessions" ADD COLUMN IF NOT EXISTS "campaign" TEXT`,
  `ALTER TABLE "storefront_sessions" ADD COLUMN IF NOT EXISTS "browser" VARCHAR(40)`,
  `ALTER TABLE "storefront_sessions" ADD COLUMN IF NOT EXISTS "os" VARCHAR(40)`,
  `CREATE INDEX IF NOT EXISTS "idx_storefront_session_channel" ON "storefront_sessions"("connector_instance_id", "channel")`,
];

async function backfillStore(db: any, connectorId: string): Promise<{ updated: number; total: number }> {
  // Ensure columns exist (no-op where the migration already ran).
  if (!DRY_RUN) {
    for (const ddl of ATTR_DDL) await db.$executeRawUnsafe(ddl);
  }

  const [{ count }] = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM storefront_sessions WHERE connector_instance_id = $1 AND channel IS NULL`,
    connectorId,
  );
  const total = Number(count || 0);
  if (DRY_RUN || total === 0) return { updated: 0, total };

  let updated = 0;
  for (;;) {
    const rows: Array<{ id: string; referrer: string | null; landing_page: string | null; user_agent: string | null }> =
      await db.$queryRawUnsafe(
        `SELECT id, referrer, landing_page, user_agent
           FROM storefront_sessions
          WHERE connector_instance_id = $1 AND channel IS NULL
          ORDER BY id
          LIMIT ${BATCH}`,
        connectorId,
      );
    if (rows.length === 0) break;

    for (const r of rows) {
      const attr = attrFromUrl(r.landing_page);
      const c = StorefrontTrackingService.classifyChannel(attr, r.referrer);
      const browser = StorefrontTrackingService.detectBrowser(r.user_agent);
      const os = StorefrontTrackingService.detectOS(r.user_agent);
      await db.$executeRawUnsafe(
        `UPDATE storefront_sessions
            SET channel = $2, source = $3, medium = $4, campaign = $5,
                browser = COALESCE(browser, $6), os = COALESCE(os, $7)
          WHERE id = $1`,
        r.id, c.channel, c.source, c.medium, c.campaign, browser, os,
      );
      updated += 1;
    }
    if (rows.length < BATCH) break;
  }
  return { updated, total };
}

async function main() {
  console.log('[attr-backfill] starting', { dryRun: DRY_RUN, connector: ONLY_CONNECTOR ?? 'all', site: ONLY_SITE ?? 'all' });

  const instances = await prisma.connectorInstance.findMany({
    where: {
      ...(ONLY_CONNECTOR ? { id: ONLY_CONNECTOR } : {}),
      ...(ONLY_SITE ? { siteId: ONLY_SITE } : {}),
    },
    select: { id: true, siteId: true, providerId: true, label: true },
    orderBy: { createdAt: 'asc' },
  });
  if (instances.length === 0) {
    console.log('[attr-backfill] no connector instances matched — nothing to do');
    return;
  }

  const failures: string[] = [];
  for (const instance of instances) {
    console.log(`\n[attr-backfill] ── ${instance.id} (${instance.providerId} "${instance.label}", site ${instance.siteId})`);
    try {
      const db = await getStorePrismaClient(instance.id);
      const { updated, total } = await backfillStore(db, instance.id);
      console.log(`[attr-backfill]   classified ${updated}/${total} sessions with NULL channel`);
    } catch (err: any) {
      // A store whose DB is not active yet (or has no storefront_sessions) is
      // reported and skipped rather than aborting the whole sweep.
      console.error(`[attr-backfill]   FAILED — ${err?.message ?? err}`);
      failures.push(instance.id);
    }
  }

  console.log(`\n[attr-backfill] done. ${instances.length - failures.length}/${instances.length} stores OK`);
  if (failures.length > 0) {
    console.error(`[attr-backfill] stores with errors: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('[attr-backfill] fatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAllStorePrismaClients();
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
