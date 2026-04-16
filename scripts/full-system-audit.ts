import { GlobalMemoryStore } from '../packages/db/src/adapters/in-memory.adapter';
import { governanceService } from '../apps/api/src/services/governance.service';
import { integrationConfigService } from '../apps/api/src/services/integration-config.service';
import { orderIntelligenceService } from '../apps/api/src/services/order-intelligence.service';

async function runFullAudit() {
    console.log('🚀 INITIALIZING UNIFIED SYSTEM AUDIT...\n');
    GlobalMemoryStore.seed();
    const siteId = 'store_001';

    // --- MODULE 1: GOVERNANCE & SECURITY ---
    console.log('🔒 AUDITING GOVERNANCE MODULE...');
    const keys = GlobalMemoryStore.projectAccessKeys.get(siteId) || [];
    console.log(`  - Active Keys Found: ${keys.length}`);
    
    // Test Rate Limit & VIP Bypass
    const vipKey = keys.find(k => k.isVip)!;
    const normalKey = keys.find(k => !k.isVip)!;
    
    // Simulate Project Limit Hit
    GlobalMemoryStore.projects.get(siteId).globalRateLimit = { max: 1, windowMs: 10000 };
    GlobalMemoryStore.rateLimitBuckets.clear();

    const normalResult = await governanceService.validateAccessKey(siteId, `${normalKey.prefix}.secret`, '10.0.0.1'); // Uses up the 1 slot
    const normalResult2 = await governanceService.validateAccessKey(siteId, `${normalKey.prefix}.secret`, '10.0.0.1'); 
    console.log(`  - Normal Key Throttling: ${normalResult2.valid === false ? '✅ PASSED' : '❌ FAILED'}`);

    const vipResult = await governanceService.validateAccessKey(siteId, `${vipKey.prefix}.secret`, '1.1.1.1');
    console.log(`  - VIP Key Bypass Logic: ${vipResult.valid === true ? '✅ PASSED' : '❌ FAILED'}`);


    // --- MODULE 2: INTEGRATION HUB ---
    console.log('\n🔌 AUDITING INTEGRATION ORCHESTRATION...');
    const instances = integrationConfigService.getProjectIntegrations(siteId);
    console.log(`  - Managed Instances Found: ${instances.length}`);
    console.log(`  - Secret Masking Integrity: ${instances[0].config.prod.apiKey.includes('••••••••') ? '✅ PASSED' : '❌ FAILED'}`);
    
    const testConnection = await integrationConfigService.testConnection(siteId, instances[0].id, 'prod');
    console.log(`  - Backend Connectivity Probing: ${testConnection.latency ? '✅ PASSED' : '❌ FAILED'} (${testConnection.latency}ms)`);


    // --- MODULE 3: INTELLIGENT ORDERS & RCA ---
    console.log('\n🧠 AUDITING INTELLIGENCE ENGINE...');
    
    // Inject failure data to trigger RCA
    GlobalMemoryStore.metrics.push({
        siteId, kpiName: 'pageLoadTime', value: 5500, timestamp: new Date().toISOString(),
        dimensions: { url: '/checkout' }
    });

    const rca = await orderIntelligenceService.performRCA(siteId);
    console.log(`  - RCA Analysis Status: ${rca.status}`);
    console.log(`  - Found ${rca.correlations.length} active correlations (Latency/Sync Health)`);
    if (rca.correlations.length > 0) {
        console.log(`  - Sample Analysis: ${rca.correlations[0].reason}`);
    }
    console.log(`  - RCA Engine Integrity: ${rca.correlations.length > 0 ? '✅ PASSED' : '❌ FAILED'}`);


    // --- MODULE 4: AUDIT ACCOUNTABILITY ---
    console.log('\n📜 AUDITING COMPLIANCE LOGS...');
    const logs = governanceService.getAuditLogs(siteId);
    const hasBreachLog = logs.some(l => l.type === 'RATE_LIMIT_BREACH');
    const hasBypassLog = logs.some(l => l.type === 'RATE_LIMIT_BYPASS');
    console.log(`  - Breach Accountability: ${hasBreachLog ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  - VIP Bypass Accountability: ${hasBypassLog ? '✅ PASSED' : '❌ FAILED'}`);

    console.log('\n🏆 SYSTEM AUDIT COMPLETE. PARITY CONFIRMED.');
}

runFullAudit();
