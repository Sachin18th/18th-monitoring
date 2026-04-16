# Simulation & Scripts Library (`scripts/`)

This directory houses the foundational orchestrations validating data inputs, schema stability, and Quality Assurance limits.

## 1. End-To-End Event Simulation (`e2e-simulation.ts`)

### 🎯 Purpose
Simulates high-density data ingestion mimicking traffic equivalent to an active e-commerce pipeline natively bypassing browser limits to directly hydrate system event buses.

### 📝 What it Generates
It natively crafts isolated events targeting specific sites simulating:
- `page_view` limits with overloaded `loadTime` parameters natively crashing thresholds.
- `js_error` telemetry strings verifying rule limits incrementing counters internally.
- `oms_sync_failed` back-end traces triggering Integration Alerts dynamically mapping to ERP rules locally.

### ⚙️ Required Inputs
When fetching Dashboard parameters downstream inside the pipeline ensuring stability, specific DTO inputs **must** be implemented restricting API sweeps:
- `siteId: string` - Enforces isolation.
- `timeRange?: string` - Strict evaluations required dynamically computing the standard health states. (Usually `24h`)
*Note: Failing to map DTOs inside `DashboardService` fetches dynamically will cause missing references resulting in `⨯ Unable to compile TypeScript` bounds.*

### 🛠️ How to run it
```bash
npm run start:simulation
```
*Note*: This executes relying heavily on Native `tsx` imports mapping the backend workspace natively protecting typings contextually.

---

## 2. Platform Cleanup Scripts (`cleanup.js`)

### 🎯 Purpose
Walks through deep project boundaries removing obsolete endpoints/hardcoded strings dynamically. 
Used gracefully to clean the core directory paths (`apps/dashboard/src/app`) executing mass-substitution logic securing architecture environments targeting `.env` limits securely.

--- 

## 3. General Executables
*Scripts in this layer act explicitly without needing full backend structures initialized explicitly unless generating dashboard metrics checks locally securely.*
