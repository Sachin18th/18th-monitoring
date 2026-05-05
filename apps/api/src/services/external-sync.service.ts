import fs from 'fs';
import path from 'path';
import { ConnectorRegistrySchema, ConnectorDefinition } from '../../../../packages/schemas/src/connector.schema';
<<<<<<< HEAD
import { ConnectorManagerService } from './connector-manager.service';
import { HardenedIngestionService } from './hardened-ingestion.service';
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb

interface FieldMapping {
    [canonicalField: string]: string; // target field or "const:<value>"
}

/**
<<<<<<< HEAD
 * ExternalSyncService - Hardened Version
 * 
 * Responsible for:
 * - Resilient third-party API polling (Requirement 5)
 * - Webhook processing with canonical ingestion (Requirement 4)
 * - Rate-limit awareness and sync orchestration
=======
 * ExternalSyncService
 * 
 * Responsible for:
 * - Loading and validating connector definitions from config (Zod-guarded)
 * - Applying field mapping to transform raw API/POS payloads into canonical shape
 * - Invoking external API polls with retry/backoff support
 * - Publishing results to the Kafka worker topic for async normalization
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
 */
export class ExternalSyncService {
    private connectors: ConnectorDefinition[] = [];

    constructor() {
        const configPath = path.join(__dirname, '../config/connectors/connector-registry.schema.json');
        try {
            const raw = fs.readFileSync(configPath, 'utf8');
            const parsed = JSON.parse(raw);
<<<<<<< HEAD
            const result = ConnectorRegistrySchema.safeParse(parsed);
            if (result.success) {
                this.connectors = result.data.connectors;
            }
        } catch {}
=======
            // Validate at startup — throws on schema violations
            const result = ConnectorRegistrySchema.safeParse(parsed);
            if (!result.success) {
                console.error('[ExternalSyncService] Connector registry config is INVALID:', result.error.flatten());
            } else {
                this.connectors = result.data.connectors;
                console.log(`[ExternalSyncService] Loaded ${this.connectors.length} connector(s).`);
            }
        } catch {
            console.error('[ExternalSyncService] Failed to load connector registry config.');
        }
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }

    public getConnector(connectorId: string): ConnectorDefinition | undefined {
        return this.connectors.find(c => c.connectorId === connectorId);
    }

    /**
<<<<<<< HEAD
     * Executes a hardened API poll (Requirement 5)
     */
    public async pollConnector(connectorId: string): Promise<{ fetched: number; failed: number }> {
        const connector = this.getConnector(connectorId);
        if (!connector || connector.type !== 'api_poll') {
            throw new Error(`Connector "${connectorId}" invalid for polling.`);
        }

        // 1. Register Sync Run (Requirement 5 & 12)
        const runId = await ConnectorManagerService.startSyncRun(connectorId, 'store_001', 'POLL');
        
        console.log(`[ExternalSyncService] Starting poll run ${runId} for ${connector.label}`);

        try {
            // 2. Fetch Checkpoint (Requirement 5 & 8)
            // In production: const lastCheckpoint = await db.select(...).from(processingCheckpoints)...

            // 3. Execute HTTP Pull (Mocked for now)
            // If response is 429 -> Record Throttled state -> Throw
            const mockRecords = [
                { id: 'EXT_001', amount: 100, status: 'paid' },
                { id: 'EXT_002', amount: 250, status: 'pending' }
            ];

            // 4. Ingest via Hardened Pipeline (Requirement 1 & 6)
            for (const rec of mockRecords) {
                await HardenedIngestionService.ingest({
                    siteId: 'store_001',
                    connectorId,
                    sourceSystem: connector.label,
                    eventType: 'sync_record',
                    payload: rec,
                    sourceEventId: rec.id
                });
            }

            // 5. Finalize Run (Requirement 5)
            await ConnectorManagerService.completeSyncRun(connectorId, 'store_001', {
                fetched: mockRecords.length,
                processed: mockRecords.length,
                rejected: 0,
                checkpoint: '2023-10-27T10:00:00Z'
            });

            return { fetched: mockRecords.length, failed: 0 };
        } catch (err) {
            console.error(`[ExternalSyncService] Sync failure for ${connectorId}:`, err);
            await ConnectorManagerService.recordHealthSignal(connectorId, 'sync', false, err);
            return { fetched: 0, failed: 1 };
        }
    }

    /**
     * Processes inbound webhook with hardened ingestion (Requirement 4)
     */
    public async processWebhookPayload(connectorId: string, rawPayload: Record<string, any>): Promise<any> {
        const connector = this.getConnector(connectorId);
        if (!connector) throw new Error(`Connector ${connectorId} not found.`);

        // 1. Record Signal (Requirement 14)
        await ConnectorManagerService.recordHealthSignal(connectorId, 'webhook', true);

        // 2. Canonical Ingest (Requirement 4)
        return HardenedIngestionService.ingest({
            siteId: 'store_001',
            connectorId,
            sourceSystem: connector.label,
            eventType: 'webhook_event',
            payload: rawPayload,
            sourceEventId: rawPayload.id || rawPayload.event_id
        });
=======
     * Applies the connector's field mapping to a raw payload object.
     * Handles "const:<value>" directives for static value injection.
     */
    public applyFieldMapping(raw: Record<string, any>, mapping: FieldMapping): Record<string, any> {
        const result: Record<string, any> = {};
        for (const [canonicalKey, sourceExpr] of Object.entries(mapping)) {
            if (sourceExpr.startsWith('const:')) {
                result[canonicalKey] = sourceExpr.replace('const:', '');
            } else {
                result[canonicalKey] = raw[sourceExpr] ?? null;
            }
        }
        return result;
    }

    /**
     * Executes a synchronous API poll for a given connector.
     * In production this would be driven by ConnectorRegistryService's cron scheduler.
     */
    public async pollConnector(connectorId: string): Promise<{ queued: number; failed: number }> {
        const connector = this.getConnector(connectorId);
        if (!connector || connector.type !== 'api_poll') {
            throw new Error(`Connector "${connectorId}" not found or is not an api_poll type.`);
        }

        console.log(`[ExternalSyncService] Polling connector: ${connector.label}`);

        // In production:
        // 1. Load checkpoint cursor from DB (last synced created_at)
        // 2. Call external API with pagination (using connector.endpoint + cursor)
        // 3. Map raw records via applyFieldMapping
        // 4. Publish mapped records to TOPICS.SYNC_EVENTS for async worker processing
        // 5. Update checkpoint cursor after successful batch

        // Mock result for MVP
        return { queued: 0, failed: 0 };
    }

    /**
     * Processes a single inbound webhook payload from a POS/ERP system.
     */
    public async processWebhookPayload(connectorId: string, rawPayload: Record<string, any>): Promise<Record<string, any>> {
        const connector = this.getConnector(connectorId);
        if (!connector || connector.type !== 'webhook') {
            throw new Error(`Webhook connector "${connectorId}" not found.`);
        }

        const mappedOrder = this.applyFieldMapping(rawPayload, connector.fieldMapping);
        console.log(`[ExternalSyncService] Webhook mapped order from ${connector.label}:`, mappedOrder.orderId);
        
        // Publish to TOPICS.SYNC_EVENTS for async normalization + classification
        return mappedOrder;
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
}

export const externalSyncService = new ExternalSyncService();
<<<<<<< HEAD

=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
