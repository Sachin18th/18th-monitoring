import { IngestionEnvelope } from '@kpi-platform/shared-types';
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import crypto from 'crypto';

export class TransformationPipeline {

    /**
     * Executes the raw-to-canonical transformation process.
     * Takes a validated ingestion envelope and produces a Canonical Entity.
     */
    public static async process(envelope: IngestionEnvelope): Promise<any> {
        console.log(`[Transformation] ▶ Starting transformation for ${envelope.mode} | source=${envelope.connectorType} | target=${envelope.entityType}`);

        try {
            // 1. Resolve Mapping Template
            const template = this.resolveMappingTemplate(envelope.connectorType || 'unknown', envelope.entityType);
            if (!template) {
                throw new Error(`No mapping template found for source: ${envelope.connectorType}, entity: ${envelope.entityType}`);
            }

            // 2. Map Fields (Raw -> Canonical)
            const canonicalRaw = await this.executeMapping(envelope.payload, template);

            // 3. Status Normalization
            const normalizedStatus = this.normalizeStatus(canonicalRaw.rawState, template.statusMap);
            canonicalRaw.lifecycleState = normalizedStatus.state;
            canonicalRaw.normalizedStatus = normalizedStatus.category;

            // 4. Currency & Timezone Normalization
            if (canonicalRaw.currency) {
                canonicalRaw.currency = canonicalRaw.currency.toUpperCase();
            }

            // 5. Enrichment & Classification
            const enrichedCanonical = await this.applyEnrichment(canonicalRaw, envelope);

            // 6. Assemble Lineage & Traceability Metadata
            const finalEntity = {
                ...enrichedCanonical,
                id: crypto.randomUUID(), // Internal Platform UUID
                siteId: envelope.projectId,
                tenantId: envelope.tenantId,
                sourceSystem: envelope.connectorType,
                ingestionEventId: envelope.id,
                mappingVersion: template.version,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: {
                    ...enrichedCanonical.metadata,
                    _lineage: {
                        sourceEventId: envelope.sourceEventId,
                        receivedAt: envelope.receivedAt,
                        rawPayloadRef: envelope.rawPayloadRef || `archive_${envelope.id}`
                    }
                }
            };

            // 7. Canonical Validation
            this.validateCanonicalEntity(finalEntity, envelope.entityType);

            // 8. Persistence Handoff
            this.persistCanonicalEntity(finalEntity, envelope.entityType);

            console.log(`[Transformation] ✓ Successfully transformed to Canonical ${envelope.entityType} | id=${finalEntity.id}`);
            return finalEntity;

        } catch (err: any) {
            console.error(`[Transformation] ⨯ Failed to transform envelope ${envelope.id}:`, err.message);
            // In a real system, route this to a Dead Letter Queue / Issue Tracker
            throw err;
        }
    }

    private static resolveMappingTemplate(connectorType: string, entityType: string) {
        const { ConnectorRegistry } = require('../../../../packages/connector-framework/src/registry');
        const connector = ConnectorRegistry.get(connectorType);

        if (!connector) {
            console.error(`[Transformation] Connector implementation for ${connectorType} not found in registry.`);
            return null;
        }

        return connector.getMappingTemplate(entityType);
    }

    private static async executeMapping(payload: any, template: any): Promise<any> {
        const result: any = {};
        for (const [canonicalField, sourceField] of Object.entries(template.mapping)) {
            // Simple flat extraction for MVP. In reality, requires json-path or robust resolvers
            result[canonicalField] = payload[sourceField as string];
        }
        return result;
    }

    private static normalizeStatus(rawState: string, statusMap: any) {
        const normalized = statusMap[rawState?.toLowerCase()];
        if (!normalized) {
            console.warn(`[Transformation] ⚠ Unmapped source status encountered: ${rawState}. Defaulting to EXCEPTION.`);
            return { state: 'EXCEPTION', category: 'FAILED' };
        }
        return normalized;
    }

    private static async applyEnrichment(entity: any, envelope: IngestionEnvelope) {
        // Infer channel based on connector type or metadata
        entity.channel = envelope.connectorType?.includes('store') || envelope.connectorType?.includes('magento') || envelope.connectorType?.includes('shopify') 
            ? 'ONLINE_STOREFRONT' 
            : 'EXTERNAL_PARTNER';
        return entity;
    }

    private static validateCanonicalEntity(entity: any, type: string) {
        // Enforce Phase 5 Cross-Platform Metadata requirements
        const requiredFields = ['siteId', 'tenantId', 'sourceSystem', 'ingestionEventId'];
        
        for (const field of requiredFields) {
            if (!entity[field]) {
                throw new Error(`Canonical validation failed. Missing required cross-platform metadata: ${field}`);
            }
        }
        
        // Entity specific validation
        if (type === 'ORDER') {
            if (!entity.orderId || !entity.totalAmount) {
                throw new Error(`Canonical validation failed. Missing core business fields for ORDER.`);
            }
        }
    }

    private static persistCanonicalEntity(entity: any, type: string) {
        if (type === 'ORDER') {
            GlobalMemoryStore.canonicalOrders = GlobalMemoryStore.canonicalOrders || [];
            GlobalMemoryStore.canonicalOrders.push(entity);
        }
        // Add other entity stores here
    }
}
