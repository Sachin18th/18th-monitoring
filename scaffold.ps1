$basePath = "c:\kpi monitoring"
cd $basePath

# Define folders
$folders = @(
    "apps/dashboard/src",
    "apps/api/src/routes",
    "services/processor/src",
    "services/alert-engine/src",
    "packages/shared-types/src",
    "packages/config",
    "packages/events/src",
    "agent/js-monitoring-agent/src",
    "infra",
    "docs"
)

foreach ($f in $folders) {
    New-Item -ItemType Directory -Force -Path $f | Out-Null
}

# Create placeholder files with content
function Write-File {
    param([string]$Path, [string]$Content)
    Set-Content -Path $Path -Value  $Content.Trim() -Encoding UTF8
}

Write-File "apps/dashboard/README.md" @"
# Dashboard App
Next.js application for KPI monitoring, alert visualization, and admin management.
"@

Write-File "apps/dashboard/.env.example" @"
# Sample Environment for Dashboard
NEXT_PUBLIC_API_URL=http://localhost:4000
"@

Write-File "apps/api/README.md" @"
# Ingestion & Dashboard API
Handles high-throughput ingestion of events from browser agent and server endpoints.
"@

Write-File "apps/api/.env.example" @"
# Sample Environment for API
PORT=4000
KAFKA_BROKERS=localhost:9092
"@

Write-File "apps/api/src/routes/browser.ts" @"
// Handles browser event ingestion (Performance, Errors, User clicks)
// Endpoint: /i/browser
// Validates payload schema and pushes to Kafka stream
export const browserIngestRoute = async (req, res) => {
    // Scaffold: Push to stream processor
};
"@

Write-File "apps/api/src/routes/server.ts" @"
// Handles server event ingestion (Order Placed, OMS sync)
// Endpoint: /i/server
// Validates schema and pushes to Kafka stream
export const serverIngestRoute = async (req, res) => {
    // Scaffold: Push to stream processor
};
"@

Write-File "services/processor/README.md" @"
# Stream Processor Service
Computes real-time KPIs and aggregates events consumed from message broker.
"@

Write-File "services/processor/src/index.ts" @"
// Entry point for stream consumer
// Connects to Kafka, reads events, and orchestrates KPI computation
console.log('Processor started');
"@

Write-File "services/processor/src/kpi-engine.ts" @"
// Core logic for processing specific KPI categories (Performance, Orders, Funnels)
export const computeKpi = (event) => {
    // Scaffold: Calculate TTFB, LCP or Order failure rates
};
"@

Write-File "services/alert-engine/README.md" @"
# Alert Engine
Evaluates thresholds and triggers notifications based on rules.
"@

Write-File "services/alert-engine/src/index.ts" @"
// Evaluates rules based on time-series aggregated data
// Triggers Slack/Email webhooks if thresholds breached
console.log('Alert Engine bounds watcher started');
"@

Write-File "packages/shared-types/README.md" @"
# Shared Types
TypeScript interfaces for cross-module type safety.
"@

Write-File "packages/shared-types/src/index.ts" @"
// Main export for all shared types
export interface BaseEvent {
    eventId: string;
    siteId: string;
    timestamp: string;
}
"@

Write-File "packages/config/README.md" @"
# Global Configuration
Centralized tracking behavior and alert definitions.
"@

Write-File "packages/config/tracking.json" @"
{
  "tracking": {
    "performance": true,
    "user": true,
    "errors": true
  },
  "sampling": {
    "sessionRate": 1.0
  }
}
"@

Write-File "packages/config/thresholds.json" @"
{
  "thresholds": {
    "pageLoadMs": 3000,
    "errorRatePct": 2,
    "orderDelayMin": 60
  }
}
"@

Write-File "packages/events/README.md" @"
# Events Schema
Base definitions and validation for event payloads.
"@

Write-File "packages/events/src/schema.ts" @"
// Base event schema definition (e.g. using Zod or pure TS)
export const EventSchema = {
    // Scaffold definitions matching TRD section 4.1
    eventId: 'uuid',
    siteId: 'string',
    eventType: 'string',
    timestamp: 'ISO',
    sessionId: 'string',
    userId: 'string',
    metadata: {}
};
"@

Write-File "agent/js-monitoring-agent/README.md" @"
# JS Monitoring Agent
Embeddable client script that gathers core web vitals and user session tracking metrics.
"@

Write-File "agent/js-monitoring-agent/src/index.ts" @"
// Lightweight execution entry point
// Connects to window/performance API and batches payloads
import { trackPerformance } from './tracker';
"@

Write-File "agent/js-monitoring-agent/src/tracker.ts" @"
// Hooks for PerformanceObserver
// Captures TTFB, FCP, LCP
export const trackPerformance = () => {
    // Scaffold: Capture metrics
};
"@

Write-File "infra/docker-compose.yml" @"
# Local Dev Services Placeholder
version: '3.8'
services:
  kafka:
    image: bitnami/kafka:latest
  clickhouse:
    image: clickhouse/clickhouse-server
"@

Write-File "docs/architecture.md" @"
# Full Platform Architecture
Placeholder for system diagrams, module communication patterns, and queue details.
"@

Write-File "docs/setup.md" @"
# Local Setup Guide
Instructions to stand up local environment using docker-compose and running apps.
"@

Write-File "README.md" @"
# E-Commerce Monitoring & Reporting Platform
Root repository for lightweight monitoring stack.
"@
