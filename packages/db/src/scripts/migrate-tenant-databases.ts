import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { prisma, decryptString } from '../index';

/**
 * PHASE 6 — Cross-tenant migration runner (internal CLI, NOT an API route).
 *
 * Applies the tenant data-plane Prisma migrations
 * (packages/db/prisma/tenant) to EVERY active tenant database — not just one.
 * Use it whenever the tenant schema gains a migration, so all tenant DBs stay
 * in lockstep.
 *
 * Usage:
 *   tsx src/scripts/migrate-tenant-databases.ts --dry-run   # list targets only
 *   tsx src/scripts/migrate-tenant-databases.ts             # apply to all active
 *   tsx src/scripts/migrate-tenant-databases.ts --tenant=<tenantId>   # one tenant
 *
 * Guarantees:
 *   • Dry-run prints exactly which tenants WOULD be migrated and exits.
 *   • Per-tenant failure isolation: one tenant's failure never aborts the batch;
 *     every tenant is attempted and a per-tenant success/failure report is
 *     printed at the end (process exits non-zero if any failed).
 *
 * NOTE: reuses the same `prisma migrate deploy` path as provisioning (never
 * `migrate dev`), consistent with the repo's migration-drift workaround.
 */

const execFileAsync = promisify(execFile);

const DB_PKG = path.resolve(__dirname, '../..'); // packages/db
const REPO_ROOT = path.resolve(DB_PKG, '../..'); // repo root
const TENANT_SCHEMA = path.join(DB_PKG, 'prisma/tenant/schema.prisma');
const PRISMA_BIN = path.join(REPO_ROOT, 'node_modules/.bin/prisma');

interface Target {
  tenantId: string;
  dbName: string;
  url: string | null;
}

interface Result {
  tenantId: string;
  dbName: string;
  ok: boolean;
  detail: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const tenantArg = args.find((a) => a.startsWith('--tenant='));
  const tenantId = tenantArg ? tenantArg.split('=')[1] : null;
  return { dryRun, tenantId };
}

async function loadTargets(onlyTenant: string | null): Promise<Target[]> {
  const rows = await prisma.tenantDatabase.findMany({
    where: { status: 'active', ...(onlyTenant ? { tenantId: onlyTenant } : {}) },
    select: { tenantId: true, dbName: true, encryptedSecret: true },
    orderBy: { tenantId: 'asc' },
  });
  return rows.map((r) => {
    let url: string | null = null;
    const secret = decryptString(r.encryptedSecret);
    if (secret) {
      try { url = JSON.parse(secret)?.url ?? null; } catch { url = null; }
    }
    return { tenantId: r.tenantId, dbName: r.dbName, url };
  });
}

async function migrateOne(target: Target): Promise<Result> {
  if (!target.url) {
    return { tenantId: target.tenantId, dbName: target.dbName, ok: false, detail: 'no decryptable connection URL' };
  }
  try {
    const { stdout } = await execFileAsync(
      PRISMA_BIN,
      ['migrate', 'deploy', '--schema', TENANT_SCHEMA],
      { cwd: DB_PKG, env: { ...process.env, TENANT_DATABASE_URL: target.url }, timeout: 5 * 60 * 1000 }
    );
    const applied = /Applying migration/.test(stdout);
    return {
      tenantId: target.tenantId,
      dbName: target.dbName,
      ok: true,
      detail: applied ? 'migrations applied' : 'already up to date',
    };
  } catch (err: any) {
    const detail = (err?.stderr?.toString?.() || err?.message || String(err)).trim().split('\n').slice(-3).join(' ');
    return { tenantId: target.tenantId, dbName: target.dbName, ok: false, detail: detail.slice(0, 300) };
  }
}

async function main() {
  const { dryRun, tenantId } = parseArgs();
  const targets = await loadTargets(tenantId);

  console.log(`\n[migrate-tenants] ${targets.length} active tenant database(s)${tenantId ? ` (filtered to ${tenantId})` : ''}`);
  if (targets.length === 0) {
    console.log('[migrate-tenants] nothing to do.');
    await prisma.$disconnect();
    process.exit(0);
  }

  if (dryRun) {
    console.log('[migrate-tenants] DRY RUN — would migrate:');
    for (const t of targets) console.log(`   • ${t.tenantId}  →  ${t.dbName}${t.url ? '' : '  (⚠ no URL)'}`);
    await prisma.$disconnect();
    process.exit(0);
  }

  const results: Result[] = [];
  for (const t of targets) {
    process.stdout.write(`   migrating ${t.tenantId} (${t.dbName}) … `);
    const r = await migrateOne(t); // failure isolation: never throws out of the loop
    results.push(r);
    console.log(r.ok ? `OK — ${r.detail}` : `FAILED — ${r.detail}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[migrate-tenants] done: ${results.length - failed.length} ok, ${failed.length} failed`);
  if (failed.length) {
    console.log('[migrate-tenants] failures:');
    for (const f of failed) console.log(`   ✗ ${f.tenantId} (${f.dbName}): ${f.detail}`);
  }

  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error('[migrate-tenants] fatal:', e);
  try { await prisma.$disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
