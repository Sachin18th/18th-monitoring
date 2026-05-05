# Deployment Guide

This platform utilizes Docker and Docker Compose to containerize workloads.

## Infrastructure Stack
1. **API Service (`apps/api`)**: Node.js Fastify handling Auth and Data Ingestion.
2. **Dashboard (`apps/dashboard`)**: Next.js 15 SSR serving UI.
3. **Message Queue**: Apache Kafka (routing metrics via the Processor layer).
4. **Time Series Store**: ClickHouse (high-ingestion datastore).
5. **Relational DB**: PostgreSQL (persisting User Accounts and Alert Configurations). *(To be bound in Phase 3)*

## Production Startup

Execute the stack via the production docker-compose schema:

```bash
cp apps/api/.env.example apps/api/.env.local
cp apps/dashboard/.env.example apps/dashboard/.env.local

# Build and start services in detached mode
docker-compose -f infra/docker-compose.prod.yml up -d --build
```

### Environment Overrides
To inject environment variables via CI/CD, use:
- `SESSION_SECRET`: Requires a 256-bit cryptographically secure string for signing sessions.
- `KAFKA_BROKERS`: Change from `kafka:9092` to your production managed Kafka cluster endpoint (e.g., Confluent Cloud or MSK).
- `NODE_ENV`: Must explicitly equal `production` to activate Next.js `.next/standalone` optimized modes and mute verbose Fastify logging.
