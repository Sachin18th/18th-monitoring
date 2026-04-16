# Local Setup & Validation Guide

Follow this guide to get the E-Commerce Monitoring platform running locally and verify its multi-tenant role-based features.

## 1. Prerequisites

- **Node.js**: v20 or higher
- **NPM**: v10 or higher
- **Operating System**: Windows, macOS, or Linux

## 2. Initial Setup

1. **Clone & Install**:
   ```bash
   npm install
   ```

2. **Environment**:
   The platform defaults to port 4000 (API) and 3000 (Dashboard). No `.env` is required for basic local operation.

## 3. Running the Platform

Start all services (Ingestion, Processor, and Dashboard) in a single command:
```bash
npm run dev
```

## 4. Test Credentials (RBAC)

The system is seeded with three distinct user profiles to test access control boundaries:

| User | Email | Role | Scope |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin@monitor.io` | `SUPER_ADMIN` | Global Access |
| **Project Admin** | `admin@store001.com` | `ADMIN` | assigned to `store_001` |
| **Viewer** | `viewer@store001.com` | `CUSTOMER` | assigned to `store_001` |

**Password for all**: `password123`

## 5. Validation Workflows

### A. Monitoring E2E (Data Flow)
1. Login as **Super Admin**.
2. Click **"▶ Simulate Events"** in the TopBar.
3. Observe the `Overview` page; metrics will update within 2 seconds as events propagate through the Processor.
4. Verify alerts on the **Alerts** page.

### B. Access Control Verification
- **Admin Isolation**: Login as `admin@store001.com`. Attempt to visit `/project/store_003/overview`. You will receive an "Access Restricted" screen.
- **Customer View-Only**: Login as `viewer@store001.com`. Verify that the **Settings** and **Customer Management** sidebar links are hidden. Attempting to visit `/project/store_001/settings` manually will trigger an RBAC redirect.

## 6. Automated Audit
To run the full system integrity suite (Requires PowerShell):
```powershell
powershell -ExecutionPolicy Bypass -File packages/ops/scripts/validate-system.ps1
```
This script validates data ingestion, KPI calculation, and role-based path security in one pass.

## 7. Troubleshooting

### Port Conflicts
If port 4000 or 3000 is occupied, the server will throw `EADDRINUSE`. 
**Windows Kill Script**:
```powershell
Get-NetTCPConnection -LocalPort 4000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Get-NetTCPConnection -LocalPort 3000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Resetting Data
Since the platform uses `GlobalMemoryStore`, simply restarting the API service will reset all metrics and alerts to the seeded baseline.
