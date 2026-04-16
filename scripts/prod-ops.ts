/**
 * Production Operations CLI Tool
 * 
 * Usage:
 *   npx tsx scripts/prod-ops.ts list-dlq
 *   npx tsx scripts/prod-ops.ts replay-dlq <payloadId>
 *   npx tsx scripts/prod-ops.ts seed-site <siteId> <actorId>
 */

import { db } from '../packages/db/src/adapters/postgres-relational.adapter';
import { rawPayloads, siteConfigs, configVersions } from '../packages/db/src/drizzle/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

async function run() {
    switch (command) {
        case 'list-dlq':
            await listDlq();
            break;
        case 'replay-dlq':
            if (!arg1) { console.error('Missing payloadId'); process.exit(1); }
            await replayDlq(arg1);
            break;
        case 'seed-site':
            if (!arg1 || !arg2) { console.error('Usage: seed-site <siteId> <actorId>'); process.exit(1); }
            await seedSite(arg1, arg2);
            break;
        default:
            console.log('Usage: npx tsx scripts/prod-ops.ts [list-dlq | replay-dlq <id> | seed-site <siteId> <actorId>]');
    }
    process.exit(0);
}

async function listDlq() {
    console.log('[Ops] Fetching payloads with status: FAILED...');
    const failures = await db.select().from(rawPayloads).where(eq(rawPayloads.status, 'FAILED')).limit(50);
    
    if (failures.length === 0) {
        console.log('No failed payloads found.');
        return;
    }

    console.table(failures.map(f => ({
        id: f.payloadId,
        site: f.siteId,
        error: (f.metadata as any)?.errorSummary || 'Unknown error',
        timestamp: f.ingestedAt
    })));
}

async function replayDlq(payloadId: string) {
    console.log(`[Ops] Replaying payload ${payloadId}...`);
    
    const result = await db.update(rawPayloads)
        .set({ status: 'PENDING', updatedAt: new Date() })
        .where(eq(rawPayloads.payloadId, payloadId));

    console.log('Successfully reset status to PENDING. Workers will pick this up on next sweep.');
}

async function seedSite(siteId: string, actorId: string) {
    console.log(`[Ops] Seeding production site: ${siteId}...`);
    
    const versionId = crypto.randomUUID();
    
    // Default Production KPI Catalog
    const defaultKpiCatalog = [
        { metricKey: "ORDER_VELOCITY", type: "count", aggregation: "sum", granularity: "1m" },
        { metricKey: "REVENUE_ONLINE", type: "value", aggregation: "sum", field: "amount", granularity: "1h" },
        { metricKey: "ORDERS_SYNC_FAILURES", type: "count", aggregation: "sum", granularity: "15m", alert: { threshold: 1, operator: "gt", severity: "critical"} }
    ];

    await db.transaction(async (tx) => {
        // 1. Create initial PUBLISHED version
        await tx.insert(configVersions).values({
            versionId,
            siteId,
            versionNumber: 1,
            status: 'PUBLISHED',
            kpiDefinitionBlob: defaultKpiCatalog,
            widgetDefinitionBlob: [],
            connectorDefinitionBlob: [],
            createdBy: actorId
        });

        // 2. Link site to active version
        await tx.insert(siteConfigs).values({
            siteId,
            activeVersionId: versionId,
        }).onConflictDoUpdate({
            target: siteConfigs.siteId,
            set: { activeVersionId: versionId, updatedAt: new Date() }
        });
    });

    console.log(`✅ Site ${siteId} seeded successfully with default KPIs and Version 1.`);
}

run().catch(console.error);
