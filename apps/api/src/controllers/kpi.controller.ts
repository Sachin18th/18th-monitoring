import { FastifyRequest, FastifyReply } from 'fastify';
import { metricCatalogService } from '../services/metric-catalog.service';
import { metricQueryService } from '../services/metric-query.service';

export const listKpis = async (request: FastifyRequest, reply: FastifyReply) => {
    const metrics = metricCatalogService.getMetrics();
    return reply.send({ success: true, count: metrics.length, metrics });
};

export const getKpi = async (request: FastifyRequest<{ Params: { siteId: string, metricKey: string } }>, reply: FastifyReply) => {
    try {
        const { siteId, metricKey } = request.params;
        const result = await metricQueryService.queryMetric(siteId, metricKey);
        return reply.send({ success: true, data: result });
    } catch (err: any) {
        if (err.message.includes('not found')) {
            return reply.status(404).send({ error: 'Not Found', message: err.message });
        }
        return reply.status(500).send({ error: 'Internal Error', message: 'Failed to query metric' });
    }
};

export const getSourceBreakdown = async (request: FastifyRequest<{ Params: { siteId: string } }>, reply: FastifyReply) => {
    try {
        const { siteId } = request.params;
        const breakdown = await metricQueryService.getSourceBreakdown(siteId);
        return reply.send({
            siteId,
            timestamp: new Date().toISOString(),
            breakdown
        });
    } catch (err: any) {
        return reply.status(500).send({ error: 'Internal Error', message: 'Failed to generate breakdown' });
    }
};
