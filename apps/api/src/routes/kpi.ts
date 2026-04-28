import { FastifyInstance } from 'fastify';
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { KpiRegistry } from '../services/kpi-engine/registry';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { tenantIsolationGuard } from '../middlewares/tenant-isolation.middleware';
import { ResponseUtil } from '../utils/response';

export const kpiRoutes = async (fastify: FastifyInstance) => {

    fastify.addHook('preHandler', tenantAuthHandler);
    fastify.addHook('preHandler', tenantIsolationGuard);

    /**
     * GET /kpi/catalog
     * Returns all active KPI definitions registered for the platform, filtered to what's available
     * for the given project's data coverage.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/kpi/catalog', async (req, reply) => {
        const { siteId } = req.params as any;
        
        // Resolve this project's active connector families
        const integrations = GlobalMemoryStore.projectIntegrations.get(siteId) || [];
        const activeTypes = integrations.map((i: any) => i.category?.toLowerCase());

        const coverage = KpiRegistry.evaluateProjectCoverage(siteId, activeTypes);

        return reply.send(ResponseUtil.success({
            available: coverage.available.map((d: any) => ({
                key: d.key,
                name: d.name,
                category: d.category,
                granularities: d.granularities,
                freshnessSlaMinutes: d.freshnessSlaMinutes
            })),
            unavailable: coverage.unavailable
        }, {}, req.id as string));
    });

    /**
     * GET /kpi/summary
     * Returns a multi-KPI aggregate summary for a project across a set of standard dashboard cards.
     * This is the primary endpoint consumed by the Control Tower and project dashboard header cards.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/kpi/summary', async (req, reply) => {
        const { siteId } = req.params as any;
        const correlationId = req.id as string;
        
        const allMetrics = GlobalMemoryStore.metrics.filter((m: any) => m.siteId === siteId);
        
        // Aggregate by KPI key
        const summaryMap: Record<string, any> = {};

        for (const metric of allMetrics) {
            const kpiKey = metric.kpiName;
            if (!summaryMap[kpiKey]) {
                const def = KpiRegistry.getDefinition(kpiKey);
                summaryMap[kpiKey] = {
                    key: kpiKey,
                    name: def?.name || kpiKey,
                    category: def?.category || 'UNKNOWN',
                    value: 0,
                    freshnessStatus: 'stale',
                    lastUpdated: null
                };
            }
            summaryMap[kpiKey].value += (metric.value || 0);
            summaryMap[kpiKey].freshnessStatus = metric.freshnessStatus || 'live';
            summaryMap[kpiKey].lastUpdated = metric.lastUpdated || metric.timestamp;
        }

        return reply.send(ResponseUtil.success({
            kpis: Object.values(summaryMap)
        }, {}, correlationId));
    });

    /**
     * GET /kpi/:kpiKey/series
     * Returns a time-series array of computed values for trend chart rendering.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/kpi/:kpiKey/series', async (req, reply) => {
        const { siteId, kpiKey } = req.params as any;

        const def = KpiRegistry.getDefinition(kpiKey);
        if (!def) {
            return reply.code(404).send(ResponseUtil.error([{ 
                code: 'KPI_NOT_FOUND', 
                message: `KPI '${kpiKey}' is not registered.` 
            }], req.id as string));
        }

        // Filter metrics for this KPI+project, returning a sorted time series
        const series = GlobalMemoryStore.metrics
            .filter((m: any) => m.siteId === siteId && m.kpiName === kpiKey)
            .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .map((m: any) => ({
                timestamp: m.timestamp,
                value: m.value,
                dimensions: m.dimensions || {},
                freshnessStatus: m.freshnessStatus || 'live'
            }));

        return reply.send(ResponseUtil.success({
            kpi: { key: def.key, name: def.name, category: def.category },
            series
        }, {}, req.id as string));
    });

    /**
     * GET /kpi/:kpiKey/availability
     * Returns the freshness state and data coverage for a specific KPI.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/kpi/:kpiKey/availability', async (req, reply) => {
        const { siteId, kpiKey } = req.params as any;

        const def = KpiRegistry.getDefinition(kpiKey);
        if (!def) {
            return reply.code(404).send(ResponseUtil.error([{ code: 'KPI_NOT_FOUND', message: 'KPI not found' }], req.id as string));
        }

        const latest = GlobalMemoryStore.metrics
            .filter((m: any) => m.siteId === siteId && m.kpiName === kpiKey)
            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

        const freshnessStatus = !latest ? 'unavailable'
            : (Date.now() - new Date(latest.lastUpdated || latest.timestamp).getTime() > def.freshnessSlaMinutes * 60000)
            ? 'stale' : 'live';

        return reply.send(ResponseUtil.success({
            key: def.key,
            freshnessSlaMinutes: def.freshnessSlaMinutes,
            lastUpdated: latest?.lastUpdated || null,
            freshnessStatus
        }, {}, req.id as string));
    });
};

