import { prisma } from '@kpi-platform/db';

export interface MetricPayload {
    siteId: string;
    kpiName: string;
    value: number;
    timestamp: string;
    dimensions: Record<string, string>;
}

export class MetricsDbAdapter {
    // Migrated from Drizzle ORM to Prisma
    static async writeMetrics(metrics: MetricPayload[]): Promise<void> {
        if (!metrics.length) {
            return;
        }

        const projectIds = Array.from(new Set(metrics.map((metric) => metric.siteId)));
        const projects = await prisma.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, tenantId: true },
        });

        const tenantBySite = new Map(projects.map((project) => [project.id, project.tenantId]));
        const missingSites = projectIds.filter((siteId) => !tenantBySite.has(siteId));

        if (missingSites.length > 0) {
            throw new Error(`Project not found for siteId(s): ${missingSites.join(', ')}`);
        }

        await prisma.kpiValue.createMany({
            data: metrics.map((metric) => ({
                siteId: metric.siteId,
                tenantId: tenantBySite.get(metric.siteId) as string,
                kpiName: metric.kpiName,
                kpiValue: metric.value.toString(),
                timeWindow: 'realtime',
                timestamp: new Date(metric.timestamp),
                metadata: {
                    dimensions: metric.dimensions,
                },
            })),
        });
    }
}
