# Configuration Package

The dynamic configuration engine responsible for multi-tenant settings and SLA thresholds.

## 1. Overview

The Configuration package provides a robust mechanism to manage site-specific settings. It allows the platform to use **Global Defaults** for general behavior while permitting **Site Overrides** for specific performance thresholds, tracking flags, and sampling rates.

## 2. Responsibilities

- **Static Resolution**: Load configuration from JSON files stored on disk.
- **Hierarchical Merging**: Merge Global Defaults with Site-Specific overrides.
- **BOM Handling**: Clean and strip Byte Order Mark (BOM) characters from JSON files to prevent parsing errors.
- **Schema Validation**: (Future) Ensure configuration files adhere to the expected structure.

## 3. How It Fits in Architecture

- **Dependency Provider**: Used by almost every service to determine behavior.
  - **JS Agent**: Fetches its tracking config on initialization.
  - **Alert Engine**: Fetches thresholds for rule evaluation.
  - **API**: Uses config to determine ingestion limits.

## 4. Key Components

- **`src/`**:
  - `resolver.ts`: The `ConfigResolver` class that performs the file loading and merging logic.
- **JSON Store** (Relative to workspace root):
  - `global-default.json`: Baseline settings for all sites.
  - `thresholds.json`: Default alerting limits.
  - `tracking.json`: Module enablement defaults.

## 5. Merging Logic

The configuration resolver uses high-performance object merging:
1. Load `global-default.json`.
2. Look for `packages/config/overrides/[siteId].json`.
3. If found, deep-merge the override into the global object.
4. return the final resolved configuration.

## 6. Local Development

Files are located in `packages/config/`. To add a new threshold:
1. Update `global-default.json` with the new key.
2. The `ConfigResolver` will automatically pick it up across all services.

## 7. Future Improvements

- **Database Backing**: Switch from JSON files to a central Config Database (e.g., Redis or PostgreSQL) for zero-latency updates.
- **Admin UI**: Add a UI to the Dashboard to edit thresholds directly without code changes.
- **Validation**: Add AJV/JSON Schema validation to catch configuration errors before they reach services.
