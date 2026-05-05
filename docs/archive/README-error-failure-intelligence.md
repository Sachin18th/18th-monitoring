# Phase 3: Error & Failure Intelligence

## Overview
Phase 3 establishes a structured reliability intelligence system that captures, classifies, and operationalizes failures across the full monitoring ecosystem. It bridges technical exceptions with business-impacting breakdowns.

## Failure Capture Architecture
The platform now monitors reliability across four distinct domains:
1.  **Frontend (UI/JS)**: Automatic capture of runtime errors and unhandled promise rejections.
2.  **Backend (API)**: Capture of 4xx/5xx responses and service-level exceptions.
3.  **Business Journeys**: Instrumentation of soft failures like "Add to Cart failed" or "Checkout Timeout".
4.  **Third-Party**: Tracking of external script load failures (GTM, Payment Gateways, etc.).

## Failure Taxonomy
All failures are normalized and classified using the following dimensions:
- **Category**: UI, API, Validation, Payment, Infrastructure, Business Logic, Third-Party.
- **Severity**: Critical (Blocking), High (Degraded), Medium (Notice), Low (Noise).
- **Fingerprinting**: Automatic MD5-based fingerprinting of error signatures for issue grouping.

## Dashboard Features
- **Failure Rate Trends**: Visualizing JS and API error volume over time.
- **Top Recurring Issues**: Grouped view of failures with impact metrics (events vs. affected users).
- **Business Impact Summary**: High-level analysis of how failures correlate with funnel drop-offs (Checkout, Cart, Search).
- **Domain Health KPIs**: Instant status of UI, API, Payment, and Third-Party stability.

## SDK Usage
The `MonitoringSDK` has been updated with explicit error tracking methods:

```javascript
// Manual exception capture
MonitoringSDK.captureException(new Error("Component failed"), { component: "Header" });

// Business failure capture
MonitoringSDK.captureBusinessFailure("PAYMENT", "Gateway Timeout", { provider: "Stripe" });
```

## Data Model & Correlation
Failure events include a `failureIntelligence` object:
```json
{
  "fingerprint": "a1b2c3d4...",
  "severity": "CRITICAL",
  "category": "PAYMENT",
  "isThirdParty": true
}
```
These are correlated with `sessionId` from Phase 1 and `correlationId` from Phase 2 for end-to-end trace diagnostics.
