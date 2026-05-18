import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { listKpis, getKpi, getSourceBreakdown } from '../controllers/kpi.controller';
import { rateLimiter } from '../middlewares/rate-limiter.middleware';
import { metricCatalogService } from '../services/metric-catalog.service';
import { metricQueryService } from '../services/metric-query.service';
import { connectorRegistryService } from '../services/connector-registry.service';
import { AuditService } from '../services/audit.service';
import { tenantIsolationGuard } from '../middlewares/tenant-isolation.middleware';

const publicApiGuard = async (req: any, reply: any) => {
    const key = req.headers['x-api-key'];
    if (!key) return reply.status(401).send({ error: 'Unauthorized', message: 'Missing x-api-key header' });
};

export async function publicRoutes(server: FastifyInstance) {
    // Strict independent rate limiting for public read-only endpoints (20 req/min)
    server.addHook('onRequest', rateLimiter(20, 60_000));
    server.addHook('preHandler', publicApiGuard);

    // Audit every public API access for security visibility
    server.addHook('preHandler', async (req: any) => {
        const { siteId } = req.params;
        if (siteId) {
            AuditService.log({
                action: 'API_ACCESS',
                actorId: (req.headers['x-api-key'] as string) || 'unknown_token',
                siteId,
                entityType: 'endpoint',
                entityId: req.url,
                meta: { method: req.method, ip: req.ip }
            }).catch(() => {}); // Fire and forget to avoid blocking
        }
    });

    // Tenant isolation for public routes (ensures the siteId in URL is consistent with what we expect)
    // Note: In prod, public keys are usually site-bound. 
    // For now, we apply the guard if it's applicable.
    server.addHook('preHandler', tenantIsolationGuard);

    // â”€â”€ KPI Catalog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // GET /api/v1/projects/:siteId/kpis  (Phase 1 â€” kept for backwards compat)
    server.get('/projects/:siteId/kpis', listKpis);
    server.get('/projects/:siteId/kpis/:metricKey', getKpi);

    // GET /api/v1/projects/:siteId/metrics/catalog  (Phase 3 spec)
    server.get(
        '/projects/:siteId/metrics/catalog',
        async (_req: FastifyRequest<{ Params: { siteId: string } }>, reply: FastifyReply) => {
            const metrics = metricCatalogService.getMetrics();
            return reply.send({ success: true, count: metrics.length, metrics });
        }
    );

    // POST /api/v1/projects/:siteId/metrics/query  (Phase 2/3 spec â€” dynamic filter query)
    server.post(
        '/projects/:siteId/metrics/query',
        async (
            request: FastifyRequest<{ Params: { siteId: string }; Body: { metricKey: string; dateRange?: { start: string; end: string } } }>,
            reply: FastifyReply
        ) => {
            try {
                const { siteId } = request.params;
                const { metricKey } = request.body ?? {};
                if (!metricKey) return reply.status(400).send({ error: 'Bad Request', message: 'metricKey is required' });
                const result = await metricQueryService.queryMetric(siteId, metricKey);
                return reply.send({ success: true, data: result });
            } catch (err: any) {
                if (err.message?.includes('not found')) return reply.status(404).send({ error: 'Not Found', message: err.message });
                return reply.status(500).send({ error: 'Internal Error', message: 'Query failed' });
            }
        }
    );

    // â”€â”€ Orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    server.get('/projects/:siteId/orders/source-breakdown', getSourceBreakdown);

    // â”€â”€ Integration Status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // GET /api/v1/projects/:siteId/integrations/status  (Phase 3 spec)
    server.get(
        '/projects/:siteId/integrations/status',
        async (_req: FastifyRequest<{ Params: { siteId: string } }>, reply: FastifyReply) => {
            const connectors = connectorRegistryService.listConnectors();
            return reply.send({
                siteId: _req.params.siteId,
                timestamp: new Date().toISOString(),
                connectors,
            });
        }
    );
}

