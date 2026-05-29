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
                    orderBy: { lastRotatedAt: 'desc' },
                    take: 1,
                    select: { encryptedSecret: true }
                }
            }
        });

        if (!instance) throw new Error('Integration instance not found.');
        if (instance.providerId !== 'adobe_commerce') throw new Error(`Provider "${instance.providerId}" is not supported by AdobeCommerceCustomerSyncService.`);

        const credentials = this.parseCredentials(instance.credentials?.[0]?.encryptedSecret);
        const config = (instance.syncConfig || {}) as Record<string, any>;
        const storeUrl = String(config.storeUrl || '').trim();
        const accessToken = String(credentials.adminApiAccessToken || credentials.accessToken || '').trim();

        if (!storeUrl) {
            throw new Error('Adobe Commerce integration is missing storeUrl in syncConfig.');
        }

        if (!accessToken) {
            throw new Error('Adobe Commerce integration is missing accessToken credentials.');
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
        const graphqlUrl = `${baseUrl}/graphql`;

        console.log('[AdobeCommerceCustomerSyncService] fetchCustomers:start', {
            storeUrl: input.storeUrl
        });

        // GraphQL query for Adobe Commerce customers
        const query = `
            query GetCustomers {
                customers(pageSize: 100) {
                    items {
                        id
                        email
                        firstname
                        lastname
                        created_at
                        updated_at
                        is_subscribed
                        addresses {
                            id
                            firstname
                            lastname
                            street
                            city
                            region
                            postcode
                            country_code
                            telephone
                        }
                    }
                    page_info {
                        page_size
                        current_page
                        total_pages
                    }
                }
            }
        `;

        const fetchFunc: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;

        const response = await fetchFunc(graphqlUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${input.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });

        if (!response.ok) {
            const body = await response.text();
            console.error('[AdobeCommerceCustomerSyncService] fetchCustomers:error-response', {
                status: response.status,
                statusText: response.statusText,
                body
            });
            throw new Error(`Adobe Commerce API request failed (${response.status}): ${body || response.statusText}`);
        }

        const payload = await response.json();

        if (payload.errors) {
            throw new Error(`Adobe Commerce GraphQL error: ${JSON.stringify(payload.errors)}`);
        }

        const customers = payload?.data?.customers?.items || [];

        console.log('[AdobeCommerceCustomerSyncService] fetchCustomers:success', {
            customerCount: customers.length,
            firstCustomerId: customers[0]?.id || null
        });

        return customers;
    }

    private static async upsertCustomerProfile(instance: ConnectorRecord, rawCustomer: any): Promise<'created' | 'updated'> {
        const customerId = String(rawCustomer?.id || '');
        const email = String(rawCustomer?.email || '').trim();
        const phone = rawCustomer?.addresses?.[0]?.telephone ? String(rawCustomer.addresses[0].telephone).trim() : null;

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
            lifecycleState: rawCustomer?.is_subscribed ? 'RETURNING' : 'NEW_GUEST',
            firstSeenAt: new Date(rawCustomer?.created_at || new Date()),
            lastSeenAt: new Date(rawCustomer?.updated_at || new Date()),
            totalLtv: null,
            metadata: {
                adobeCustomerId: customerId,
                firstName: rawCustomer?.firstname || null,
                lastName: rawCustomer?.lastname || null,
                email: email || null,
                phone: phone || null,
                isSubscribed: rawCustomer?.is_subscribed || false,
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
