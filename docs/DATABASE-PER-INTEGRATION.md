# Database-per-Integration (Store Databases)

Every **integration** (a `ConnectorInstance` = one connected store) gets its **own physical
Postgres database**. All of that store's data — orders, products, categories, checkouts,
customers, storefront sessions/events/errors, performance metrics/rollups — lives in its store
DB. The master DB (`DATABASE_URL`) keeps **control-plane** data only: tenants, projects, users,
RBAC, connector instances/credentials/sync runs, alerts, alert rules, discovered page URLs.

This mirrors the `ai-agent-ecom` pattern (store = isolated DB), adapted to this platform.

## Flow

```
POST /integrations (create)                    ┌─ control plane (master DB) ─┐
  └─ ConnectorInstance + Credential + Event ──▶│ connector_instances          │
  └─ background runInitialSetup:               │ tenant_databases  (registry) │
       1. provisionStoreDatabase(instanceId)   └──────────────────────────────┘
          • CREATE DATABASE kpi_store_<instanceId>
          • prisma migrate deploy (tenant schema)
          • verify + encrypt URL → tenant_databases row = active
       2. initial order/customer/product syncs
          → getDataPlaneClient(instanceId) → store DB   ◀── all store data
```

- **State machine** (`tenant_databases`): `pending → provisioning → active | failed`,
  re-runs repair `failed`/stale rows (idempotent).
- **Writes fail closed**: with `TENANT_DATA_PLANE_ENABLED=true`, a sync whose store DB is not
  `active` throws `StoreDatabaseNotActive` — data can never silently land in the master DB.
- **Site reads** (`getSiteDataPlaneClient(siteId)`) resolve the site's store DB; a site with no
  store DB yet falls back to the master DB (reads stay scoped by `siteId`, so no cross-store leak).
- Rows with `connector_instance_id NULL` in `tenant_databases` are legacy per-tenant databases
  and are ignored by the resolver.

## Key code

| Piece | Path |
|---|---|
| Store-DB registry (control plane) | `packages/db/prisma/schema.prisma` → `TenantDatabase` (unique `connectorInstanceId`) |
| Store data-plane schema + migrations | `packages/db/prisma/tenant/` |
| State machine | `apps/api/src/services/tenant-database.service.ts` |
| Provisioner (`provisionStoreDatabase`) | `apps/api/src/services/tenant-database-provisioning.service.ts` |
| Client routing (`getDataPlaneClient`, `getSiteDataPlaneClient`) | `apps/api/src/lib/tenant-prisma.ts` |
| Provisioning trigger | `apps/api/src/controllers/integration.controller.ts` → `runInitialSetup` |
| Backfill | `apps/api/src/scripts/backfill-store-databases.ts` |

## Rollout on an existing environment

1. **One-time DB grant** (superuser) — the app role must be able to create databases:
   ```sql
   ALTER ROLE cartexel_app CREATEDB;
   ```
2. Apply the control-plane migration and regenerate clients:
   ```bash
   cd packages/db
   npx prisma migrate deploy --schema=./prisma/schema.prisma
   npm run db:generate && npm run db:generate:tenant
   ```
3. Backfill existing store data into per-integration DBs (provisions DBs as needed):
   ```bash
   cd apps/api
   npm run backfill:stores -- --dry-run   # inspect counts first
   npm run backfill:stores                # copy
   npm run backfill:stores -- --prune     # optional: remove copied rows from master
   ```
   Legacy rows with `connector_instance_id NULL` are assigned by site only when the site has
   exactly one connector; ambiguous rows are reported and skipped.
4. Enable routing: `TENANT_DATA_PLANE_ENABLED=true` in `apps/api/.env` (already set), restart.

Setting the flag to `false` reverts every read/write to the master DB (rollback path).

## Notes / limitations

- A multi-store **site** aggregates dashboards from its **first** store DB
  (`getSiteDataPlaneClient` returns the first active one; `getSiteDataPlaneClients` returns all
  for future cross-store aggregation). One store per project is the expected shape.
- `services/alert-engine` and `services/processor` write only control-plane (alerts) or
  neutralized tables, so they keep using the master client.
- Integration deletion sets `tenant_databases.connector_instance_id` NULL (SetNull FK); the
  physical database is intentionally NOT dropped — clean up manually after review.
