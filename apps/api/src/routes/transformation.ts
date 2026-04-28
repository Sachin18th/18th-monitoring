import { FastifyInstance } from 'fastify';
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { ConnectorRegistry } from '../../../../packages/connector-framework/src/registry';
import { TransformationPipeline } from '../services/transformation-pipeline.service';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { tenantIsolationGuard } from '../middlewares/tenant-isolation.middleware';
import { ResponseUtil } from '../utils/response';

export const transformationRoutes = async (fastify: FastifyInstance) => {
    
    fastify.addHook('preHandler', tenantAuthHandler);
    fastify.addHook('preHandler', tenantIsolationGuard);

    /**
     * Get Canonical Data Model schema for a given entity type (e.g., ORDER)
     * Used by the developer preview dashboard
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/canonical/:entityType', async (req, reply) => {
        const { entityType } = req.params as any;
        
        // Mocking the schema resolution that would normally be read from Drizzle models or metadata
        if (entityType === 'ORDER') {
            return reply.send(ResponseUtil.success({
                schema: {
                    id: 'string (uuid)',
                    orderId: 'string',
                    externalReferenceId: 'string?',
                    sourceSystem: 'string',
                    channel: 'string',
                    lifecycleState: 'string (enum)',
                    normalizedStatus: 'string (enum)',
                    currency: 'string',
                    totalAmount: 'number',
                    placedAt: 'iso-date'
                }
            }, {}, req.id as string));
        }

        return reply.code(404).send(ResponseUtil.error([{ code: 'SCHEMA_NOT_FOUND', message: 'Entity type not found' }], req.id as string));
    });

    /**
     * Preview Transformation Output (Developer Tooling)
     * Takes a raw payload and simulates full canonical transformation
     */
    fastify.post('/tenants/:tenantId/projects/:siteId/transformation/preview', async (req, reply) => {
        const { connectorType, entityType, rawPayload } = req.body as any;
        const correlationId = req.id as string;

        try {
            // Mock an ingestion envelope
            const envelope = {
                id: correlationId,
                mode: 'SYNTHETIC' as any,
                tenantId: (req.params as any).tenantId,
                projectId: (req.params as any).siteId,
                integrationId: 'preview-session',
                connectorType,
                entityType,
                receivedAt: new Date().toISOString(),
                payload: rawPayload,
                metadata: {}
            };

            const canonicalResult = await TransformationPipeline.process(envelope);
            
            return reply.send(ResponseUtil.success(canonicalResult, {}, correlationId));

        } catch (err: any) {
             return reply.code(400).send(ResponseUtil.error([{ 
                 code: 'TRANSFORMATION_PREVIEW_FAILED', 
                 message: err.message 
             }], correlationId));
        }
    });
};

