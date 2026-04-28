import crypto from 'crypto';

/**
 * High-Fidelity Seeder for 18th Digitech Creation
 * Implements realistic monitoring, role-based users, and consistent datasets.
 */
export const seed18thDigitech = (store: any) => {
    const now = new Date().toISOString();
    const projectId = 'proj-18th-digitech';
    const tenantId = 'tenant_18th_digitech';

    console.log('[Seeder] Initializing 18th Digitech Creation project layer...');

    // 1. Seed Tenant
    store.tenants.set(tenantId, {
        id: tenantId,
        name: '18th Digitech Enterprise',
        slug: '18th-digitech-enterprise',
        status: 'ACTIVE',
        plan: 'ENTERPRISE',
        metadata: { source: 'demo-18th' },
        createdAt: now,
        updatedAt: now
    });

    // 2. Seed Project
    store.projects.set(projectId, {
        id: projectId,
        tenantId: tenantId,
        name: '18th Digitech Creation',
        slug: '18th-digitech',
        status: 'ACTIVE',
        description: 'Primary high-fidelity validation project for the platform.',
        environment: 'production',
        timezone: 'UTC',
        metadata: { source: 'demo-18th' },
        metricsSummary: { activeUsers: 842, errorRate: 0.015, revenue: 85400 },
        createdAt: now,
        updatedAt: now
    });

    // Helper for password hashing (simulating GlobalMemoryStore._p)
    const hashPwd = (pwd: string) => {
        const salt = process.env.JWT_SECRET || 'hardcoded_demo_salt';
        const hash = crypto.scryptSync(pwd, salt, 64).toString('hex');
        return `${salt}:${hash}`;
    };

    // 3. Seed Users with specific roles
    const users = [
        {
            email: 'superadmin@18thdigitech.com',
            name: '18th Super Admin',
            role: 'SUPER_ADMIN',
            id: 'user_18th_super'
        },
        {
            email: 'admin@18thdigitech.com',
            name: '18th Project Admin',
            role: 'PROJECT_ADMIN',
            id: 'user_18th_admin'
        },
        {
            email: 'viewer@18thdigitech.com',
            name: '18th Read-Only Viewer',
            role: 'VIEWER',
            id: 'user_18th_viewer'
        },
        {
            email: 'contributor@18thdigitech.com',
            name: '18th Ops Contributor',
            role: 'OPERATOR',
            id: 'user_18th_contributor'
        }
    ];

    users.forEach(u => {
        store.users.set(u.email, {
            ...u,
            status: 'active',
            tenantId: tenantId,
            assignedProjects: [projectId],
            passwordHash: hashPwd('Demo@1234!'),
            metadata: { source: 'demo-18th' },
            audit: { createdAt: now, updatedAt: now }
        });
    });

    // 4. Seed Metrics (24 hours of data)
    const metrics: any[] = [];
    for (let i = 0; i < 24; i++) {
        const timestamp = new Date(Date.now() - i * 3600000).toISOString();
        
        // Uptime (100% mostly, with one dip)
        metrics.push({
            siteId: projectId,
            kpiName: 'uptime',
            value: (i === 5) ? 0 : 1,
            timestamp,
            dimensions: { region: 'US-EAST' },
            metadata: { source: 'demo-18th' }
        });

        // Page Load Time (degraded between 2 PM and 4 PM simulated)
        const hour = new Date(timestamp).getHours();
        const isDegraded = hour >= 14 && hour <= 16;
        const latency = isDegraded ? 4500 + Math.random() * 1000 : 1200 + Math.random() * 300;

        metrics.push({
            siteId: projectId,
            kpiName: 'pageLoadTime',
            value: latency,
            timestamp,
            dimensions: { url: '/checkout', device: 'Mobile' },
            metadata: { source: 'demo-18th' }
        });

        // Error Rate (spikes during degradation)
        metrics.push({
            siteId: projectId,
            kpiName: 'errorRatePct',
            value: isDegraded ? 8.5 + Math.random() * 2 : 0.5 + Math.random() * 0.2,
            timestamp,
            dimensions: { region: 'Global' },
            metadata: { source: 'demo-18th' }
        });
    }
    store.metrics.push(...metrics);

    // 5. Seed Integrations
    store.projectIntegrations.set(projectId, [
        {
            id: 'int_18th_sap',
            connectorId: 'sap_s4hana',
            label: 'SAP S/4HANA (Production)',
            category: 'ERP',
            status: 'ACTIVE',
            healthStatus: 'HEALTHY',
            healthScore: 100,
            enabled: true,
            metadata: { source: 'demo-18th' },
            lastSyncAt: now,
            lastSyncStatus: 'success'
        },
        {
            id: 'int_18th_magento',
            connectorId: 'magento_2',
            label: 'Magento B2C Storefront',
            category: 'Commerce',
            status: 'ACTIVE',
            healthStatus: 'DEGRADED',
            healthScore: 65,
            enabled: true,
            metadata: { source: 'demo-18th' },
            lastSyncAt: new Date(Date.now() - 300000).toISOString(),
            lastSyncStatus: 'failure',
            errorCount: 12
        }
    ]);

    // 6. Seed Alerts & Incidents
    store.alerts.push(
        {
            alertId: 'alt_18th_latency',
            siteId: projectId,
            ruleId: 'rule_checkout_latency',
            kpiName: 'pageLoadTime',
            severity: 'CRITICAL',
            status: 'active',
            message: 'Checkout latency exceeded 4000ms threshold',
            context: { value: 4850, threshold: 4000 },
            triggeredAt: new Date(Date.now() - 3600000).toISOString(),
            metadata: { source: 'demo-18th' }
        },
        {
            alertId: 'alt_18th_errors',
            siteId: projectId,
            ruleId: 'rule_error_spike',
            kpiName: 'errorRatePct',
            severity: 'WARNING',
            status: 'active',
            message: 'Error rate spike detected in Checkout journey',
            context: { value: 8.2, threshold: 5.0 },
            triggeredAt: new Date(Date.now() - 1800000).toISOString(),
            metadata: { source: 'demo-18th' }
        }
    );

    // 7. Seed Synthetics
    store.synthetics.push(
        {
            id: 'syn_18th_checkout',
            siteId: projectId,
            name: 'E2E Checkout Flow',
            status: 'failing',
            lastRunAt: now,
            performance: { dns: 45, tcp: 80, ttfb: 450, total: 5200 },
            steps: [
                { name: 'Home', status: 'passed', duration: 800 },
                { name: 'Login', status: 'passed', duration: 1200 },
                { name: 'Add to Cart', status: 'passed', duration: 900 },
                { name: 'Checkout', status: 'failed', error: 'Payment Timeout', duration: 2300 }
            ],
            metadata: { source: 'demo-18th' }
        }
    );

    console.log('[Seeder] 18th Digitech Creation operationalized successfully.');
};

/**
 * Purge Utility to remove all 18th Digitech demo data
 */
export const purge18thDigitech = (store: any) => {
    console.log('[Seeder] Initiating purge of 18th Digitech demo data...');

    // Remove Tenant
    store.tenants.delete('tenant_18th_digitech');

    // Remove Project
    store.projects.delete('proj-18th-digitech');

    // Remove Users
    const demoUserEmails = [
        'superadmin@18thdigitech.com',
        'admin@18thdigitech.com',
        'viewer@18thdigitech.com',
        'contributor@18thdigitech.com'
    ];
    demoUserEmails.forEach(email => store.users.delete(email));

    // Filter out Metrics
    store.metrics = store.metrics.filter((m: any) => m.metadata?.source !== 'demo-18th');

    // Filter out Alerts
    store.alerts = store.alerts.filter((a: any) => a.metadata?.source !== 'demo-18th');

    // Filter out Synthetics
    store.synthetics = store.synthetics.filter((s: any) => s.metadata?.source !== 'demo-18th');

    // Remove Integrations
    store.projectIntegrations.delete('proj-18th-digitech');

    console.log('[Seeder] Purge complete. System restored to baseline.');
};
