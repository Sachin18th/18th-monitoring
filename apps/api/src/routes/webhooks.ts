import { FastifyInstance } from 'fastify';
import { WebhookController } from '../controllers/webhook.controller';

/**
 * Webhook Ingestion Router
 * Standardized intake for all external connector events.
 */
export const webhookRoutes = async (fastify: FastifyInstance) => {
    
    /**
     * Productized Webhook Intake
     * Expects a unique integrationId to route to the correct project & connector.
     */
    fastify.post('/:integrationId', WebhookController.handleInbound);

    /**
     * Legacy Inbound Route (for backward compatibility)
     */
    fastify.post('/legacy/:providerId/:siteId', async (request, reply) => {
        // ... legacy logic from line 16-45
        return reply.code(202).send({ status: 'ACCEPTED_LEGACY' });
    });
};

