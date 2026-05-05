# Database Migration Readiness Guide

Currently, the KPI Monitoring Platform relies on `GlobalMemoryStore` for rapid prototyping. For production, the platform is designed to split data persistence across two primary layers:

1. **Relational Database (e.g. PostgreSQL)**
   - **Purpose**: Stores configurations, user accounts, RBAC policies, and alert rules.
   - **Interface**: `RelationalDatabase` (see `src/interfaces/relational-db.interface.ts`)
   - **Migration Strategy**: 
     - Use a tool like **Prisma** or **Knex.js** for schema migrations and version control.
     - Implement `postgres-relational.adapter.ts`.

2. **Time-Series Database (e.g. ClickHouse or TimescaleDB)**
   - **Purpose**: Stores high-volume, append-only granular events (page views, clicks, order metadata) and aggregated metrics (active users, performance averages).
   - **Interface**: `TimeSeriesDatabase` (see `src/interfaces/time-series.interface.ts`)
   - **Migration Strategy**: 
     - Establish materialized views for rapid dashboard reads (e.g. downsampling data hourly/daily).
     - Implement `clickhouse-ts.adapter.ts`.

## Pre-Requisites for Deployment
- [ ] Connect `PrismaClient` (or equivalent) in the respective adapters.
- [ ] Ensure all connection strings are pulled securely via environment variables (`DB_HOST`, `DB_USER`, `DB_PASS`).
- [ ] Implement robust connection pooling to handle API throughput scaling.
- [ ] Write initialization scripts ensuring the schema automatically applies strictly in non-prod environments (`npm run migrate:dev`), but requires explicit approval in strictly CI environments (`npm run migrate:deploy`).
