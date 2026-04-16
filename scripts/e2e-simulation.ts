import { IngestionService } from '../apps/api/src/services/ingestion.service';
import { KafkaStreamConsumer } from '../services/processor/src/consumer/kafka-consumer';
import { DashboardService } from '../apps/api/src/services/dashboard.service';
import * as crypto from 'crypto';

async function generateEvent(type: string, metadata: any, sessionId?: string, siteId: string = 'store_001') {
    return {
        eventId: crypto.randomUUID(),
        siteId,
        eventType: type,
        sessionId: sessionId || metadata.sessionId,
        timestamp: new Date().toISOString(),
        metadata
    };
}

async function run() {
    console.log('\x1b[32m%s\x1b[0m', '▶ Initializing Enhanced E2E Real-Time Dashboard Simulation…');
    
    const consumer = new KafkaStreamConsumer();
    await consumer.connectAndSubscribe(['browser-events-stream-v1', 'server-events-stream-v1']);

    const scenarios = [
        { deviceType: 'desktop', browser: 'chrome',  userId: 'u1', count: 5 },
        { deviceType: 'mobile',  browser: 'safari',  userId: 'u2', count: 3 },
        { deviceType: 'tablet',  browser: 'firefox', userId: null, count: 2 }
    ];

    console.log('>>> SCENARIO: Normal Order Flow');
    for (let i = 0; i < 5; i++) {
        const orderId = `ORD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        await IngestionService.processBrowserEvents('store_001', [
            await generateEvent('order_placed', { 
                orderId, 
                amount: 200 + i * 50, 
                channel: 'web', 
                sku: 'SKU-PRO-01', 
                paymentMethod: i % 2 === 0 ? 'PayPal' : 'Credit Card',
                paymentStatus: 'success',
                processingStatus: 'completed'
            }, `s_ord_${i}`)
        ]);
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\x1b[33m%s\x1b[0m', '>>> SCENARIO: Order Intelligence Failure Correlation');
    
    // 1. Trigger Slow Page Loads (Performance Degradation Root Cause)
    await IngestionService.processBrowserEvents('store_001', [
        await generateEvent('page_view', { loadTime: 4500, url: '/checkout', kpiName: 'pageLoadTime' }, 's_rca_1')
    ]);

    // 2. Trigger Integration Failure
    const { OrderIngestionService } = require('../apps/api/src/services/order-ingestion.service');
    await OrderIngestionService.syncExternalSystem('store_001', 'OMS'); // This will record a sync (randomly might fail)
    
    // Force a failure in the sync log for verification
    const { GlobalMemoryStore } = require('../packages/db/src');
    GlobalMemoryStore.integrationSyncs.push({
        id: 'sync_manual_fail',
        siteId: 'store_001',
        system: 'OMS',
        timestamp: new Date().toISOString(),
        status: 'failure',
        lastSyncAt: new Date().toISOString()
    });

    // 3. Trigger JS Errors
    for(let i=0; i<5; i++) {
        await IngestionService.processBrowserEvents('store_001', [
            await generateEvent('js_error', { errorMsg: 'ReferenceError: oms is not defined', kpiName: 'errorRateIncrement' })
        ]);
    }

    // Final Snapshot check locally
    console.log('\n--- EXTRACTION: Order Intelligence Snapshot ---');
    const ordersAnalytics = await DashboardService.getOrderSummary({ siteId: 'store_001', timeRange: '24h' });
    const rcaResult = await DashboardService.getOrderRCA({ siteId: 'store_001', timeRange: '24h' });
    const recs = await DashboardService.getRecommendations({ siteId: 'store_001', timeRange: '24h' });
    
    console.log('Order Summary:', JSON.stringify(ordersAnalytics, null, 2));
    console.log('RCA Status:', rcaResult.status);
    console.log('Detected Anomalies:', rcaResult.anomalies.map(a => a.type).join(', '));
    console.log('Recommendations:', recs.map(r => r.title).join(', '));

    console.log('\n--- SUCCESSFUL COMPLETION OF INTELLIGENT ORDERS PIPELINE ---');
}

run().catch(console.error);
