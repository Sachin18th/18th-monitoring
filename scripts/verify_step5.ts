/**
 * Step 5 Verification Script: Phase 4 Hardening Simulation
 * 
 * Verifies:
 * 1. CSV Worker retry and DLQ logic
 * 2. KPI Query caching and configuration-driven invalidation
 * 3. Tenant isolation security boundaries
 */

// 1. MOCK THE DB ADAPTER FIRST (Before any service imports)
// 1. MOCK THE DB ADAPTER FIRST (Before any service imports)
import * as pgAdapter from '../packages/db/src/adapters/postgres-relational.adapter';

const dbMock: any = {
    insert: () => dbMock,
    values: () => dbMock,
    onConflictDoUpdate: () => Promise.resolve(),
    update: () => dbMock,
    set: () => dbMock,
    where: () => Promise.resolve([]),
    select: () => dbMock,
    from: () => dbMock,
    limit: () => Promise.resolve([]),
    orderBy: () => dbMock,
    transaction: (cb: any) => cb(dbMock),
    // Make it thenable to support direct await
    then: (resolve: any) => resolve([]),
};

(pgAdapter as any).db = dbMock;

// 2. NOW IMPORT SERVICES
import { csvWorker } from '../services/processor/src/workers/csv.worker';
import { dlqWorker } from '../services/processor/src/workers/dlq.worker';
import { MemoryBus } from '../packages/streaming/src/memory-bus';
import { metricQueryService } from '../apps/api/src/services/metric-query.service';
import { configManager } from '../packages/config/src/manager/config.manager';
import { cache } from '../packages/cache/src';
import { tenantIsolationGuard } from '../apps/api/src/middlewares/tenant-isolation.middleware';
import { orderNormalizationService } from '../apps/api/src/services/order-normalization.service';

// Force normalization to fail for simulation
orderNormalizationService.normalize = async () => {
    throw new Error('Simulated transient connector error');
};

async function runVerification() {
    console.log('🚀 Starting Step 5 Verification Simulation...\n');

    // ── 1. CSV Resilience & DLQ Flow ──────────────────────────────────────────
    console.log('--- [1] Testing CSV Resilience & DLQ Flow ---');
    await dlqWorker.start();
    await csvWorker.start();

    const payloadId = 'test-payload-fail-123';
    const siteId = 'site_verify_fail';
    
    console.log(`[Sim] Emitting failing CSV chunk to CSV_QUEUE...`);
    MemoryBus.emit('CSV_QUEUE', {
        value: {
            payloadId,
            siteId,
            connectorId: 'verify-csv-1',
            rows: [
                { order_id: 'err-1', amount: 100, createdAt: new Date().toISOString() }
            ]
        }
    });

    await new Promise(r => setTimeout(r, 2000));
    console.log('--- [1] End Simulation ---\n');


    // ── 2. Tenant Isolation Loop ────────────────────────────────────────────
    console.log('--- [2] Testing Tenant Isolation ---');
    const mockReq = {
        params: { siteId: 'site_B' },
        user: { id: 'user_A', siteId: 'site_A', role: 'ADMIN' },
        log: console
    };
    const mockReply = {
        status: (code: number) => ({ send: (msg: any) => console.log(`[Sim] Guard Response: ${code} - ${msg.error}`) })
    };

    console.log(`[Sim] User from site_A attempting to access site_B dashboard...`);
    await tenantIsolationGuard(mockReq as any, mockReply as any);
    console.log('--- [2] End Simulation ---\n');


    // ── 3. Cache Invalidation Loop ───────────────────────────────────────────
    console.log('--- [3] Testing Cache Invalidation Loop ---');
    const metricKey = 'REVENUE_ONLINE';
    
    console.log(`[Sim] First query for ${metricKey} (Cache Miss expected)...`);
    const start1 = Date.now();
    await metricQueryService.queryMetric(siteId, metricKey);
    console.log(`[Sim] Time: ${Date.now() - start1}ms`);

    console.log(`[Sim] Second query for ${metricKey} (Cache Hit expected)...`);
    const start2 = Date.now();
    await metricQueryService.queryMetric(siteId, metricKey);
    console.log(`[Sim] Time: ${Date.now() - start2}ms (should be ~0-1ms)`);

    console.log(`[Sim] Publishing new config for ${siteId}...`);
    try {
        await configManager.publishDraft(siteId, 'verifier', { metrics: {}, widgets: {}, connectors: {} } as any);
        const hit = await cache.get(`resolved:${siteId}`);
        console.log(`[Sim] Cache state after publish: ${hit === null ? 'FLUSHED (Success)' : 'STALE (Fail)'}`);
    } catch (err) {
        console.error(`[Sim] Publish failed (DB mock error):`, err.message);
    }
    console.log('--- [3] End Simulation ---\n');

    console.log('✅ Simulation Complete. Review logs above for Verify status.');
    process.exit(0);
}

runVerification().catch(console.error);
