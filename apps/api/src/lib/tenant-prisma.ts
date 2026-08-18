import { PrismaClient as TenantPrismaClient } from '.prisma/tenant-client';
import { prisma as controlPrisma, decryptString, findRawEmail } from '@kpi-platform/db';

/**
 * PHASE 3 — Dynamic store Prisma-client resolver (database-per-integration).
 *
 * `getStorePrismaClient(connectorInstanceId)` returns a Prisma client bound to
 * that integration's PHYSICAL data-plane database (canonical_orders,
 * customer_profiles, storefront_*, performance_metrics, ...). Every
 * store-data query path (route handlers, connector sync jobs) must obtain its
 * client through here rather than importing the global control-plane `prisma`.
 *
 * Control-plane queries (tenants, projects, users, RBAC, connector_instances,
 * audit logs, alerts/alert_rules) keep using the shared `controlPrisma`.
 *
 * Routing entry points:
 *   • getDataPlaneClient(connectorInstanceId) — WRITE paths (sync services).
 *     Fails CLOSED when the data plane is enabled: a store whose DB is not
 *     `active` must never silently write into the master DB.
 *   • getSiteDataPlaneClient(siteId) — READ paths (dashboards/analytics) that
 *     are keyed by site. Resolves the site's store database via the
 *     tenant_databases.project_id column.
 *
 * Pooling: clients are cached per integration in a bounded LRU (default 50).
 * This avoids a new client (and connection pool) per request while capping
 * total connection growth as the store count scales. On eviction the client is
 * $disconnect()'d.
 *
 * The client carries the SAME customer_profiles PII guard as the control-plane
 * client (raw emails may never land in JSON columns), replicated here so the
 * store client cannot become a PII bypass.
 */

const MAX_TENANT_CLIENTS = Number(process.env.TENANT_CLIENT_CACHE_MAX ?? 50);

// The extended client type (post-$extends) differs from the bare PrismaClient;
// derive it from the factory so callers get correct model accessors.
type ExtendedTenantClient = ReturnType<typeof buildTenantClient>;

interface CacheEntry {
  client: ExtendedTenantClient;
  url: string;
}

// Map preserves insertion order → used as an LRU: on access we re-insert to
// move the key to the most-recently-used end; eviction removes the oldest.
const cache = new Map<string, CacheEntry>();

export class StoreDatabaseNotActive extends Error {
  /** The tenant_databases row status: 'provisioning' | 'failed' | null (no row yet). */
  public readonly provisioningStatus: string | null;
  /**
   * HTTP status the API layer should answer with.
   *
   * A store DB that is still provisioning (or whose row does not exist yet) is a
   * NORMAL, transient state: `provisionStoreDatabase` runs in the background
   * after a connector is created, so every read in that window would otherwise
   * 500. Those 500s are counted by the platform's own error-rate KPI and trip
   * the CRITICAL "High API Error Rate" rule — the product alerting on itself for
   * a store being set up correctly. Answer 409 instead: not ready, retryable,
   * not a server fault.
   *
   * A `failed` provision is a genuine fault and stays 5xx so it gets noticed.
   */
  public readonly statusCode: number;
  public readonly code: string;

  constructor(connectorInstanceId: string, status: string | null) {
    super(
      `[tenant-prisma] Integration ${connectorInstanceId} has no active store database (status: ${status ?? 'none'}). ` +
        `Provision it before running store-data queries.`
    );
    this.name = 'StoreDatabaseNotActive';
    this.provisioningStatus = status;
    this.statusCode = status === 'failed' ? 503 : 409;
    this.code = status === 'failed' ? 'STORE_DATABASE_PROVISION_FAILED' : 'STORE_DATABASE_NOT_READY';
  }
}

const CUSTOMER_PROFILE_JSON_FIELDS = ['externalIds', 'metadata'] as const;

function assertNoRawEmail(data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const payload = data as Record<string, unknown>;
  for (const field of CUSTOMER_PROFILE_JSON_FIELDS) {
    if (!(field in payload)) continue;
    const leaked = findRawEmail(payload[field]);
    if (leaked) {
      throw new Error(
        `[customer_profiles] Refusing write: raw email detected in JSON column "${field}". ` +
          `Store emails only in email_hash and scrub metadata. ` +
          `Offending value resembled: ${leaked.replace(/(.).*(@.*)/, '$1***$2')}`
      );
    }
  }
}

function guardCustomerProfileWrite(args: any): void {
  if (!args) return;
  if (Array.isArray(args.data)) args.data.forEach(assertNoRawEmail);
  else if (args.data) assertNoRawEmail(args.data);
  if (args.create) assertNoRawEmail(args.create);
  if (args.update) assertNoRawEmail(args.update);
}

function buildTenantClient(url: string) {
  return new TenantPrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  }).$extends({
    name: 'tenant-customer-profile-pii-guard',
    query: {
      customerProfile: {
        create({ args, query }) { guardCustomerProfileWrite(args); return query(args); },
        update({ args, query }) { guardCustomerProfileWrite(args); return query(args); },
        updateMany({ args, query }) { guardCustomerProfileWrite(args); return query(args); },
        upsert({ args, query }) { guardCustomerProfileWrite(args); return query(args); },
        createMany({ args, query }) { guardCustomerProfileWrite(args); return query(args); },
      },
    },
  });
}

/** Resolve an integration's active store-DB connection URL from the control plane. */
async function resolveStoreUrl(connectorInstanceId: string): Promise<string> {
  const normalizedConnectorInstanceId = Array.isArray(connectorInstanceId)
    ? String(connectorInstanceId[0] || '').trim()
    : String(connectorInstanceId || '').trim();

  if (!normalizedConnectorInstanceId) {
    throw new Error('[tenant-prisma] connectorInstanceId is required to resolve a store database.');
  }

  const row = await controlPrisma.tenantDatabase.findUnique({ where: { connectorInstanceId: normalizedConnectorInstanceId } });
  if (!row || row.status !== 'active') {
    throw new StoreDatabaseNotActive(normalizedConnectorInstanceId, row?.status ?? null);
  }
  const secret = decryptString(row.encryptedSecret);
  if (!secret) {
    throw new Error(`[tenant-prisma] Store DB for ${normalizedConnectorInstanceId} active but credentials could not be decrypted.`);
  }
  try {
    const parsed = JSON.parse(secret);
    if (!parsed?.url) throw new Error('no url');
    return parsed.url as string;
  } catch {
    throw new Error(`[tenant-prisma] Store DB credential envelope for ${normalizedConnectorInstanceId} is malformed.`);
  }
}

async function evictOldestIfNeeded(): Promise<void> {
  while (cache.size >= MAX_TENANT_CLIENTS) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const entry = cache.get(oldestKey);
    cache.delete(oldestKey);
    if (entry) {
      try { await entry.client.$disconnect(); } catch { /* best-effort */ }
    }
  }
}

/**
 * Get (or lazily create + cache) the Prisma client for an integration's
 * physical store DB. Throws StoreDatabaseNotActive if the integration has no
 * active database.
 */
export async function getStorePrismaClient(connectorInstanceId: string): Promise<ExtendedTenantClient> {
  const cached = cache.get(connectorInstanceId);
  if (cached) {
    // LRU touch: move to most-recently-used position.
    cache.delete(connectorInstanceId);
    cache.set(connectorInstanceId, cached);
    return cached.client;
  }

  const url = await resolveStoreUrl(connectorInstanceId);
  await evictOldestIfNeeded();
  const client = buildTenantClient(url);
  cache.set(connectorInstanceId, { client, url });
  return client;
}

/** Drop an integration's cached client (e.g. after re-provisioning). */
export async function invalidateStorePrismaClient(connectorInstanceId: string): Promise<void> {
  const entry = cache.get(connectorInstanceId);
  if (!entry) return;
  cache.delete(connectorInstanceId);
  try { await entry.client.$disconnect(); } catch { /* best-effort */ }
}

/** Disconnect every cached store client (graceful shutdown). */
export async function closeAllStorePrismaClients(): Promise<void> {
  const entries = [...cache.values()];
  cache.clear();
  await Promise.allSettled(entries.map((e) => e.client.$disconnect()));
}

/** Introspection for tests/ops: which integrations currently have a live client. */
export function cachedConnectorInstanceIds(): string[] {
  return [...cache.keys()];
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY data-plane client — used for site-keyed READ paths when the data plane
// is enabled but the site has NO active store DB yet (a project with no
// integration). The data-plane models (canonicalOrder, performanceMetric,
// customerProfile, storefront*, …) live ONLY in the tenant schema, so the
// control client can't answer these queries — `controlPrisma.canonicalOrder` is
// `undefined`, which is exactly the "Cannot read properties of undefined
// (reading 'findMany')" crash. A no-integration project genuinely has no data,
// so we hand back a stub whose model reads resolve to empty results. Writes
// throw: a store-data write with no store DB is a real misconfiguration, not
// something to swallow.
// ─────────────────────────────────────────────────────────────────────────────

const READ_RESULT_BY_METHOD: Record<string, () => unknown> = {
  findMany: () => [],
  findFirst: () => null,
  findFirstOrThrow: () => null,
  findUnique: () => null,
  findUniqueOrThrow: () => null,
  count: () => 0,
  aggregate: () => ({}),
  groupBy: () => [],
};

const emptyModelProxy: any = new Proxy(
  {},
  {
    get(_t, method: string) {
      const reader = READ_RESULT_BY_METHOD[method];
      if (reader) return async () => reader();
      // create/update/upsert/delete/… — fail loud rather than silently drop.
      return async () => {
        throw new Error(
          `[tenant-prisma] Store-data write (${method}) attempted for a site with no active store database. ` +
            `Provision an integration before writing store data.`
        );
      };
    },
  }
);

const emptyDataPlaneClient: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === '$queryRaw' || prop === '$queryRawUnsafe' || prop === '$executeRaw' || prop === '$executeRawUnsafe') {
        return async () => [];
      }
      if (prop === '$transaction') {
        return async (arg: any) =>
          Array.isArray(arg) ? [] : typeof arg === 'function' ? arg(emptyDataPlaneClient) : undefined;
      }
      if (prop === '$connect' || prop === '$disconnect' || prop === '$on' || prop === '$use' || prop === '$extends') {
        return async () => undefined;
      }
      // Any other property is treated as a model delegate.
      return emptyModelProxy;
    },
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5 — data-plane routing (database-per-integration, behind a flag)
//
// `getDataPlaneClient(connectorInstanceId)` is the single switch for WRITE
// paths (sync services), `getSiteDataPlaneClient(siteId)` for site-keyed READ
// paths (dashboards/analytics):
//   • TENANT_DATA_PLANE_ENABLED off → both return the shared control client,
//     byte-for-byte the pre-cutover behavior (rollback path).
//   • on → the integration's physical store-DB client. Writes FAIL CLOSED: a
//     store whose DB is not `active` throws StoreDatabaseNotActive rather than
//     silently landing rows in the master DB (callers repair by provisioning).
//     Site reads fall back to an EMPTY data-plane client only when the site has
//     NO store DB rows at all (fresh / no-integration site) — reads resolve to
//     empty results, and a same-site read can never leak another store's data.
//     (The control client can't be used here: data-plane models live only in
//     the tenant schema.)
// ─────────────────────────────────────────────────────────────────────────────

export function isTenantDataPlaneEnabled(): boolean {
  const v = process.env.TENANT_DATA_PLANE_ENABLED;
  return v === 'true' || v === '1';
}

/**
 * The Prisma client that an integration's DATA-PLANE writes (and
 * connector-scoped reads) must use. Typed loosely (`any`) because the control
 * and store clients are distinct generated types that nonetheless share the
 * data-plane model surface (canonicalOrder, orderSnapshot, orderEvent,
 * customerProfile, …, $transaction).
 *
 * Fails closed when the data plane is enabled: if the integration's store DB
 * is not `active`, this throws instead of falling back to the master DB.
 */
export async function getDataPlaneClient(connectorInstanceId: string): Promise<any> {
  if (!isTenantDataPlaneEnabled()) return controlPrisma;
  return getStorePrismaClient(connectorInstanceId);
}

/**
 * The Prisma client(s) for SITE-keyed data-plane reads. A site (project)
 * usually has exactly one integration → one store DB. When it has none yet
 * (fresh project, or legacy data not yet backfilled) the control client is
 * returned so dashboards keep working — reads stay scoped by siteId, so this
 * can only ever surface the site's own legacy rows, never another store's.
 */
export async function getSiteDataPlaneClient(siteId: string): Promise<any> {
  const clients = await getSiteDataPlaneClients(siteId);
  return clients[0];
}

/**
 * All active store-DB clients for a site, for read paths that aggregate across
 * a multi-store site. Falls back to `[controlPrisma]` when the flag is off or
 * the site has no active store DB yet.
 */
export async function getSiteDataPlaneClients(siteId: string): Promise<any[]> {
  if (!isTenantDataPlaneEnabled()) return [controlPrisma];

  const rows = await controlPrisma.tenantDatabase.findMany({
    where: { projectId: siteId, status: 'active', connectorInstanceId: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: { connectorInstanceId: true },
  });
  if (rows.length === 0) {
    // Flag ON but the site has no store DB (no integration yet). The control
    // client can't serve data-plane models (they live only in the tenant
    // schema), so hand back an empty client → reads resolve to empty results
    // instead of crashing on `controlPrisma.canonicalOrder` being undefined.
    return [emptyDataPlaneClient];
  }
  return Promise.all(rows.map((r) => getStorePrismaClient(r.connectorInstanceId as string)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scope helpers for data that is SITE-PARTITIONED across the site's store DBs
// (alerts, alert_rules, discovered_page_urls, …). A given row lives in exactly
// ONE store DB: the store it is scoped to, or — for project-wide rows
// (connectorInstanceId null) — the site's primary store DB. Flag off / no store
// DB yet → all three collapse to the shared control client, so pre-cutover
// behavior is byte-for-byte unchanged.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WRITE (and connector-scoped READ) client for a site+optional-connector scope:
 * the specific store DB when scoped to a connector, else the site's primary
 * store DB. Follows the same single-primary-client convention the analytics
 * read paths already use for site-keyed queries.
 */
export async function getScopedClient(
  siteId: string,
  connectorInstanceId: string | null | undefined,
): Promise<any> {
  return connectorInstanceId
    ? getDataPlaneClient(connectorInstanceId)
    : getSiteDataPlaneClient(siteId);
}

/**
 * Run a READ `query` against every store DB for a site and flat-merge the
 * results. Use for site-keyed lists of site-partitioned rows (a row lives in
 * exactly one store DB, so no dedup is needed). Callers re-sort/limit the merged
 * set. Flag off / single-store site → runs once, identical to the old query.
 */
export async function queryAllSiteClients<T>(
  siteId: string,
  query: (client: any) => Promise<T[]>,
): Promise<T[]> {
  const clients = await getSiteDataPlaneClients(siteId);
  const results = await Promise.all(clients.map((c) => query(c)));
  return results.flat();
}

/**
 * Locate a single row across a site's store DBs (e.g. an alert / rule by id) and
 * return both the row and the client that owns it, so a follow-up write targets
 * the correct physical DB. Returns null when no store DB has a match.
 */
export async function findInSiteClients(
  siteId: string,
  find: (client: any) => Promise<any>,
): Promise<{ client: any; row: any } | null> {
  const clients = await getSiteDataPlaneClients(siteId);
  for (const client of clients) {
    const row = await find(client);
    if (row) return { client, row };
  }
  return null;
}
