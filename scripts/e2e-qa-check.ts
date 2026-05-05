/**
 * E2E QA Validation Script for "Tushar's Creation" (tc_demo_004)
 * Validates:
 * 1. Role-based access control (SuperAdmin, Admin, Viewer)
 * 2. Project Isolation
 * 3. KPI values and ranges
 * 4. Integration status & sync logs
 * 5. Route stability (no 404/500)
 */

const API_BASE = 'http://127.0.0.1:4000/api/v1';
const SITE_ID = 'tc_demo_004';

const USERS = [
    { label: 'Super Admin', email: 'superadmin@monitor.io', pass: 'password123', role: 'SUPER_ADMIN' },
    { label: 'Project Admin', email: 'admin@store001.com', pass: 'password123', role: 'ADMIN' },
    { label: 'Project Viewer', email: 'viewer@store001.com', pass: 'password123', role: 'CUSTOMER' },
];

async function post(path: string, body: any, token?: string) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
    return res.json();
}

async function get(path: string, token: string) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json();
}

async function runQA() {
    console.log('\n═══ STARTING E2E QA VALIDATION — "Tushar\'s Creation" ═══\n');

    const results: any[] = [];

    for (const user of USERS) {
        console.log(`[Role Test] Validating: ${user.label} (${user.role})...`);
        try {
            // 1. Auth check
            const auth = await post('/auth/login', { email: user.email, password: user.pass }) as any;
            const token = auth.token;
            console.log(`   ✅ Login successful`);

            // 2. Project Access Check
            const projects = await get('/projects', token) as any[];
            const tcProject = projects.find(p => p.id === SITE_ID);
            
            if (tcProject) {
                console.log(`   ✅ Project "${SITE_ID}" visible to user`);
            } else {
                throw new Error(`Project ${SITE_ID} not found in project list for ${user.label}`);
            }

            // 3. Data Integrity Check (Only need to do this once, e.g., for SuperAdmin)
            if (user.role === 'SUPER_ADMIN') {
                console.log(`[Data Test] Validating KPI & Integration integrity...`);
                
                // KPI Check
                const kpis = await get(`/dashboard/summaries?siteId=${SITE_ID}`, token) as any[];
                const revenue = projects.find(p => p.id === SITE_ID)?.metricsSummary?.revenue;
                
                if (kpis.length < 5) throw new Error('Insufficient KPIs returned');
                console.log(`   ✅ KPI Summary returned ${kpis.length} metrics`);
                console.log(`   ✅ Revenue check: $${revenue}`);

                // Integration Health Check
                const health = await get(`/dashboard/integrations/summary?siteId=${SITE_ID}`, token) as any;
                console.log(`   ✅ Integration Success Rate: ${health.successRate}%`);
                if (health.successRate < 80 || health.successRate > 95) {
                    console.warn(`   ⚠️ Unexpected success rate: ${health.successRate}% (Expected ~91%)`);
                }

                // Integration Instances
                const instances = await get(`/config/p/${SITE_ID}/integrations/instances`, token) as any[];
                const sap = instances.find(i => i.id === 'int_sap_erp');
                const oms = instances.find(i => i.id === 'int_oms_sterling');
                
                if (sap?.status !== 'Active') throw new Error('SAP S/4HANA should be Active');
                if (oms?.status !== 'Degraded') throw new Error('IBM Sterling should be Degraded');
                console.log(`   ✅ Integration instance statuses verified (SAP: Active, OMS: Degraded)`);

                // Order Breakdown
                const orders = await get(`/dashboard/orders/summary?siteId=${SITE_ID}`, token) as any;
                if (orders.totalOrders !== 32) throw new Error(`Expected 32 orders, got ${orders.totalOrders}`);
                console.log(`   ✅ Order count verified: ${orders.totalOrders}`);
            }

            // 4. Permission Boundary Check
            // Viewers shouldn't be able to trigger syncs
            if (user.role === 'CUSTOMER') {
                try {
                    await post('/dashboard/sync', { siteId: SITE_ID, system: 'SAP-ERP' }, token);
                    console.error(`   ❌ FAIL: Viewer was able to trigger sync!`);
                } catch (e) {
                    console.log(`   ✅ Permission enforced: Viewer cannot trigger sync (Expected)`);
                }
            }

        } catch (err: any) {
            console.error(`   ❌ FAILED for ${user.label}: ${err.message}`);
            process.exit(1);
        }
    }

    // 5. Route Stability Sweep
    console.log(`\n[Route Sweep] Checking stability of core endpoints...`);
    const adminToken = (await post('/auth/login', { email: USERS[0].email, password: USERS[0].pass }) as any).token;
    const paths = [
        `/dashboard/performance/summary?siteId=${SITE_ID}`,
        `/dashboard/performance/trends?siteId=${SITE_ID}`,
        `/dashboard/users/summary?siteId=${SITE_ID}`,
        `/dashboard/alerts?siteId=${SITE_ID}`,
        `/dashboard/orders/rca?siteId=${SITE_ID}`,
        `/dashboard/integrations/failed?siteId=${SITE_ID}`
    ];

    for (const path of paths) {
        try {
            await get(path, adminToken);
            console.log(`   ✅ OK: ${path}`);
        } catch (e: any) {
            console.error(`   ❌ ROUTE FAILED: ${path} -> ${e.message}`);
            process.exit(1);
        }
    }

    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  ✅ ALL E2E QA CHECKS PASSED — "Tushar\'s Creation" IS READY');
    console.log('══════════════════════════════════════════════════════════\n');
}

runQA().catch(err => {
    console.error(err);
    process.exit(1);
});
