import { FastifyRequest, FastifyReply } from 'fastify';
import { DashboardService } from '../../services/dashboard.service';
import { ResponseUtil } from '../../utils/response';
import { PerformanceMetricsSchema, RegionalPerformanceSchema } from '../schemas/performance.schema';
import { z } from 'zod';

export const getPerformanceSummary = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;

    try {
        const summary = await DashboardService.getPerformanceSummary({ siteId });
        return reply.send(ResponseUtil.success(summary, PerformanceMetricsSchema, {
            traceId,
            siteId,
            filters: { siteId }
        }));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};

export const getRegionalPerformance = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;

    try {
        const regional = await DashboardService.getRegionalPerformance({ siteId });
        return reply.send(ResponseUtil.success(regional, z.array(RegionalPerformanceSchema), {
            traceId,
            siteId,
            filters: { siteId }
        }));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};

export const getSlowestPages = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;

    try {
        const slowest = await DashboardService.getSlowestPages({ siteId });
        return reply.send(ResponseUtil.success(slowest, {
            filters: { siteId }
        }, traceId));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};

export const getPerformanceSeries = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;
    const { metric = 'pageLoadTime', range = '1h' } = req.query as any;

    try {
        const series = await DashboardService.getMetricsSeries({ siteId, kpi: metric, range });
        return reply.send(ResponseUtil.success(series, {
            filters: { siteId, metric, range }
        }, traceId));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};
