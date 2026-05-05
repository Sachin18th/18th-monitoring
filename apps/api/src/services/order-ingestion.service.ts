// import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
// import { orderNormalizationService } from './order-normalization.service';
// import crypto from 'crypto';

// export class OrderIngestionService {
    
//     /**
//      * Simulates CSV parsing for offline orders.
//      * Expected format: Order ID, SKU, Payment Method, Total Amount
//      */
//     static async processCSV(siteId: string, csvContent: string) {
//         const lines = csvContent.split('\n').filter(l => l.trim().length > 0);
//         const results = {
//             success: 0,
//             failed: 0,
//             errors: [] as string[]
//         };

//         const batchId = `csv_${Date.now()}`;
//         const logEntry = {
//             id: batchId,
//             siteId,
//             timestamp: new Date().toISOString(),
//             type: 'csv_upload',
//             status: 'processing',
//             details: `Processing ${lines.length} rows`
//         };
//         GlobalMemoryStore.ingestionLogs.push(logEntry);

//         for (let i = 0; i < lines.length; i++) {
//             const line = lines[i];
//             const parts = line.split(',').map(p => p.trim());

//             if (parts.length < 4) {
//                 results.failed++;
//                 results.errors.push(`Row ${i + 1}: Missing fields. Expected 4, got ${parts.length}`);
//                 continue;
//             }

//             const [orderId, sku, paymentMethod, amountStr] = parts;
//             const amount = parseFloat(amountStr);

//             if (isNaN(amount)) {
//                 results.failed++;
//                 results.errors.push(`Row ${i + 1}: Invalid amount "${amountStr}"`);
//                 continue;
//             }

//             // Normalization & Storage
//             try {
//                 const rawEvent = {
//                     eventId: crypto.randomUUID(),
//                     timestamp: new Date().toISOString(),
//                     metadata: {
//                         orderId,
//                         sku,
//                         paymentMethod,
//                         amount,
//                         channel: 'offline',
//                         orderSource: 'offline'
//                     }
//                 };

//                 const tenantId = GlobalMemoryStore.projects.get(siteId)?.tenantId || 'system';
//                 const canonical = await orderNormalizationService.normalize('offline', rawEvent, siteId, tenantId);
//                 GlobalMemoryStore.orders.set(orderId, {
//                     ...canonical,
//                     siteId,
//                     ingestionType: 'csv',
//                     status: 'processed'
//                 });
//                 results.success++;
//             } catch (err: any) {
//                 results.failed++;
//                 results.errors.push(`Row ${i + 1}: ${err.message}`);
//             }
//         }

//         const finalLog = GlobalMemoryStore.ingestionLogs.find(l => l.id === batchId);
//         if (finalLog) {
//             finalLog.status = results.failed === 0 ? 'success' : 'partial_failure';
//             finalLog.details = `Processed ${results.success} success, ${results.failed} failed.`;
//         }

//         return results;
//     }

//     /**
//      * Simulates external system sync (OMS, ERP, POS)
//      */
//     static async syncExternalSystem(siteId: string, system: 'OMS' | 'ERP' | 'POS') {
//         const syncId = `sync_${Date.now()}`;
//         const syncEntry = {
//             id: syncId,
//             siteId,
//             system,
//             timestamp: new Date().toISOString(),
//             status: 'syncing'
//         };
//         GlobalMemoryStore.integrationSyncs.push(syncEntry);

//         // Simulate network delay
//         await new Promise(resolve => setTimeout(resolve, 1500));

//         // Mock success with some random failure probability
//         const success = Math.random() > 0.1;

//         const updatedSync = GlobalMemoryStore.integrationSyncs.find(s => s.id === syncId);
//         if (updatedSync) {
//             updatedSync.status = success ? 'success' : 'failure';
//             updatedSync.lastSyncAt = new Date().toISOString();
//         }

//         return { success, syncId };
//     }
// }


import { prisma } from '@kpi-platform/db';
import { orderNormalizationService } from './order-normalization.service';
import crypto from 'crypto';

export class OrderIngestionService {
    
    /**
     * Simulates CSV parsing for offline orders.
     * Expected format: Order ID, SKU, Payment Method, Total Amount
     */
    static async processCSV(siteId: string, csvContent: string) {
        const lines = csvContent.split('\n').filter(l => l.trim().length > 0);
        const results = {
            success: 0,
            failed: 0,
            errors: [] as string[]
        };

        const batchId = `csv_${Date.now()}`;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const parts = line.split(',').map(p => p.trim());

            if (parts.length < 4) {
                results.failed++;
                results.errors.push(`Row ${i + 1}: Missing fields. Expected 4, got ${parts.length}`);
                continue;
            }

            const [orderId, sku, paymentMethod, amountStr] = parts;
            const amount = parseFloat(amountStr);

            if (isNaN(amount)) {
                results.failed++;
                results.errors.push(`Row ${i + 1}: Invalid amount "${amountStr}"`);
                continue;
            }

            // Normalization & Storage
            try {
                const rawEvent = {
                    eventId: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    metadata: {
                        orderId,
                        sku,
                        paymentMethod,
                        amount,
                        channel: 'POS',
                        orderSource: 'offline'
                    }
                };

                const project = await prisma.project.findUnique({
                    where: { id: siteId },
                    select: { tenantId: true }
                });
                const tenantId = project?.tenantId || 'system';

                const canonical = await orderNormalizationService.normalize('offline', rawEvent, siteId, tenantId);
                
                await prisma.canonicalOrder.create({
                    data: {
                        ...canonical,
                        projectId: siteId,
                        tenantId,
                        channel: 'POS',
                        status: 'PLACED'
                    }
                });

                results.success++;
            } catch (err: any) {
                results.failed++;
                results.errors.push(`Row ${i + 1}: ${err.message}`);
            }
        }

        return results;
    }

    /**
     * Simulates external system sync (OMS, ERP, POS)
     */
    static async syncExternalSystem(siteId: string, system: 'OMS' | 'ERP' | 'POS') {
        const syncId = `sync_${Date.now()}`;

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Mock success with some random failure probability
        const success = Math.random() > 0.1;

        // Log lifecycle event for the sync
        await prisma.connectorLifecycleEvent.create({
            data: {
                id: crypto.randomUUID(),
                tenantId: 'system',
                projectId: siteId,
                connectorInstanceId: system,
                eventType: success ? 'CONNECTOR_SYNCED' : 'CONNECTOR_SYNC_FAILED',
                severity: success ? 'INFO' : 'ERROR',
                payload: { system, recordCount: 0 },
                triggeredBy: 'SYSTEM'
            }
        });

        return { success, syncId };
    }
}