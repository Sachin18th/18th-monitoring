import { FastifyRequest, FastifyReply } from 'fastify';
import { DashboardService } from '../../services/dashboard.service';
import { ResponseUtil } from '../../utils/response';
import { PlatformKpiSchema, HealthStatusSchema } from '../schemas/platform.schema';
import { z } from 'zod';

export const getGlobalKpis = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;

    try {
        const kpis = await DashboardService.getKpiSummaries({ siteId });
        return reply.send(ResponseUtil.success(kpis, z.array(PlatformKpiSchema), {
            traceId,
            siteId,
            filters: { siteId }
        }));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};

export const getSystemHealth = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;

    try {
        const alerts = await DashboardService.getActiveAlerts({ siteId, limit: 5 });
        const healthScore = 100 - (alerts.filter(a => a.severity === 'critical').length * 20);
        
        const health = {
            status: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'critical',
            healthScore: Math.max(0, healthScore),
            activeAlertCount: alerts.length,
            recentAlerts: alerts
        };

        return reply.send(ResponseUtil.success(health, {
            filters: { siteId }
        }, traceId));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};

export const getPlatformOverview = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;

    try {
        const [kpis, health, activity] = await Promise.all([
            DashboardService.getKpiSummaries({ siteId }),
            DashboardService.getActiveAlerts({ siteId, limit: 3 }),
            DashboardService.getActivityFeed({ siteId })
        ]);

        return reply.send(ResponseUtil.success({
            kpis,
            healthStatus: health.length > 0 ? 'alert' : 'stable',
            recentActivity: activity.slice(0, 5)
        }, {
            filters: { siteId }
        }, traceId));
    } catch (err: any) {
        return reply.status(500).send(ResponseUtil.error(err.message, traceId));
    }
};
