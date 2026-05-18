import { FastifyInstance } from 'fastify';
import { ImportController } from '../controllers/import.controller';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { tenantIsolationGuard } from '../middlewares/tenant-isolation.middleware';
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { ResponseUtil } from '../utils/response';

export const ingestionRoutes = async (fastify: FastifyInstance) => {
    
    fastify.addHook('preHandler', tenantAuthHandler);
    fastify.addHook('preHandler', tenantIsolationGuard);

    // â”€â”€â”€ BATCH IMPORTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    fastify.post('/tenants/:tenantId/projects/:siteId/imports', ImportController.uploadFile);

    // â”€â”€â”€ OBSERVABILITY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    
    /**
     * List ingestion events for a project
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/ingestion/events', async (req, reply) => {
        const { siteId } = req.params as any;
        const events = GlobalMemoryStore.syncHistory.filter((h: any) => h.projectId === siteId);
        return reply.send(ResponseUtil.success(events, {}, req.id as string));
    });

    /**
     * Get specific ingestion artifact (raw payload)
     */
    fastify.get('/tenants/:tenantId/projects/:siteId/ingestion/artifacts/:artifactId', async (req, reply) => {
        const { artifactId } = req.params as any;
        const artifact = GlobalMemoryStore.ingestionLogs.find((l: any) => l.id === artifactId);
        
        if (!artifact) {
            return reply.code(404).send(ResponseUtil.error([{ code: 'ARTIFACT_NOT_FOUND', message: 'Raw payload not found' }], req.id as string));
        }

        return reply.send(ResponseUtil.success(artifact, {}, req.id as string));
    });
};

