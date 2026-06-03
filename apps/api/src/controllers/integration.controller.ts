import { FastifyRequest, FastifyReply } from 'fastify';
import { ConnectorRegistry } from '../../../../packages/connector-framework/src/registry';
import { prisma } from '@kpi-platform/db';
import { ResponseUtil } from '../utils/response';
import crypto from 'crypto';
import { ShopifyOrderSyncService } from '../services/shopify-order-sync.service';
import { AdobeCommerceOrderSyncService } from '../services/adobe-commerce-order-sync.service';
import { ShopifyCustomerSyncService } from '../services/shopify-customer-sync.service';
import { ShopifyJourneySyncService } from '../services/shopify-journey-sync.service';
import { AdobeCommerceCustomerSyncService } from '../services/adobe-commerce-customer-sync.service';
import { BigCommerceOrderSyncService } from '../services/bigcommerce-order-sync.service';
import { BigCommerceCustomerSyncService } from '../services/bigcommerce-customer-sync.service';
import { ConnectorResyncService } from '../services/connector-resync.service';

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
                category: true,
                family: true,
                status: true,
                healthStatus: true,
                healthScore: true,
                recordsByType: true,
                lastSyncAt: true,
                lastAttemptAt: true,
                lastWebhookAt: true,
                lastError: true,
                createdAt: true,
                updatedAt: true,
                resyncJobs: {
                    where: {
                        status: {
                            in: ['queued', 'running']
                        }
                    },
                    orderBy: {
                        initiatedAt: 'desc'
                    },
                    take: 1,
                    select: {
                        jobId: true,
                        status: true,
                        syncTargets: true,
                        initiatedAt: true,
                        completedAt: true,
                        error: true
                    }
                }
            }
        });

        const latestResyncJobs = await prisma.connectorResyncJob.findMany({
            where: {
                projectId: siteId,
                connectorInstanceId: {
                    in: integrations.map((integration: any) => integration.id)
                }
            },
            orderBy: {
                initiatedAt: 'desc'
            },
            select: {
                jobId: true,
                connectorInstanceId: true,
                status: true,
                syncTargets: true,
                initiatedAt: true,
                completedAt: true,
                error: true
            }
        });

        const latestResyncJobByConnector = new Map<string, any>();
        for (const job of latestResyncJobs) {
            if (!latestResyncJobByConnector.has(job.connectorInstanceId)) {
                latestResyncJobByConnector.set(job.connectorInstanceId, job);
            }
        }

        const mapped = integrations.map((integration: any) => ({
            ...integration,
            activeResyncJob: integration.resyncJobs?.[0] || null,
            latestResyncJob: latestResyncJobByConnector.get(integration.id) || null,
            lastResyncAt:
                latestResyncJobByConnector.get(integration.id)?.completedAt?.toISOString() ||
                latestResyncJobByConnector.get(integration.id)?.initiatedAt?.toISOString() ||
                integration.lastSyncAt?.toISOString() ||
                null
        }));
        return reply.send(ResponseUtil.success(mapped, { siteId }, req.id as string));
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
        
        const connector = ConnectorRegistry.get(type);
        if (!connector) {
            return reply.code(404).send(ResponseUtil.error([{ code: 'CONNECTOR_NOT_FOUND', message: `Connector type '${type}' is not registered.` }], req.id as string));
        }

        await connector.validateCredentials(config || {}, credentials || {});

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
        let initialSync: any = null;
        if (type === 'shopify') {
            try {
                const orderSync = await ShopifyOrderSyncService.syncConnectorInstance(id);
                const customerSync = await ShopifyCustomerSyncService.syncConnectorInstance(id);
                // Journey/session backfill needs protected-customer-data access; never let it
                // fail the order/customer sync that already succeeded.
                let journeySync: any = null;
                try {
                    journeySync = await ShopifyJourneySyncService.syncConnectorInstance(id);
                } catch (journeyErr: any) {
                    journeySync = { ok: false, message: journeyErr?.message };
                }
                initialSync = { orders: orderSync, customers: customerSync, journey: journeySync };
            } catch (err: any) {
                initialSync = {
                    ok: false,
                    message: err.message
                };
            }
        } else if (type === 'adobe_commerce') {
            try {
                const orderSync = await AdobeCommerceOrderSyncService.syncConnectorInstance(id);
                const customerSync = await AdobeCommerceCustomerSyncService.syncConnectorInstance(id);
                initialSync = { orders: orderSync, customers: customerSync };
            } catch (err: any) {
                initialSync = {
                    ok: false,
                    message: err.message
                };
            }
        } else if (type === 'bigcommerce') {
            try {
                const orderSync = await BigCommerceOrderSyncService.syncConnectorInstance(id);
                const customerSync = await BigCommerceCustomerSyncService.syncConnectorInstance(id);
                initialSync = { orders: orderSync, customers: customerSync };
            } catch (err: any) {
                initialSync = {
                    ok: false,
                    message: err.message
                };
            }
        }

        const refreshedInstance = await prisma.connectorInstance.findUnique({
            where: { id }
        });

        const mappedInstance = {
            ...(refreshedInstance || instance),
            lastSuccessfulSync: refreshedInstance?.lastSyncAt?.toISOString() || instance.lastSyncAt?.toISOString(),
            lastAttemptedSync: refreshedInstance?.lastAttemptAt?.toISOString() || instance.lastAttemptAt?.toISOString(),
            initialSync
        };

        return reply.code(201).send(ResponseUtil.success(mappedInstance, {}, req.id as string));
    }

    /**
     * Triggers a manual synchronization for a specific instance.
     */
    public static async sync(req: FastifyRequest, reply: FastifyReply) {
        const { id, tenantId, siteId } = req.params as any;
        
        const instance = await prisma.connectorInstance.findUnique({
            where: { id }
        });

        if (!instance) {
            return reply.code(404).send(ResponseUtil.error([{ code: 'INSTANCE_NOT_FOUND', message: 'Integration instance not found.' }], req.id as string));
        }

        // SECURITY: Verify the instance belongs to the requested project
        if (instance.tenantId !== tenantId || instance.siteId !== siteId) {
            return reply.code(403).send(ResponseUtil.error(
                [{ code: 'FORBIDDEN', message: 'This connector instance does not belong to the specified project.' }],
                req.id as string
            ));
        }

        try {
            if (instance.providerId === 'shopify') {
                const orderResult = await ShopifyOrderSyncService.syncConnectorInstance(instance.id);
                const customerResult = await ShopifyCustomerSyncService.syncConnectorInstance(instance.id);
                let journeyResult: any = null;
                try {
                    journeyResult = await ShopifyJourneySyncService.syncConnectorInstance(instance.id);
                } catch (journeyErr: any) {
                    journeyResult = { ok: false, message: journeyErr?.message };
                }
                return reply.send(ResponseUtil.success({
                    status: 'SYNC_COMPLETED',
                    orders: orderResult,
                    customers: customerResult,
                    journey: journeyResult
                }, {}, req.id as string));
            } else if (instance.providerId === 'adobe_commerce') {
                const orderResult = await AdobeCommerceOrderSyncService.syncConnectorInstance(instance.id);
                const customerResult = await AdobeCommerceCustomerSyncService.syncConnectorInstance(instance.id);
                return reply.send(ResponseUtil.success({ 
                    status: 'SYNC_COMPLETED', 
                    orders: orderResult, 
                    customers: customerResult 
                }, {}, req.id as string));
            } else if (instance.providerId === 'bigcommerce') {
                const orderResult = await BigCommerceOrderSyncService.syncConnectorInstance(instance.id);
                const customerResult = await BigCommerceCustomerSyncService.syncConnectorInstance(instance.id);
                return reply.send(ResponseUtil.success({ 
                    status: 'SYNC_COMPLETED', 
                    orders: orderResult, 
                    customers: customerResult 
                }, {}, req.id as string));
            }

            return reply.code(400).send(ResponseUtil.error([{ code: 'SYNC_NOT_IMPLEMENTED', message: `Manual sync is not implemented for provider '${instance.providerId}'.` }], req.id as string));
        } catch (err: any) {
            return reply.code(500).send(ResponseUtil.error([{ code: 'SYNC_ERROR', message: err.message }], req.id as string));
        }
    }

    /**
     * Enqueues a manual re-sync for orders and customers.
     */
    public static async resync(req: FastifyRequest, reply: FastifyReply) {
        const { tenantId, siteId, connectorInstanceId: routeConnectorInstanceId } = req.params as any;
        const effectiveTenantId = IntegrationController.resolveTenantId(tenantId, req);
        const { syncTargets } = req.body as any;
        const connectorInstanceId = await IntegrationController.resolveConnectorInstanceId({
            tenantId: effectiveTenantId,
            siteId,
            connectorInstanceId: routeConnectorInstanceId,
            syncTargets
        });

        if (!Array.isArray(syncTargets)) {
            return reply.code(400).send(ResponseUtil.error([
                { code: 'INVALID_SYNC_TARGETS', message: 'syncTargets must be an array.' }
            ], req.id as string));
        }

        if (!connectorInstanceId) {
            return reply.code(404).send(ResponseUtil.error([
                { code: 'CONNECTOR_INSTANCE_NOT_FOUND', message: 'Unable to resolve connector instance for this project.' }
            ], req.id as string));
        }

        try {
            const job = await ConnectorResyncService.enqueueResyncJob({
                tenantId: effectiveTenantId,
                projectId: siteId,
                connectorInstanceId,
                syncTargets
            });

            return reply.code(202).send(ResponseUtil.success({
                jobId: job.jobId,
                connectorInstanceId: job.connectorInstanceId,
                syncTargets: job.syncTargets,
                status: job.status,
                initiatedAt: job.initiatedAt
            }, { tenantId: effectiveTenantId, siteId }, req.id as string));
        } catch (err: any) {
            const statusCode = err?.statusCode || 500;
            return reply.code(statusCode).send(ResponseUtil.error([
                { code: statusCode === 409 ? 'RESYNC_ALREADY_RUNNING' : 'RESYNC_FAILED', message: err.message }
            ], req.id as string));
        }
    }

    /**
     * Returns the current status of a re-sync job.
     */
    public static async resyncStatus(req: FastifyRequest, reply: FastifyReply) {
        const { tenantId, siteId, connectorInstanceId: routeConnectorInstanceId } = req.params as any;
        const effectiveTenantId = IntegrationController.resolveTenantId(tenantId, req);
        const { jobId } = req.query as any;
        const connectorInstanceId = await IntegrationController.resolveConnectorInstanceId({
            tenantId: effectiveTenantId,
            siteId,
            connectorInstanceId: routeConnectorInstanceId
        });

        if (!jobId) {
            return reply.code(400).send(ResponseUtil.error([
                { code: 'JOB_ID_REQUIRED', message: 'jobId query parameter is required.' }
            ], req.id as string));
        }

        if (!connectorInstanceId) {
            return reply.code(404).send(ResponseUtil.error([
                { code: 'CONNECTOR_INSTANCE_NOT_FOUND', message: 'Unable to resolve connector instance for this project.' }
            ], req.id as string));
        }

        try {
            const job = await ConnectorResyncService.getResyncJob({
                tenantId: effectiveTenantId,
                projectId: siteId,
                connectorInstanceId,
                jobId
            });

            if (!job) {
                return reply.code(404).send(ResponseUtil.error([
                    { code: 'RESYNC_JOB_NOT_FOUND', message: 'Re-sync job not found.' }
                ], req.id as string));
            }

            return reply.send(ResponseUtil.success({
                jobId: job.jobId,
                status: job.status,
                syncTargets: job.syncTargets,
                initiatedAt: job.initiatedAt,
                completedAt: job.completedAt,
                error: IntegrationController.extractErrorMessage(job.error)
            }, { tenantId: effectiveTenantId, siteId }, req.id as string));
        } catch (err: any) {
            return reply.code(500).send(ResponseUtil.error([
                { code: 'RESYNC_STATUS_FAILED', message: err.message }
            ], req.id as string));
        }
    }

    private static extractErrorMessage(error: any): string | null {
        if (!error) {
            return null;
        }

        if (typeof error === 'string') {
            return error;
        }

        if (typeof error === 'object' && typeof error.message === 'string') {
            return error.message;
        }

        return JSON.stringify(error);
    }

    private static async resolveConnectorInstanceId(input: {
        tenantId: string;
        siteId: string;
        connectorInstanceId?: string;
        syncTargets?: string[];
    }): Promise<string | null> {
        const explicitId = String(input.connectorInstanceId || '').trim();
        if (explicitId) {
            const existing = await prisma.connectorInstance.findFirst({
                where: {
                    id: explicitId,
                    tenantId: input.tenantId,
                    siteId: input.siteId
                },
                select: { id: true }
            });

            if (existing) {
                return existing.id;
            }
        }

        const connector = await prisma.connectorInstance.findFirst({
            where: {
                tenantId: input.tenantId,
                siteId: input.siteId,
                providerId: { in: ['shopify', 'adobe_commerce', 'bigcommerce'] }
            },
            orderBy: [
                { updatedAt: 'desc' },
                { createdAt: 'desc' }
            ],
            select: { id: true }
        });

        return connector?.id || null;
    }

    private static resolveTenantId(tenantId: string, req: FastifyRequest): string {
        const routeTenantId = String(tenantId || '').trim();
        if (routeTenantId && routeTenantId !== 'current') {
            return routeTenantId;
        }

        const userTenantId = String((req as any)?.user?.tenantId || '').trim();
        return userTenantId || routeTenantId;
    }
}
