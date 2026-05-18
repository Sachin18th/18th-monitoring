import { FastifyRequest, FastifyReply } from 'fastify';
import { DashboardService } from '../../services/dashboard.service';
import { ResponseUtil } from '../../utils/response';
import { AudienceAnalyticsSchema } from '../schemas/platform.schema';
import { z } from 'zod';

const CustomerResourceSchema = z.object({
    id: z.string(),
    externalIds: z.record(z.string(), z.string()).optional(),
    emailHash: z.string().optional(),
    phoneHash: z.string().optional(),
    lifecycleState: z.string(),
    identityConfidence: z.number().optional(),
    firstSeenAt: z.string().datetime(),
    lastSeenAt: z.string().datetime(),
    totalLtv: z.number().optional(),
    metadata: z.record(z.string(), z.any()).optional()
});

export const getCustomerList = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;
    const { lifecycleState, limit = 50, offset = 0 } = req.query as any;

    try {
        let customers = await DashboardService.getCustomers({ siteId });
        
        if (lifecycleState) {
            customers = customers.filter((c: any) => c.lifecycleState === lifecycleState);
        }

        const total = customers.length;
        const page = customers.slice(Number(offset), Number(offset) + Number(limit));

        return reply.send(ResponseUtil.success(page, z.array(CustomerResourceSchema), {
            traceId,
            siteId,
            pagination: { 
                total, 
                limit: Number(limit), 
                offset: Number(offset),
                hasNext: Number(offset) + Number(limit) < total
            },
            filters: { siteId, lifecycleState }
        }));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};

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
