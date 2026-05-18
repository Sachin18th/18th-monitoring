import { FastifyRequest, FastifyReply } from 'fastify';
import { IngestionPipeline } from '../services/ingestion-pipeline.service';
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import crypto from 'crypto';

export class WebhookController {

    /**
     * Standardized webhook receiver for all external connectors.
     * Path: /api/v1/ingest/webhooks/:integrationId
     */
    public static async handleInbound(req: FastifyRequest, reply: FastifyReply) {
        const { integrationId } = req.params as any;
        const correlationId = req.id as string;

        // 1. Resolve Integration Instance & Context
        const integrations = Array.from(GlobalMemoryStore.projectIntegrations.values()).flat();
        const instance = integrations.find(i => i.id === integrationId);

        if (!instance) {
            return reply.code(404).send({ error: 'Integration not found.' });
        }

        // 2. Wrap into Ingestion Envelope
        const envelope = {
            id: correlationId,
            mode: 'WEBHOOK' as const,
            tenantId: instance.tenantId,
            projectId: instance.siteId,
            integrationId: instance.id,
            connectorType: instance.connectorId,
            entityType: req.headers['x-entity-type'] as string || 'GENERIC',
            sourceEventId: req.headers['x-shopify-order-id'] as string || req.headers['x-event-id'] as string,
            receivedAt: new Date().toISOString(),
            payload: req.body,
            metadata: {
                sourceIp: req.ip,
                headers: req.headers as Record<string, string>
            }
        };

        // 3. Process via Pipeline (Async to ensure fast Acknowledge)
        setImmediate(async () => {
            try {
                await IngestionPipeline.intake(envelope);
            } catch (err: any) {
                console.error(`[WebhookIntake] Critical pipeline failure for ${instance.id}:`, err.message);
            }
        });

        // 4. Fast Response
        return reply.code(202).send({ 
            status: 'ACCEPTED', 
            correlationId,
            message: 'Webhook received and queued for validation.'
        });
    }
}
