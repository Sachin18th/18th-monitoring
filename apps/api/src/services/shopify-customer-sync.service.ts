import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@kpi-platform/db';

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

export class ShopifyCustomerSyncService {
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
            throw new Error(`Provider "${instance.providerId}" is not supported by ShopifyCustomerSyncService.`);
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

        try {
            const customers = await this.fetchCustomers({
                shopDomain,
                adminApiAccessToken,
                apiVersion
            });

            let created = 0;
            let updated = 0;
            let failed = 0;

            for (const customer of customers) {
                try {
                    const result = await this.upsertCustomerProfile(instance, customer);
                    if (result === 'created') {
                        created += 1;
                    } else {
                        updated += 1;
                    }
                } catch (err) {
                    failed += 1;
                    console.error('[ShopifyCustomerSyncService] Failed to persist customer', {
                        connectorInstanceId,
                        customerId: customer?.id,
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
                    recordsFetched: customers.length,
                    recordsProcessed: created + updated,
                    recordsFailed: failed,
                    checkpointValue: customers[0]?.updated_at || customers[0]?.created_at || null
                }
            });

            console.log('[ShopifyCustomerSyncService] Sync completed', {
                runId,
                fetched: customers.length,
                created,
                updated,
                failed
            });

            return {
                runId,
                fetched: customers.length,
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

            console.error('[ShopifyCustomerSyncService] Sync failed', errorPayload);
            throw err;
        }
    }

    private static async fetchCustomers(input: {
        shopDomain: string;
        adminApiAccessToken: string;
        apiVersion: string;
    }): Promise<any[]> {
        const normalizedShopDomain = this.normalizeShopDomain(input.shopDomain);
        const baseUrl = `https://${normalizedShopDomain}/admin/api/${input.apiVersion}`;

        console.log('[ShopifyCustomerSyncService] fetchCustomers:start', {
            shopDomain: input.shopDomain,
            normalizedShopDomain,
            apiVersion: input.apiVersion
        });

        const url = new URL(`${baseUrl}/customers.json`);
        url.searchParams.set('limit', '100');
        url.searchParams.set('order', 'updated_at desc');

        const fetchFunc: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;

        const response = await fetchFunc(url.toString(), {
            method: 'GET',
            headers: {
                'X-Shopify-Access-Token': input.adminApiAccessToken,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const body = await response.text();
            console.error('[ShopifyCustomerSyncService] fetchCustomers:error-response', {
                status: response.status,
                statusText: response.statusText,
                body
            });
            throw new Error(`Shopify API request failed (${response.status}): ${body || response.statusText}`);
        }

        const payload = await response.json();
        const customers = Array.isArray(payload?.customers) ? payload.customers : [];

        console.log('[ShopifyCustomerSyncService] fetchCustomers:success', {
            customerCount: customers.length,
            firstCustomerId: customers[0]?.id || null
        });

        return customers;
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

    private static async upsertCustomerProfile(instance: ConnectorRecord, rawCustomer: any): Promise<'created' | 'updated'> {
        const customerId = String(rawCustomer?.id || '');
        const email = String(rawCustomer?.email || '').trim();
        const phone = rawCustomer?.phone ? String(rawCustomer.phone).trim() : null;

        // Check if customer already exists by external ID
        const existing = await prisma.customerProfile.findFirst({
            where: {
                siteId: instance.siteId,
                tenantId: instance.tenantId,
                externalIds: {
                    path: ['shopify'],
                    equals: customerId
                }
            },
            select: { id: true }
        });

        const emailHash = email ? crypto.createHash('sha256').update(email.toLowerCase()).digest('hex') : null;
        const phoneHash = phone ? crypto.createHash('sha256').update(phone).digest('hex') : null;

        const data: Prisma.CustomerProfileUncheckedCreateInput = {
            id: crypto.randomUUID(),
            siteId: instance.siteId,
            tenantId: instance.tenantId,
            externalIds: {
                ...(existing ? {} : {}),
                shopify: customerId
            } as Prisma.InputJsonValue,
            emailHash: emailHash || undefined,
            phoneHash: phoneHash || undefined,
            lifecycleState: rawCustomer?.tags?.includes('vip') ? 'VIP' : 'RETURNING',
            firstSeenAt: new Date(rawCustomer?.created_at || new Date()),
            lastSeenAt: new Date(rawCustomer?.updated_at || new Date()),
            totalLtv: rawCustomer?.total_spent ? Number(rawCustomer.total_spent) : null,
            metadata: {
                shopifyCustomerId: customerId,
                firstName: rawCustomer?.first_name || null,
                lastName: rawCustomer?.last_name || null,
                email: email || null,
                phone: phone || null,
                marketingOptIn: rawCustomer?.marketing_opt_in_level || null,
                orders: rawCustomer?.orders_count || 0,
                tags: rawCustomer?.tags || [],
                addresses: rawCustomer?.addresses || [],
                connectorInstanceId: instance.id,
                connectorLabel: instance.label,
                lastSyncedAt: new Date().toISOString()
            } as Prisma.InputJsonValue
        };

        if (existing) {
            const updated = await prisma.customerProfile.update({
                where: { id: existing.id },
                data: {
                    lastSeenAt: new Date(rawCustomer?.updated_at || new Date()),
                    totalLtv: rawCustomer?.total_spent ? Number(rawCustomer.total_spent) : undefined,
                    metadata: data.metadata
                }
            });

            return 'updated';
        }

        await prisma.customerProfile.create({
            data
        });

        return 'created';
    }

    private static parseCredentials(encryptedSecret: any): Record<string, any> {
        if (!encryptedSecret) return {};
        try {
            return typeof encryptedSecret === 'string' ? JSON.parse(encryptedSecret) : encryptedSecret;
        } catch (err) {
            console.warn('[ShopifyCustomerSyncService] Failed to parse credentials', err);
            return {};
        }
    }
}
