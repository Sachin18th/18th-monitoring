# Infrastructure Module

The orchestration and deployment definitions for the E-Commerce Monitoring platform.

## 1. Overview

The Infrastructure module contains the scripts, configurations, and templates required to deploy the monitoring platform across various environments—from local Docker-based development to large-scale Kubernetes clusters.

## 2. Responsibilities

- **Orchestration**: Manage the lifecycle of the API, Dashboard, and Stream Processing services.
- **Environment Provisioning**: Define the underlying hardware/cloud resources (vCores, RAM, Networking).
- **Service Mesh**: (Future) Configure communication policies between internal services.
- **Scaling Policies**: Define horizontal scaling triggers for ingestion and processing nodes.

## 3. How It Fits in Architecture

- **The Foundation**: It wraps all other modules (`apps`, `services`, `packages`) for consistent deployment.
- **Operational Interface**: The primary entry point for DevOps and SRE teams to manage the platform survival.

## 4. Key Components

- **`docker/`**:
  - `docker-compose.yml`: Local orchestrator that starts the Ingestion API and Dashboard in parallel.
  - `Dockerfile`: standard multi-stage builds for the TypeScript applications.
- **`k8s/`**: (Future) Kubernetes manifests for Helm charts or raw YAML deployments.
- **`terraform/`**: (Future) Infrastructure as Code (IaC) templates for AWS/Azure/GCP resources.

## 5. Local Orchestration (Docker)

To start the entire platform using Docker:
```bash
cd infra/docker
docker-compose up --build
```
This will launch:
1. **API**: exposed on port 4000.
2. **Dashboard**: Exposed on port 3000.

## 6. Cloud Readiness

The platform is built with **Cloud-Native** principles:
- **Statelessness**: Services can be scaled horizontally behind a Load Balancer.
- **Configuration**: All secrets and settings are injected via environment variables.
- **Observability**: Standardized logging (Pino) and health check endpoints `/health` are included in every service.

## 7. Configuration

Environmental variables used by orchestration:
- `DOCKER_API_PORT`: Mapping for the Fastify server.
- `DOCKER_DASHBOARD_PORT`: Mapping for the Next.js UI.

## 8. Future Improvements

- **Helm Charts**: Standardize Kubernetes deployments for production environments.
- **CI/CD Pipelines**: Integration with GitHub Actions or GitLab CI for automated testing and deployment.
- **Monitoring for the Monitor**: Integrate Prometheus/Grafana to watch the health of the monitoring platform itself.
- **Terraform Providers**: Deep integration with cloud providers for managed database and Kafka instances.
