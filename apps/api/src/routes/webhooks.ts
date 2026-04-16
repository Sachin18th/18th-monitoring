import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { externalSyncService } from '../services/external-sync.service';

/**
 * Inbound webhook routes for POS/ERP systems that push data to us.
 * Auth is performed via the x-api-key header matching the connector's vaultKey-issued token.
 * No rate limiter here — these are trusted system-to-system calls on a separate policy.
 */
import { IngestionService } from '../services/ingestion.service';

export async function webhookRoutes(server: FastifyInstance) {

    // POST /api/v1/webhooks/shopify/orders/create
    server.post('/shopify/orders/create', async (request: FastifyRequest<{ Body: Record<string, any> }>, reply: FastifyReply) => {
        try {
            const payload = request.body;
            // Normalize Shopify Order into common BaseEvent
            const event = {
                eventId: `shp_${payload.id || crypto.randomUUID()}`,
                eventType: 'order_placed',
                timestamp: payload.created_at || new Date().toISOString(),
                metadata: {
                    orderId: payload.id?.toString(),
                    value: parseFloat(payload.total_price || '0'),
                    channel: 'shopify',
                    currency: payload.currency
                }
            };
            
            // Site ID would ideally come from API key/header mapping or Webhook query params. Using general context for MVP.
            await IngestionService.processServerEvents('store_001', [event]);
            
            return reply.status(202).send({ accepted: true, source: 'shopify', event: 'orders/create', mapped: event });
        } catch (err: any) {
            return reply.status(500).send({ error: 'Internal Error', message: 'Shopify Webhook processing failed.' });
        }
    });

    // POST /api/v1/webhooks/shopify/orders/update
    server.post('/shopify/orders/update', async (request: FastifyRequest<{ Body: Record<string, any> }>, reply: FastifyReply) => {
        try {
            const payload = request.body;
            const event = {
                eventId: `shp_up_${payload.id || crypto.randomUUID()}`,
                eventType: 'order_processed',
                timestamp: payload.updated_at || new Date().toISOString(),
                metadata: { orderId: payload.id?.toString(), status: payload.financial_status || 'updated' }
            };
            await IngestionService.processServerEvents('store_001', [event]);
            return reply.status(202).send({ accepted: true, source: 'shopify', event: 'orders/update', mapped: event });
        } catch (err: any) {
            return reply.status(500).send({ error: 'Internal Error', message: 'Shopify Webhook processing failed.' });
        }
    });

    // POST /api/v1/webhooks/shopify/products/update
    server.post('/shopify/products/update', async (request: FastifyRequest<{ Body: Record<string, any> }>, reply: FastifyReply) => {
        try {
            const payload = request.body;
            const event = {
                eventId: `shp_prod_${payload.id || crypto.randomUUID()}`,
                eventType: 'product_updated',
                timestamp: payload.updated_at || new Date().toISOString(),
                metadata: { productId: payload.id?.toString(), syncStatus: 'success' }
            };
            await IngestionService.processServerEvents('store_001', [event]);
            return reply.status(202).send({ accepted: true, source: 'shopify', event: 'products/update', mapped: event });
        } catch (err: any) {
            return reply.status(500).send({ error: 'Internal Error', message: 'Shopify Webhook processing failed.' });
        }
    });

    // POST /api/v1/webhooks/magento/orders/create
    server.post('/magento/orders/create', async (request: FastifyRequest<{ Body: Record<string, any> }>, reply: FastifyReply) => {
        try {
            const payload = request.body;
            // Normalize Magento Order into common BaseEvent
            const event = {
                eventId: `mag_${payload.entity_id || crypto.randomUUID()}`,
                eventType: 'order_placed',
                timestamp: new Date().toISOString(), // Magento sometimes omits created_at in simple hooks
                metadata: {
                    orderId: payload.entity_id?.toString(),
                    value: parseFloat(payload.grand_total || '0'),
                    channel: 'magento',
                    currency: payload.order_currency_code
                }
            };
            await IngestionService.processServerEvents('store_001', [event]);
            return reply.status(202).send({ accepted: true, source: 'magento', event: 'orders/create', mapped: event });
        } catch (err: any) {
            return reply.status(500).send({ error: 'Internal Error', message: 'Magento Webhook processing failed.' });
        }
    });

    // POST /api/v1/webhooks/:connectorId
    // Receives a single order payload pushed by a POS/ERP webhook
    server.post(
        '/:connectorId',
        async (request: FastifyRequest<{ Params: { connectorId: string }; Body: Record<string, any> }>, reply: FastifyReply) => {
            const { connectorId } = request.params;
            const rawPayload = request.body;

            if (!rawPayload || typeof rawPayload !== 'object') {
                return reply.status(400).send({ error: 'Bad Request', message: 'Payload body is required.' });
            }

            try {
                const mapped = await externalSyncService.processWebhookPayload(connectorId, rawPayload);
                // In production: enqueue mapped to TOPICS.SYNC_EVENTS for async normalization
                return reply.status(202).send({ accepted: true, mapped });
            } catch (err: any) {
                if (err.message?.includes('not found')) {
                    return reply.status(404).send({ error: 'Not Found', message: `Connector "${connectorId}" not registered.` });
                }
                return reply.status(500).send({ error: 'Internal Error', message: 'Webhook processing failed.' });
            }
        }
    );
}
