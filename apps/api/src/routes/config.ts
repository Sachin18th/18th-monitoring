import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { 
    getResolvedConfig, 
    publishConfig, 
    rollbackConfig, 
    getIntegrationCatalog,
    getIntegrationCategories,
    getProjectIntegrationInstances,
    createIntegrationInstance,
    updateIntegrationInstance,
    deleteIntegrationInstance,
    testIntegrationConnection
} from '../controllers/config.controller';
import {
    listAccessKeys,
    createAccessKey,
    rotateAccessKey,
    revokeAccessKey,
    getAuditLogs
} from '../controllers/governance.controller';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { roleGuard } from '../middlewares/rbac.middleware';
import { tenantIsolationGuard } from '../middlewares/tenant-isolation.middleware';
import { idempotencyGuard } from '../middlewares/idempotency.middleware';

export async function configRoutes(server: FastifyInstance) {

    // Integrations
    server.get('/p/:siteId/integrations/catalog',   { preHandler: [tenantAuthHandler, tenantIsolationGuard] }, getIntegrationCatalog);
    server.get('/p/:siteId/integrations/categories',{ preHandler: [tenantAuthHandler, tenantIsolationGuard] }, getIntegrationCategories);
    server.get('/p/:siteId/integrations/instances', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['ADMIN', 'SUPER_ADMIN'])] }, getProjectIntegrationInstances);
    server.post('/p/:siteId/integrations/instances', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['SUPER_ADMIN'])] }, createIntegrationInstance);
    server.patch('/p/:siteId/integrations/instances/:instanceId', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['SUPER_ADMIN'])] }, updateIntegrationInstance);
    server.delete('/p/:siteId/integrations/instances/:instanceId', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['SUPER_ADMIN'])] }, deleteIntegrationInstance);
    server.post('/p/:siteId/integrations/instances/:instanceId/test', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['SUPER_ADMIN'])] }, testIntegrationConnection);

    // Access Control
    server.get('/p/:siteId/access-control/keys', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['ADMIN', 'SUPER_ADMIN'])] }, listAccessKeys);
    server.post('/p/:siteId/access-control/keys', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['SUPER_ADMIN'])] }, createAccessKey);
    server.post('/p/:siteId/access-control/keys/:keyId/rotate', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['SUPER_ADMIN'])] }, rotateAccessKey);
    server.delete('/p/:siteId/access-control/keys/:keyId', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['SUPER_ADMIN'])] }, revokeAccessKey);
    server.get('/p/:siteId/access-control/audit', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['ADMIN', 'SUPER_ADMIN'])] }, getAuditLogs);

    // Legacy/Base Config
    server.get('/p/:siteId/config/resolved',{ preHandler: [tenantAuthHandler, tenantIsolationGuard] }, getResolvedConfig);
    server.post('/p/:siteId/config/publish',  { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['ADMIN', 'SUPER_ADMIN']), idempotencyGuard] }, publishConfig);
    server.post('/p/:siteId/config/rollback', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['ADMIN', 'SUPER_ADMIN']), idempotencyGuard] }, rollbackConfig);

    // Base site route (MUST BE LAST)
    server.get('/p/:siteId', { preHandler: [tenantAuthHandler, roleGuard(['ADMIN', 'SUPER_ADMIN'])] }, getResolvedConfig);
}

