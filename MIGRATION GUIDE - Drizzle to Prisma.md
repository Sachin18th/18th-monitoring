# Migration Guide: Drizzle ORM to Prisma

## Overview

Your current database layer uses **Drizzle ORM** with PostgreSQL. This guide explains how to migrate to **Prisma** while maintaining your existing architecture and interfaces.

---

## Current Architecture (Drizzle)

```
packages/db/
├── src/
│   ├── config/db-connection.ts       # Database connection factory
│   ├── adapters/postgres-relational.adapter.ts
│   ├── drizzle/
│   │   ├── schema.ts                 # Schema exports
│   │   └── domains/
│   │       ├── iam.ts               # tenants, users, projects tables
│   │       ├── customers.ts
│   │       ├── analytics.ts
│   │       └── ... (other domains)
│   └── interfaces/
│       ├── relational-db.interface.ts
│       └── time-series.interface.ts
```

---

## Step-by-Step Migration Process

### Step 1: Install Prisma Dependencies

Add to `packages/db/package.json`:

```json
{
  "dependencies": {
    "@prisma/client": "^5.0.0"
  },
  "devDependencies": {
    "prisma": "^5.0.0"
  }
}
```

Run: `npm install`

---

### Step 2: Initialize Prisma

In the `packages/db/` directory, run:

```bash
npx prisma init
```

This creates:
- `prisma/schema.prisma` - Your new database schema
- `.env` - Environment variable file

---

### Step 3: Convert Drizzle Schema to Prisma Schema

Map your existing Drizzle tables to Prisma models:

**Current Drizzle (iam.ts):**
```typescript
export const tenants = pgTable('tenants', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  status: varchar('status', { length: 50 }).default('ACTIVE'),
  plan: varchar('plan', { length: 50 }).default('FREE'),
  settings: jsonb('settings').default('{}'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

**Convert to Prisma Schema:**
```prisma
model Tenant {
  id        String   @id @default(uuid()) @db.VarChar(36)
  name      String   @db.VarChar(255)
  slug      String   @unique @db.VarChar(255)
  status    String   @default("ACTIVE") @db.VarChar(50)
  plan      String   @default("FREE") @db.VarChar(50)
  settings  Json     @default("{}")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  projects  Project[]
  users     User[]
  @@map("tenants")
}
```

**Repeat for all tables:**
- projects (SiteConfigs)
- users
- userProjectAccess
- configVersions
- iamAuditLogs
- And all domain schemas (customers, analytics, ingestion, orders, observability, recovery, pipeline, integrations)

---

### Step 4: Generate Prisma Client

Run:
```bash
npx prisma generate
```

This creates the typed Prisma Client in `node_modules/@prisma/client`.

---

### Step 5: Create Prisma Client Instance

Create new file `packages/db/src/prisma-client.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

---

### Step 6: Update Database Connection Factory

Modify `packages/db/src/config/db-connection.ts`:

**Before (Drizzle):**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../drizzle/schema';

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

**After (Prisma):**
```typescript
import { prisma } from '../prisma-client';

export const DatabaseFactory = {
    getTimeSeriesDb: () => new InMemoryTimeSeriesAdapter(),
    getEventStoreDb: () => new InMemoryEventAdapter(),
    getRelationalDb: () => prisma,  // Use Prisma Client
};
```

---

### Step 7: Convert Query Patterns

**Drizzle Queries:**
```typescript
import { eq } from 'drizzle-orm';
import { tenants } from '../drizzle/domains/iam';

const result = await db.select()
  .from(tenants)
  .where(eq(tenants.id, tenantId));
```

**Prisma Queries:**
```typescript
const result = await prisma.tenant.findUnique({
  where: { id: tenantId }
});
```

**Examples:**
| Operation | Drizzle | Prisma |
|-----------|---------|-------|
| Find by ID | `db.select().from(tenants).where(eq(tenants.id, id))` | `prisma.tenant.findUnique({ where: { id } })` |
| Find many | `db.select().from(users).where(eq(users.tenantId, tid))` | `prisma.user.findMany({ where: { tenantId: tid } })` |
| Create | `db.insert(tenants).values(data)` | `prisma.tenant.create({ data })` |
| Update | `db.update(tenants).set(data).where(eq(tenants.id, id))` | `prisma.tenant.update({ where: { id }, data })` |
| Delete | `db.delete(tenants).where(eq(tenants.id, id))` | `prisma.tenant.delete({ where: { id } })` |

---

### Step 8: Maintain Interface Compatibility

Keep your existing interfaces while implementing with Prisma:

```typescript
// packages/db/src/repositories/relational.repository.ts
import { prisma } from '../prisma-client';

export class RelationalRepository {
  async getTenant(tenantId: string) {
    return await prisma.tenant.findUnique({
      where: { id: tenantId }
    });
  }
  
  async getSiteMetadata(siteId: string) {
    return await prisma.project.findUnique({
      where: { id: siteId }
    });
  }
  
  async getUsersByProject(projectId: string) {
    return await prisma.user.findMany({
      where: { projects: { some: { id: projectId } } }
    });
  }
}
```

This approach allows you to:
1. Keep your existing `RelationalRepository` interface unchanged
2. Simply swap the underlying implementation from Drizzle to Prisma
3. Update consumers gradually without breaking existing code

---

## Migration Benefits with Prisma

| Aspect | Drizzle | Prisma |
|--------|---------|-------|
| Type Safety | Manual schema inference | Full auto-generated types |
| Migrations | Manual SQL or CLI | `npx prisma migrate` |
| Schema Visualization | VS Code extension | Built-in Prisma Studio |
| Query Building | SQL-like syntax | Fluent API |
| Relations | Manual joins | Auto-included relations |
| Documentation | External | Auto-generated from schema |

---

## Recommended Migration Order

1. **Install & Initialize** - Set up Prisma
2. **Schema Conversion** - Map all Drizzle tables to Prisma models
3. **Client Setup** - Create singleton Prisma Client
4. **Factory Update** - Update DatabaseFactory to use Prisma
5. **Repository Implementation** - Reimplement interfaces with Prisma
6. **Incremental Rollout** - Update one domain at a time
7. **Remove Drizzle** - Clean up old code after full migration

---

## Important: Understanding Your Schemas

Your project has **two separate types of schemas** that serve different purposes:

### 1. Database Schemas (packages/db/src/drizzle/)
These define your **database tables and relationships** - your Drizzle schema files in `packages/db/src/drizzle/domains/` (iam.ts, customers.ts, analytics.ts, etc.)

**Migration impact:** These MUST be converted to Prisma schema as described in the guide above.

### 2. API Exposure Schemas (apps/api/src/exposure/schemas/)
These are **Zod validation schemas** for your API responses - they define what your API endpoints return to clients:
- `platform.schema.ts` - Platform KPIs, health status, customers, integrations
- `performance.schema.ts` - Performance metrics
- `orders.schema.ts` - Order data
- `common.schema.ts` - Common response types

**Migration impact:** These are **NOT affected** by the database migration. They remain unchanged.

The API schemas validate responses at the exposure layer, while the database schemas define how data is stored. They are independent layers:
- **Zod schemas** (apps/api/src/exposure/schemas/) → API layer validation
- **Drizzle/Prisma schemas** (packages/db/src/drizzle/) → Database layer

---

## Is the Migration Guide Sufficient?

**Yes**, the guide I provided covers everything needed to migrate from Drizzle ORM to Prisma for your database layer.

Here is the complete picture:

| Layer | Current | After Migration | Needs Change? |
|-------|---------|-----------------|---------------|
| Database Schema | Drizzle (packages/db/src/drizzle/) | Prisma (prisma/schema.prisma) | ✅ Yes - convert |
| Database Client | drizzle-orm + postgres-js | @prisma/client | ✅ Yes - swap |
| Database Factory | DatabaseFactory.ts | Same pattern, new client | ✅ Yes - update |
| Repository Interfaces | RelationalRepository | Same interface, Prisma impl | ✅ Yes - update queries |
| API Schemas (Zod) | apps/api/src/exposure/schemas/ | Same Zod schemas | ❌ No - independent |
| In-Memory Adapters | InMemory adapters | Same adapters | ❌ No - unchanged |
| Docker/Infra | docker-compose.yml | Same (just change env vars) | ❌ No - already configured |

---

## Additional Consideration: Docker & Environment Variables

If you're running your database via Docker (see `infra/docker-compose.yml`), the migration to Prisma does NOT require any Docker changes. Your PostgreSQL database continues to work the same way.

What may need updating:
1. **Environment variables** - Ensure `DATABASE_URL` is properly set in your Docker Compose
2. **Prisma migrate** - Run `npx prisma migrate dev` to create initial migration files for your database

---

## Summary

- The **API schemas** in `apps/api/src/exposure/schemas/` (Zod schemas) are **completely independent** from the database ORM layer - they define API response shapes, not database tables
- The migration guide is **complete** - it covers all the changes needed to switch from Drizzle to Prisma
- Your Docker/database infrastructure **does not need changes** - Prisma works with the same PostgreSQL database

---

## Notes

- Your current `DatabaseFactory` pattern can remain the same
- Interfaces (`RelationalRepository`, etc.) can stay unchanged
- The InMemory adapters can continue to work alongside Prisma
- Consider running both in parallel during migration for rollback capability
- Your existing models (Tenant, Metric) can be replaced or wrapper around Prisma types
