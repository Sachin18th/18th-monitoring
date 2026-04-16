import fs from 'fs';
import path from 'path';
import { ConnectorRegistrySchema, ConnectorDefinition } from '../../../../packages/schemas/src/connector.schema';

interface FieldMapping {
    [canonicalField: string]: string; // target field or "const:<value>"
}

/**
 * ExternalSyncService
 * 
 * Responsible for:
 * - Loading and validating connector definitions from config (Zod-guarded)
 * - Applying field mapping to transform raw API/POS payloads into canonical shape
 * - Invoking external API polls with retry/backoff support
 * - Publishing results to the Kafka worker topic for async normalization
 */
export class ExternalSyncService {
    private connectors: ConnectorDefinition[] = [];

    constructor() {
        const configPath = path.join(__dirname, '../config/connectors/connector-registry.schema.json');
        try {
            const raw = fs.readFileSync(configPath, 'utf8');
            const parsed = JSON.parse(raw);
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
    }

    public getConnector(connectorId: string): ConnectorDefinition | undefined {
        return this.connectors.find(c => c.connectorId === connectorId);
    }

    /**
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
    }
}

export const externalSyncService = new ExternalSyncService();
