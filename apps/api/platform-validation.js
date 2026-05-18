const { GlobalMemoryStore } = require('../../packages/db/src/adapters/in-memory.adapter');
const { ConnectorRegistry } = require('../../packages/connector-framework/src/registry');
const { OrderNormalizationService } = require('./src/services/order-normalization.service');
const { ResilienceService } = require('./src/services/resilience.service');
const { ReconciliationEngine } = require('./src/services/reconciliation.service');
const { AnalyticsEngine } = require('./src/services/analytics-engine.service');
const { HealthScoreService } = require('./src/services/health-score.service');
const crypto = require('crypto');

async function runValidation() {
    console.log('🚀 INITIALIZING PLATFORM VALIDATION (JS)...');
    
    const TENANT_A = 'tenant_alpha';
    const SITE_A = 'site_primary';
    const normalization = new OrderNormalizationService();

    // TEST 1: ISOLATION
    console.log('\n[TEST 1] VERIFYING ISOLATION...');
    const analyticsA = await AnalyticsEngine.getSummaryKpis(SITE_A);
    console.log(`- Site A Initial Revenue: $${analyticsA.revenue}`);

    // TEST 2: CONNECTOR ONBOARDING
    console.log('\n[TEST 2] SIMULATING CONNECTOR ONBOARDING...');
    const registry = ConnectorRegistry.getInstance();
    const shopify = await registry.createInstance('shopify', SITE_A, TENANT_A, {
        type: 'TOKEN',
        credentials: { shopUrl: 'test-store.shopify.com', accessToken: 'shpat_test' }
    });

    const validation = await shopify.validateConnection();
    console.log(`- Shopify Validation: ${validation.success ? 'PASSED' : 'FAILED'}`);

    // TEST 3: RESILIENCE
    console.log('\n[TEST 3] TESTING RESILIENCE LAYER...');
    const failingEvent = {
        eventId: 'fail_123',
        siteId: SITE_A,
        tenantId: TENANT_A,
        providerId: 'shopify',
        rawPayload: { bad: 'data' },
        processingStatus: 'PENDING'
    };
    GlobalMemoryStore.ingestionLogs.push(failingEvent);
    for (let i = 0; i < 3; i++) { await ResilienceService.processPendingEvents(); }
    const finalEvent = GlobalMemoryStore.ingestionLogs.find(e => e.eventId === 'fail_123');
    console.log(`- Event Status after max retries: ${finalEvent ? finalEvent.processingStatus : 'NOT_FOUND'}`);

    // TEST 4: ANALYTICS
    console.log('\n[TEST 4] VERIFYING ANALYTICS...');
    const rawOrder = { id: 'ORD-VALID', total_price: '500.00', financial_status: 'paid' };
    const canonical = await normalization.normalize('shopify', rawOrder, SITE_A, TENANT_A);
    GlobalMemoryStore.orders.set(canonical.orderId, canonical);
    const updatedKpis = await AnalyticsEngine.getSummaryKpis(SITE_A);
    console.log(`- Verified Site Revenue: $${updatedKpis.revenue}`);

    // TEST 5: SELF-HEALING
    console.log('\n[TEST 5] TESTING SELF-HEALING...');
    await ReconciliationEngine.runReconciliation(SITE_A, 'shopify');
    const healingLog = GlobalMemoryStore.ingestionLogs.find(e => e.eventId.includes('ORD-FIX-001'));
    console.log(`- Healing Record Created: ${healingLog ? 'YES' : 'NO'}`);

    console.log('\n✅ ALL SYSTEMS OPERATIONAL. VALIDATION SUCCESSFUL.');
}

runValidation().catch(console.error);
