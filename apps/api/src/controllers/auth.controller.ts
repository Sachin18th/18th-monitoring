import { AuthService } from '../services/auth.service';
import { prisma } from '@kpi-platform/db';
import { successResponse, errorResponse } from '../utils/response';

export const login = async (req: any, reply: any) => {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    
    if (!result) {
        return reply.code(401).send(errorResponse('Invalid credentials', 'AUTH_FAILED'));
    }
    
    return reply.code(200).send(successResponse(result));
};

export const getMe = async (req: any, reply: any) => {
    return reply.code(200).send(successResponse({ user: req.user }));
};

export const getProjects = async (req: any, reply: any) => {
    const userRole = req.user.role;
    const tenantId = req.user.tenantId;
    const assignedIds = req.user.assignedProjects;
    
    // Query projects from database instead of memory
    const tenantProjects = await prisma.project.findMany({
        where: { tenantId }
    });

    // Restrict to assigned projects for roles other than SUPER_ADMIN / TENANT_ADMIN
    let result = tenantProjects;
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'TENANT_ADMIN') {
        result = tenantProjects.filter(p => assignedIds.includes(p.id));
    }

    // Attach a live health summary per project.
    //
    // serviceAvailability = % of the project's store connectors that are HEALTHY
    // right now — the exact same signal the per-project integrations page surfaces
    // as "Service Availability" (see DashboardService.getIntegrationHealthSummary),
    // so the portfolio cards and the integrations page stay consistent.
    //
    // errorRate = % of connector lifecycle events with ERROR severity over the last
    // 30 days, kept for the incident-surface aggregates on the portfolio view.
    const projectIds = result.map(p => p.id);
    const errorRateByProject: Record<string, number> = {};
    const availabilityByProject: Record<string, { rate: number; total: number }> = {};
    if (projectIds.length > 0) {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [groups, connectors] = await Promise.all([
            prisma.connectorLifecycleEvent.groupBy({
                by: ['projectId', 'severity'],
                where: { projectId: { in: projectIds }, createdAt: { gte: since } },
                _count: { _all: true },
            }),
            prisma.connectorInstance.findMany({
                where: { siteId: { in: projectIds } },
                select: { siteId: true, healthStatus: true },
            }),
        ]);

        const totals: Record<string, { total: number; errors: number }> = {};
        for (const g of groups as any[]) {
            const t = totals[g.projectId] ?? (totals[g.projectId] = { total: 0, errors: 0 });
            t.total += g._count._all;
            if (g.severity === 'ERROR') t.errors += g._count._all;
        }
        for (const [pid, t] of Object.entries(totals)) {
            errorRateByProject[pid] = t.total > 0
                ? Math.round((t.errors / t.total) * 10000) / 100
                : 0;
        }

        const connectorTotals: Record<string, { total: number; healthy: number }> = {};
        for (const c of connectors) {
            if (!c.siteId) continue;
            const t = connectorTotals[c.siteId] ?? (connectorTotals[c.siteId] = { total: 0, healthy: 0 });
            t.total += 1;
            if (c.healthStatus === 'HEALTHY') t.healthy += 1;
        }
        for (const [pid, t] of Object.entries(connectorTotals)) {
            availabilityByProject[pid] = {
                rate: t.total > 0 ? Math.round((t.healthy / t.total) * 100) : 100,
                total: t.total,
            };
        }
    }

    const withMetrics = result.map(p => {
        const availability = availabilityByProject[p.id];
        return {
            ...p,
            metricsSummary: {
                errorRate: errorRateByProject[p.id] ?? 0,
                // 100 when a project has no connectors yet, matching the integrations summary.
                serviceAvailability: availability?.rate ?? 100,
                connectorCount: availability?.total ?? 0,
            },
        };
    });

    return reply.code(200).send(successResponse(withMetrics));
};