/**
 * Demo Seeder: "Tushar's Creation" (tc_demo_004)
 * Injects comprehensive, realistic dummy data across all KPI dimensions.
 * Run: npx tsx scripts/demo-seed-tushar.ts
 */

import { IngestionService } from '../apps/api/src/services/ingestion.service';
import { KafkaStreamConsumer } from '../services/processor/src/consumer/kafka-consumer';
import { GlobalMemoryStore } from '../packages/db/src';
import * as crypto from 'crypto';

const SITE = 'tc_demo_004';

function uuid() { return crypto.randomUUID(); }
function ago(minutes: number) { return new Date(Date.now() - minutes * 60 * 1000).toISOString(); }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randF(min: number, max: number) { return (Math.random() * (max - min) + min).toFixed(2); }

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function seedBrowserEvents() {
    console.log('\n[Phase 1] Seeding browser telemetry events...');

    // Active user sessions (desktop, mobile, tablet)
    const SESSIONS = [
        { id: 's_d_1', device: 'desktop', browser: 'chrome',  userId: 'tc_u1', isCustomer: true },
        { id: 's_d_2', device: 'desktop', browser: 'edge',    userId: 'tc_u2', isCustomer: true },
        { id: 's_m_1', device: 'mobile',  browser: 'safari',  userId: 'tc_u3', isCustomer: true },
        { id: 's_m_2', device: 'mobile',  browser: 'chrome',  userId: 'tc_u4', isCustomer: false },
        { id: 's_m_3', device: 'mobile',  browser: 'chrome',  userId: 'tc_u5', isCustomer: false },
        { id: 's_t_1', device: 'tablet',  browser: 'safari',  userId: null,    isCustomer: false },
    ];

    // Start all sessions
    for (const s of SESSIONS) {
        GlobalMemoryStore.sessions.set(s.id, {
            sessionId: s.id, siteId: SITE, userId: s.userId,
            deviceType: s.device, browser: s.browser,
            isCustomer: s.isCustomer,
            startedAt: ago(rand(5, 25)),
            lastActiveAt: new Date().toISOString(),
        });

        await IngestionService.processBrowserEvents(SITE, [{
            eventId: uuid(), eventType: 'session_start', siteId: SITE,
            timestamp: ago(rand(5, 25)), sessionId: s.id, userId: s.userId || undefined,
            metadata: { device: s.device, browser: s.browser }
        }]);
    }

    // Page views with realistic load times across URLs
    const PAGES = [
        { url: '/', loadTime: rand(900, 1400) },
        { url: '/products', loadTime: rand(1200, 2100) },
        { url: '/products/sneakers', loadTime: rand(800, 1500) },
        { url: '/cart', loadTime: rand(600, 1000) },
        { url: '/checkout', loadTime: rand(1800, 3200) },   // heavier page
        { url: '/account/orders', loadTime: rand(700, 1100) },
        { url: '/search?q=shoes', loadTime: rand(1100, 2000) },
    ];

    for (const page of PAGES) {
        for (let i = 0; i < rand(2, 5); i++) {
            const sess = SESSIONS[rand(0, SESSIONS.length - 1)];
            await IngestionService.processBrowserEvents(SITE, [{
                eventId: uuid(), eventType: 'page_view', siteId: SITE,
                timestamp: ago(rand(0, 30)), sessionId: sess.id, userId: sess.userId || undefined,
                metadata: { url: page.url, loadTime: page.loadTime + rand(-200, 200), ttfb: rand(80, 400), fcp: rand(400, 1000), lcp: page.loadTime - rand(100, 300) }
            }]);
        }
    }

    // One slow page (SLA breach) for demo RCA scenario
    await IngestionService.processBrowserEvents(SITE, [{
        eventId: uuid(), eventType: 'page_view', siteId: SITE,
        timestamp: ago(8), sessionId: 's_m_1',
        metadata: { url: '/checkout', loadTime: 4800, ttfb: 1100, fcp: 3200, lcp: 4600, isSlowLoad: true }
    }]);

    // Browser metrics (Web Vitals)
    const metrics = [
        { metric: 'CLS', value: 0.08 }, { metric: 'FID', value: 95 },
        { metric: 'LCP', value: 1850 }, { metric: 'TTFB', value: 220 },
    ];
    for (const m of metrics) {
        await IngestionService.processBrowserEvents(SITE, [{
            eventId: uuid(), eventType: 'browser_metric', siteId: SITE,
            timestamp: ago(rand(1, 10)), sessionId: 's_d_1',
            metadata: m
        }]);
    }

    // Click events (add-to-cart)
    for (let i = 0; i < 12; i++) {
        const sess = SESSIONS[rand(0, SESSIONS.length - 1)];
        await IngestionService.processBrowserEvents(SITE, [{
            eventId: uuid(), eventType: 'click', siteId: SITE,
            timestamp: ago(rand(0, 25)), sessionId: sess.id,
            metadata: { elementId: 'add-to-cart-btn', productId: `PROD-${rand(100, 200)}` }
        }]);
    }

    // User activity pings
    for (const s of SESSIONS) {
        await IngestionService.processBrowserEvents(SITE, [{
            eventId: uuid(), eventType: 'user_activity', siteId: SITE,
            timestamp: new Date().toISOString(), sessionId: s.id, userId: s.userId || undefined,
            metadata: { action: 'active' }
        }]);
    }

    // JS Errors (a few, realistic)
    const errors = [
        'TypeError: Cannot read properties of null (reading "price")',
        'ReferenceError: analytics is not defined',
    ];
    for (const err of errors) {
        await IngestionService.processBrowserEvents(SITE, [{
            eventId: uuid(), eventType: 'js_error', siteId: SITE,
            timestamp: ago(rand(5, 20)), sessionId: 's_m_2',
            metadata: { errorMsg: err }
        }]);
    }

    console.log('[Phase 1] ✅ Browser telemetry seeded');
}

async function seedOrders() {
    console.log('\n[Phase 2] Seeding orders (online + offline, mixed statuses)...');

    // Online orders (completed)
    const onlineProducts = [
        { name: 'Air Max 270', sku: 'SKU-AM270', price: 149.99 },
        { name: 'Slim Fit Jeans', sku: 'SKU-SFJ01', price: 79.00 },
        { name: 'Leather Jacket', sku: 'SKU-LJ-XL', price: 299.00 },
        { name: 'Running Shorts', sku: 'SKU-RS-M', price: 34.99 },
        { name: 'Classic Tee Bundle', sku: 'SKU-CTB03', price: 59.00 },
    ];

    // 18 completed web orders
    for (let i = 1; i <= 18; i++) {
        const prod = onlineProducts[rand(0, onlineProducts.length - 1)];
        const qty = rand(1, 3);
        const orderId = `TC-ONL-${1000 + i}`;
        await IngestionService.processServerEvents(SITE, [
            {
                eventId: uuid(), eventType: 'order_placed', siteId: SITE,
                timestamp: ago(rand(5, 120)), sessionId: `s_ord_${i}`, userId: `tc_u${rand(1, 5)}`,
                metadata: { orderId, value: prod.price * qty, channel: 'web', sku: prod.sku, qty, paymentMethod: i % 3 === 0 ? 'PayPal' : 'Credit Card', paymentStatus: 'success' }
            },
            {
                eventId: uuid(), eventType: 'order_processed', siteId: SITE,
                timestamp: ago(rand(1, 100)), metadata: { orderId, processingStatus: 'completed' }
            }
        ]);
        await sleep(20);
    }

    // 4 pending orders
    for (let i = 1; i <= 4; i++) {
        const orderId = `TC-PEND-${2000 + i}`;
        await IngestionService.processServerEvents(SITE, [{
            eventId: uuid(), eventType: 'order_placed', siteId: SITE,
            timestamp: ago(rand(1, 15)), sessionId: `s_pend_${i}`,
            metadata: { orderId, value: parseFloat(randF(50, 250)), channel: 'mobile', paymentStatus: 'pending' }
        }]);
    }

    // 2 failed orders
    for (let i = 1; i <= 2; i++) {
        const orderId = `TC-FAIL-${3000 + i}`;
        await IngestionService.processServerEvents(SITE, [{
            eventId: uuid(), eventType: 'order_placed', siteId: SITE,
            timestamp: ago(rand(10, 60)), sessionId: `s_fail_${i}`,
            metadata: { orderId, value: parseFloat(randF(80, 200)), channel: 'web', paymentStatus: 'failed' }
        }]);
    }

    // 8 POS (offline) orders
    for (let i = 1; i <= 8; i++) {
        const orderId = `TC-POS-${4000 + i}`;
        await IngestionService.processServerEvents(SITE, [
            {
                eventId: uuid(), eventType: 'order_placed', siteId: SITE,
                timestamp: ago(rand(10, 200)), metadata: { orderId, value: parseFloat(randF(30, 150)), channel: 'pos', store: `STORE-${rand(1, 5)}` }
            },
            {
                eventId: uuid(), eventType: 'order_processed', siteId: SITE,
                timestamp: ago(rand(1, 180)), metadata: { orderId, processingStatus: 'completed' }
            }
        ]);
    }

    console.log('[Phase 2] ✅ Orders seeded (18 web + 8 POS + 4 pending + 2 failed)');
}

async function seedIntegrationEvents() {
    console.log('\n[Phase 3] Seeding integration health events...');

    // SAP ERP — Healthy syncs
    for (let i = 0; i < 12; i++) {
        await IngestionService.processServerEvents(SITE, [{
            eventId: uuid(), eventType: 'oms_sync', siteId: SITE,
            timestamp: ago(i * 5), metadata: { system: 'SAP-ERP' }
        }]);
    }

    // IBM Sterling OMS — Some failures
    for (let i = 0; i < 8; i++) {
        await IngestionService.processServerEvents(SITE, [{
            eventId: uuid(), eventType: 'oms_sync', siteId: SITE,
            timestamp: ago(i * 8), metadata: { system: 'IBM-Sterling-OMS' }
        }]);
    }
    for (let i = 0; i < 3; i++) {
        await IngestionService.processServerEvents(SITE, [{
            eventId: uuid(), eventType: 'oms_sync_failed', siteId: SITE,
            timestamp: ago(rand(1, 30)), metadata: { error: 'Connection timeout after 30s', system: 'IBM-Sterling-OMS', retryCount: i + 1 }
        }]);
        GlobalMemoryStore.integrationSyncs.push({
            id: `sync_oms_fail_${i}`, siteId: SITE, system: 'IBM-Sterling-OMS',
            timestamp: ago(rand(1, 30)), status: 'failure',
            error: 'Connection timeout after 30s', retryCount: i + 1,
            lastSyncAt: ago(rand(1, 30))
        });
    }

    // DotDigital — Healthy
    for (let i = 0; i < 5; i++) {
        await IngestionService.processServerEvents(SITE, [{
            eventId: uuid(), eventType: 'oms_sync', siteId: SITE,
            timestamp: ago(i * 12), metadata: { system: 'DotDigital' }
        }]);
    }

    // MoEngage — Healthy
    for (let i = 0; i < 5; i++) {
        await IngestionService.processServerEvents(SITE, [{
            eventId: uuid(), eventType: 'oms_sync', siteId: SITE,
            timestamp: ago(i * 15), metadata: { system: 'MoEngage' }
        }]);
    }

    // Push explicit sync records for dashboard queries
    GlobalMemoryStore.integrationSyncs.push(
        { id: 'sync_sap_ok', siteId: SITE, system: 'SAP-ERP', status: 'success', lastSyncAt: ago(2), timestamp: ago(2) },
        { id: 'sync_dot_ok', siteId: SITE, system: 'DotDigital', status: 'success', lastSyncAt: ago(5), timestamp: ago(5) },
        { id: 'sync_moe_ok', siteId: SITE, system: 'MoEngage', status: 'success', lastSyncAt: ago(8), timestamp: ago(8) }
    );

    console.log('[Phase 3] ✅ Integration sync events seeded');
}

async function seedCatalogAndInventory() {
    console.log('\n[Phase 4] Seeding catalog performance events...');

    // Catalog update events
    const products = [
        { id: 'P-001', name: 'Air Max 270', stock: 45, category: 'Footwear' },
        { id: 'P-002', name: 'Slim Fit Jeans', stock: 120, category: 'Apparel' },
        { id: 'P-003', name: 'Leather Jacket', stock: 8, category: 'Apparel' },    // Low stock
        { id: 'P-004', name: 'Running Shorts', stock: 200, category: 'Activewear' },
        { id: 'P-005', name: 'Classic Tee Bundle', stock: 3, category: 'Apparel' }, // Critical stock
        { id: 'P-006', name: 'Wireless Earbuds', stock: 55, category: 'Electronics' },
    ];

    for (const p of products) {
        await IngestionService.processServerEvents(SITE, [{
            eventId: uuid(), eventType: 'product_updated', siteId: SITE,
            timestamp: ago(rand(10, 60)),
            metadata: { productId: p.id, name: p.name, stock: p.stock, category: p.category, syncSource: 'SAP-ERP' }
        }]);
    }

    // CSV import event
    await IngestionService.processServerEvents(SITE, [{
        eventId: uuid(), eventType: 'csv_upload', siteId: SITE,
        timestamp: ago(45), metadata: { filename: 'catalog_update_14Apr.csv', rows: 156, success: true }
    }]);

    console.log('[Phase 4] ✅ Catalog events seeded');
}

async function run() {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  🚀 Demo Seeder: "Tushar\'s Creation" (tc_demo_004)');
    console.log('  Injecting comprehensive, realistic demo data...');
    console.log('══════════════════════════════════════════════════════════\n');

    // Boot streaming consumer
    const consumer = new KafkaStreamConsumer();
    await consumer.connectAndSubscribe(['browser-events-stream-v1', 'server-events-stream-v1']);
    console.log('[Boot] ✅ Stream consumer online');

    await seedBrowserEvents();
    await seedOrders();
    await seedIntegrationEvents();
    await seedCatalogAndInventory();

    // Summary verification
    await sleep(500);
    const { DashboardService } = await import('../apps/api/src/services/dashboard.service');
    const summary = await DashboardService.getKpiSummaries({ siteId: SITE, timeRange: '24h' });
    const orderSummary = await DashboardService.getOrderSummary({ siteId: SITE, timeRange: '24h' });
    const intHealth = await DashboardService.getIntegrationHealthSummary({ siteId: SITE, timeRange: '24h' });
    const catalog = await DashboardService.getMetricsCatalog({ siteId: SITE, timeRange: '24h' });

    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  ✅ SEED COMPLETE — Live Data Snapshot');
    console.log('══════════════════════════════════════════════════════════');
    console.log('📊 KPI Summary:');
    summary.forEach((k: any) => console.log(`   ${k.kpiName}: ${k.value} (${k.state})`));
    console.log('\n🛒 Orders:');
    console.log(`   Total: ${orderSummary.totalOrders}  |  Online: ${orderSummary.onlineSplit}%  |  Delayed: ${orderSummary.delayedCount}  |  Failed: ${orderSummary.failedCount}`);
    console.log('\n🔗 Integration Health:');
    console.log(`   Success Rate: ${intHealth.successRate}%  |  Failures (24h): ${intHealth.failureCount24h}`);
    console.log('\n📋 Metric Catalog:');
    catalog.forEach((m: any) => console.log(`   [${m.category}] ${m.name} (${m.id})`));
    console.log('\n🌐 Dashboard URL: http://localhost:3000/project/tc_demo_004/overview');
    console.log('══════════════════════════════════════════════════════════\n');
}

run().catch(console.error);
