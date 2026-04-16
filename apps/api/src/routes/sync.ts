import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { csvImportService } from '../services/csv-import.service';
import { reconciliationService } from '../services/reconciliation.service';
import { connectorRegistryService } from '../services/connector-registry.service';
import { externalSyncService } from '../services/external-sync.service';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { roleGuard } from '../middlewares/rbac.middleware';

export async function syncRoutes(server: FastifyInstance) {
    
    server.post('/:siteId/orders/sync/:connectorKey', { preHandler: [tenantAuthHandler, roleGuard(['ADMIN', 'SUPER_ADMIN'])] }, async (request: FastifyRequest<{ Params: { siteId: string, connectorKey: string } }>, reply: FastifyReply) => {
        try {
            await connectorRegistryService.pollExternalAPI(request.params.siteId, request.params.connectorKey);
            return reply.send({ success: true, message: `Sync triggered successfully for ${request.params.connectorKey}` });
        } catch (err: any) {
            return reply.status(500).send({ error: 'Sync Error', message: err.message });
        }
    });

    server.post('/:siteId/orders/import/csv', { preHandler: [tenantAuthHandler, roleGuard(['ADMIN', 'SUPER_ADMIN'])] }, async (request: FastifyRequest<{ Params: { siteId: string }, Body: any }>, reply: FastifyReply) => {
        try {
            const { fileStream, fileSizeMb, connectorId } = request.body; // Mock extracting stream
            const result = await csvImportService.processImport(request.params.siteId, connectorId || 'csv_fallback', [], 1); // Mock data for Demo execution
            return reply.send({ success: true, ...result });
        } catch (err: any) {
            return reply.status(400).send({ error: 'Import Error', message: err.message });
        }
    });

    server.post('/:siteId/orders/reconciliation', { preHandler: [tenantAuthHandler, roleGuard(['ADMIN', 'SUPER_ADMIN'])] }, async (request: FastifyRequest<{ Params: { siteId: string }, Body: { connectorId: string, start: string, end: string } }>, reply: FastifyReply) => {
        try {
            const { connectorId, start, end } = request.body;
            const result = await reconciliationService.triggerReconciliation(request.params.siteId, connectorId, { start, end });
            return reply.send({ success: true, ...result });
        } catch (err: any) {
            return reply.status(500).send({ error: 'Reconciliation Queue Error', message: err.message });
        }
    });
}
