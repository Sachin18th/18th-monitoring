import { FastifyRequest, FastifyReply } from 'fastify';
import { DashboardService } from '../../services/dashboard.service';
import { ResponseUtil } from '../../utils/response';
import { AudienceAnalyticsSchema } from '../schemas/platform.schema';

export const getCustomerAnalytics = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;

    try {
        const analytics = await DashboardService.getUserAnalytics({ siteId });
        return reply.send(ResponseUtil.success(analytics, AudienceAnalyticsSchema, {
            traceId,
            siteId,
            filters: { siteId }
        }));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};

export const getCustomerIntelligence = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;

    try {
        const intelligence = await DashboardService.getCustomerIntelligence({ siteId });
        return reply.send(ResponseUtil.success(intelligence, {
            filters: { siteId }
        }, traceId));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};

export const getBehaviorMetrics = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;

    try {
        const activity = await DashboardService.getUserActivitySummary({ siteId });
        const topPages = await DashboardService.getTopPages({ siteId });
        
        return reply.send(ResponseUtil.success({
            activity,
            topPages
        }, {
            filters: { siteId }
        }, traceId));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};
