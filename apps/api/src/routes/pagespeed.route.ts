import { FastifyInstance } from 'fastify';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { tenantIsolationGuard } from '../middlewares/tenant-isolation.middleware';
import { PageSpeedService } from '../services/pagespeed.service';
import { ResponseUtil } from '../utils/response';

export const pagespeedRoutes = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', tenantAuthHandler);
    fastify.addHook('preHandler', tenantIsolationGuard);

    fastify.post('/tenants/:tenantId/projects/:siteId/pagespeed/sync', async (req, reply) => {
        const { tenantId, siteId } = req.params as any;

        console.log('[PAGESPEED] sync request', {
            requestId: req.id,
            tenantId,
            siteId,
        });

        try {
            const data = await PageSpeedService.syncProjectMetrics(tenantId, siteId);
            console.log('[PAGESPEED] sync response', {
                requestId: req.id,
                tenantId,
                siteId,
                count: Array.isArray(data) ? data.length : 0,
            });
            return reply.send(ResponseUtil.success(data, {}, req.id as string));
        } catch (err) {
            console.error('[PAGESPEED] sync failed', err);
            const message = err instanceof Error ? err.message : 'Failed to sync PageSpeed metrics';
            return reply.code(502).send(ResponseUtil.error(message, 'PAGESPEED_SYNC_FAILED', null, req.id as string));
        }
    });

    fastify.get('/tenants/:tenantId/projects/:siteId/pagespeed/latest', async (req, reply) => {
        const { tenantId, siteId } = req.params as any;

        console.log('[PAGESPEED] latest request', {
            requestId: req.id,
            tenantId,
            siteId,
        });

        try {
            const data = await PageSpeedService.getLatestMetrics(siteId);
            console.log('[PAGESPEED] latest response', {
                requestId: req.id,
                tenantId,
                siteId,
                count: Array.isArray(data) ? data.length : 0,
            });
            return reply.send(ResponseUtil.success(data, {}, req.id as string));
        } catch (err) {
            console.error('[PAGESPEED] latest failed', err);
            return reply.send(ResponseUtil.success([], {}, req.id as string));
        }
    });
};