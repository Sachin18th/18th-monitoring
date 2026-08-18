import { FastifyInstance } from 'fastify';
import { prisma } from '@kpi-platform/db';
import { getSiteDataPlaneClient, getScopedClient, queryAllSiteClients } from '../lib/tenant-prisma';
import { KpiRegistry } from '../services/kpi-engine/registry';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { tenantIsolationGuard } from '../middlewares/tenant-isolation.middleware';
import { ResponseUtil } from '../utils/response';

/**
 * The store the dashboard currently has selected. The dashboard's apiFetch
 * appends `connector_instance_id` to every request; Fastify surfaces a
 * duplicated param as an array, so collapse to the first non-empty scalar.
 * Returns null for "no specific store" (the whole project).
 */
const selectedConnectorId = (req: any): string | null => {
    const raw = (req.query as any)?.connector_instance_id ?? (req.query as any)?.connectorInstanceId;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const text = value === null || value === undefined ? '' : String(value).trim();
    return text && text !== 'all' ? text : null;
};

export const kpiRoutes = async (fastify: FastifyInstance) => {

    fastify.addHook('preHandler', tenantAuthHandler);
    fastify.addHook('preHandler', tenantIsolationGuard);

    /**
     * GET /kpi/catalog
     * Returns all KPI definitions registered for the platform, filtered by project data coverage.
     * Uses Prisma to check actual connected integrations and telemetry presence.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/kpi/catalog', async (req, reply) => {
        const { siteId } = req.params as any;
        // Coverage is reported for the store the operator has selected, so
        // switching stores re-derives which KPIs are actually available.
        const connectorInstanceId = selectedConnectorId(req);

        // Check real connector instances in DB to determine which integrations are active
        const connectors = await prisma.connectorInstance.findMany({
            where: {
                siteId,
                ...(connectorInstanceId ? { id: connectorInstanceId } : {})
            },
            select: { category: true, status: true }
        });

        const activeCategories = connectors
            .filter(c => c.status !== 'DISCONNECTED' && c.status !== 'ERROR')
            .map(c => (c.category || '').toLowerCase());

        // Check if any browser/RUM telemetry exists (determines EXPERIENCE KPI availability)
        const rumWhere = {
            siteId,
            ...(connectorInstanceId ? { connectorInstanceId } : {})
        };
        const rumCounts = connectorInstanceId
            ? [await (await getScopedClient(siteId, connectorInstanceId))
                .performanceMetric.count({ where: rumWhere, take: 1 })]
            : await queryAllSiteClients<number>(siteId, async (db) => [
                await db.performanceMetric.count({ where: rumWhere, take: 1 }),
            ]);
        const hasRumData = rumCounts.some((n) => Number(n) > 0);
        if (hasRumData && !activeCategories.includes('browser_sdk')) {
            activeCategories.push('browser_sdk');
        }

        const coverage = KpiRegistry.evaluateProjectCoverage(siteId, activeCategories);

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
     * Computes a multi-KPI aggregate from Prisma (canonicalOrder, performanceMetric,
     * connectorLifecycleEvent). Replaces the old in-memory GlobalMemoryStore approach.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/kpi/summary', async (req, reply) => {
        const { siteId } = req.params as any;
        const { range } = req.query as any;
        const correlationId = req.id as string;
        // Every figure below is scoped to the selected store. Without this the
        // page read only the site's FIRST store DB (getSiteDataPlaneClient
        // returns clients[0]), so switching stores never changed the numbers.
        const connectorInstanceId = selectedConnectorId(req);

        // Compute date filter from range param
        const now = new Date();
        let startDate: Date | undefined;
        if (range === '24h') startDate = new Date(now.getTime() - 86400000);
        else if (range === '7d') startDate = new Date(now.getTime() - 7 * 86400000);
        else if (range === '30d') startDate = new Date(now.getTime() - 30 * 86400000);
        else if (range === '90d') startDate = new Date(now.getTime() - 90 * 86400000);

        const dateFilter = startDate ? { gte: startDate, lte: now } : undefined;

        // 1. Revenue + Order Count from canonicalOrder
        // A store selection reads that store's DB only; with none selected we
        // fan out across every store DB of the site and merge.
        const readSiteData = async (query: (client: any) => Promise<any[]>): Promise<any[]> => {
            if (!connectorInstanceId) return queryAllSiteClients<any>(siteId, query);
            const db = await getScopedClient(siteId, connectorInstanceId);
            return query(db);
        };
        const connectorWhere = connectorInstanceId ? { connectorInstanceId } : {};

        const [orders, perfMetricsMerged, lifecycleEvents] = await Promise.all([
            readSiteData((db: any) => db.canonicalOrder.findMany({
                where: {
                    siteId,
                    ...connectorWhere,
                    ...(dateFilter ? { placedAt: dateFilter } : {})
                },
                select: { totalAmount: true, createdAt: true, placedAt: true }
            })),
            readSiteData((db: any) => db.performanceMetric.findMany({
                where: {
                    siteId,
                    ...connectorWhere,
                    metricName: { in: ['lcp', 'pageLoadTime', 'page_load_time'] },
                    ...(dateFilter ? { timestamp: dateFilter } : {})
                },
                select: { metricValue: true, timestamp: true },
                orderBy: { timestamp: 'desc' },
                take: 500
            })),
            prisma.connectorLifecycleEvent.findMany({
                where: {
                    projectId: siteId,
                    ...connectorWhere,
                    ...(dateFilter ? { createdAt: dateFilter } : {})
                },
                select: { severity: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 1000
            })
        ]);

        // Each store DB ordered its own slice; re-sort the merged set so the
        // newest-first assumptions below (avg over the latest 500, lastPerfDate)
        // still hold on a multi-store site.
        const perfMetrics = perfMetricsMerged
            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 500);

        const totalRevenue = orders.reduce((s: number, o: any) => s + Number(o.totalAmount || 0), 0);
        const orderCount = orders.length;
        const lastOrderDate = orders.length > 0
            ? orders.reduce((latest: Date, o: any) => {
                const t = o.placedAt ?? o.createdAt;
                return t > latest ? t : latest;
            }, new Date(0))
            : null;

        // 2. Page Load Time — average of LCP / pageLoadTime metrics
        const avgPageLoad = perfMetrics.length > 0
            ? perfMetrics.reduce((s: number, m: any) => s + Number(m.metricValue || 0), 0) / perfMetrics.length
            : 0;
        const lastPerfDate = perfMetrics.length > 0 ? perfMetrics[0].timestamp : null;

        // 3. Pipeline Success Rate from connectorLifecycleEvents
        const totalEvents = lifecycleEvents.length;
        const errorEvents = lifecycleEvents.filter((e: any) => e.severity === 'ERROR').length;
        const successRate = totalEvents > 0
            ? Math.round(((totalEvents - errorEvents) / totalEvents) * 10000) / 100
            : (totalEvents === 0 ? 100 : 0);
        const lastPipelineDate = lifecycleEvents.length > 0 ? lifecycleEvents[0].createdAt : null;

        const freshnessAge = (date: Date | null, slaMins: number) => {
            if (!date) return 'unavailable';
            return (now.getTime() - date.getTime()) > slaMins * 60000 ? 'stale' : 'live';
        };

        const kpis = [
            {
                key: 'revenue',
                name: 'Gross Revenue',
                category: 'BUSINESS',
                value: Math.round(totalRevenue * 100) / 100,
                unit: 'currency',
                freshnessStatus: freshnessAge(lastOrderDate, 15),
                lastUpdated: lastOrderDate?.toISOString() ?? null
            },
            {
                key: 'order_count',
                name: 'Order Volume',
                category: 'BUSINESS',
                value: orderCount,
                unit: 'count',
                freshnessStatus: freshnessAge(lastOrderDate, 15),
                lastUpdated: lastOrderDate?.toISOString() ?? null
            },
            {
                key: 'pipeline_success_rate',
                name: 'Pipeline Success Rate',
                category: 'OPERATIONAL',
                value: successRate,
                unit: 'percentage',
                freshnessStatus: freshnessAge(lastPipelineDate, 5),
                lastUpdated: lastPipelineDate?.toISOString() ?? null
            },
            {
                key: 'page_load_time',
                name: 'Page Load Time',
                category: 'EXPERIENCE',
                value: Math.round(avgPageLoad),
                unit: 'ms',
                freshnessStatus: freshnessAge(lastPerfDate, 5),
                lastUpdated: lastPerfDate?.toISOString() ?? null
            }
        ];

        return reply.send(ResponseUtil.success({ kpis }, {}, correlationId));
    });

    /**
     * GET /kpi/:kpiKey/series
     * Returns a time-series of computed KPI values from Prisma tables.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/kpi/:kpiKey/series', async (req, reply) => {
        const { siteId, kpiKey } = req.params as any;
        const { range } = req.query as any;

        const def = KpiRegistry.getDefinition(kpiKey);
        if (!def) {
            return reply.code(404).send(ResponseUtil.error([{
                code: 'KPI_NOT_FOUND',
                message: `KPI '${kpiKey}' is not registered.`
            }], req.id as string));
        }

        const now = new Date();
        let startDate: Date;
        if (range === '24h') startDate = new Date(now.getTime() - 86400000);
        else if (range === '7d') startDate = new Date(now.getTime() - 7 * 86400000);
        else if (range === '90d') startDate = new Date(now.getTime() - 90 * 86400000);
        else startDate = new Date(now.getTime() - 30 * 86400000); // default 30d

        let series: { timestamp: string; value: number; dimensions: object }[] = [];
        const db = await getSiteDataPlaneClient(siteId);

        if (kpiKey === 'revenue' || kpiKey === 'order_count') {
            const orders = await db.canonicalOrder.findMany({
                where: { siteId, placedAt: { gte: startDate, lte: now } },
                select: { totalAmount: true, placedAt: true, createdAt: true },
                orderBy: { placedAt: 'asc' }
            });
            // Bucket by day
            const buckets: Record<string, { revenue: number; count: number }> = {};
            for (const o of orders) {
                const d = (o.placedAt ?? o.createdAt).toISOString().slice(0, 10);
                if (!buckets[d]) buckets[d] = { revenue: 0, count: 0 };
                buckets[d].revenue += Number(o.totalAmount || 0);
                buckets[d].count++;
            }
            series = Object.entries(buckets).map(([day, b]) => ({
                timestamp: day,
                value: kpiKey === 'revenue' ? Math.round(b.revenue * 100) / 100 : b.count,
                dimensions: {}
            }));
        } else if (kpiKey === 'page_load_time') {
            const metrics = await db.performanceMetric.findMany({
                where: { siteId, metricName: { in: ['lcp', 'pageLoadTime'] }, timestamp: { gte: startDate, lte: now } },
                select: { metricValue: true, timestamp: true },
                orderBy: { timestamp: 'asc' }
            });
            const buckets: Record<string, { sum: number; count: number }> = {};
            for (const m of metrics) {
                const d = m.timestamp.toISOString().slice(0, 10);
                if (!buckets[d]) buckets[d] = { sum: 0, count: 0 };
                buckets[d].sum += Number(m.metricValue || 0);
                buckets[d].count++;
            }
            series = Object.entries(buckets).map(([day, b]) => ({
                timestamp: day,
                value: b.count > 0 ? Math.round(b.sum / b.count) : 0,
                dimensions: {}
            }));
        } else if (kpiKey === 'pipeline_success_rate') {
            const events = await prisma.connectorLifecycleEvent.findMany({
                where: { projectId: siteId, createdAt: { gte: startDate, lte: now } },
                select: { severity: true, createdAt: true },
                orderBy: { createdAt: 'asc' }
            });
            const buckets: Record<string, { total: number; errors: number }> = {};
            for (const e of events) {
                const d = e.createdAt.toISOString().slice(0, 10);
                if (!buckets[d]) buckets[d] = { total: 0, errors: 0 };
                buckets[d].total++;
                if (e.severity === 'ERROR') buckets[d].errors++;
            }
            series = Object.entries(buckets).map(([day, b]) => ({
                timestamp: day,
                value: b.total > 0 ? Math.round(((b.total - b.errors) / b.total) * 10000) / 100 : 100,
                dimensions: {}
            }));
        }

        return reply.send(ResponseUtil.success({
            kpi: { key: def.key, name: def.name, category: def.category },
            series
        }, {}, req.id as string));
    });

    /**
     * GET /kpi/:kpiKey/availability
     * Checks freshness and data coverage for a specific KPI using Prisma.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/kpi/:kpiKey/availability', async (req, reply) => {
        const { siteId, kpiKey } = req.params as any;

        const def = KpiRegistry.getDefinition(kpiKey);
        if (!def) {
            return reply.code(404).send(ResponseUtil.error([{ code: 'KPI_NOT_FOUND', message: 'KPI not found' }], req.id as string));
        }

        let lastUpdated: Date | null = null;
        const db = await getSiteDataPlaneClient(siteId);

        if (kpiKey === 'revenue' || kpiKey === 'order_count') {
            const latest = await db.canonicalOrder.findFirst({
                where: { siteId },
                orderBy: { placedAt: 'desc' },
                select: { placedAt: true, createdAt: true }
            });
            lastUpdated = latest ? (latest.placedAt ?? latest.createdAt) : null;
        } else if (kpiKey === 'page_load_time') {
            const latest = await db.performanceMetric.findFirst({
                where: { siteId, metricName: { in: ['lcp', 'pageLoadTime'] } },
                orderBy: { timestamp: 'desc' },
                select: { timestamp: true }
            });
            lastUpdated = latest?.timestamp ?? null;
        } else if (kpiKey === 'pipeline_success_rate') {
            const latest = await prisma.connectorLifecycleEvent.findFirst({
                where: { projectId: siteId },
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true }
            });
            lastUpdated = latest?.createdAt ?? null;
        }

        const now = Date.now();
        const freshnessStatus = !lastUpdated ? 'unavailable'
            : (now - lastUpdated.getTime() > def.freshnessSlaMinutes * 60000) ? 'stale' : 'live';

        return reply.send(ResponseUtil.success({
            key: def.key,
            freshnessSlaMinutes: def.freshnessSlaMinutes,
            lastUpdated: lastUpdated?.toISOString() ?? null,
            freshnessStatus
        }, {}, req.id as string));
    });
};
