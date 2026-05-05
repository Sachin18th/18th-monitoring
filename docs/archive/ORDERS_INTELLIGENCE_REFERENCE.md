# Orders Monitoring & Intelligence Backend Reference

This document describes the canonical domain model and intelligence layer for order monitoring.

## 1. Canonical Order Domain Model
The system uses a unified "Truth Layer" to represent orders regardless of their source (Shopify, Magento, POS, manual).

### Core Structure
- **Lifecycle State**: Normalized status (e.g., `CREATED`, `PAID`, `SHIPPED`, `DELIVERED`).
- **Intelligence State**: Operational health (e.g., `HEALTHY`, `STUCK`, `DELAYED`, `MISMATCHED`).
- **Financial Summary**: Currency-safe totals including subtotal, tax, shipping, and discounts.
- **Traceability**: Links to raw `ingestion_events` and versioned `mapping_rules`.

---

## 2. Lifecycle Normalization
Source-specific statuses are mapped to a canonical lifecycle.
| Source System | Source Status | Canonical State |
| :--- | :--- | :--- |
| Shopify | `open` | `CREATED` |
| Shopify | `fulfilled` | `SHIPPED` |
| Magento | `pending` | `PENDING_PAYMENT` |
| Magento | `complete` | `DELIVERED` |

---

## 3. Order Channel Classification
Orders are deterministically segregated into channels to support core business reporting:
- `ONLINE_STOREFRONT`: Standard web orders.
- `OFFLINE_POS`: Physical store transactions (via Shopify POS, etc.).
- `MARKETPLACE`: Amazon, eBay, or other third-party aggregators.
- `ERP_CREATED`: Orders originating from backend office systems.

---

## 4. Integrity & Intelligence Rules
### Financial Validation
Rules ensure the mathematical consistency of order data:
- `V-ORD-FIN-001`: `GrandTotal = Subtotal + Tax + Shipping - Discounts`.

### Operational Intelligence
Algorithms detect bottlenecks and anomalies:
- **STUCK detection**: Orders remaining in `CREATED` state for more than 24 hours.
- **Mismatch detection**: Discrepancies between payment amount and order total.

---

## 5. History & Auditability
Every order preserves its journey via two specialized sub-layers:
- **Order Snapshots**: Versioned state captures for every significant change.
- **Order Events**: Granular record of every status transition and external sync event.

---

## 6. Reconciliation Readiness
The `OrderReconciliationService` supports comparing Platform truth against:
- Storefront APIs (Shopify/Magento).
- Payment Gateways (Stripe/PayPal).
- Logistics Providers (ShipStation/FedEx).
- ERP/OMS (NetSuite/Dynamics).
