import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@kpi-platform/db';
import { interpretAdobeApiError } from './adobe-commerce-error.util';

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

export class AdobeCommerceCustomerSyncService {
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
                    // Newest active credential first. `lastRotatedAt` is nullable and
                    // unset on connect, so it can't order deterministically; createdAt can.
                    where: { isActive: true },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { id: true, encryptedSecret: true, createdAt: true }
                }
            }
        });

        if (!instance) throw new Error('Integration instance not found.');
        if (instance.providerId !== 'adobe_commerce') throw new Error(`Provider "${instance.providerId}" is not supported by AdobeCommerceCustomerSyncService.`);

        const credentials = this.parseCredentials(instance.credentials?.[0]?.encryptedSecret);
        const config = (instance.syncConfig || {}) as Record<string, any>;
        const storeUrl = String(config.storeUrl || '').trim();
        const accessToken = String(
            credentials.adminApiAccessToken || credentials.adminApiToken || credentials.accessToken || credentials.token || credentials.apiKey || ''
        ).trim();

        if (!storeUrl) {
            throw new Error('Adobe Commerce integration is missing storeUrl in syncConfig.');
        }

        if (!accessToken) {
            throw new Error('Adobe Commerce integration is missing accessToken credentials.');
        }

        console.log('[AdobeCommerceCustomerSyncService] syncConnectorInstance:start', {
            connectorInstanceId,
            storeUrl,
            credentialId: instance.credentials?.[0]?.id || null,
            credentialCreatedAt: instance.credentials?.[0]?.createdAt || null,
            tokenLength: accessToken.length,
            maskedToken: `${accessToken.slice(0, 4)}...${accessToken.slice(-4)}`
        });

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
                storeUrl,
                accessToken
            });

            let created = 0;
            let updated = 0;
            let failed = 0;

            for (const rawCustomer of customers) {
                try {
                    const result = await this.upsertCustomerProfile(instance, rawCustomer);
                    if (result === 'created') {
                        created += 1;
                    } else {
                        updated += 1;
                    }
                } catch (err) {
                    failed += 1;
                    console.error('[AdobeCommerceCustomerSyncService] Failed to persist customer', {
                        connectorInstanceId,
                        customerId: rawCustomer?.id,
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
                    checkpointValue: customers[0]?.updated_at || null
                }
            });

            console.log('[AdobeCommerceCustomerSyncService] Sync completed', {
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

            console.error('[AdobeCommerceCustomerSyncService] Sync failed', errorPayload);
            throw err;
        }
    }

    private static async fetchCustomers(input: {
        storeUrl: string;
        accessToken: string;
    }): Promise<any[]> {
        const baseUrl = input.storeUrl.replace(/\/+$/, '');
        const fetchFunc: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;

        // Use the admin REST endpoint (GET /rest/V1/customers/search), NOT the
        // storefront GraphQL `customers` query. The GraphQL query authenticates
        // only with a per-customer session token ("Composite reader could not read
        // a token" otherwise); bulk export needs an admin/integration token, which
        // the REST search endpoint accepts (requires the Magento_Customer::manage ACL).
        const pageSize = 100;
        const maxPages = 50; // safety cap (~5,000 customers per resync)
        const all: any[] = [];

        console.log('[AdobeCommerceCustomerSyncService] fetchCustomers:start', {
            storeUrl: input.storeUrl
        });

        for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
            const url = new URL(`${baseUrl}/rest/V1/customers/search`);
            url.searchParams.set('searchCriteria[pageSize]', String(pageSize));
            url.searchParams.set('searchCriteria[currentPage]', String(currentPage));
            url.searchParams.set('searchCriteria[sortOrders][0][field]', 'updated_at');
            url.searchParams.set('searchCriteria[sortOrders][0][direction]', 'DESC');

            const response = await fetchFunc(url.toString(), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${input.accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const body = await response.text();
                console.error('[AdobeCommerceCustomerSyncService] fetchCustomers:error-response', {
                    status: response.status,
                    statusText: response.statusText,
                    body
                });
                throw new Error(interpretAdobeApiError(response.status, body, response.statusText));
            }

            const payload = await response.json();
            const items = Array.isArray(payload?.items) ? payload.items : [];
            all.push(...items);

            const totalCount = Number(payload?.total_count || 0);
            // Stop when the last (short) page is reached or we've collected everything.
            if (items.length < pageSize || (totalCount > 0 && all.length >= totalCount)) {
                break;
            }
        }

        console.log('[AdobeCommerceCustomerSyncService] fetchCustomers:success', {
            customerCount: all.length,
            firstCustomerId: all[0]?.id || null
        });

        return all;
    }

    private static async upsertCustomerProfile(instance: ConnectorRecord, rawCustomer: any): Promise<'created' | 'updated'> {
        const customerId = String(rawCustomer?.id || '');
        const email = String(rawCustomer?.email || '').trim();
        const phone = rawCustomer?.addresses?.[0]?.telephone ? String(rawCustomer.addresses[0].telephone).trim() : null;
        // REST exposes the subscription flag under extension_attributes; GraphQL had it top-level.
        const isSubscribed = Boolean(rawCustomer?.is_subscribed ?? rawCustomer?.extension_attributes?.is_subscribed ?? false);

        // Check if customer already exists by external ID
        const existing = await prisma.customerProfile.findFirst({
            where: {
                siteId: instance.siteId,
                tenantId: instance.tenantId,
                externalIds: {
                    path: ['adobe_commerce'],
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
            connectorInstanceId: instance.id,
            externalIds: {
                adobe_commerce: customerId
            } as Prisma.InputJsonValue,
            emailHash: emailHash || undefined,
            phoneHash: phoneHash || undefined,
            lifecycleState: isSubscribed ? 'RETURNING' : 'NEW_GUEST',
            firstSeenAt: new Date(rawCustomer?.created_at || new Date()),
            lastSeenAt: new Date(rawCustomer?.updated_at || new Date()),
            totalLtv: null,
            metadata: {
                adobeCustomerId: customerId,
                firstName: rawCustomer?.firstname || null,
                lastName: rawCustomer?.lastname || null,
                email: email || null,
                phone: phone || null,
                isSubscribed,
                addresses: rawCustomer?.addresses || [],
                connectorInstanceId: instance.id,
                connectorLabel: instance.label,
                lastSyncedAt: new Date().toISOString()
            } as Prisma.InputJsonValue
        };

        if (existing) {
            await prisma.customerProfile.update({
                where: { id: existing.id },
                data: {
                    lastSeenAt: new Date(rawCustomer?.updated_at || new Date()),
                    metadata: data.metadata
                }
            });

            return 'updated';
        }

        await prisma.customerProfile.create({
            data: {
                ...data
            }
        });

        return 'created';
    }

    private static parseCredentials(encryptedSecret: any): Record<string, any> {
        if (!encryptedSecret) return {};
        try {
            return typeof encryptedSecret === 'string' ? JSON.parse(encryptedSecret) : encryptedSecret;
        } catch (err) {
            console.warn('[AdobeCommerceCustomerSyncService] Failed to parse credentials', err);
            return {};
        }
    }
}
