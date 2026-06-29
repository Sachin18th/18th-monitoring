import { FastifyInstance } from 'fastify';
import { ImportController } from '../controllers/import.controller';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { tenantIsolationGuard } from '../middlewares/tenant-isolation.middleware';
import { prisma } from '@kpi-platform/db';
import { ResponseUtil } from '../utils/response';

export const ingestionRoutes = async (fastify: FastifyInstance) => {

    fastify.addHook('preHandler', tenantAuthHandler);
    fastify.addHook('preHandler', tenantIsolationGuard);

    // ─── BATCH IMPORTS ──────────────────────────────────────────────────────
    fastify.post('/tenants/:tenantId/projects/:siteId/imports', ImportController.uploadFile);

    // ─── OBSERVABILITY ──────────────────────────────────────────────────────

    /**
     * List ingestion events for a project (sourced from the ingestion_events table).
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/ingestion/events', async (req, reply) => {
        const { siteId } = req.params as any;

        const events = await prisma.ingestionEvent.findMany({
            where: { projectId: siteId },
            orderBy: { receivedAt: 'desc' },
            take: 200,
            include: { artifacts: { select: { id: true }, take: 1 } }
        });

        const shaped = events.map((e) => ({
            id: e.id,
            mode: e.mode,
            status: e.status,
            sourceReferenceId: e.sourceReferenceId,
            correlationId: e.correlationId,
            receivedAt: e.receivedAt,
            validation: e.validationReport ?? null,
            artifactId: e.artifacts[0]?.id ?? null,
            projectId: e.projectId
        }));

        return reply.send(ResponseUtil.success(shaped, {}, req.id as string));
    });

    /**
     * Get specific ingestion artifact (raw payload) from the ingestion_artifacts table.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/ingestion/artifacts/:artifactId', async (req, reply) => {
        const { artifactId } = req.params as any;

        const artifact = await prisma.ingestionArtifact.findUnique({ where: { id: artifactId } });

        if (!artifact) {
            return reply.code(404).send(ResponseUtil.error([{ code: 'ARTIFACT_NOT_FOUND', message: 'Raw payload not found' }], req.id as string));
        }

        return reply.send(ResponseUtil.success(artifact, {}, req.id as string));
    });
};
