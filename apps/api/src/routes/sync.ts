import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { csvImportService } from '../services/csv-import.service';
<<<<<<< HEAD
import { ReconciliationEngine } from '../services/reconciliation-engine.service';
=======
import { reconciliationService } from '../services/reconciliation.service';
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
import { connectorRegistryService } from '../services/connector-registry.service';
import { externalSyncService } from '../services/external-sync.service';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { roleGuard } from '../middlewares/rbac.middleware';

<<<<<<< HEAD
import { SyncEngine } from '../services/sync-engine.service';

export async function syncRoutes(server: FastifyInstance) {
    
    server.post('/:siteId/orders/sync/:connectorKey', { preHandler: [tenantAuthHandler, roleGuard(['TENANT_ADMIN', 'PROJECT_ADMIN', 'SUPER_ADMIN'])] }, async (request: FastifyRequest<{ Params: { siteId: string, connectorKey: string } }>, reply: FastifyReply) => {
        try {
            const { siteId, connectorKey } = request.params;
            const result = await SyncEngine.executeJob({
                siteId,
                connectorId: connectorKey,
                syncType: 'MANUAL',
                force: (request.query as any).force === 'true'
            });

            if ((result as any).skipped) {
                return reply.status(409).send({ success: false, message: 'Sync job already in progress.' });
            }

            return reply.send({ success: true, ...result });
        } catch (err: any) {
            return reply.status(500).send({ error: 'Sync Engine Error', message: err.message });
        }
    });

    server.post('/:siteId/orders/import/csv', { preHandler: [tenantAuthHandler, roleGuard(['TENANT_ADMIN', 'PROJECT_ADMIN', 'SUPER_ADMIN'])] }, async (request: FastifyRequest<{ Params: { siteId: string }, Body: any }>, reply: FastifyReply) => {
        try {
            const { fileStream, fileSizeMb, connectorId } = request.body as any; // Mock extracting stream
            const result = await csvImportService.processImport(request.params.siteId, connectorId || 'csv_fallback', (fileStream || []) as any, 1); // Mock data for Demo execution
=======
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
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
            return reply.send({ success: true, ...result });
        } catch (err: any) {
            return reply.status(400).send({ error: 'Import Error', message: err.message });
        }
    });

<<<<<<< HEAD
    server.post('/:siteId/orders/reconciliation', { preHandler: [tenantAuthHandler, roleGuard(['TENANT_ADMIN', 'PROJECT_ADMIN', 'SUPER_ADMIN'])] }, async (request: FastifyRequest<{ Params: { siteId: string }, Body: any }>, reply: FastifyReply) => {
        try {
            const { connectorId, start, end } = request.body as any;
            const result = await ReconciliationEngine.runReconciliation({ 
                siteId: request.params.siteId, 
                domain: 'ORDERS',
                connectorId, 
                start: new Date(start), 
                end: new Date(end) 
            });
=======
    server.post('/:siteId/orders/reconciliation', { preHandler: [tenantAuthHandler, roleGuard(['ADMIN', 'SUPER_ADMIN'])] }, async (request: FastifyRequest<{ Params: { siteId: string }, Body: { connectorId: string, start: string, end: string } }>, reply: FastifyReply) => {
        try {
            const { connectorId, start, end } = request.body;
            const result = await reconciliationService.triggerReconciliation(request.params.siteId, connectorId, { start, end });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
            return reply.send({ success: true, ...result });
        } catch (err: any) {
            return reply.status(500).send({ error: 'Reconciliation Queue Error', message: err.message });
        }
    });
}
<<<<<<< HEAD

=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
