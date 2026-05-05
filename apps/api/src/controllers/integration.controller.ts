// import { FastifyRequest, FastifyReply } from 'fastify';
// import { ConnectorRegistry } from '../../../../packages/connector-framework/src/registry';
// import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
// import { ResponseUtil } from '../utils/response';
// import crypto from 'crypto';

// export class IntegrationController {

//     /**
//      * Lists all connectors established for a project.
//      */
//     public static async listConnectors(req: FastifyRequest, reply: FastifyReply) {
//         const { siteId } = req.params as any;
//         const integrations = GlobalMemoryStore.projectIntegrations.get(siteId) || [];
//         return reply.send(ResponseUtil.success(integrations, { siteId }, req.id as string));
//     }

//     /**
//      * Validate credentials for a connector type before persistence.
//      */
//     public static async validate(req: FastifyRequest, reply: FastifyReply) {
//         const { type, config, credentials } = req.body as any;
        
//         const connector = ConnectorRegistry.get(type);
//         if (!connector) {
//             return reply.code(404).send(ResponseUtil.error([{ 
//                 code: 'CONNECTOR_NOT_FOUND', 
//                 message: `Connector type '${type}' is not registered in the system.` 
//             }], req.id as string));
//         }

//         try {
//             const result = await connector.validateCredentials(config, credentials);
//             return reply.send(ResponseUtil.success(result, { type }, req.id as string));
//         } catch (err: any) {
//             return reply.code(500).send(ResponseUtil.error([{ 
//                 code: 'VALIDATION_FAILED', 
//                 message: err.message 
//             }], req.id as string));
//         }
//     }

//     /**
//      * Discover entities/assets from the source.
//      */
//     public static async discover(req: FastifyRequest, reply: FastifyReply) {
//         const { type, config, credentials } = req.body as any;
        
//         const connector = ConnectorRegistry.get(type);
//         if (!connector) {
//             return reply.code(404).send(ResponseUtil.error([{ code: 'CONNECTOR_NOT_FOUND', message: 'Connector not found' }], req.id as string));
//         }

//         const result = await connector.discoverEntities(config, credentials);
//         return reply.send(ResponseUtil.success(result, { type }, req.id as string));
//     }

//     /**
//      * Establish a new integration instance.
//      */
//     public static async createInstance(req: FastifyRequest, reply: FastifyReply) {
//         const { tenantId, siteId } = req.params as any;
//         const { type, label, family, config, credentials } = req.body as any;

//         const id = crypto.randomUUID();
//         const instance = {
//             id,
//             tenantId,
//             siteId,
//             connectorId: type,
//             providerId: type,
//             label,
//             category: family, // Map family to category for legacy support
//             family,
//             status: 'ACTIVE',
//             healthStatus: 'HEALTHY',
//             healthScore: 100,
//             configVersion: '1.0.0',
//             syncConfig: config || {},
//             createdAt: new Date().toISOString(),
//             updatedAt: new Date().toISOString()
//         };

//         // Persist Instance
//         if (!GlobalMemoryStore.projectIntegrations.has(siteId)) {
//             GlobalMemoryStore.projectIntegrations.set(siteId, []);
//         }
//         GlobalMemoryStore.projectIntegrations.get(siteId)?.push(instance);

//         // Persist Credentials (Mocked separation)
//         GlobalMemoryStore.connectorCredentials.set(id, [{
//             id: crypto.randomUUID(),
//             connectorInstanceId: id,
//             tenantId,
//             authType: 'API_KEY', // Default for now
//             vaultKey: `vault/${tenantId}/${id}/secret`,
//             createdAt: instance.createdAt
//         }]);

//         // Log Lifecycle Event
//         GlobalMemoryStore.connectorLifecycleEvents.push({
//             id: crypto.randomUUID(),
//             tenantId,
//             projectId: siteId,
//             integrationId: id,
//             eventType: 'CONNECTOR_CREATED',
//             severity: 'INFO',
//             payload: { type, label },
//             triggeredBy: 'USER',
//             createdAt: instance.createdAt
//         });

//         return reply.code(201).send(ResponseUtil.success(instance, {}, req.id as string));
//     }

//     /**
//      * Triggers a manual synchronization for a specific instance.
//      */
//     public static async sync(req: FastifyRequest, reply: FastifyReply) {
//         const { id } = req.params as any;
//         const integrations = Array.from(GlobalMemoryStore.projectIntegrations.values()).flat();
//         const instance = integrations.find(i => i.id === id);

//         if (!instance) {
//             return reply.code(404).send(ResponseUtil.error([{ code: 'INSTANCE_NOT_FOUND', message: 'Integration instance not found.' }], req.id as string));
//         }

//         const { SyncOrchestrator } = require('../services/sync-orchestrator.service');
//         try {
//             await SyncOrchestrator.syncInstance(instance);
//             return reply.send(ResponseUtil.success({ status: 'SYNC_COMPLETED' }, {}, req.id as string));
//         } catch (err: any) {
//             return reply.code(500).send(ResponseUtil.error([{ code: 'SYNC_ERROR', message: err.message }], req.id as string));
//         }
//     }
// }

import { FastifyRequest, FastifyReply } from 'fastify';
import { ConnectorRegistry } from '../../../../packages/connector-framework/src/registry';
import { prisma } from '@kpi-platform/db';
import { ResponseUtil } from '../utils/response';
import crypto from 'crypto';

export class IntegrationController {

    /**
     * Lists all connectors established for a project.
     */
    public static async listConnectors(req: FastifyRequest, reply: FastifyReply) {
        const { siteId } = req.params as any;
        const integrations = await prisma.connectorInstance.findMany({
            where: { siteId },
            select: {
                id: true,
                label: true,
                providerId: true,
                status: true,
                healthStatus: true,
                healthScore: true,
                createdAt: true,
                updatedAt: true
            }
        });
        return reply.send(ResponseUtil.success(integrations, { siteId }, req.id as string));
    }

    /**
     * Validate credentials for a connector type before persistence.
     */
    public static async validate(req: FastifyRequest, reply: FastifyReply) {
        const { type, config, credentials } = req.body as any;
        
        const connector = ConnectorRegistry.get(type);
        if (!connector) {
            return reply.code(404).send(ResponseUtil.error([{ 
                code: 'CONNECTOR_NOT_FOUND', 
                message: `Connector type '${type}' is not registered in the system.` 
            }], req.id as string));
        }

        try {
            const result = await connector.validateCredentials(config, credentials);
            return reply.send(ResponseUtil.success(result, { type }, req.id as string));
        } catch (err: any) {
            return reply.code(500).send(ResponseUtil.error([{ 
                code: 'VALIDATION_FAILED', 
                message: err.message 
            }], req.id as string));
        }
    }

    /**
     * Discover entities/assets from the source.
     */
    public static async discover(req: FastifyRequest, reply: FastifyReply) {
        const { type, config, credentials } = req.body as any;
        
        const connector = ConnectorRegistry.get(type);
        if (!connector) {
            return reply.code(404).send(ResponseUtil.error([{ code: 'CONNECTOR_NOT_FOUND', message: 'Connector not found' }], req.id as string));
        }

        const result = await connector.discoverEntities(config, credentials);
        return reply.send(ResponseUtil.success(result, { type }, req.id as string));
    }

    /**
     * Establish a new integration instance.
     */
    public static async createInstance(req: FastifyRequest, reply: FastifyReply) {
        const { tenantId, siteId } = req.params as any;
        const { type, label, family, config, credentials } = req.body as any;

        const id = crypto.randomUUID();
        
        // Create ConnectorInstance in database
        const instance = await prisma.connectorInstance.create({
            data: {
                id,
                tenantId,
                siteId,
                providerId: type,
                label,
                category: family,
                family,
                status: 'ACTIVE',
                healthStatus: 'HEALTHY',
                healthScore: 100,
                syncConfig: config || {}
            }
        });

        // Store credentials securely
        await prisma.connectorCredential.create({
            data: {
                id: crypto.randomUUID(),
                connectorInstanceId: id,
                tenantId,
                authType: 'API_KEY',
                encryptedSecret: JSON.stringify(credentials || {}), // In production, use actual encryption
                vaultKey: `vault/${tenantId}/${id}/secret`
            }
        });

        // Log lifecycle event
        await prisma.connectorLifecycleEvent.create({
            data: {
                id: crypto.randomUUID(),
                tenantId,
                projectId: siteId,
                connectorInstanceId: id,
                eventType: 'CONNECTOR_CREATED',
                severity: 'INFO',
                payload: { type, label },
                triggeredBy: 'USER'
            }
        });

        // Map Prisma fields to dashboard-expected field names
        const mappedInstance = {
            ...instance,
            lastSuccessfulSync: instance.lastSyncAt?.toISOString(),
            lastAttemptedSync: instance.lastAttemptAt?.toISOString()
        };

        return reply.code(201).send(ResponseUtil.success(mappedInstance, {}, req.id as string));
    }

    /**
     * Triggers a manual synchronization for a specific instance.
     */
    public static async sync(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as any;
        
        const instance = await prisma.connectorInstance.findUnique({
            where: { id }
        });

        if (!instance) {
            return reply.code(404).send(ResponseUtil.error([{ code: 'INSTANCE_NOT_FOUND', message: 'Integration instance not found.' }], req.id as string));
        }

        const { SyncOrchestrator } = require('../services/sync-orchestrator.service');
        try {
            await SyncOrchestrator.syncInstance(instance);
            return reply.send(ResponseUtil.success({ status: 'SYNC_COMPLETED' }, {}, req.id as string));
        } catch (err: any) {
            return reply.code(500).send(ResponseUtil.error([{ code: 'SYNC_ERROR', message: err.message }], req.id as string));
        }
    }
}