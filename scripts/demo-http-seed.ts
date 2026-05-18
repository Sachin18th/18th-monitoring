/**
 * HTTP-Based Demo Seeder for "Tushar's Creation" (tc_demo_004)
 * Injects all data via the RUNNING API server's ingestion endpoints.
 * Run: npx tsx scripts/demo-http-seed.ts
 */

const BASE   = 'http://127.0.0.1:4000/api/v1';
const SITE   = 'tc_demo_004';

let TOKEN = '';

function uuid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function ago(minutes: number) {
    return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}
function rand(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
async function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
}

async function post(path: string, body: any, auth = true) {
    const headers: any = { 'Content-Type': 'application/json' };
    if (auth) headers['Authorization'] = `Bearer ${TOKEN}`;
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST ${path} → ${res.status}: ${text}`);
    }
    return res.json();
}

async function login() {
    console.log('[Auth] Logging in...');
    const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'superadmin@monitor.io', password: 'password123' })
    });
    const data = await res.json() as any;
    TOKEN = data.token;
    if (!TOKEN) throw new Error('[Auth] Login failed — no token returned');
    console.log('[Auth] ✅ Token acquired');
}

async function seedBrowserEvents() {
    console.log('\n[Phase 1] Seeding browser telemetry (page views, sessions, errors)...');

    const sessions = ['s_d_1', 's_d_2', 's_m_1', 's_m_2', 's_m_3', 's_t_1'];
    const pages = [
        { url: '/',             loadTime: rand(900,  1400) },
        { url: '/products',     loadTime: rand(1200, 2100) },
        { url: '/cart',         loadTime: rand(600,  1000) },
        { url: '/checkout',     loadTime: rand(1800, 3200) },
        { url: '/account',      loadTime: rand(700,  1100) },
        { url: '/search?q=tee', loadTime: rand(1100, 2000) },
    ];

    const browserEvents: any[] = [];

    // Session starts
    sessions.forEach((sid, i) => {
        browserEvents.push({ eventId: uuid(), eventType: 'session_start', siteId: SITE, timestamp: ago(rand(5, 30)), sessionId: sid, metadata: {} });
    });

    // Page views
    for (const page of pages) {
        for (let i = 0; i < rand(3, 6); i++) {
            const sid = sessions[rand(0, sessions.length - 1)];
            browserEvents.push({
                eventId: uuid(), eventType: 'page_view', siteId: SITE,
                timestamp: ago(rand(0, 30)), sessionId: sid,
                metadata: { url: page.url, loadTime: page.loadTime + rand(-200, 200), ttfb: rand(80, 400), fcp: rand(400, 1000) }
            });
        }
    }

    // Slow checkout (SLA breach) for RCA demo
    browserEvents.push({
        eventId: uuid(), eventType: 'page_view', siteId: SITE,
        timestamp: ago(8), sessionId: 's_m_1',
        metadata: { url: '/checkout', loadTime: 4900, ttfb: 1200, fcp: 3400 }
    });

    // Web vitals
    ['CLS', 'FID', 'LCP'].forEach(metric => {
        browserEvents.push({
            eventId: uuid(), eventType: 'browser_metric', siteId: SITE,
            timestamp: ago(rand(1, 10)), sessionId: 's_d_1',
            metadata: { metric, value: metric === 'CLS' ? 0.08 : metric === 'FID' ? 95 : 1850 }
        });
    });

    // Active user pings
    sessions.forEach(sid => {
        browserEvents.push({
            eventId: uuid(), eventType: 'user_activity', siteId: SITE,
            timestamp: new Date().toISOString(), sessionId: sid, metadata: { action: 'active' }
        });
    });

    // JS Errors
    ['TypeError: Cannot read properties of null', 'ReferenceError: analytics is not defined'].forEach(errorMsg => {
        browserEvents.push({
            eventId: uuid(), eventType: 'js_error', siteId: SITE,
            timestamp: ago(rand(5, 20)), sessionId: 's_m_2', metadata: { errorMsg }
        });
    });

    // Add to cart clicks (12)
    for (let i = 0; i < 12; i++) {
        browserEvents.push({
            eventId: uuid(), eventType: 'click', siteId: SITE,
            timestamp: ago(rand(0, 20)), sessionId: sessions[rand(0, sessions.length-1)],
            metadata: { elementId: 'add-to-cart-btn', productId: `PROD-${rand(100,200)}` }
        });
    }

    // Send in batches of 20
    for (let i = 0; i < browserEvents.length; i += 20) {
        await post('/i/browser', { siteId: SITE, events: browserEvents.slice(i, i + 20) }, false);
        await sleep(50);
    }
    console.log(`[Phase 1] ✅ ${browserEvents.length} browser events sent`);
}

async function seedOrders() {
    console.log('\n[Phase 2] Seeding orders (web, POS, pending, failed)...');
    const serverEvents: any[] = [];

    // 18 completed web orders
    for (let i = 1; i <= 18; i++) {
        const orderId = `TC-ONL-${1000 + i}`;
        const value = parseFloat((rand(50, 400) + Math.random()).toFixed(2));
        serverEvents.push(
            { eventId: uuid(), eventType: 'order_placed',    siteId: SITE, timestamp: ago(rand(5, 120)), sessionId: `s_ord_${i}`, userId: `tc_u${rand(1,5)}`, metadata: { orderId, value, channel: 'web', paymentStatus: 'success', sku: `SKU-${rand(100,999)}` } },
            { eventId: uuid(), eventType: 'order_processed', siteId: SITE, timestamp: ago(rand(1, 80)),  metadata: { orderId, processingStatus: 'completed' } }
        );
    }
    // 8 POS offline
    for (let i = 1; i <= 8; i++) {
        const orderId = `TC-POS-${4000 + i}`;
        serverEvents.push(
            { eventId: uuid(), eventType: 'order_placed',    siteId: SITE, timestamp: ago(rand(10, 200)), metadata: { orderId, value: rand(30, 150), channel: 'pos', store: `STORE-${rand(1,5)}` } },
            { eventId: uuid(), eventType: 'order_processed', siteId: SITE, timestamp: ago(rand(1, 180)),  metadata: { orderId, processingStatus: 'completed' } }
        );
    }
    // 4 pending
    for (let i = 1; i <= 4; i++) {
        serverEvents.push({ eventId: uuid(), eventType: 'order_placed', siteId: SITE, timestamp: ago(rand(1,15)), metadata: { orderId: `TC-PEND-${2000+i}`, value: rand(50,250), channel: 'mobile', paymentStatus: 'pending' } });
    }
    // 2 failed
    for (let i = 1; i <= 2; i++) {
        serverEvents.push({ eventId: uuid(), eventType: 'order_placed', siteId: SITE, timestamp: ago(rand(10,60)), metadata: { orderId: `TC-FAIL-${3000+i}`, value: rand(80,200), channel: 'web', paymentStatus: 'failed' } });
    }
    // Integration syncs — ERP, OMS, Marketing
    for (let i = 0; i < 12; i++) serverEvents.push({ eventId: uuid(), eventType: 'oms_sync', siteId: SITE, timestamp: ago(i * 5), metadata: { system: 'SAP-ERP' } });
    for (let i = 0; i < 8;  i++) serverEvents.push({ eventId: uuid(), eventType: 'oms_sync', siteId: SITE, timestamp: ago(i * 8), metadata: { system: 'IBM-Sterling-OMS' } });
    for (let i = 0; i < 3;  i++) serverEvents.push({ eventId: uuid(), eventType: 'oms_sync_failed', siteId: SITE, timestamp: ago(rand(1,30)), metadata: { error: 'Connection timeout after 30s', system: 'IBM-Sterling-OMS', retryCount: i + 1 } });
    for (let i = 0; i < 5;  i++) serverEvents.push({ eventId: uuid(), eventType: 'oms_sync', siteId: SITE, timestamp: ago(i * 12), metadata: { system: 'DotDigital' } });
    for (let i = 0; i < 5;  i++) serverEvents.push({ eventId: uuid(), eventType: 'oms_sync', siteId: SITE, timestamp: ago(i * 15), metadata: { system: 'MoEngage' } });
    // Catalog
    serverEvents.push({ eventId: uuid(), eventType: 'csv_upload', siteId: SITE, timestamp: ago(45), metadata: { filename: 'catalog_14Apr.csv', rows: 156, success: true } });

    // Send in batches of 25
    for (let i = 0; i < serverEvents.length; i += 25) {
        await post('/i/server', { siteId: SITE, events: serverEvents.slice(i, i + 25) }, false);
        await sleep(80);
    }
    console.log(`[Phase 2] ✅ ${serverEvents.length} server/order/integration events sent`);
}

async function verifyResultsViaAPI() {
    console.log('\n[Verify] Checking dashboard APIs...');
    const get = async (path: string) => {
        const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
        return res.json();
    };

    const projects   = await get('/projects') as any[];
    const kpis       = await get('/dashboard/summaries?siteId=tc_demo_004') as any[];
    const orders     = await get('/dashboard/orders/summary?siteId=tc_demo_004') as any;
    const intHealth  = await get('/dashboard/integrations/summary?siteId=tc_demo_004') as any;
    const instances  = await get('/config/p/tc_demo_004/integrations/instances') as any[];

    const tcProject = projects.find((p: any) => p.id === 'tc_demo_004');

    console.log('\n══════════════════════════════════════════════════════════');
    console.log("  ✅ DEMO ENV LIVE: \"Tushar's Creation\" (tc_demo_004)");
    console.log('══════════════════════════════════════════════════════════');
    console.log(`\n📁 Project: ${tcProject?.name} — ${tcProject?.status}`);
    console.log(`   Revenue: $${tcProject?.metricsSummary?.revenue?.toLocaleString()}`);
    console.log('\n📊 KPI Summary:');
    kpis.forEach((k: any) => console.log(`   ${k.kpiName.padEnd(20)} ${String(k.value).padStart(6)} [${k.state}]`));
    console.log('\n🛒 Orders:');
    console.log(`   Total: ${orders.totalOrders}  |  Online: ${orders.onlineSplit}%  |  Delayed: ${orders.delayedCount}  |  Failed: ${orders.failedCount}`);
    console.log('\n🔗 Integration Health:');
    console.log(`   Success Rate: ${intHealth.successRate}%  |  Failures 24h: ${intHealth.failureCount24h}  |  Health Score: ${intHealth.healthScore}`);
    console.log('\n🔌 Connected Integrations:');
    instances.forEach((i: any) => console.log(`   [${i.status}] ${i.label} — Health: ${i.health}%  |  Last Sync: ${i.lastSyncStatus}`));
    console.log('\n🌐 Dashboard: http://localhost:3000/project/tc_demo_004/overview');
    console.log('══════════════════════════════════════════════════════════\n');
}

async function main() {
    await login();
    await seedBrowserEvents();
    await seedOrders();
    await sleep(500);  // wait for processor to flush
    await verifyResultsViaAPI();
}

main().catch(console.error);
