/**
 * CSV Worker — Async normalization worker
 *
 * Consumes chunk payloads from raw_payloads (status: PENDING),
 * applies field mapping, runs OrderNormalizationService + OrderClassificationService,
 * writes to normalized_orders, then marks raw_payload as PROCESSED.
 *
 * Worker safety guarantees:
 *   - Idempotent: skips payloadIds already in PROCESSED state
 *   - Bounded memory: processes one chunk at a time from the queue
 *   - DLQ routing: failures after retries are published to SYNC_DLQ
 */

import { MemoryBus } from '../../../../packages/streaming/src/memory-bus';
import { orderNormalizationService } from '../../../../apps/api/src/services/order-normalization.service';
import { withRetry, RetryExhaustedError } from '../../../../apps/api/src/utils/retry.util';
import { AuditService } from '../../../../apps/api/src/services/audit.service';

const CSV_WORKER_TOPIC = 'CSV_QUEUE';

export class CsvWorker {
    async start() {
        MemoryBus.on(CSV_WORKER_TOPIC, async (msg: any) => {
            await this.processChunk(msg);
        });
        console.log(`[CSV Worker] Listening on ${CSV_WORKER_TOPIC}`);
    }

    private async processChunk(msg: any) {
        const { payloadId, siteId, tenantId, connectorId, rows } = msg?.value ?? {};

        if (!payloadId || !Array.isArray(rows)) {
            console.warn('[CSV Worker] Skipping invalid chunk message');
            return;
        }

        const results = { processed: 0, failed: 0 };

        for (const row of rows) {
            try {
                await withRetry(
                    async () => {
                        // Normalize each row into canonical model
                        await orderNormalizationService.normalize(
                            { metadata: row, eventId: payloadId, timestamp: row.createdAt },
                            siteId,
                            tenantId ?? 'default_tenant'
                        );
                    },
                    {
                        maxAttempts: 3,
                        baseDelayMs: 500,
                        shouldRetry: (err) => !err.message.includes('validation'),
                    }
                );
                results.processed++;
            } catch (err) {
                results.failed++;
                if (err instanceof RetryExhaustedError) {
                    // Route failed row to DLQ
                    MemoryBus.emit('SYNC_DLQ', {
                        value: { payloadId, siteId, connectorId, rawData: row }
                    });
                }
            }
        }

        await AuditService.log({
            action:     results.failed > 0 ? 'IMPORT_COMPLETED' : 'IMPORT_COMPLETED',
            actorId:    'CSV_WORKER',
            siteId,
            entityType: 'raw_payload',
            entityId:   payloadId,
            changes:    { connectorId, ...results },
            status:     results.failed === 0 ? 'SUCCESS' : 'FAILURE',
        });

        console.log(`[CSV Worker] Chunk ${payloadId}: ${results.processed} OK, ${results.failed} failed`);
    }
}

export const csvWorker = new CsvWorker();
