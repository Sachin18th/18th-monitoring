import { FastifyInstance } from 'fastify';
import { prisma } from '@kpi-platform/db';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { tenantIsolationGuard } from '../middlewares/tenant-isolation.middleware';
import { ResponseUtil } from '../utils/response';

/**
 * Normalize the assorted status strings used across sync/resync tables
 * (ACTIVE, RUNNING, running, completed, FAILED, queued, ...) into the
 * uppercase vocabulary the dashboard status pills understand.
 */
const normalizeStatus = (status: unknown): string => {
    const upper = String(status || '').toUpperCase();
    if (upper === 'ACTIVE' || upper === 'IN_PROGRESS') return 'RUNNING';
    if (upper === 'SUCCESS' || upper === 'SUCCEEDED') return 'COMPLETED';
    if (upper === 'PENDING') return 'QUEUED';
    return upper; // RUNNING | COMPLETED | FAILED | QUEUED | DEGRADED | ...
};

export const pipelineRoutes = async (fastify: FastifyInstance) => {

    fastify.addHook('preHandler', tenantAuthHandler);
    fastify.addHook('preHandler', tenantIsolationGuard);

    // ─── PIPELINE JOBS (EXECUTION QUEUE) ─────────────────────────────────────

    /**
     * List recent execution activity for the project. The real execution work
     * lives in connector_sync_runs (background polls/backfills) and
     * connector_resync_jobs (operator-triggered resyncs); both are normalized
     * into a single job feed for the Execution Queue view.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/pipeline/jobs', async (req, reply) => {
        const { siteId } = req.params as any;

        const [syncRuns, resyncJobs] = await Promise.all([
            prisma.connectorSyncRun.findMany({
                where: { connectorInstance: { siteId } },
                orderBy: { startedAt: 'desc' },
                take: 150,
                include: { connectorInstance: { select: { label: true, providerId: true } } }
            }),
            prisma.connectorResyncJob.findMany({
                where: { projectId: siteId },
                orderBy: { initiatedAt: 'desc' },
                take: 50
            })
        ]);

        const syncJobs = syncRuns.map((r) => ({
            id: r.id,
            type: r.syncType,
            status: normalizeStatus(r.status),
            correlationId: r.id,
            startedAt: r.startedAt,
            completedAt: r.finishedAt,
            attempts: (r.recordsFailed ?? 0) > 0 ? 1 : 0,
            maxRetries: 0,
            recordsFetched: r.recordsFetched ?? 0,
            recordsProcessed: r.recordsProcessed ?? 0,
            recordsFailed: r.recordsFailed ?? 0,
            errorSummary: r.errorSummary ?? null,
            connector: r.connectorInstance?.label ?? r.connectorInstance?.providerId ?? null,
            source: 'SYNC_RUN',
            createdAt: r.startedAt
        }));

        const resyncMapped = resyncJobs.map((j) => ({
            id: j.jobId,
            type: 'RESYNC',
            status: normalizeStatus(j.status),
            correlationId: j.jobId,
            startedAt: j.initiatedAt,
            completedAt: j.completedAt,
            attempts: 0,
            maxRetries: 0,
            errorSummary: j.error ?? null,
            source: 'RESYNC',
            createdAt: j.createdAt
        }));

        const jobs = [...syncJobs, ...resyncMapped].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        return reply.send(ResponseUtil.success({ jobs }, {}, req.id as string));
    });

    /**
     * Get a specific execution record by id (sync run, then resync job).
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/pipeline/jobs/:jobId', async (req, reply) => {
        const { jobId } = req.params as any;

        const syncRun = await prisma.connectorSyncRun.findUnique({
            where: { id: jobId },
            include: { connectorInstance: { select: { label: true, providerId: true } } }
        });

        if (syncRun) {
            return reply.send(ResponseUtil.success({
                job: {
                    id: syncRun.id,
                    type: syncRun.syncType,
                    status: normalizeStatus(syncRun.status),
                    correlationId: syncRun.id,
                    startedAt: syncRun.startedAt,
                    completedAt: syncRun.finishedAt,
                    attempts: (syncRun.recordsFailed ?? 0) > 0 ? 1 : 0,
                    maxRetries: 0,
                    recordsFetched: syncRun.recordsFetched ?? 0,
                    recordsProcessed: syncRun.recordsProcessed ?? 0,
                    recordsFailed: syncRun.recordsFailed ?? 0,
                    errorSummary: syncRun.errorSummary ?? null,
                    connector: syncRun.connectorInstance?.label ?? null,
                    source: 'SYNC_RUN'
                }
            }, {}, req.id as string));
        }

        const resyncJob = await prisma.connectorResyncJob.findUnique({ where: { jobId } });

        if (resyncJob) {
            return reply.send(ResponseUtil.success({
                job: {
                    id: resyncJob.jobId,
                    type: 'RESYNC',
                    status: normalizeStatus(resyncJob.status),
                    correlationId: resyncJob.jobId,
                    startedAt: resyncJob.initiatedAt,
                    completedAt: resyncJob.completedAt,
                    attempts: 0,
                    maxRetries: 0,
                    errorSummary: resyncJob.error ?? null,
                    source: 'RESYNC'
                }
            }, {}, req.id as string));
        }

        return reply.code(404).send(ResponseUtil.error([{ code: 'JOB_NOT_FOUND', message: 'Job not found' }], req.id as string));
    });

    // ─── PIPELINE CHECKPOINTS ────────────────────────────────────────────────

    /**
     * List current sync cursors/checkpoints for the project's integrations.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/pipeline/checkpoints', async (req, reply) => {
        const { siteId } = req.params as any;

        const checkpoints = await prisma.pipelineCheckpoint.findMany({
            where: { siteId },
            orderBy: { updatedAt: 'desc' }
        });

        return reply.send(ResponseUtil.success({ checkpoints }, {}, req.id as string));
    });

    // ─── DEAD LETTER QUEUE (DLQ) ─────────────────────────────────────────────

    /**
     * List entries stuck in the dead_letter_queue table awaiting intervention.
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/pipeline/dlq', async (req, reply) => {
        const { siteId } = req.params as any;

        const deadLetters = await prisma.deadLetterQueue.findMany({
            where: { siteId, actionTaken: null },
            orderBy: { createdAt: 'desc' }
        });

        return reply.send(ResponseUtil.success({ DLQ: deadLetters }, {}, req.id as string));
    });
};
