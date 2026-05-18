import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { csvImportService } from '../services/csv-import.service';
import { ReconciliationEngine } from '../services/reconciliation-engine.service';
import { connectorRegistryService } from '../services/connector-registry.service';
import { externalSyncService } from '../services/external-sync.service';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { roleGuard } from '../middlewares/rbac.middleware';

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
            return reply.send({ success: true, ...result });
        } catch (err: any) {
            return reply.status(400).send({ error: 'Import Error', message: err.message });
        }
    });

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
            return reply.send({ success: true, ...result });
        } catch (err: any) {
            return reply.status(500).send({ error: 'Reconciliation Queue Error', message: err.message });
        }
    });
}

