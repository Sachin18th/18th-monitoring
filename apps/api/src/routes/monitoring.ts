import { FastifyInstance } from 'fastify';
import { prisma } from '@kpi-platform/db';
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { HealthEngine } from '../services/health-engine.service';
import { AlertEngine } from '../services/alert-engine.service';
import { AlertRuleService } from '../services/alert-rule.service';
import { ProjectSettingsService } from '../services/project-settings.service';
import { NotificationService } from '../services/notification.service';
import { alertRuleInputSchema, alertNotificationsSchema } from '../utils/alerting/rule-criteria';
import { DashboardService } from '../services/dashboard.service';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { tenantIsolationGuard } from '../middlewares/tenant-isolation.middleware';
import { ResponseUtil } from '../utils/response';

export const monitoringRoutes = async (fastify: FastifyInstance) => {

    fastify.addHook('preHandler', tenantAuthHandler);
    fastify.addHook('preHandler', tenantIsolationGuard);


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

    /**
     * GET /sync-jobs
     * Lists recent connector sync runs for the project.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/sync-jobs', async (req, reply) => {
        const { siteId } = req.params as any;

        try {
            const runs = await prisma.connectorSyncRun.findMany({
                where: {
                    connectorInstance: {
                        siteId
                    }
                },
                orderBy: {
                    startedAt: 'desc'
                },
                take: 25,
                select: {
                    id: true,
                    connectorInstanceId: true,
                    status: true,
                    startedAt: true,
                    finishedAt: true,
                    recordsProcessed: true,
                    connectorInstance: {
                        select: {
                            label: true,
                            providerId: true
                        }
                    }
                }
            });

            const jobs = runs.map((run: any) => {
                const startedAt = run.startedAt?.toISOString?.() || new Date().toISOString();
                const finishedAt = run.finishedAt?.toISOString?.();
                const durationMs = finishedAt
                    ? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime())
                    : 0;

                return {
                    id: run.id,
                    connectorId: run.connectorInstanceId,
                    connectorName: run.connectorInstance?.label || run.connectorInstance?.providerId || 'Connector',
                    source: run.connectorInstance?.providerId === 'adobe_commerce' ? 'adobe_commerce' : 'shopify',
                    storeLabel: run.connectorInstance?.label || 'Connector',
                    recordsProcessed: run.recordsProcessed || 0,
                    durationMs,
                    status:
                        run.status === 'RUNNING'
                            ? 'running'
                            : run.status === 'FAILED'
                              ? 'failed'
                              : run.status === 'DEAD_LETTERED'
                                ? 'dead_lettered'
                                : 'completed',
                    startedAt
                };
            });

            return reply.send(ResponseUtil.success(jobs, {}, req.id as string));
        } catch (err) {
            console.error('[MONITORING] sync-jobs failed', err);
            return reply.code(500).send(ResponseUtil.error('Failed to fetch sync jobs', 'INTERNAL_SERVER_ERROR', null, req.id as string));
        }
    });

    fastify.get('/projects/:siteId/audit/logs', async (req, reply) => {
        const { siteId } = req.params as any;
        try {
            const logs = await DashboardService.getAuditLogs({
                tenantId: (req as any).tenantId,
                siteId,
                limit: Number((req.query as any)?.limit || 50),
                offset: Number((req.query as any)?.offset || 0)
            } as any);
            return reply.send(ResponseUtil.success(logs, {}, req.id as string));
        } catch (err) {
            console.error('[MONITORING] Legacy audit/logs failed', err);
            return reply.code(500).send(ResponseUtil.error('Failed to fetch audit logs', 'INTERNAL_SERVER_ERROR', null, req.id as string));
        }
    });

    // â”€â”€â”€ ALERTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â€�

    /**
     * GET /alerts
     * Lists all active alerts for the project, sorted by severity.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/alerts', async (req, reply) => {
        const { tenantId, siteId } = req.params as any;
        const { status, connector_instance_id } = req.query as any;

        // Evaluate user-configured alert rules on read so rule-based alerts
        // surface immediately (complements the 5-min scheduled evaluation).
        // All alerts are now driven by the configurable rules in
        // observability/alerts — no hardcoded order/refund heuristics.
        try {
            await AlertEngine.evaluateProject(siteId, tenantId);
        } catch (err) {
            (req as any).log?.warn?.({ err }, '[Alerts] rule evaluation failed');
        }

        const activeStatuses = ['TRIGGERED', 'ACTIVE', 'ACKNOWLEDGED'];
        const where: any = { siteId };
        // Normalize: a repeated query param arrives as an array (e.g. ?x=a&x=a).
        // Collapse to a single string so Prisma receives a scalar filter.
        const connectorInstanceId = Array.isArray(connector_instance_id)
            ? connector_instance_id[0]
            : connector_instance_id;
        if (connectorInstanceId && connectorInstanceId !== 'all') {
            // Match alerts stamped with this store OR project-wide alerts
            // (connectorInstanceId null — e.g. rule alerts that evaluate the
            // whole project). Without the null branch, project-wide rule
            // alerts vanish the moment a specific store is selected.
            where.OR = [
                { connectorInstanceId },
                { connectorInstanceId: null },
            ];
        }
        if (status === 'resolved') {
            where.status = 'RESOLVED';
        } else {
            // Default + status=active: only actionable alerts.
            where.status = { in: activeStatuses };
        }

        const rows = await prisma.alert.findMany({
            where,
            orderBy: { triggeredAt: 'desc' },
            take: 200,
        });

        const severityRank: Record<string, number> = { critical: 0, high: 1, warning: 1, medium: 2, low: 3, info: 3 };
        const toStatus = (value: string) => {
            const v = String(value || '').toUpperCase();
            if (v === 'RESOLVED') return 'resolved';
            if (v === 'ACKNOWLEDGED') return 'acknowledged';
            return 'active';
        };

        const alerts = rows
            .map((a: any) => {
                const severity = String(a.severity || 'high').toLowerCase();
                const context = a.context && typeof a.context === 'object' ? a.context : {};
                const triggeredAt = a.triggeredAt?.toISOString?.() || new Date().toISOString();
                return {
                    id: a.id,
                    alertId: a.id,
                    title: a.message,
                    message: a.message,
                    severity,
                    status: toStatus(a.status),
                    module: a.module || 'System',
                    source: a.module || 'System',
                    alertType: a.alertType,
                    kpiName: a.alertType,
                    affectedEntity: context.orderId || '-',
                    connectorInstanceId: a.connectorInstanceId || null,
                    context,
                    triggeredAt,
                    timestamp: triggeredAt,
                    acknowledgedAt: a.acknowledgedAt?.toISOString?.() || null,
                    resolvedAt: a.resolvedAt?.toISOString?.() || null,
                };
            })
            .sort((x, y) => (severityRank[x.severity] ?? 4) - (severityRank[y.severity] ?? 4));

        return reply.send(ResponseUtil.success({ alerts, total: alerts.length }, {}, req.id as string));
    });

    /**
     * POST /alerts/:alertId/acknowledge
     * Acknowledges an active alert, suppressing further notifications temporarily.
     */
    fastify.post('/tenants/:tenantId/projects/:siteId/alerts/:alertId/acknowledge', async (req, reply) => {
        const { alertId } = req.params as any;
        const { userId } = (req.body as any) || { userId: 'system' };
        try {
            await prisma.alert.update({
                where: { id: alertId },
                data: { status: 'ACKNOWLEDGED', acknowledgedBy: userId || 'system', acknowledgedAt: new Date() },
            });
        } catch (err) {
            (req as any).log?.warn?.({ err, alertId }, '[Alerts] acknowledge failed');
        }
        return reply.send(ResponseUtil.success({ alertId, status: 'acknowledged' }, {}, req.id as string));
    });

    /**
     * POST /alerts/:alertId/resolve
     * Marks an alert as resolved after operator remediation.
     */
    fastify.post('/tenants/:tenantId/projects/:siteId/alerts/:alertId/resolve', async (req, reply) => {
        const { alertId } = req.params as any;
        try {
            await prisma.alert.update({
                where: { id: alertId },
                data: { status: 'RESOLVED', resolvedAt: new Date() },
            });
        } catch (err) {
            (req as any).log?.warn?.({ err, alertId }, '[Alerts] resolve failed');
        }
        return reply.send(ResponseUtil.success({ alertId, status: 'resolved' }, {}, req.id as string));
    });


    /**
     * GET /alert-rules
     * Lists all configured alert rules for the project (DB-backed).
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/alert-rules', async (req, reply) => {
        const { siteId } = req.params as any;
        const rules = await AlertRuleService.list(siteId);
        return reply.send(ResponseUtil.success({ rules }, {}, req.id as string));
    });

    /**
     * POST /alert-rules
     * Creates a new alert rule from the Alert Center config form.
     */
    fastify.post('/tenants/:tenantId/projects/:siteId/alert-rules', async (req, reply) => {
        const { tenantId, siteId } = req.params as any;
        try {
            const parsed = alertRuleInputSchema.parse(req.body);
            const rule = await AlertRuleService.create(siteId, tenantId, parsed);
            return reply.code(201).send(ResponseUtil.success({ rule }, {}, req.id as string));
        } catch (err: any) {
            return reply.code(400).send(ResponseUtil.error(err?.message || 'Invalid alert rule', 'VALIDATION_ERROR', null, req.id as string));
        }
    });

    /**
     * PUT /alert-rules/:ruleId
     * Updates an existing alert rule.
     */
    fastify.put('/tenants/:tenantId/projects/:siteId/alert-rules/:ruleId', async (req, reply) => {
        const { tenantId, siteId, ruleId } = req.params as any;
        try {
            const parsed = alertRuleInputSchema.parse(req.body);
            const rule = await AlertRuleService.update(siteId, ruleId, parsed);
            if (!rule) return reply.code(404).send(ResponseUtil.error('Alert rule not found', 'NOT_FOUND', null, req.id as string));
            // The condition may have changed: clear alerts raised under the old
            // criteria and re-evaluate now so the Alert Center is filtered on the
            // updated rule immediately (not after the next scheduled cycle).
            try {
                await AlertEngine.handleRuleChanged(siteId, tenantId, ruleId);
            } catch (err) {
                (req as any).log?.warn?.({ err, ruleId }, '[Alerts] post-update re-evaluation failed');
            }
            return reply.send(ResponseUtil.success({ rule }, {}, req.id as string));
        } catch (err: any) {
            return reply.code(400).send(ResponseUtil.error(err?.message || 'Invalid alert rule', 'VALIDATION_ERROR', null, req.id as string));
        }
    });

    /**
     * PATCH /alert-rules/:ruleId/toggle
     * Enables or disables a rule without resubmitting the whole form.
     */
    fastify.patch('/tenants/:tenantId/projects/:siteId/alert-rules/:ruleId/toggle', async (req, reply) => {
        const { siteId, ruleId } = req.params as any;
        const { enabled } = (req.body || {}) as any;
        const rule = await AlertRuleService.setEnabled(siteId, ruleId, enabled !== false);
        if (!rule) return reply.code(404).send(ResponseUtil.error('Alert rule not found', 'NOT_FOUND', null, req.id as string));
        // A paused rule must not leave its alerts open in the Alert Center.
        if (!rule.enabled) {
            try {
                await AlertEngine.resolveAlertsForRule(siteId, ruleId);
            } catch (err) {
                (req as any).log?.warn?.({ err, ruleId }, '[Alerts] resolve-on-disable failed');
            }
        }
        return reply.send(ResponseUtil.success({ rule }, {}, req.id as string));
    });

    /**
     * DELETE /alert-rules/:ruleId
     */
    fastify.delete('/tenants/:tenantId/projects/:siteId/alert-rules/:ruleId', async (req, reply) => {
        const { siteId, ruleId } = req.params as any;
        const ok = await AlertRuleService.remove(siteId, ruleId);
        if (!ok) return reply.code(404).send(ResponseUtil.error('Alert rule not found', 'NOT_FOUND', null, req.id as string));
        // The rule is gone, so it can no longer auto-resolve its own alerts on
        // the scheduled cycle — clear them now so they don't linger forever.
        try {
            await AlertEngine.resolveAlertsForRule(siteId, ruleId);
        } catch (err) {
            (req as any).log?.warn?.({ err, ruleId }, '[Alerts] resolve-on-delete failed');
        }
        return reply.send(ResponseUtil.success({ deleted: true }, {}, req.id as string));
    });

    /**
     * GET /alert-notifications
     * Project-level notification settings (shared recipients + summary cadence).
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/alert-notifications', async (req, reply) => {
        const { siteId } = req.params as any;
        const settings = await ProjectSettingsService.getAlertNotifications(siteId);
        return reply.send(ResponseUtil.success({ settings }, {}, req.id as string));
    });

    /**
     * PUT /alert-notifications
     * Updates the project's shared notification settings.
     */
    fastify.put('/tenants/:tenantId/projects/:siteId/alert-notifications', async (req, reply) => {
        const { siteId } = req.params as any;
        try {
            const parsed = alertNotificationsSchema.parse(req.body);
            const settings = await ProjectSettingsService.updateAlertNotifications(siteId, parsed);
            return reply.send(ResponseUtil.success({ settings }, {}, req.id as string));
        } catch (err: any) {
            return reply.code(400).send(ResponseUtil.error(err?.message || 'Invalid notification settings', 'VALIDATION_ERROR', null, req.id as string));
        }
    });

    /**
     * POST /alert-notifications/test
     * Sends a one-off test email to the configured recipients so the operator
     * can verify SMTP delivery on demand.
     */
    fastify.post('/tenants/:tenantId/projects/:siteId/alert-notifications/test', async (req, reply) => {
        const { siteId } = req.params as any;
        const result = await NotificationService.sendTestEmail(siteId);
        return reply.send(ResponseUtil.success(result, {}, req.id as string));
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
