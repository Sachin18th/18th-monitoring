import { FastifyInstance } from 'fastify';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { ResponseUtil } from '../utils/response';
import { StoreHealthService } from '../services/store-health.service';

/**
 * Backend API Observability — store-API health (mounted at both
 * `/api/v1/dashboard` and `/api/v1/tenants/:tenantId/projects/:siteId`, so the
 * dashboard's apiFetch URL-rewriting resolves either way).
 *
 *   GET  /api-health/overview   — summary KPIs + per-store health + trend.
 *   GET  /api-health/history    — recent individual probe rows.
 *   POST /api-health/run        — probe now (on-demand refresh).
 *
 * siteId is read from the route param (scoped prefix) or the `siteId` query
 * (dashboard prefix). tenantAuthHandler already validates project access when
 * a siteId is present.
 */
export const storeHealthRoutes = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', tenantAuthHandler);

    const resolveSiteId = (req: any): string | null =>
        req.params?.siteId || req.query?.siteId || req.siteId || null;

    const connectorFrom = (req: any): string | null => {
        const v = req.query?.connector_instance_id || req.query?.connectorInstanceId || req.query?.connectorId;
        return v && v !== 'all' ? String(v) : null;
    };

    fastify.get('/api-health/overview', async (req, reply) => {
        const siteId = resolveSiteId(req);
        if (!siteId) {
            return reply.code(400).send(ResponseUtil.error('siteId is required', 'MISSING_SITE_ID', null, req.id as string));
        }
        try {
            const windowHours = Number((req.query as any)?.windowHours) || 24;
            const data = await StoreHealthService.overview(String(siteId), {
                connectorInstanceId: connectorFrom(req),
                windowHours,
            });
            return reply.send(ResponseUtil.success(data, {}, req.id as string));
        } catch (err) {
            console.error('[StoreHealth] overview failed', err);
            return reply.code(500).send(ResponseUtil.error('Failed to load store API health', 'STORE_HEALTH_OVERVIEW_FAILED', null, req.id as string));
        }
    });

    fastify.get('/api-health/history', async (req, reply) => {
        const siteId = resolveSiteId(req);
        if (!siteId) {
            return reply.code(400).send(ResponseUtil.error('siteId is required', 'MISSING_SITE_ID', null, req.id as string));
        }
        try {
            const limit = Number((req.query as any)?.limit) || 100;
            const data = await StoreHealthService.history(String(siteId), {
                connectorInstanceId: connectorFrom(req),
                limit,
            });
            return reply.send(ResponseUtil.success(data, {}, req.id as string));
        } catch (err) {
            console.error('[StoreHealth] history failed', err);
            return reply.code(500).send(ResponseUtil.error('Failed to load probe history', 'STORE_HEALTH_HISTORY_FAILED', null, req.id as string));
        }
    });

    fastify.post('/api-health/run', async (req, reply) => {
        const siteId = resolveSiteId(req);
        if (!siteId) {
            return reply.code(400).send(ResponseUtil.error('siteId is required', 'MISSING_SITE_ID', null, req.id as string));
        }
        try {
            await StoreHealthService.checkProject(String(siteId));
            const data = await StoreHealthService.overview(String(siteId), { connectorInstanceId: connectorFrom(req) });
            return reply.send(ResponseUtil.success(data, {}, req.id as string));
        } catch (err) {
            console.error('[StoreHealth] run failed', err);
            return reply.code(500).send(ResponseUtil.error('Failed to run store API health probe', 'STORE_HEALTH_RUN_FAILED', null, req.id as string));
        }
    });
};

export default storeHealthRoutes;
