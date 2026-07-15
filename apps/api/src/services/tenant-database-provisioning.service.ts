import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { Client } from 'pg';
import { prisma, encryptString } from '@kpi-platform/db';
import {
  createPendingTenantDatabase,
  transitionTenantDatabase,
  getTenantDatabaseByConnector,
} from './tenant-database.service';

const execFileAsync = promisify(execFile);

/**
 * PHASE 2 — Store-database provisioning (database-per-integration).
 *
 * Creates and migrates the dedicated physical Postgres database for ONE
 * integration (connector instance = a connected store), driving the
 * control-plane state machine (see tenant-database.service.ts):
 *   pending → provisioning → active | failed
 *
 * Design notes for THIS deployment:
 *  • Reuses the existing app role (`cartexel_app`, which has CREATEDB) — no
 *    per-tenant role is created. The role/password is taken from the
 *    control-plane DATABASE_URL; only the database name differs per tenant.
 *  • Tenant migrations = the data-plane schema at packages/db/prisma/tenant,
 *    applied with `prisma migrate deploy` against the new DB via TENANT_DATABASE_URL.
 *  • Credentials are vaulted the same way as connector_credentials: an enc:v1
 *    envelope in `encrypted_secret` (here, the full tenant connection URL), plus
 *    a `vault_key` path label. No external vault.
 *  • Idempotent: an existing `active` row short-circuits; an in-flight
 *    `provisioning` row that is not stale short-circuits; a stale one is retried.
 *  • Failure-safe: any error lands the row in `failed` with detail; the physical
 *    DB is only ever created AFTER the control-plane row exists, so there is no
 *    orphaned DB without a control-plane record.
 */

// apps/api/src/services -> repo root
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const DB_PKG = path.join(REPO_ROOT, 'packages/db');
const TENANT_SCHEMA = path.join(DB_PKG, 'prisma/tenant/schema.prisma');
const PRISMA_BIN = path.join(REPO_ROOT, 'node_modules/.bin/prisma');
const INIT_MIGRATION = '00000000000000_init';
const PROVISION_TIMEOUT_MS = 5 * 60 * 1000;

interface ControlConn {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/** Parse the control-plane DATABASE_URL (host/port/user/password/db). */
function parseControlUrl(): ControlConn {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('[provisioning] DATABASE_URL is not set');
  const u = new URL(raw);
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '') || 'postgres',
  };
}

/**
 * Derive a safe, deterministic database name for an integration (store).
 * Postgres identifiers must start with a letter/underscore and be <= 63 bytes.
 */
export function storeDbName(connectorInstanceId: string): string {
  const safe = connectorInstanceId
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^[^a-z_]/, 's');
  return `kpi_store_${safe}`.slice(0, 63);
}

function buildTenantUrl(cfg: ControlConn, dbName: string): string {
  const auth = `${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.password)}`;
  return `postgresql://${auth}@${cfg.host}:${cfg.port}/${dbName}`;
}

/** CREATE DATABASE if absent, using an admin connection to the control DB. */
async function createDatabaseIfNotExists(cfg: ControlConn, dbName: string): Promise<void> {
  const admin = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!rowCount) {
      // Identifier cannot be parameterized; dbName is sanitized by storeDbName().
      await admin.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }
}

/** Apply the tenant data-plane migrations to the new DB. */
async function runTenantMigrations(tenantUrl: string): Promise<void> {
  await execFileAsync(PRISMA_BIN, ['migrate', 'deploy', '--schema', TENANT_SCHEMA], {
    cwd: DB_PKG,
    env: { ...process.env, TENANT_DATABASE_URL: tenantUrl },
    timeout: PROVISION_TIMEOUT_MS,
  });
}

/** Confirm the migrated DB is reachable and has the expected tables. */
async function verifyConnectable(tenantUrl: string): Promise<void> {
  const client = new Client({ connectionString: tenantUrl });
  await client.connect();
  try {
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('canonical_orders','customer_profiles','storefront_sessions')"
    );
    if (!rows[0] || rows[0].n < 3) {
      throw new Error(`[provisioning] Tenant DB missing expected tables (found ${rows[0]?.n ?? 0}/3)`);
    }
  } finally {
    await client.end();
  }
}

export interface ProvisionOptions {
  triggeredBy?: string;
  correlationId?: string | null;
  /** Re-provision even if a row is already active (used for repair). */
  force?: boolean;
}

export interface ProvisionResult {
  status: 'active' | 'provisioning' | 'failed';
  tenantDatabaseId: string;
  dbName: string;
  alreadyProvisioned?: boolean;
  alreadyInProgress?: boolean;
  error?: string;
}

/**
 * Provision (or repair) the physical database for ONE integration (connector
 * instance = connected store). Safe to call repeatedly: an active row
 * short-circuits, a fresh in-flight provision short-circuits, a failed or
 * stale-provisioning row is retried.
 */
export async function provisionStoreDatabase(
  connectorInstanceId: string,
  opts: ProvisionOptions = {}
): Promise<ProvisionResult> {
  const { triggeredBy = 'system', correlationId = null, force = false } = opts;
  const cfg = parseControlUrl();
  const dbName = storeDbName(connectorInstanceId);

  const instance = await prisma.connectorInstance.findUnique({
    where: { id: connectorInstanceId },
    select: { id: true, tenantId: true, siteId: true },
  });
  if (!instance) {
    throw new Error(`[provisioning] Connector instance ${connectorInstanceId} not found`);
  }

  const existing = await getTenantDatabaseByConnector(connectorInstanceId);

  // Idempotency short-circuits.
  if (existing?.status === 'active' && !force) {
    return { status: 'active', tenantDatabaseId: existing.id, dbName, alreadyProvisioned: true };
  }
  if (existing?.status === 'provisioning') {
    const startedMs = existing.provisioningStartedAt?.getTime() ?? 0;
    const stale = Date.now() - startedMs > PROVISION_TIMEOUT_MS;
    if (!stale && !force) {
      return { status: 'provisioning', tenantDatabaseId: existing.id, dbName, alreadyInProgress: true };
    }
    // else: stale in-flight provision — fall through and retry.
  }

  // Ensure the control-plane row exists (pending) BEFORE any physical DB work.
  const row =
    existing ??
    (await createPendingTenantDatabase({
      tenantId: instance.tenantId,
      connectorInstanceId: instance.id,
      projectId: instance.siteId,
      dbHost: cfg.host,
      dbPort: cfg.port,
      dbName,
      dbUser: cfg.user,
      triggeredBy,
      correlationId,
    }));

  await transitionTenantDatabase(row.id, 'provisioning', { triggeredBy, correlationId, force: true });

  const tenantUrl = buildTenantUrl(cfg, dbName);
  try {
    await createDatabaseIfNotExists(cfg, dbName);
    await runTenantMigrations(tenantUrl);
    await verifyConnectable(tenantUrl);

    const vaultKey = `vault/${instance.tenantId}/${connectorInstanceId}/database/credentials`;
    const encryptedSecret = encryptString(JSON.stringify({ url: tenantUrl }));

    await transitionTenantDatabase(row.id, 'active', {
      triggeredBy,
      correlationId,
      patch: { vaultKey, encryptedSecret, lastMigrationVersion: INIT_MIGRATION },
      payload: { dbName },
    });
    return { status: 'active', tenantDatabaseId: row.id, dbName };
  } catch (err: any) {
    const detail = err?.stderr?.toString?.() || err?.message || String(err);
    await transitionTenantDatabase(row.id, 'failed', {
      triggeredBy,
      correlationId,
      errorDetail: detail.slice(0, 4000),
      force: true,
    });
    return { status: 'failed', tenantDatabaseId: row.id, dbName, error: detail };
  }
}

/**
 * Mark any `provisioning` row whose start is older than the timeout as `failed`,
 * so a dead provision becomes visible and retryable. Intended to be called on a
 * schedule (like ScheduledMonitor). Returns the ids reaped.
 */
export async function reapStuckProvisions(): Promise<string[]> {
  const cutoff = new Date(Date.now() - PROVISION_TIMEOUT_MS);
  const stuck = await prisma.tenantDatabase.findMany({
    where: { status: 'provisioning', provisioningStartedAt: { lt: cutoff } },
    select: { id: true },
  });
  for (const { id } of stuck) {
    await transitionTenantDatabase(id, 'failed', {
      triggeredBy: 'reaper',
      errorDetail: `Provisioning exceeded ${PROVISION_TIMEOUT_MS / 1000}s timeout and was marked failed.`,
      force: true,
    });
  }
  return stuck.map((s) => s.id);
}
