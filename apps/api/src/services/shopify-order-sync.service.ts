import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma, decryptSecret, hashEmail, encryptEmail, scrubEmails } from '@kpi-platform/db';
import { linkOrderToCustomer } from './order-customer-link.service';
import { getDataPlaneClient } from '../lib/tenant-prisma';
import { orderNormalizationService } from './order-normalization.service';
import {
    getSinceCursor,
    computeMaxCheckpoint,
    extractNextLink,
    ORDER_SYNC_TYPE,
    MAX_SYNC_PAGES
} from './sync-checkpoint.util';

const SHOPIFY_PAGE_DELAY_MS = 550;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
                syncType: ORDER_SYNC_TYPE,
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
            // Incremental cursor: only orders updated since the last successful run (minus
            // overlap). Null on the first run → full backfill.
            const since = await getSinceCursor(connectorInstanceId, ORDER_SYNC_TYPE);

            const orders = await this.fetchOrders({
                shopDomain,
                adminApiAccessToken,
                apiVersion,
                since
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
                    // Advance the checkpoint ONLY on a fully successful run. On a PARTIAL run we
                    // leave it null so the cursor is not advanced and failed records are retried.
                    checkpointValue: failed > 0 ? null : computeMaxCheckpoint(orders, ['updated_at', 'created_at'], 'shopify')
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
        since: Date | null;
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
            maskedToken,
            since: input.since?.toISOString() || null
        });

        const firstUrl = new URL(`${baseUrl}/orders.json`);
        firstUrl.searchParams.set('status', 'any');
        firstUrl.searchParams.set('limit', '250');
        // Incremental: only orders updated since the cursor. Omitted on full backfill.
        if (input.since) {
            firstUrl.searchParams.set('updated_at_min', input.since.toISOString());
        }

        const fetchFunc: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;

        const orders: any[] = [];
        // Shopify uses cursor pagination via the Link header; subsequent pages carry their own
        // page_info (plus limit) so we follow the next URL verbatim.
        let nextUrl: string | null = firstUrl.toString();
        let page = 0;

        while (nextUrl) {
            page += 1;
            if (page > MAX_SYNC_PAGES) {
                console.warn('[ShopifyOrderSyncService] fetchOrders:page-cap-hit', { page, totalSoFar: orders.length });
                break;
            }

            const response = await fetchFunc(nextUrl, {
                method: 'GET',
                headers: {
                    'X-Shopify-Access-Token': input.adminApiAccessToken,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
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
            const pageOrders = Array.isArray(payload?.orders) ? payload.orders : [];
            orders.push(...pageOrders);

            if (!Array.isArray(payload?.orders)) {
                console.warn('[ShopifyOrderSyncService] fetchOrders:unexpected-payload-shape', payload);
            }

            nextUrl = extractNextLink(response.headers.get('link') || response.headers.get('Link'));
            if (nextUrl) {
                await delay(SHOPIFY_PAGE_DELAY_MS);
            }
        }

        console.log('[ShopifyOrderSyncService] fetchOrders:complete', {
            pages: page,
            orderCount: orders.length
        });

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
        // PII: never persist the plaintext email. Keep the one-way hash (identity
        // join key) + a reversible encrypted copy (dashboard display only).
        const customerEmailHash = hashEmail(customerEmail);
        const customerEmailEncrypted = encryptEmail(customerEmail);

        // PHASE 5 PILOT: canonical order data is a DATA-PLANE write. Route it to
        // the integration's physical store DB when the data plane is enabled
        // (else this is the shared control client — identical to prior
        // behavior). The connector bookkeeping writes (connectorSyncRun /
        // connectorInstance / lifecycle events) stay on the control client in
        // syncConnectorInstance.
        const db = await getDataPlaneClient(instance.id);

        // Attach the order to the golden record so online history sits alongside
        // any in-store/offline orders imported for the same shopper.
        const customerProfileId = await linkOrderToCustomer(
            db,
            { siteId: instance.siteId, connectorInstanceId: instance.id },
            {
                email: customerEmail,
                phone: rawOrder?.customer?.phone || rawOrder?.phone || rawOrder?.billing_address?.phone || null,
                externalId: rawOrder?.customer?.id ?? null,
                platform: 'shopify',
                source: 'shopify-order-sync',
            },
        );

        const existing = await db.canonicalOrder.findFirst({
            where: {
                siteId: instance.siteId,
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
            customerProfileId,
            // scrubEmails() deep-replaces any raw email nested in customer / rawOrder /
            // lineItems with its hash, so no plaintext email is ever persisted here.
            metadata: scrubEmails({
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
                customerEmailHash,
                customerEmailEncrypted,
                shopifyOrderId: rawOrder?.id,
                orderNumber: rawOrder?.order_number,
                customer: rawOrder?.customer || null,
                lineItems: rawOrder?.line_items || [],
                rawOrder
            }) as Prisma.InputJsonValue,
            updatedAt: new Date()
        };

        if (existing) {
            await db.$transaction(async (tx: any) => {
                await tx.canonicalOrder.update({
                    where: { id: existing.id },
                    data
                });
            });

            return 'updated';
        }

        const newId = crypto.randomUUID();
        await db.$transaction(async (tx: any) => {
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
            // Decrypts the AES-256-GCM envelope in memory (with legacy-plaintext fallback).
            // Never log the returned credentials.
            const parsed = decryptSecret(serialized);
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
