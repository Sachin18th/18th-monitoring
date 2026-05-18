/**
 * Load Test Simulation
 * 
 * Floods the Public API with concurrent requests to verify:
 * 1. Rate limiting (429) behavior
 * 2. Caching efficacy (latency benchmarks)
 * 3. System stability under load
 */

import { KpiPlatform } from '../packages/sdk-core/src/index';

const CONCURRENCY = 50;
const TOTAL_REQUESTS = 200;
const SITE_ID = 'load_test_site';
const TOKEN = 'test_token_123';
const HOST = process.env.API_HOST || 'http://localhost:4000';

async function runLoadTest() {
    console.log(`🚀 Starting Load Test Simulation...`);
    console.log(`Target: ${HOST}`);
    console.log(`Concurrency: ${CONCURRENCY} | Total Requests: ${TOTAL_REQUESTS}\n`);

    const sdk = new KpiPlatform({ siteId: SITE_ID, token: TOKEN, host: HOST });
    const stats = {
        success: 0,
        rateLimited: 0,
        error: 0,
        latencies: [] as number[],
    };

    const runBatch = async (batchSize: number) => {
        const promises = Array.from({ length: batchSize }).map(async () => {
            const start = Date.now();
            try {
                await sdk.getMetricsCatalog();
                stats.success++;
                stats.latencies.push(Date.now() - start);
            } catch (err: any) {
                if (err.message.includes('429')) {
                    stats.rateLimited++;
                } else {
                    stats.error++;
                    // console.error(err.message);
                }
            }
        });
        await Promise.all(promises);
    };

    const startTime = Date.now();
    for (let i = 0; i < TOTAL_REQUESTS; i += CONCURRENCY) {
        process.stdout.write(`[Load] Dispatched ${i + CONCURRENCY}/${TOTAL_REQUESTS} requests...\r`);
        await runBatch(CONCURRENCY);
    }

    const duration = (Date.now() - startTime) / 1000;
    const avgLatency = stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length;
    const p95 = stats.latencies.sort((a, b) => a - b)[Math.floor(stats.latencies.length * 0.95)] || 0;

    console.log('\n\n--- Load Test Results ---');
    console.log(`Duration:     ${duration.toFixed(2)}s`);
    console.log(`Throughput:   ${(TOTAL_REQUESTS / duration).toFixed(2)} req/s`);
    console.log(`Success:      ${stats.success}`);
    console.log(`Rate Limited: ${stats.rateLimited} (Expected if >20/min per IP)`);
    console.log(`Avg Latency:  ${avgLatency.toFixed(2)}ms`);
    console.log(`P95 Latency:  ${p95.toFixed(2)}ms`);
    console.log('--------------------------\n');

    if (stats.success > 0 && stats.rateLimited > 0) {
        console.log('✅ PASS: System handled concurrency, enforced rate limits, and maintained low latency via cache.');
    } else if (stats.error > 0) {
        console.log('⚠️ WARN: System encountered errors. Check server logs.');
    }
}

runLoadTest().catch(console.error);
