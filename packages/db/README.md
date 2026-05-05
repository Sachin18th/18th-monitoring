# Persistence Package (DB)

The data abstraction layer and multi-tenant storage engine for metrics, events, alerts, users, and projects.

## 1. Overview

The DB package provides a modular persistence layer using the **Adapter Pattern**. It abstracts the details of metrics, configuration, and identity storage, allowing the platform to move between in-memory mock storage and production databases (PostgreSQL/TimescaleDB) with zero changes to business logic.

## 2. Shared Multi-Tenant Store

The package manages a singleton `GlobalMemoryStore` which serves as the source of truth for all services during the MVP phase. It includes seeded data for projects, roles, and users to facilitate immediate testing.

### Data Domains
- **Time-Series (`metrics`)**: In-memory array of KPI records, optimized for `siteId` filtering.
- **Identity (`users`)**: Map of user profiles containing hashed credentials, roles, and `assignedProjects`.
- **Tenant Context (`projects`)**: Master registry of shops/sites and their metadata.
- **Incidents (`alerts`)**: Record of active and historical threshold breaches.

## 3. Storage Adapters

### `InMemoryTimeSeriesAdapter`
Handles high-frequency metric ingestion and retrieval. Supports querying KPI averages by site and time range.

### `InMemoryRelationalAdapter`
Handles configuration, alert states, and IAM (Identity and Access Management).
- **Project Scoping**: Provides `getUsersByProject` and `getAlertRules` with strict tenant filtering.
- **User CRUD**: Supports creating and deactivating customer accounts.

## 4. Security & Seeding

The store includes a `seed()` method that populates:
- **Super Admin**: Global owner of all projects.
- **Project Admin**: Manager of a specific store.
- **Customer**: View-only participant.

Passwords are cryptographically hashed using **scrypt** within the store wrapper to simulate production security.

## 5. Local Development

Data persists as long as the API/Processor process is running. A restart resets the environment to the seeded baseline.

## 6. Future Improvements

- **PostgreSQL Adapter**: Transition relational data (Users/Alerts/Projects) to a persistent SQL store.
- **ClickHouse/TimescaleDB**: Offload metric storage to a specialized high-scale time-series DB.
- **Migration Engine**: Implement a robust schema migration pipeline for project and user definitions.
