import { FastifyRequest, FastifyReply } from 'fastify';
import { DashboardService } from '../../services/dashboard.service';
import { ResponseUtil } from '../../utils/response';
import { ConnectorHealthSchema } from '../schemas/platform.schema';
import { z } from 'zod';

export const getIntegrationSummary = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;

    try {
        const summary = await DashboardService.getIntegrationHealthSummary({ siteId });
        return reply.send(ResponseUtil.success(summary, {
            filters: { siteId }
        }, traceId));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};

export const getConnectorStatus = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;

    try {
        const systems = await DashboardService.getIntegrationSystemBreakdown({ siteId });
        return reply.send(ResponseUtil.success(systems, z.array(ConnectorHealthSchema), {
            traceId,
            siteId,
            filters: { siteId }
        }));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};

export const getSyncHistory = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;

    try {
        const failed = await DashboardService.getFailedSyncs({ siteId });
        const trends = await DashboardService.getSyncTrends({ siteId });
        
        return reply.send(ResponseUtil.success({
            recentFailures: failed,
            trends
        }, {
            filters: { siteId }
        }, traceId));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};
