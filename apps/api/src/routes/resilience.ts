import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ReplayService } from '../services/replay.service';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { roleGuard } from '../middlewares/rbac.middleware';

/**
 * Hardened Resilience Routes (Replay, DLQ, Ingestion Lag)
 */
export async function resilienceRoutes(server: FastifyInstance) {
    
    // POST /api/v1/resilience/replay/:eventId
    // Replays a single failed event
    server.post('/replay/:eventId', { preHandler: [tenantAuthHandler, roleGuard(['TENANT_ADMIN', 'PROJECT_ADMIN', 'SUPER_ADMIN'])] }, async (request: FastifyRequest<{ Params: { eventId: string } }>, reply: FastifyReply) => {
        try {
            const result = await ReplayService.replayEvent(request.params.eventId);
            return reply.send({ success: true, eventId: result.eventId, status: result.status });
        } catch (err: any) {
            return reply.status(500).send({ error: 'Replay Failure', message: err.message });
        }
    });

    // POST /api/v1/resilience/replay-batch
    // Replays a batch of failed events based on range/connector
    server.post('/replay-batch', { preHandler: [tenantAuthHandler, roleGuard(['TENANT_ADMIN', 'PROJECT_ADMIN', 'SUPER_ADMIN'])] }, async (request: FastifyRequest<{ Body: { siteId: string, connectorId: string, start?: string, end?: string, status?: string } }>, reply: FastifyReply) => {
        try {
            const { siteId, connectorId, start, end, status } = request.body;
            const result = await ReplayService.replayBatch({
                siteId: siteId || 'store_001',
                connectorId,
                start: start ? new Date(start) : undefined,
                end: end ? new Date(end) : undefined,
                status
            });
            return reply.send({ success: true, ...result });
        } catch (err: any) {
            return reply.status(500).send({ error: 'Batch Replay Failure', message: err.message });
        }
    });

    // GET /api/v1/resilience/lag
    // Placeholder for real-time ingestion lag reporting
    server.get('/lag', { preHandler: [tenantAuthHandler] }, async (_request, reply) => {
        return reply.send({
            overallLagMs: 1450,
            connectorLags: [
                { connectorId: 'shopify_primary', lagMs: 400 },
                { connectorId: 'magento_legacy', lagMs: 2500 }
            ]
        });
    });
}

