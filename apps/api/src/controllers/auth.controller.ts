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

    // Attach a live health summary per project. errorRate = % of connector
    // lifecycle events with ERROR severity over the last 30 days — the same
    // signal that drives the KPI engine's pipeline success rate, so the
    // projects overview and the per-project KPI page stay consistent.
    const projectIds = result.map(p => p.id);
    const errorRateByProject: Record<string, number> = {};
    if (projectIds.length > 0) {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const groups = await prisma.connectorLifecycleEvent.groupBy({
            by: ['projectId', 'severity'],
            where: { projectId: { in: projectIds }, createdAt: { gte: since } },
            _count: { _all: true },
        });
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
    }

    const withMetrics = result.map(p => ({
        ...p,
        metricsSummary: { errorRate: errorRateByProject[p.id] ?? 0 },
    }));

    return reply.code(200).send(successResponse(withMetrics));
};