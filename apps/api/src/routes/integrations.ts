import { FastifyInstance } from 'fastify';
import { IntegrationController } from '../controllers/integration.controller';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { tenantIsolationGuard } from '../middlewares/tenant-isolation.middleware';

/**
 * Productized Integration Routes
 * Standardized lifecycle for all connectors under a project context.
 */
export const integrationRoutes = async (fastify: FastifyInstance) => {
    
    // Scoped Middleware Context
    fastify.addHook('preHandler', tenantAuthHandler);
    fastify.addHook('preHandler', tenantIsolationGuard);

    // â”€â”€â”€ INTEGRATION MANAGEMENT (SCOPED) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Path Context: /api/v1/tenants/:tenantId/projects/:siteId/integrations
    
    fastify.get('/',        IntegrationController.listConnectors);
    fastify.post('/',       IntegrationController.createInstance);

    // Single connector instance (deep-link / page-refresh lookup).
    // Registered as a static-vs-param sibling to /validate, /discover, /registry —
    // Fastify's radix router prefers those static paths over this :id param.
    fastify.get('/:id',     IntegrationController.getConnector);
    
    // Lifecycle Actions (Discovery & Validation)
    fastify.post('/validate', IntegrationController.validate);
    fastify.post('/discover', IntegrationController.discover);

    // Instance Lifecycle Actions
    fastify.post('/:id/sync', IntegrationController.sync);

    // Initial (post-create) background sync status — polled by the setup modal
    // to show real progress and a completion acknowledgement.
    fastify.get('/:id/initial-sync/status', IntegrationController.initialSyncStatus);

    // Credential rotation / re-authenticate (update an expired store token)
    fastify.patch('/:connectorInstanceId/credentials', IntegrationController.updateCredentials);

    // Manual Re-Sync Actions
    fastify.post('/:connectorInstanceId/resync', IntegrationController.resync);
    fastify.get('/:connectorInstanceId/resync/status', IntegrationController.resyncStatus);

    // Connector Catalog
    fastify.get('/registry', async (req, reply) => {
        const { ConnectorRegistry } = require('../../../../packages/connector-framework/src/registry');
        return reply.send(ConnectorRegistry.list());
    });
};

