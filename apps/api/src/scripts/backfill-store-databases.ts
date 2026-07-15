import path from 'path';
import dotenv from 'dotenv';

// Load apps/api/.env (same file the server loads) so DATABASE_URL and
// CONNECTOR_SECRET_KEY are available when run standalone via tsx.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { prisma } from '@kpi-platform/db';
import { provisionStoreDatabase } from '../services/tenant-database-provisioning.service';
import { getStorePrismaClient, closeAllStorePrismaClients } from '../lib/tenant-prisma';

/**
 * One-time backfill: copy each integration's (connector instance's) existing
 * store data OUT of the master/control-plane database INTO its dedicated
 * per-integration store database (DATABASE-PER-INTEGRATION cutover).
 *
 *   npm run backfill:stores -- [--connector=<id>] [--site=<siteId>] [--dry-run] [--prune]
 *
 *  • Provisions the store DB first (idempotent) if it is not active yet.
 *  • Copies in FK-safe order with createMany({ skipDuplicates }) so re-runs
 *    are idempotent and partially-copied tables resume cleanly.
 *  • Legacy rows with connector_instance_id NULL are assigned by site — but
 *    ONLY when the site has exactly one connector instance (unambiguous).
 *    Ambiguous legacy rows are reported and left in place.
 *  • --prune deletes successfully copied rows from the master DB (children
 *    first). Off by default; run it only after verifying the copy.
 *  • NOT copied (control-plane by design): alerts, alert_rules, kpi_values,
 *    discovered_page_urls, and all connector/auth/project bookkeeping.
 */

const BATCH = 500;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const DRY_RUN = flag('dry-run');
const PRUNE = flag('prune');
const ONLY_CONNECTOR = opt('connector');
const ONLY_SITE = opt('site');

interface TableSpec {
  /** Prisma model accessor name (identical on both clients). */
  model: string;
  /** Build the master-DB where clause for this instance's rows. */
  where: (instance: { id: string; siteId: string }, includeLegacy: boolean) => any;
  /** Postgres table name — set for autoincrement-id tables needing a sequence bump. */
  serialTable?: string;
}

// Copy order is FK-safe: orders before snapshots/events, profiles before
// sessions before events. Prune runs in REVERSE order (children first).
function tableSpecs(): TableSpec[] {
  const byConnector = (instance: any, includeLegacy: boolean) =>
    includeLegacy
      ? { OR: [{ connectorInstanceId: instance.id }, { connectorInstanceId: null, siteId: instance.siteId }] }
      : { connectorInstanceId: instance.id };

  // order_snapshots / order_events have no siteId — scope through their order.
  const byOrder = (instance: any, includeLegacy: boolean) => ({
    order: byConnector(instance, includeLegacy),
  });

  return [
    { model: 'canonicalProduct', where: byConnector },
    { model: 'canonicalProductCategory', where: byConnector },
    { model: 'canonicalCheckout', where: byConnector },
    { model: 'canonicalOrder', where: byConnector },
    { model: 'orderSnapshot', where: byOrder },
    { model: 'orderEvent', where: byOrder },
    { model: 'customerProfile', where: byConnector },
    { model: 'customerSession', where: byConnector },
    { model: 'customerEvent', where: byConnector },
    // storefront_sessions/events: connector_instance_id is NOT NULL — no legacy case.
    { model: 'storefrontSession', where: (i) => ({ connectorInstanceId: i.id }) },
    { model: 'storefrontEvent', where: (i) => ({ connectorInstanceId: i.id }) },
    // storefront_errors carry projectId (== siteId) instead of siteId.
    {
      model: 'storefrontError',
      where: (i, legacy) =>
        legacy
          ? { OR: [{ connectorInstanceId: i.id }, { connectorInstanceId: null, projectId: i.siteId }] }
          : { connectorInstanceId: i.id },
    },
    { model: 'performanceMetric', where: byConnector, serialTable: 'performance_metrics' },
    { model: 'performanceRollup', where: byConnector, serialTable: 'performance_rollups' },
  ];
}

async function copyTable(
  storeDb: any,
  instance: { id: string; siteId: string },
  spec: TableSpec,
  includeLegacy: boolean
): Promise<{ copied: number; total: number }> {
  const where = spec.where(instance, includeLegacy);
  const source = (prisma as any)[spec.model];
  const target = storeDb[spec.model];

  const total = await source.count({ where });
  if (DRY_RUN || total === 0) return { copied: 0, total };

  let copied = 0;
  let cursor: any = null;
  for (;;) {
    const rows: any[] = await source.findMany({
      where,
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    const res = await target.createMany({ data: rows, skipDuplicates: true });
    copied += res.count;
    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }

  // Autoincrement tables: rows were inserted with explicit ids, so the store
  // DB's sequence is still at its initial value — bump it past MAX(id) or the
  // next organic insert would collide.
  if (spec.serialTable) {
    await storeDb.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('${spec.serialTable}','id'), (SELECT COALESCE(MAX(id),1) FROM "${spec.serialTable}"))`
    );
  }

  return { copied, total };
}

async function pruneTable(
  instance: { id: string; siteId: string },
  spec: TableSpec,
  includeLegacy: boolean
): Promise<number> {
  const where = spec.where(instance, includeLegacy);
  const res = await (prisma as any)[spec.model].deleteMany({ where });
  return res.count;
}

async function main() {
  console.log(`[backfill] database-per-integration backfill starting`, {
    dryRun: DRY_RUN,
    prune: PRUNE,
    connector: ONLY_CONNECTOR ?? 'all',
    site: ONLY_SITE ?? 'all',
  });

  const instances = await prisma.connectorInstance.findMany({
    where: {
      ...(ONLY_CONNECTOR ? { id: ONLY_CONNECTOR } : {}),
      ...(ONLY_SITE ? { siteId: ONLY_SITE } : {}),
    },
    select: { id: true, siteId: true, tenantId: true, providerId: true, label: true },
    orderBy: { createdAt: 'asc' },
  });
  if (instances.length === 0) {
    console.log('[backfill] no connector instances matched — nothing to do');
    return;
  }

  const failures: string[] = [];

  for (const instance of instances) {
    console.log(`\n[backfill] ── integration ${instance.id} (${instance.providerId} "${instance.label}", site ${instance.siteId})`);

    // A site with >1 connector: legacy NULL-connector rows are ambiguous.
    const siteConnectorCount = await prisma.connectorInstance.count({ where: { siteId: instance.siteId } });
    const includeLegacy = siteConnectorCount === 1;
    if (!includeLegacy) {
      console.warn(
        `[backfill]   site has ${siteConnectorCount} connectors — legacy rows with connector_instance_id NULL are AMBIGUOUS and will be skipped. ` +
          `Re-run with an explicit assignment after review if needed.`
      );
    }

    // 1) Ensure the store database exists and is active.
    if (!DRY_RUN) {
      const prov = await provisionStoreDatabase(instance.id, { triggeredBy: 'backfill' });
      if (prov.status !== 'active') {
        console.error(`[backfill]   provisioning ${prov.status}: ${prov.error ?? ''} — SKIPPING integration`);
        failures.push(instance.id);
        continue;
      }
      console.log(`[backfill]   store DB ready: ${prov.dbName}${prov.alreadyProvisioned ? ' (already provisioned)' : ''}`);
    }

    // 2) Copy tables in FK-safe order.
    const storeDb = DRY_RUN ? null : await getStorePrismaClient(instance.id);
    const specs = tableSpecs();
    let hadError = false;
    for (const spec of specs) {
      try {
        if (DRY_RUN) {
          const total = await (prisma as any)[spec.model].count({ where: spec.where(instance, includeLegacy) });
          console.log(`[backfill]   ${spec.model}: ${total} rows would be copied`);
        } else {
          const { copied, total } = await copyTable(storeDb, instance, spec, includeLegacy);
          console.log(`[backfill]   ${spec.model}: copied ${copied}/${total} (skipDuplicates)`);
        }
      } catch (err: any) {
        hadError = true;
        console.error(`[backfill]   ${spec.model}: FAILED — ${err?.message ?? err}`);
      }
    }
    if (hadError) {
      failures.push(instance.id);
      console.error(`[backfill]   errors occurred — NOT pruning this integration`);
      continue;
    }

    // 3) Optional prune of the master DB (children first).
    if (PRUNE && !DRY_RUN) {
      for (const spec of [...specs].reverse()) {
        try {
          const n = await pruneTable(instance, spec, includeLegacy);
          if (n > 0) console.log(`[backfill]   pruned ${n} ${spec.model} rows from master`);
        } catch (err: any) {
          console.error(`[backfill]   prune ${spec.model}: FAILED — ${err?.message ?? err}`);
          failures.push(instance.id);
          break;
        }
      }
    }
  }

  console.log(`\n[backfill] done. ${instances.length - failures.length}/${instances.length} integrations OK`);
  if (failures.length > 0) {
    console.error(`[backfill] integrations with errors: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('[backfill] fatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAllStorePrismaClients();
    await prisma.$disconnect();
    // Imported service modules (seeder/db factory) hold timers that keep the
    // event loop alive — exit explicitly once all work is flushed.
    process.exit(process.exitCode ?? 0);
  });
