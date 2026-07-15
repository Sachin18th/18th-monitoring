import { FastifyRequest, FastifyReply } from 'fastify';
import { ConnectorRegistry } from '../../../../packages/connector-framework/src/registry';
import { prisma, encryptSecret } from '@kpi-platform/db';
import { ResponseUtil } from '../utils/response';
import crypto from 'crypto';
import { ShopifyOrderSyncService } from '../services/shopify-order-sync.service';
import { AdobeCommerceOrderSyncService } from '../services/adobe-commerce-order-sync.service';
import { ShopifyCustomerSyncService } from '../services/shopify-customer-sync.service';
import { AdobeCommerceCustomerSyncService } from '../services/adobe-commerce-customer-sync.service';
import { BigCommerceOrderSyncService } from '../services/bigcommerce-order-sync.service';
import { BigCommerceCustomerSyncService } from '../services/bigcommerce-customer-sync.service';
import { ConnectorResyncService } from '../services/connector-resync.service';
import { registerShopifyPixel } from '../../../../packages/connectors/src/commerce/shopify-pixel.service';
import { StoreHealthService } from '../services/store-health.service';
import { isTenantDataPlaneEnabled } from '../lib/tenant-prisma';
import { provisionStoreDatabase } from '../services/tenant-database-provisioning.service';

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
     * Fetches a single connector instance by id, scoped to the project/tenant.
     * Backs the deep-link / page-refresh path where the selected connector
     * isn't present in the already-loaded list. Returns 404 when not found.
     */
    public static async getConnector(req: FastifyRequest, reply: FastifyReply) {
        const { id, siteId } = req.params as any;
        // The path segment is `tenants/current`, so params.tenantId is the literal
        // "current" — use the tenant resolved by the auth handler instead. siteId
        // is already verified against the user's tenant by tenantIsolationGuard.
        const tenantId = (req as any).tenantId;

        const integration = await prisma.connectorInstance.findFirst({
            where: { id, siteId, ...(tenantId ? { tenantId } : {}) },
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

        if (!integration) {
            return reply.code(404).send(
                ResponseUtil.error('Connector instance not found', 'NOT_FOUND', null, req.id as string)
            );
        }

        const latestResyncJob = await prisma.connectorResyncJob.findFirst({
            where: {
                projectId: siteId,
                connectorInstanceId: integration.id
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

        const mapped = {
            ...integration,
            activeResyncJob: (integration as any).resyncJobs?.[0] || null,
            latestResyncJob: latestResyncJob || null,
            lastResyncAt:
                latestResyncJob?.completedAt?.toISOString() ||
                latestResyncJob?.initiatedAt?.toISOString() ||
                integration.lastSyncAt?.toISOString() ||
                null
        };

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

        // Create ConnectorInstance in database. The initial sync runs in the
        // background (see runInitialSetup), so we stamp an authoritative
        // `metadata.initialSync` marker the UI can poll to show real progress
        // and a completion acknowledgement.
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
                syncConfig: config || {},
                metadata: {
                    initialSync: {
                        status: 'running',
                        startedAt: new Date().toISOString(),
                        completedAt: null,
                        targets: ['orders', 'customers', 'products'],
                        results: {}
                    }
                }
            }
        });

        // Store credentials securely
        await prisma.connectorCredential.create({
            data: {
                id: crypto.randomUUID(),
                connectorInstanceId: id,
                tenantId,
                authType: 'API_KEY',
                // AES-256-GCM encrypted at rest; raw tokens never hit the DB in plaintext.
                encryptedSecret: encryptSecret(credentials || {}),
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

        // The initial order/customer sync (and Shopify pixel registration) make
        // live, paginated calls to the store's API. Running them inline blocks
        // the HTTP response — a slow, large, or unreachable store makes the dev
        // proxy reset the socket (ECONNRESET / "socket hang up") and the UI sees
        // a spurious 500 even though the connector was created. Kick the setup
        // off in the background (like ConnectorResyncService) and respond now.
        // Each sync service records its own health/lastError on the instance, so
        // progress and failures are still surfaced without blocking the request.
        setImmediate(() => {
            void IntegrationController.runInitialSetup({ id, type, siteId, config, credentials })
                .catch((err: any) => {
                    console.error('[Integration] initial background setup failed', { id, error: err?.message || err });
                });
        });

        const mappedInstance = {
            ...instance,
            lastSuccessfulSync: instance.lastSyncAt?.toISOString(),
            lastAttemptedSync: instance.lastAttemptAt?.toISOString(),
            initialSync: { status: 'PENDING', message: 'Initial sync started in the background.' }
        };

        return reply.code(201).send(ResponseUtil.success(mappedInstance, {}, req.id as string));
    }

    /**
     * Mark the instance's initialSync metadata as failed with a reason (merges
     * into existing metadata so other keys, e.g. pixelConfig, are preserved).
     */
    private static async markInitialSyncFailed(id: string, error: string): Promise<void> {
        try {
            const current = await prisma.connectorInstance.findUnique({
                where: { id },
                select: { metadata: true }
            });
            const existingMetadata = (current?.metadata && typeof current.metadata === 'object')
                ? current.metadata as Record<string, any>
                : {};
            await prisma.connectorInstance.update({
                where: { id },
                data: {
                    healthStatus: 'DEGRADED',
                    metadata: {
                        ...existingMetadata,
                        initialSync: {
                            ...(existingMetadata.initialSync ?? {}),
                            status: 'failed',
                            completedAt: new Date().toISOString(),
                            error
                        }
                    } as any
                }
            });
        } catch (err: any) {
            console.error('[Integration] failed to mark initialSync failed', { id, error: err?.message || err });
        }
    }

    /**
     * Runs the post-create initial sync and provider-specific setup in the
     * background. Never throws — all failures are logged and captured on the
     * connector instance's health state by the individual sync services.
     */
    private static async runInitialSetup(input: {
        id: string;
        type: string;
        siteId: string;
        config: any;
        credentials: any;
    }): Promise<void> {
        const { id, type, siteId, config, credentials } = input;

        console.log('[Integration] runInitialSetup:start', { connectorInstanceId: id, type, siteId });

        // ─── Store database provisioning (database-per-integration) ─────────
        // Every integration gets its OWN physical database; all data the syncs
        // below pull for this store lands there. Provisioning is idempotent
        // (re-runs repair a failed/stale row). When the data plane is enabled,
        // sync writes fail closed without an active store DB — so on a
        // provisioning failure we mark the initial sync failed and stop instead
        // of letting every entity sync fail one by one.
        try {
            const provision = await provisionStoreDatabase(id, { triggeredBy: 'integration-create' });
            if (provision.status !== 'active') {
                throw new Error(provision.error || `store DB status: ${provision.status}`);
            }
            console.log('[Integration] store database ready', { connectorInstanceId: id, dbName: provision.dbName });
        } catch (provErr: any) {
            console.error('[Integration] store database provisioning failed', { id, error: provErr?.message || provErr });
            if (isTenantDataPlaneEnabled()) {
                await IntegrationController.markInitialSyncFailed(id, `Store database provisioning failed: ${provErr?.message || provErr}`);
                return;
            }
            // Data plane disabled: syncs still write to the master DB, so
            // continue — the failed row stays visible for repair.
        }

        // ─── Initial order + customer sync ───────────────────────────────────
        // Orders and customers are synced INDEPENDENTLY. They authenticate against
        // different provider ACLs (e.g. Adobe Commerce needs Magento_Sales::sales
        // for orders and Magento_Customer::manage for customers, granted
        // separately), so a failure in one must not skip the other. Each sync
        // service records its own DEGRADED/lastError state on the instance.
        const orderSync =
            type === 'shopify' ? () => ShopifyOrderSyncService.syncConnectorInstance(id)
            : type === 'adobe_commerce' ? () => AdobeCommerceOrderSyncService.syncConnectorInstance(id)
            : type === 'bigcommerce' ? () => BigCommerceOrderSyncService.syncConnectorInstance(id)
            : null;
        const customerSync =
            type === 'shopify' ? () => ShopifyCustomerSyncService.syncConnectorInstance(id)
            : type === 'adobe_commerce' ? () => AdobeCommerceCustomerSyncService.syncConnectorInstance(id)
            : type === 'bigcommerce' ? () => BigCommerceCustomerSyncService.syncConnectorInstance(id)
            : null;
        // Products (and their derived categories) sync independently too, via the resync
        // service's provider-agnostic product entry point (Shopify uses its dedicated,
        // checkpointed service; Adobe/BigCommerce use the inline canonical upsert).
        const productSync =
            ['shopify', 'adobe_commerce', 'bigcommerce'].includes(type)
                ? () => ConnectorResyncService.syncProductsForInstance(id)
                : null;

        const startedAt = new Date().toISOString();
        const results: Record<string, any> = {};
        const failedTargets: string[] = [];

        // Persist the running initialSync marker so the UI can show real,
        // incremental progress (orders finish → 50%, customers finish → 100%)
        // rather than a single jump at the end. Merges into existing metadata so
        // other keys (e.g. pixelConfig lives separately) are never clobbered.
        const persistInitialSync = async (status: 'running' | 'completed' | 'failed') => {
            try {
                const current = await prisma.connectorInstance.findUnique({
                    where: { id },
                    select: { metadata: true }
                });
                const existingMetadata = (current?.metadata && typeof current.metadata === 'object')
                    ? current.metadata as Record<string, any>
                    : {};
                const existingInitialSync = (existingMetadata.initialSync && typeof existingMetadata.initialSync === 'object')
                    ? existingMetadata.initialSync as Record<string, any>
                    : {};

                await prisma.connectorInstance.update({
                    where: { id },
                    data: {
                        metadata: {
                            ...existingMetadata,
                            initialSync: {
                                ...existingInitialSync,
                                status,
                                startedAt: existingInitialSync.startedAt || startedAt,
                                completedAt: status === 'running' ? null : new Date().toISOString(),
                                targets: ['orders', 'customers', 'products'],
                                failedTargets: [...failedTargets],
                                results: { ...results }
                            }
                        } as any
                    }
                });
            } catch (metaErr: any) {
                console.error('[Integration] failed to persist initialSync metadata', { id, status, error: metaErr?.message || metaErr });
            }
        };

        if (orderSync) {
            try {
                const result = await orderSync();
                results.orders = {
                    status: (result?.failed ?? 0) > 0 ? 'partial' : 'completed',
                    fetched: result?.fetched ?? 0,
                    upserted: (result?.created ?? 0) + (result?.updated ?? 0),
                    failed: result?.failed ?? 0
                };
                console.log('[Integration] initial order sync done', { id, siteId, ...result });
            } catch (err: any) {
                results.orders = { status: 'failed', error: err?.message || String(err) };
                failedTargets.push('orders');
                console.error('[Integration] initial order sync failed', { id, siteId, error: err?.message || err });
            }
            // Checkpoint after orders so the UI advances to ~50% mid-run.
            await persistInitialSync('running');
        }

        if (customerSync) {
            try {
                const result = await customerSync();
                results.customers = {
                    status: (result?.failed ?? 0) > 0 ? 'partial' : 'completed',
                    fetched: result?.fetched ?? 0,
                    upserted: (result?.created ?? 0) + (result?.updated ?? 0),
                    failed: result?.failed ?? 0
                };
                console.log('[Integration] initial customer sync done', { id, siteId, ...result });
            } catch (err: any) {
                results.customers = { status: 'failed', error: err?.message || String(err) };
                failedTargets.push('customers');
                console.error('[Integration] initial customer sync failed', { id, siteId, error: err?.message || err });
            }
            // Checkpoint after customers so the UI advances before products run.
            await persistInitialSync('running');
        }

        if (productSync) {
            try {
                const result = await productSync();
                results.products = {
                    status: (result?.failed ?? 0) > 0 ? 'partial' : 'completed',
                    fetched: result?.fetched ?? 0,
                    upserted: (result?.created ?? 0) + (result?.updated ?? 0),
                    failed: result?.failed ?? 0
                };
                console.log('[Integration] initial product sync done', { id, siteId, ...result });
            } catch (err: any) {
                results.products = { status: 'failed', error: err?.message || String(err) };
                failedTargets.push('products');
                console.error('[Integration] initial product sync failed', { id, siteId, error: err?.message || err });
            }
        }

        // Stamp the terminal marker the UI polls for completion.
        await persistInitialSync(failedTargets.length > 0 ? 'failed' : 'completed');

        // ─── Shopify Web Pixel registration ──────────────────────────────────
        // Best-effort: register a Web Pixel on the connected store so checkout
        // events flow into POST /api/track. A failure here must NEVER fail the
        // overall connector activation, so everything is wrapped in try/catch.
        if (type === 'shopify') {
            try {
                // Mirror the sync-service credential resolution, but using the raw
                // request values already in scope (config/credentials).
                const rawDomain = String((config || {}).shopDomain || '').trim();
                const shopDomain = rawDomain
                    .replace(/^https?:\/\//i, '')
                    .split('/')[0]
                    .replace(/\/+$/, '')
                    .trim();
                const creds = (credentials || {}) as Record<string, any>;
                const accessToken = String(
                    creds.adminApiAccessToken ||
                    creds.accessToken ||
                    creds.access_token ||
                    creds.token ||
                    creds.apiKey ||
                    creds.password ||
                    ''
                ).trim();

                const base = process.env.PUBLIC_BASE_URL || process.env.TRACKER_PUBLIC_BASE_URL;

                if (!base) {
                    console.warn('[ShopifyPixel] PUBLIC_BASE_URL/TRACKER_PUBLIC_BASE_URL not set — skipping pixel registration.');
                } else if (!shopDomain || !accessToken) {
                    console.warn('[ShopifyPixel] Missing shopDomain or accessToken — skipping pixel registration.');
                } else {
                    const ingestUrl = `${base.replace(/\/+$/, '')}/api/track`;
                    const result = await registerShopifyPixel(shopDomain, accessToken, siteId, id, ingestUrl);

                    if (result.success) {
                        await prisma.connectorInstance.update({
                            where: { id },
                            data: {
                                pixelConfig: {
                                    pixel_id: result.pixelId,
                                    status: 'active',
                                    flow: 'programmatic',
                                    registered_at: new Date().toISOString(),
                                    error: null
                                }
                            }
                        });
                    } else {
                        await prisma.connectorInstance.update({
                            where: { id },
                            data: {
                                pixelConfig: {
                                    pixel_id: null,
                                    status: 'failed',
                                    flow: 'programmatic',
                                    registered_at: null,
                                    error: result.error
                                }
                            }
                        });
                    }
                }
            } catch (pixelErr: any) {
                // Swallow — pixel registration must not break activation.
                console.error('[ShopifyPixel] registration step errored (non-fatal):', pixelErr?.message || pixelErr);
            }
        }
    }

    /**
     * Rotates the stored credentials for an existing connector (e.g. after the
     * store's access token expires/is revoked). Validates the new token against
     * the live provider before persisting, then clears the failed-auth state.
     *
     * PATCH /integrations/:connectorInstanceId/credentials
     * Body: { credentials: {...}, config?: {...} }
     */
    public static async updateCredentials(req: FastifyRequest, reply: FastifyReply) {
        const { tenantId, siteId, connectorInstanceId } = req.params as any;
        const { config, credentials } = (req.body as any) || {};

        if (!credentials || typeof credentials !== 'object') {
            return reply.code(400).send(ResponseUtil.error('credentials are required', 'MISSING_CREDENTIALS', null, req.id as string));
        }

        const instance = await prisma.connectorInstance.findFirst({
            where: { id: connectorInstanceId, siteId, tenantId }
        });
        if (!instance) {
            return reply.code(404).send(ResponseUtil.error('Connector not found', 'CONNECTOR_NOT_FOUND', null, req.id as string));
        }

        const connector = ConnectorRegistry.get(instance.providerId);
        if (!connector) {
            return reply.code(404).send(ResponseUtil.error(`Connector type '${instance.providerId}' is not registered.`, 'CONNECTOR_NOT_FOUND', null, req.id as string));
        }

        // Merge incoming config over the stored syncConfig, so a domain/store can
        // be corrected alongside the token (or omitted to keep current config).
        const mergedConfig = { ...((instance.syncConfig as any) || {}), ...(config || {}) };

        // Validate the new token against the live provider BEFORE persisting —
        // same gate the create flow uses. Reject if it doesn't authenticate.
        try {
            const result: any = await connector.validateCredentials(mergedConfig, credentials);
            if (result && result.success === false) {
                return reply.code(400).send(ResponseUtil.error(
                    result.message || 'Credential validation failed',
                    'CREDENTIAL_VALIDATION_FAILED',
                    { reAuthRequired: result.reAuthRequired, missingScopes: result.missingScopes },
                    req.id as string
                ));
            }
        } catch (err: any) {
            return reply.code(400).send(ResponseUtil.error(err?.message || 'Credential validation failed', 'CREDENTIAL_VALIDATION_FAILED', null, req.id as string));
        }

        // Rotate the active credential (or create one if somehow missing).
        const existing = await prisma.connectorCredential.findFirst({
            where: { connectorInstanceId },
            orderBy: { createdAt: 'desc' }
        });
        const encryptedSecret = encryptSecret(credentials);
        if (existing) {
            await prisma.connectorCredential.update({
                where: { id: existing.id },
                data: { encryptedSecret, lastRotatedAt: new Date(), isActive: true }
            });
        } else {
            await prisma.connectorCredential.create({
                data: {
                    id: crypto.randomUUID(),
                    connectorInstanceId,
                    tenantId,
                    authType: 'API_KEY',
                    encryptedSecret,
                    lastRotatedAt: new Date(),
                    vaultKey: `vault/${tenantId}/${connectorInstanceId}/secret`
                }
            });
        }

        // Token just validated — clear the failed-auth state.
        const updated = await prisma.connectorInstance.update({
            where: { id: connectorInstanceId },
            data: {
                ...(config ? { syncConfig: mergedConfig } : {}),
                status: 'ACTIVE',
                healthStatus: 'HEALTHY',
                healthScore: 100
            }
        });

        await prisma.connectorLifecycleEvent.create({
            data: {
                id: crypto.randomUUID(),
                tenantId,
                projectId: siteId,
                connectorInstanceId,
                eventType: 'CREDENTIALS_ROTATED',
                severity: 'INFO',
                payload: { providerId: instance.providerId, configUpdated: Boolean(config) },
                triggeredBy: 'USER'
            }
        });

        // Refresh the health-check table so observability/backend + system-health
        // reflect the recovery immediately. Fire-and-forget — must not block the
        // response or fail the rotation.
        StoreHealthService.checkProject(String(siteId)).catch((err) => {
            console.warn('[Integration] post-reauth health probe failed', err?.message || err);
        });

        return reply.send(ResponseUtil.success(updated, {}, req.id as string));
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
                return reply.send(ResponseUtil.success({
                    status: 'SYNC_COMPLETED',
                    orders: orderResult,
                    customers: customerResult
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

    /**
     * Returns the status of a connector's initial (post-create) background sync.
     * The authoritative marker lives in `metadata.initialSync` (stamped by
     * runInitialSetup). For connectors created before that marker existed we
     * fall back to deriving state from their connector_sync_runs rows.
     */
    public static async initialSyncStatus(req: FastifyRequest, reply: FastifyReply) {
        const { tenantId, siteId, id: routeConnectorInstanceId } = req.params as any;
        const effectiveTenantId = IntegrationController.resolveTenantId(tenantId, req);

        const instance = await prisma.connectorInstance.findFirst({
            where: { id: routeConnectorInstanceId, tenantId: effectiveTenantId, siteId },
            select: {
                id: true,
                metadata: true,
                recordsByType: true,
                lastSyncAt: true,
                healthStatus: true
            }
        });

        if (!instance) {
            return reply.code(404).send(ResponseUtil.error([
                { code: 'CONNECTOR_INSTANCE_NOT_FOUND', message: 'Unable to resolve connector instance for this project.' }
            ], req.id as string));
        }

        const metadata = (instance.metadata && typeof instance.metadata === 'object')
            ? instance.metadata as Record<string, any>
            : {};
        let initialSync = (metadata.initialSync && typeof metadata.initialSync === 'object')
            ? metadata.initialSync as Record<string, any>
            : null;

        // Fallback for connectors created before the metadata marker existed.
        if (!initialSync) {
            const runs = await prisma.connectorSyncRun.findMany({
                where: { connectorInstanceId: instance.id },
                orderBy: { startedAt: 'desc' },
                take: 10
            });
            const anyRunning = runs.some((r) => String(r.status).toUpperCase() === 'RUNNING');
            initialSync = {
                status: anyRunning ? 'running' : (runs.length > 0 ? 'completed' : 'not_started'),
                startedAt: runs[runs.length - 1]?.startedAt ?? null,
                completedAt: anyRunning ? null : (runs[0]?.finishedAt ?? null),
                targets: ['orders', 'customers', 'products'],
                results: {}
            };
        }

        return reply.send(ResponseUtil.success({
            connectorInstanceId: instance.id,
            status: initialSync.status,
            startedAt: initialSync.startedAt ?? null,
            completedAt: initialSync.completedAt ?? null,
            targets: initialSync.targets ?? ['orders', 'customers', 'products'],
            failedTargets: initialSync.failedTargets ?? [],
            results: initialSync.results ?? {},
            recordsByType: instance.recordsByType ?? {},
            lastSyncAt: instance.lastSyncAt,
            healthStatus: instance.healthStatus
        }, { tenantId: effectiveTenantId, siteId }, req.id as string));
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