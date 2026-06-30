import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma, hashEmail, hashPhone, encryptEmail, scrubEmails, decryptSecret } from '@kpi-platform/db';
import {
    getSinceCursor,
    computeMaxCheckpoint,
    extractNextLink,
    CUSTOMER_SYNC_TYPE,
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
                syncType: CUSTOMER_SYNC_TYPE,
                status: 'RUNNING',
                startedAt,
                recordsFetched: 0,
                recordsProcessed: 0,
                recordsFailed: 0
            }
        });

        try {
            // Incremental cursor: only customers updated since the last successful run (minus
            // overlap). Null on the first run → full backfill.
            const since = await getSinceCursor(connectorInstanceId, CUSTOMER_SYNC_TYPE);

            const customers = await this.fetchCustomers({
                shopDomain,
                adminApiAccessToken,
                apiVersion,
                since
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
                    // Advance the checkpoint ONLY on a fully successful run; PARTIAL leaves it null
                    // so the cursor is not advanced and failed records are retried next run.
                    checkpointValue: failed > 0 ? null : computeMaxCheckpoint(customers, ['updated_at', 'created_at'], 'shopify')
                }
            });

            await prisma.connectorInstance.update({
                where: { id: connectorInstanceId },
                data: { lastSyncAt: finishedAt, lastAttemptAt: startedAt }
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
        since: Date | null;
    }): Promise<any[]> {
        const normalizedShopDomain = this.normalizeShopDomain(input.shopDomain);
        const baseUrl = `https://${normalizedShopDomain}/admin/api/${input.apiVersion}`;

        console.log('[ShopifyCustomerSyncService] fetchCustomers:start', {
            shopDomain: input.shopDomain,
            normalizedShopDomain,
            apiVersion: input.apiVersion,
            since: input.since?.toISOString() || null
        });

        const firstUrl = new URL(`${baseUrl}/customers.json`);
        firstUrl.searchParams.set('limit', '250');
        if (input.since) {
            firstUrl.searchParams.set('updated_at_min', input.since.toISOString());
        }

        const fetchFunc: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;

        const customers: any[] = [];
        // Cursor pagination via the Link header; the next URL carries its own page_info + limit.
        let nextUrl: string | null = firstUrl.toString();
        let page = 0;

        while (nextUrl) {
            page += 1;
            if (page > MAX_SYNC_PAGES) {
                console.warn('[ShopifyCustomerSyncService] fetchCustomers:page-cap-hit', { page, totalSoFar: customers.length });
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
                console.error('[ShopifyCustomerSyncService] fetchCustomers:error-response', {
                    status: response.status,
                    statusText: response.statusText,
                    body
                });
                throw new Error(`Shopify API request failed (${response.status}): ${body || response.statusText}`);
            }

            const payload = await response.json();
            const pageCustomers = Array.isArray(payload?.customers) ? payload.customers : [];
            customers.push(...pageCustomers);

            nextUrl = extractNextLink(response.headers.get('link') || response.headers.get('Link'));
            if (nextUrl) {
                await delay(SHOPIFY_PAGE_DELAY_MS);
            }
        }

        console.log('[ShopifyCustomerSyncService] fetchCustomers:complete', {
            pages: page,
            customerCount: customers.length
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

        const emailHash = hashEmail(email);
        const phoneHash = hashPhone(phone);

        const data: Prisma.CustomerProfileUncheckedCreateInput = {
            id: crypto.randomUUID(),
            siteId: instance.siteId,
            tenantId: instance.tenantId,
            connectorInstanceId: instance.id,
            externalIds: {
                ...(existing ? {} : {}),
                shopify: customerId
            } as Prisma.InputJsonValue,
            emailHash: emailHash || undefined,
            // Reversible, encrypted-at-rest copy for dashboard display.
            emailEncrypted: encryptEmail(email) || undefined,
            phoneHash: phoneHash || undefined,
            lifecycleState: rawCustomer?.tags?.includes('vip') ? 'VIP' : 'RETURNING',
            firstSeenAt: new Date(rawCustomer?.created_at || new Date()),
            lastSeenAt: new Date(rawCustomer?.updated_at || new Date()),
            totalLtv: rawCustomer?.total_spent ? Number(rawCustomer.total_spent) : null,
            // Raw email/phone are NOT stored here — they live only in emailHash/phoneHash.
            // scrubEmails() neutralizes any address email nested in `addresses`.
            metadata: scrubEmails({
                shopifyCustomerId: customerId,
                firstName: rawCustomer?.first_name || null,
                lastName: rawCustomer?.last_name || null,
                marketingOptIn: rawCustomer?.marketing_opt_in_level || null,
                orders: rawCustomer?.orders_count || 0,
                tags: rawCustomer?.tags || [],
                addresses: rawCustomer?.addresses || [],
                connectorInstanceId: instance.id,
                connectorLabel: instance.label,
                lastSyncedAt: new Date().toISOString()
            }) as Prisma.InputJsonValue
        };

        if (existing) {
            const updated = await prisma.customerProfile.update({
                where: { id: existing.id },
                data: {
                    lastSeenAt: new Date(rawCustomer?.updated_at || new Date()),
                    totalLtv: rawCustomer?.total_spent ? Number(rawCustomer.total_spent) : undefined,
                    // Refresh identity columns so existing rows backfill on re-sync.
                    emailHash: emailHash || undefined,
                    emailEncrypted: encryptEmail(email) || undefined,
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
        // Decrypts the AES-256-GCM envelope in memory (with legacy-plaintext fallback).
        // Never log the returned credentials.
        return decryptSecret(encryptedSecret);
    }
}
