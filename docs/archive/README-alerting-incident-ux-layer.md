# Phase 6: Alerting, Incident & Monitoring UX

## Overview
Phase 6 transforms the platform from a collection of dashboards into an actionable operational console. It introduces proactive alerting, structured incident management, and a unified command center for investigating platform issues.

## Architecture
- **Alert Engine**: Evaluates real-time signals from RUM, API monitoring, Failure Intelligence, and Synthetic checks against configurable rules.
- **Incident Manager**: Handles the lifecycle of issues (Open, Investigating, Monitoring, Resolved) and ensures deduplication of repeated alerts.
- **Unified UX**: Reorganizes the platform navigation into a "Command Center" for high-level actionability and an "Operational Surface" for deep diagnostics.

## Key Features
- **Alert Center**: A centralized hub for viewing active and historical alerts, categorized by severity and signal source.
- **Incident Center**: A timeline-based view for managing major platform outages, with support for status tracking and evidence linkage.
- **Proactive Ingestion**: The ingestion pipeline now automatically triggers the Alert Engine for every incoming event, enabling near-real-time detection.
- **Deduplication**: Alerts are automatically clustered into active incidents to prevent operator noise and alert storms.

## Alert Rules (Predefined)
1.  **High API Error Rate**: Triggers on 5xx responses from backend APIs.
2.  **Checkout Funnel Drop**: Triggers on sudden drops in completion rates detected by the Journey Engine.
3.  **Synthetic Failure**: Triggers immediately when a proactive synthetic monitor fails.
4.  **Failure Intelligence Spike**: Triggers when critical JS errors or business failures are detected.

## Unified Monitoring UX
The platform navigation has been restructured:
- **Command Center**: Overview, Alerts, and Incidents.
- **Operational Surface**: Performance, RUM, Backend API, Failure Intel, Journey Intel, and Synthetic.

## Incident Lifecycle
Incidents move through a structured workflow:
`OPEN` -> `INVESTIGATING` -> `MONITORING` -> `RESOLVED`
Each incident maintains references to the original alerts and evidence (screenshots, stack traces, etc.).
