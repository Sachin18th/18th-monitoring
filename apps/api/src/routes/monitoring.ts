﻿import { FastifyInstance } from 'fastify';
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { HealthEngine } from '../services/health-engine.service';
import { AlertEngine } from '../services/alert-engine.service';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { tenantIsolationGuard } from '../middlewares/tenant-isolation.middleware';
import { ResponseUtil } from '../utils/response';

export const monitoringRoutes = async (fastify: FastifyInstance) => {

    fastify.addHook('preHandler', tenantAuthHandler);
    fastify.addHook('preHandler', tenantIsolationGuard);

    // â”€â”€â”€ HEALTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /**
     * GET /health/snapshot
     * Computes and returns a fresh health evaluation for the project.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/health/snapshot', async (req, reply) => {
        const { tenantId, siteId } = req.params as any;
        const snapshot = HealthEngine.evaluate(siteId, tenantId);
        return reply.send(ResponseUtil.success({ snapshot }, {}, req.id as string));
    });

    /**
     * GET /health/history
     * Returns health snapshots over time for trend analysis.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/health/history', async (req, reply) => {
        const { siteId } = req.params as any;
        const history = (GlobalMemoryStore.healthSnapshots || [])
            .filter((s: any) => s.siteId === siteId)
            .sort((a: any, b: any) => new Date(b.computedAt).getTime() - new Date(a.computedAt).getTime())
            .slice(0, 50);
        return reply.send(ResponseUtil.success({ history }, {}, req.id as string));
    });

    // â”€â”€â”€ ALERTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /**
     * GET /alerts
     * Lists all active alerts for the project, sorted by severity.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/alerts', async (req, reply) => {
        const { siteId } = req.params as any;
        const { status } = req.query as any;

        let alerts = GlobalMemoryStore.alerts.filter((a: any) => a.siteId === siteId);
        if (status) {
            alerts = alerts.filter((a: any) => a.status === status);
        }

        const severityOrder = { critical: 0, warning: 1, info: 2 };
        alerts.sort((a: any, b: any) => (severityOrder[a.severity as keyof typeof severityOrder] ?? 3) - (severityOrder[b.severity as keyof typeof severityOrder] ?? 3));

        return reply.send(ResponseUtil.success({ alerts, total: alerts.length }, {}, req.id as string));
    });

    /**
     * POST /alerts/:alertId/acknowledge
     * Acknowledges an active alert, suppressing further notifications temporarily.
     */
    fastify.post('/tenants/:tenantId/projects/:siteId/alerts/:alertId/acknowledge', async (req, reply) => {
        const { alertId } = req.params as any;
        const { userId } = (req.body as any) || { userId: 'system' };
        const alert = GlobalMemoryStore.alerts.find((a: any) => a.id === alertId || a.alertId === alertId);
        if (alert) {
            alert.status = 'acknowledged';
            alert.acknowledgedBy = userId;
            alert.acknowledgedAt = new Date().toISOString();
        }
        return reply.send(ResponseUtil.success({ alertId, status: 'acknowledged' }, {}, req.id as string));
    });

    /**
     * POST /alerts/:alertId/resolve
     * Marks an alert as resolved after operator remediation.
     */
    fastify.post('/tenants/:tenantId/projects/:siteId/alerts/:alertId/resolve', async (req, reply) => {
        const { alertId } = req.params as any;
        const { userId } = (req.body as any) || { userId: 'system' };
        const alert = GlobalMemoryStore.alerts.find((a: any) => a.id === alertId || a.alertId === alertId);
        if (alert) {
            alert.status = 'resolved';
            alert.resolvedBy = userId;
            alert.resolvedAt = new Date().toISOString();
        }
        return reply.send(ResponseUtil.success({ alertId, status: 'resolved' }, {}, req.id as string));
    });

    // â”€â”€â”€ ALERT RULES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /**
     * GET /alert-rules
     * Lists all configured alert rules for the project.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/alert-rules', async (req, reply) => {
        const { siteId } = req.params as any;
        const rules = (GlobalMemoryStore.alertRules || []).filter((r: any) => r.siteId === siteId);
        return reply.send(ResponseUtil.success({ rules }, {}, req.id as string));
    });

    /**
     * POST /alert-rules/evaluate
     * Manually triggers alert rule evaluation for the project (useful for testing).
     */
    fastify.post('/tenants/:tenantId/projects/:siteId/alert-rules/evaluate', async (req, reply) => {
        const { tenantId, siteId } = req.params as any;
        await AlertEngine.evaluateProject(siteId, tenantId);
        return reply.code(202).send(ResponseUtil.success({ evaluated: true }, {}, req.id as string));
    });
};
