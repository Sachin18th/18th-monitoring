# Technical Documentation

Welcome to the internal documentation for the E-Commerce Monitoring platform. This directory contains deep-dives into the architecture, operational guides, and setup procedures.

## 📖 Core Guides

1. **[Full Platform Architecture](./architecture.md)**: A complete breakdown of service communication, layered logic, and message bus design.
2. **[Local Setup Guide](./setup-guide.md)**: step-by-step instructions for developers to get the platform running locally.

## 🧱 Module Documentation

For documentation specific to a functional area, please refer to the README files located within the respective module directories:

### Applications (`/apps`)
- **[Dashboard API & Server](../apps/api/README.md)**: Ingestion logic and middleware.
- **[Monitoring UI](../apps/dashboard/README.md)**: Metrics visualization and components.

### Services (`/services`)
- **[KPI Processor](../services/processor/README.md)**: Stream aggregation and computation logic.
- **[Alert Engine](../services/alert-engine/README.md)**: Threshold evaluation and lifecycle.

### Packages (`/packages`)
- **[Shared Types](../packages/shared-types/README.md)**: Contracts and domain models.
- **[Configuration](../packages/config/README.md)**: JSON-based site overrides.
- **[Events](../packages/events/README.md)**: Standardized event schemas.

---
*For high-level project information, see the [Root README](../README.md).*
