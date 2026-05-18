# Phase 5: Synthetic Monitoring System

## Overview
Phase 5 implements a proactive monitoring layer that executes critical eCommerce journeys at regular intervals. This allows the platform to detect availability and flow issues before they impact real users.

## Architecture
- **Synthetic Runner**: A headless execution engine that simulates user behavior across multiple steps.
- **Journey Registry**: Predefined, configurable journeys for `STOREFRONT_HEALTH` and `PURCHASE_FLOW`.
- **Scheduler**: A recurring background service that orchestrates runs across projects and environments.
- **Result Persistence**: Every run is ingested as a `synthetic_run` event, capturing step-level duration and failure evidence.

## Implemented Journeys
1.  **Storefront Health**: Homepage -> Search -> Results -> Product Click.
2.  **Purchase Flow**: PDP -> Add to Cart -> Cart View -> Checkout Reachability.

## Dashboard Features
- **System Availability KPI**: 24h uptime percentage based on synthetic pass/fail rates.
- **Historical Timeline**: Visual representation of the last 48 runs.
- **Failure Diagnostics**: Detailed breakdown of failed steps, including error messages and screenshot references.
- **Journey Health Cards**: Aggregated performance and uptime stats per journey.

## Scheduling
- **Default Cadence**: 10 minutes.
- **Retries**: Immediate retry on failure to distinguish flakiness from real outages.
- **Safety**: Bounded concurrency to ensure server stability.

## Data Model
`synthetic_run` events include:
- `runId`: Unique execution identifier.
- `status`: PASS | FAIL.
- `steps[]`: List of steps with individual duration and status.
- `screenshotUrl`: Reference to failure evidence captured during the run.
