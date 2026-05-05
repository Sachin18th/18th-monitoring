<<<<<<< HEAD
﻿import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
=======
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
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
<<<<<<< HEAD
    server.get('/p/:siteId/integrations/instances', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['TENANT_ADMIN', 'PROJECT_ADMIN', 'SUPER_ADMIN'])] }, getProjectIntegrationInstances);
=======
    server.get('/p/:siteId/integrations/instances', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['ADMIN', 'SUPER_ADMIN'])] }, getProjectIntegrationInstances);
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    server.post('/p/:siteId/integrations/instances', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['SUPER_ADMIN'])] }, createIntegrationInstance);
    server.patch('/p/:siteId/integrations/instances/:instanceId', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['SUPER_ADMIN'])] }, updateIntegrationInstance);
    server.delete('/p/:siteId/integrations/instances/:instanceId', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['SUPER_ADMIN'])] }, deleteIntegrationInstance);
    server.post('/p/:siteId/integrations/instances/:instanceId/test', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['SUPER_ADMIN'])] }, testIntegrationConnection);

    // Access Control
<<<<<<< HEAD
    server.get('/p/:siteId/access-control/keys', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['TENANT_ADMIN', 'PROJECT_ADMIN', 'SUPER_ADMIN'])] }, listAccessKeys);
    server.post('/p/:siteId/access-control/keys', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['SUPER_ADMIN'])] }, createAccessKey);
    server.post('/p/:siteId/access-control/keys/:keyId/rotate', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['SUPER_ADMIN'])] }, rotateAccessKey);
    server.delete('/p/:siteId/access-control/keys/:keyId', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['SUPER_ADMIN'])] }, revokeAccessKey);
    server.get('/p/:siteId/access-control/audit', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['TENANT_ADMIN', 'PROJECT_ADMIN', 'SUPER_ADMIN'])] }, getAuditLogs);

    // Legacy/Base Config
    server.get('/p/:siteId/config/resolved',{ preHandler: [tenantAuthHandler, tenantIsolationGuard] }, getResolvedConfig);
    server.post('/p/:siteId/config/publish',  { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['TENANT_ADMIN', 'PROJECT_ADMIN', 'SUPER_ADMIN']), idempotencyGuard] }, publishConfig);
    server.post('/p/:siteId/config/rollback', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['TENANT_ADMIN', 'PROJECT_ADMIN', 'SUPER_ADMIN']), idempotencyGuard] }, rollbackConfig);

    // Base site route (MUST BE LAST)
    server.get('/p/:siteId', { preHandler: [tenantAuthHandler, roleGuard(['TENANT_ADMIN', 'PROJECT_ADMIN', 'SUPER_ADMIN'])] }, getResolvedConfig);
}


=======
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

>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
