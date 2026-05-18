# Customer Intelligence Backend Reference

This document describes the identity-aware customer intelligence data layer and sessionization engine.

## 1. Canonical Identity Model
The system resolves customer identity across multiple sources (Storefront, CRM, Web) to build a unified path.

### Identity Resolution
- **Identity Stitching**: Linking anonymous visitor sessions to authenticated user profiles upon login.
- **Privacy-Safe PII**: Sensitive identifiers like emails are stored using SHA256 hashes to ensure privacy compliance while maintaining deterministic matching.
- **Identity Links**: Tracking the history of profile merges with confidence scores (Strong vs Soft links).

---

## 2. Event Taxonomy & Ingestion
Events are classified into standardized buckets to support operational intelligence:
- **ACQUISITION**: First visits, campaign landings (tracks UTMs).
- **VIEW / INTERACTION**: Page views, product clicks, searches.
- **CART**: Add/remove from cart events.
- **PURCHASE**: Successful conversions.
- **RETENTION**: Account logins, loyalty interactions.

---

## 3. Sessionization Engine
The backend automatically constructs sessions from raw events:
- **Timeout Logic**: Sessions are closed after 30 minutes of inactivity.
- **Outcome Tracking**: Every session is tagged with its final state (e.g., `Converted`, `Bounced`).
- **Device Context**: Captures browser, OS, and device type for cross-platform journey reconstruction.

---

## 4. Lifecycle & Behavioral Scoring
Customer profiles evolve through a rule-driven lifecycle:
1. `NEW_VISITOR`: First recorded event.
2. `ENGAGED_USER`: Reaching interaction thresholds.
3. `CART_STARTER`: High intent behavior detected.
4. `PURCHASER`: Successful conversion event recorded.
5. `REPEAT_PURCHASER`: Multiple purchases across different sessions.
6. `CHURN_RISK`: No activity detected beyond threshold.

---

## 5. Segmentation & Cohorts
- **Acquisition Cohorts**: Analysis of user behavior based on their first-seen date.
- **Behavioral Segments**: Dynamic grouping by lifecycle stage (e.g., "Dormant High-Value Users").
- **Attribution Performance**: Aggregating conversion rates by UTM Source, Medium, and Campaign to identify the highest ROI channels.

---

## 6. Privacy & Governance
- **Right to be Forgotten**: Identity resolution architecture supports selective deletion of linked history.
- **Tenant Isolation**: Strict `siteId` scoping ensures customer data never leaks across projects.
