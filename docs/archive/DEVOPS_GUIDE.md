# Phase 10: DevOps, Deployment & Scaling Guide

This document outlines the production-grade deployment architecture, scaling strategy, and operational procedures for the KPI Monitoring Platform.

## 1. Architecture Overview

The platform is deployed as a **containerized modular monolith** transitioning to microservices:
- **Frontend (Next.js)**: Served via AWS ECS (Fargate) with auto-scaling.
- **Backend API (Fastify)**: Handles HTTP traffic and business logic.
- **Workers (Node.js)**: Isolated background processors for data ingestion and KPI calculations.
- **Persistence**: Amazon RDS (Postgres 16) and Redis (Cache).
- **Networking**: Deployed within a dedicated VPC with public subnets (ALB) and private subnets (Apps/DB).

## 2. Deployment Instructions

### Infrastructure Provisioning (Terraform)
1. Initialize Terraform: `cd infra/terraform && terraform init`
2. Review plan: `terraform plan -var="db_password=REDACTED"`
3. Apply: `terraform apply -var="db_password=REDACTED"`

### Container Strategy
All services use multi-stage Docker builds located in `infra/docker/`.

**Local Orchestration:**
```bash
cd infra
docker-compose up --build
```

### CI/CD Pipeline
- **Validation (CI)**: `.github/workflows/ci.yml` runs on every PR (Lint, Type Check, Test).
- **Release (CD)**: `.github/workflows/cd.yml` builds and pushes Docker images to a registry on merge to `main`.

## 3. Scaling & Performance

### Horizontal Scaling
The API service is configured with **Target Tracking Auto-scaling**:
- **Metric**: Average CPU Utilization > 70%.
- **Capacity**: Scalable from 2 to 10 tasks automatically.

### Database Scaling
- **Read Replicas**: Can be enabled in `db.tf` for high-load scenarios.
- **Connection Pooling**: Managed via `drizzle-orm` and `postgres` drivers in the application layer.

## 4. Observability & Monitoring

### Centralized Logging
All logs are streamed to **Amazon CloudWatch** under the `/ecs/kpi-platform-*` log groups. Logs are structured (JSON) including `request_id` and `tenant_id` for traceability.

### Alarms
- **High CPU Alarm**: Triggers when service utilization exceeds 85%.
- **Health Checks**: ALB performs `/health` checks every 30 seconds; unhealthy tasks are terminated and replaced.

## 5. Security & Governance

- **Encryption at Rest**: RDS storage is encrypted using AES-256.
- **Encryption in Transit**: ALB handles SSL termination (port 443).
- **Network Isolation**: All application and database instances reside in private subnets with no direct internet access.

## 6. Disaster Recovery

- **Backups**: RDS retains automated daily snapshots for 7 days.
- **State Recovery**: Terraform state should be stored in an S3 bucket with versioning enabled for rollback capabilities.

---
*Created as part of Phase 10 Delivery.*
