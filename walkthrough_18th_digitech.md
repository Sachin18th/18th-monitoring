# 18th Digitech Creation: Operationalization Walkthrough

This document outlines the high-fidelity implementation of the **18th Digitech Creation** test project, providing a canonical environment for end-to-end platform validation.

## 1. Seed Architecture
The project is initialized via a dedicated seeder that ensures consistent data across all monitoring modules.

- **Project ID**: `proj-18th-digitech`
- **Tenant ID**: `tenant_18th_digitech`
- **Isolation**: All records are tagged with `metadata.source: 'demo-18th'` for atomic removal.

### Seeded Components
- **Metrics**: 24 hours of simulated `uptime`, `pageLoadTime`, and `errorRatePct` with realistic performance dips and spikes.
- **Integrations**: Active `SAP S/4HANA` and `Magento 2` connectors.
- **Synthetics**: Failing "E2E Checkout Flow" with step-level performance timing.
- **Alerts**: Critical latency and warning error spikes triggered in the last hour.

## 2. Authentication & RBAC
Four specific users have been provisioned to test the system's role-based access control.

| Role | Email | Password | Scope |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin@18thdigitech.com` | `Demo@1234!` | Global system control |
| **Project Admin** | `admin@18thdigitech.com` | `Demo@1234!` | 18th Digitech settings/users |
| **Ops Contributor** | `contributor@18thdigitech.com` | `Demo@1234!` | Alert & Incident management |
| **ReadOnly Viewer** | `viewer@18thdigitech.com` | `Demo@1234!` | Dashboard visibility only |

## 3. UI Validation Support
The Login interface has been updated to provide immediate access to these roles for testing purposes.

- **Location**: `apps/dashboard/src/app/login/page.tsx`
- **Feature**: A dedicated "18th Digitech Demo Credentials" card allows one-click selection of test roles.
- **Design**: Adheres to the platform's premium glassmorphism and blueprint aesthetics.

## 4. Reversibility & Control
The test project can be managed or removed using the following mechanisms:

### Environment Toggle
To disable the automatic seeding on boot, set the following in your `.env` file:
```bash
ENABLE_DEMO_SEEDING=false
```

### Remote Purge
A secure endpoint and CLI script are available for Super Admins to wipe all 18th Digitech data without restarting the server.

- **Endpoint**: `POST /api/v1/admin/demo/purge` (Bearer Token required)
- **CLI Tool**: `npx tsx scripts/purge-18th-demo.ts`

## 5. Verification Steps
1. **Login**: Use the `Super Admin` role from the login page.
2. **Launch**: Navigate to the `18th Digitech Creation` workspace.
3. **Inspect**:
   - Check the **Control Tower** for the 24-hour trendlines.
   - Verify the **Integrations** list shows the SAP and Magento connectors.
   - Inspect the **Alert Center** for active critical signals.
4. **RBAC Test**: Log in as `ReadOnly Viewer` and verify that "Resolve" buttons and "Settings" are disabled/hidden.
