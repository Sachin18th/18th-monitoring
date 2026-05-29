import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@kpi-platform/db';
import { orderNormalizationService } from './order-normalization.service';

type ConnectorRecord = {
    id: string;
    tenantId: string;
    siteId: string;
    providerId: string;
    label: string;
    syncConfig: any;
};

type SyncSummary = {
    runId: string;
    fetched: number;
    created: number;
    updated: number;
    failed: number;
};

export class ShopifyOrderSyncService {
    private static extractCustomerEmail(rawOrder: any): string | null {
        const candidates = [
            rawOrder?.email,
            rawOrder?.contact_email,
            rawOrder?.customer?.email,
            rawOrder?.billing_address?.email,
            rawOrder?.shipping_address?.email
        ];

        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim().length > 0) {
                return candidate.trim().toLowerCase();
            }
        }

        return null;
    }

    static async syncConnectorInstance(connectorInstanceId: string): Promise<SyncSummary> {
        const instance = await prisma.connectorInstance.findUnique({
            where: { id: connectorInstanceId },
            select: {
                id: true,
                tenantId: true,
                siteId: true,
                providerId: true,
                label: true,
                syncConfig: true,
                credentials: {
                    orderBy: {
                        lastRotatedAt: 'desc'
                    },
                    take: 1,
                    select: {
                        encryptedSecret: true
                    }
                }
            }
        });

        if (!instance) {
            throw new Error('Integration instance not found.');
        }

        if (instance.providerId !== 'shopify') {
            throw new Error(`Provider "${instance.providerId}" is not supported by ShopifyOrderSyncService.`);
        }

        const credentials = this.parseCredentials(instance.credentials?.[0]?.encryptedSecret);
        const config = (instance.syncConfig || {}) as Record<string, any>;
        const shopDomain = this.normalizeShopDomain(config.shopDomain);
        const adminApiAccessToken = String(credentials.adminApiAccessToken || '').trim();
        const apiVersion = String(config.apiVersion || '2024-01').trim();

        if (!shopDomain) {
            throw new Error('Shopify integration is missing shopDomain in syncConfig.');
        }

        if (!adminApiAccessToken) {
            throw new Error('Shopify integration is missing adminApiAccessToken credentials.');
        }

        const runId = crypto.randomUUID();
        const startedAt = new Date();

        await prisma.connectorSyncRun.create({
            data: {
                id: runId,
                connectorInstanceId,
                syncType: 'MANUAL_RESYNC',
                status: 'RUNNING',
                startedAt,
                recordsFetched: 0,
                recordsProcessed: 0,
                recordsFailed: 0
            }
        });

        await prisma.connectorInstance.update({
            where: { id: connectorInstanceId },
            data: {
                lastAttemptAt: startedAt,
                status: 'ACTIVE',
                lifecycleState: 'ACTIVE'
            }
        });

        try {
            const orders = await this.fetchOrders({
                shopDomain,
                adminApiAccessToken,
                apiVersion
            });

            let created = 0;
            let updated = 0;
            let failed = 0;

            for (const order of orders) {
                try {
                    const result = await this.upsertCanonicalOrder(instance, order);
                    if (result === 'created') {
                        created += 1;
                    } else {
                        updated += 1;
                    }
                } catch (err) {
                    failed += 1;
                    console.error('[ShopifyOrderSyncService] Failed to persist order', {
                        connectorInstanceId,
                        orderId: order?.id,
                        error: err
                    });
                }
            }

            const finishedAt = new Date();
            await prisma.connectorSyncRun.update({
                where: { id: runId },
                data: {
                    status: failed > 0 ? 'PARTIAL' : 'SUCCESS',
                    finishedAt,
                    recordsFetched: orders.length,
                    recordsProcessed: created + updated,
                    recordsFailed: failed,
                    checkpointValue: orders[0]?.updated_at || orders[0]?.created_at || null
                }
            });

            await prisma.connectorInstance.update({
                where: { id: connectorInstanceId },
                data: {
                    lastSyncAt: finishedAt,
                    lastAttemptAt: startedAt,
                    healthStatus: failed > 0 ? 'DEGRADED' : 'HEALTHY',
                    lifecycleState: failed > 0 ? 'DEGRADED' : 'ACTIVE',
                    healthScore: failed > 0 ? 75 : 100,
                    lastError: failed > 0
                        ? ({
                            message: `${failed} order(s) failed during sync.`,
                            at: finishedAt.toISOString()
                        } as Prisma.InputJsonValue)
                        : Prisma.JsonNull
                }
            });

            await this.logLifecycleEvent(instance, failed > 0 ? 'CONNECTOR_SYNC_PARTIAL' : 'CONNECTOR_SYNCED', failed > 0 ? 'WARN' : 'INFO', {
                runId,
                fetched: orders.length,
                created,
                updated,
                failed
            });

            return {
                runId,
                fetched: orders.length,
                created,
                updated,
                failed
            };
        } catch (err: any) {
            const finishedAt = new Date();
            const errorPayload = {
                message: err?.message || 'Unknown sync failure',
                at: finishedAt.toISOString()
            };

            await prisma.connectorSyncRun.update({
                where: { id: runId },
                data: {
                    status: 'FAILED',
                    finishedAt,
                    errorSummary: errorPayload as Prisma.InputJsonValue
                }
            });

            await prisma.connectorInstance.update({
                where: { id: connectorInstanceId },
                data: {
                    lastAttemptAt: startedAt,
                    healthStatus: 'DEGRADED',
                    lifecycleState: 'DEGRADED',
                    healthScore: 45,
                    lastError: errorPayload as Prisma.InputJsonValue
                }
            });

            await this.logLifecycleEvent(instance, 'CONNECTOR_SYNC_FAILED', 'ERROR', {
                runId,
                ...errorPayload
            });

            throw err;
        }
    }

    private static async fetchOrders(input: {
        shopDomain: string;
        adminApiAccessToken: string;
        apiVersion: string;
    }): Promise<any[]> {
        const normalizedShopDomain = this.normalizeShopDomain(input.shopDomain);
        const baseUrl = `https://${normalizedShopDomain}/admin/api/${input.apiVersion}`;
        const maskedToken = input.adminApiAccessToken
            ? `${input.adminApiAccessToken.slice(0, 4)}...${input.adminApiAccessToken.slice(-4)}`
            : 'missing';

        console.log('[ShopifyOrderSyncService] fetchOrders:start', {
            shopDomain: input.shopDomain,
            normalizedShopDomain,
            apiVersion: input.apiVersion,
            hasToken: Boolean(input.adminApiAccessToken),
            maskedToken
        });

        // console.log(`[ShopifyOrderSyncService] Fetching orders from ${baseUrl} for shop ${input.shopDomain}`);
        const url = new URL(`${baseUrl}/orders.json`);
        url.searchParams.set('status', 'any');
        url.searchParams.set('limit', '100');
        url.searchParams.set('order', 'updated_at desc');

        console.log('[ShopifyOrderSyncService] fetchOrders:request', {
            method: 'GET',
            url: url.toString()
        });

        const fetchFunc: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;

        const response = await fetchFunc(url.toString(), {
            method: 'GET',
            headers: {
                'X-Shopify-Access-Token': input.adminApiAccessToken,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        console.log('[ShopifyOrderSyncService] fetchOrders:response', {
            status: response.status,
            statusText: response.statusText,
            contentType: response.headers.get('content-type'),
            requestId: response.headers.get('x-request-id')
        });

        if (!response.ok) {
            const body = await response.text();
            console.error('[ShopifyOrderSyncService] fetchOrders:error-response', {
                status: response.status,
                statusText: response.statusText,
                body
            });
            throw new Error(`Shopify API request failed (${response.status}): ${body || response.statusText}`);
        }

        const payload = await response.json();
        const orders = Array.isArray(payload?.orders) ? payload.orders : [];

        console.log('[ShopifyOrderSyncService] fetchOrders:payload', {
            payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
            orderCount: orders.length,
            firstOrderId: orders[0]?.id || null,
            firstOrderName: orders[0]?.name || null
        });

        if (!Array.isArray(payload?.orders)) {
            console.warn('[ShopifyOrderSyncService] fetchOrders:unexpected-payload-shape', payload);
        }

        return orders;
    }

    private static normalizeShopDomain(value: unknown): string {
        const raw = String(value || '').trim();
        if (!raw) {
            return '';
        }

        const withoutProtocol = raw.replace(/^https?:\/\//i, '');
        const withoutPath = withoutProtocol.split('/')[0];
        return withoutPath.replace(/\/+$/, '').trim();
    }

    private static async upsertCanonicalOrder(instance: ConnectorRecord, rawOrder: any): Promise<'created' | 'updated'> {
        const canonical = await orderNormalizationService.normalize(
            'shopify',
            rawOrder,
            instance.siteId,
            instance.tenantId
        );
        const customerEmail = this.extractCustomerEmail(rawOrder);

        const existing = await prisma.canonicalOrder.findFirst({
            where: {
                siteId: instance.siteId,
                tenantId: instance.tenantId,
                sourceSystem: 'shopify',
                OR: [
                    { externalReferenceId: String(rawOrder?.id || '') },
                    { orderId: String(rawOrder?.name || rawOrder?.id || '') }
                ]
            },
            select: {
                id: true
            }
        });

        const data = {
            siteId: instance.siteId,
            tenantId: instance.tenantId,
            connectorInstanceId: instance.id,
            orderId: String(canonical.orderId),
            externalReferenceId: canonical.externalReferenceId ? String(canonical.externalReferenceId) : null,
            sourceSystem: 'shopify',
            channel: String(canonical.channel || 'online'),
            lifecycleState: String(canonical.lifecycleState),
            normalizedStatus: String(canonical.lifecycleState),
            currency: String(canonical.currency || 'USD'),
            totalAmount: Number(canonical.totalAmount || 0),
            taxAmount: Number(canonical.taxAmount || 0),
            discountAmount: Number(canonical.discountAmount || 0),
            paidAmount: Number(canonical.paidAmount || 0),
            refundedAmount: Number(canonical.refundedAmount || 0),
            placedAt: new Date(canonical.placedAt),
            paidAt: rawOrder?.processed_at ? new Date(rawOrder.processed_at) : null,
            shippedAt: rawOrder?.closed_at ? new Date(rawOrder.closed_at) : null,
            deliveredAt: null,
            mappingVersion: 'shopify/v1',
            metadata: {
                ...(canonical.metadata || {}),
                connectorInstanceId: instance.id,
                connectorLabel: instance.label,
                connectorStoreUrl: (() => {
                    const config = (instance.syncConfig || {}) as Record<string, any>;
                    const rawStoreUrl = String(config.storeUrl || '').trim();
                    if (rawStoreUrl) return rawStoreUrl;

                    const shopDomain = this.normalizeShopDomain(config.shopDomain || '');
                    return shopDomain ? `https://${shopDomain}` : null;
                })(),
                customerEmail,
                shopifyOrderId: rawOrder?.id,
                orderNumber: rawOrder?.order_number,
                customer: rawOrder?.customer || null,
                lineItems: rawOrder?.line_items || [],
                rawOrder
            } as Prisma.InputJsonValue,
            updatedAt: new Date()
        };

        if (existing) {
            await prisma.$transaction(async (tx) => {
                await tx.canonicalOrder.update({
                    where: { id: existing.id },
                    data
                });
            });

            return 'updated';
        }

        const newId = crypto.randomUUID();
        await prisma.$transaction(async (tx) => {
            await tx.canonicalOrder.create({
                data: {
                    id: newId,
                    ...data
                }
            });

            await tx.orderSnapshot.create({
                data: {
                    orderInternalId: newId,
                    projectId: instance.siteId,
                    connectorInstanceId: instance.id,
                    lifecycleState: String(canonical.lifecycleState),
                    totalAmount: Number(canonical.totalAmount || 0),
                    metadata: {
                        syncSource: 'shopify',
                        connectorInstanceId: instance.id
                    } as Prisma.InputJsonValue
                }
            });

            await tx.orderEvent.create({
                data: {
                    id: crypto.randomUUID(),
                    orderInternalId: newId,
                    projectId: instance.siteId,
                    connectorInstanceId: instance.id,
                    eventType: 'SHOPIFY_SYNC_IMPORT',
                    timestamp: new Date(),
                    payload: rawOrder as Prisma.InputJsonValue,
                    correlationId: instance.id
                }
            });
        });

        return 'created';
    }

    private static parseCredentials(serialized: string | null | undefined): Record<string, any> {
        if (!serialized) {
            return {};
        }

        try {
            const parsed = JSON.parse(serialized);
            if (!parsed || typeof parsed !== 'object') return {};

            // Ensure we expose `adminApiAccessToken` regardless of the incoming key name
            if (parsed.adminApiAccessToken) return parsed;

            const altToken = parsed.adminApiAccessToken || parsed.accessToken || parsed.access_token || parsed.token || parsed.apiKey || parsed.password;
            if (altToken) {
                return { ...parsed, adminApiAccessToken: String(altToken) };
            }

            return parsed;
        } catch {
            return {};
        }
    }

    private static async logLifecycleEvent(
        instance: ConnectorRecord,
        eventType: string,
        severity: string,
        payload: Record<string, any>
    ) {
        await prisma.connectorLifecycleEvent.create({
            data: {
                id: crypto.randomUUID(),
                connectorInstanceId: instance.id,
                tenantId: instance.tenantId,
                projectId: instance.siteId,
                eventType,
                severity,
                payload: payload as Prisma.InputJsonValue,
                triggeredBy: 'SYSTEM'
            }
        });
    }
}
