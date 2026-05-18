import { FastifyRequest, FastifyReply } from 'fastify';
import { DashboardService } from '../../services/dashboard.service';
import { ResponseUtil } from '../../utils/response';
import { OrderResourceSchema, OrderMetricsSchema } from '../schemas/orders.schema';
import { z } from 'zod';

export const getOrderOverview = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;

    try {
        const summary = await DashboardService.getOrderSummary({ siteId });
        return reply.send(ResponseUtil.success(summary, OrderMetricsSchema, {
            traceId,
            siteId,
            filters: { siteId }
        }));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};

export const getOrderList = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;
    const { status, limit = 50, offset = 0 } = req.query as any;

    try {
        let orders = await DashboardService.getOrders({ siteId });
        
        if (status) {
            orders = orders.filter((o: any) => o.status === status);
        }

        const total = orders.length;
        const page = orders.slice(Number(offset), Number(offset) + Number(limit));

        return reply.send(ResponseUtil.success(page, z.array(OrderResourceSchema), {
            traceId,
            siteId,
            pagination: { 
                total, 
                limit: Number(limit), 
                offset: Number(offset),
                hasNext: Number(offset) + Number(limit) < total
            },
            filters: { siteId, status }
        }));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};

export const getDelayedOrders = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;

    try {
        const delayed = await DashboardService.getDelayedOrders({ siteId });
        return reply.send(ResponseUtil.success(delayed, {
            filters: { siteId }
        }, traceId));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};

export const getOrderTrends = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;

    try {
        const trends = await DashboardService.getOrderTrends({ siteId });
        return reply.send(ResponseUtil.success(trends, {
            filters: { siteId }
        }, traceId));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};
