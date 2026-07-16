import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma, hashEmail, hashPhone, encryptEmail, scrubEmails, decryptSecret } from '@kpi-platform/db';
import { getDataPlaneClient } from '../lib/tenant-prisma';
import { interpretAdobeApiError } from './adobe-commerce-error.util';
import {
    getSinceCursor,
    computeMaxCheckpoint,
    toAdobeDateTime,
    CUSTOMER_SYNC_TYPE
} from './sync-checkpoint.util';

// Bound each customer-search request. Magento's /customers/search degrades on
// deep offset pagination for large stores; without a timeout a single stalled
// page hangs the whole sync (and any resync job that runs it) indefinitely.
const ADOBE_FETCH_TIMEOUT_MS = 30000;
// Gentle spacing between pages so a big backfill doesn't hammer the store API.
const ADOBE_CUSTOMER_PAGE_DELAY_MS = 250;
const customerDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

        // DATA-PLANE routing: customer profiles live in the integration's
        // physical store DB when the data plane is enabled (else this is the
        // shared control client). Connector bookkeeping stays on `prisma`.
        const db = await getDataPlaneClient(instance.id);

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
                storeUrl,
                accessToken,
                since
            });

            let created = 0;
            let updated = 0;
            let failed = 0;

            for (const rawCustomer of customers) {
                try {
                    const result = await this.upsertCustomerProfile(db, instance, rawCustomer);
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
                    // Advance the checkpoint ONLY on a fully successful run; PARTIAL leaves it null
                    // so the cursor is not advanced and failed records are retried next run.
                    checkpointValue: failed > 0 ? null : computeMaxCheckpoint(customers, ['updated_at', 'created_at'], 'adobe_commerce')
                }
            });

            await prisma.connectorInstance.update({
                where: { id: connectorInstanceId },
                data: { lastSyncAt: finishedAt, lastAttemptAt: startedAt }
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

            // Surface the failure on the connector itself so the UI shows why
            // customers didn't sync (e.g. a missing Magento_Customer::manage ACL),
            // mirroring the order sync. Best-effort — never mask the original error.
            try {
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
            } catch (updateErr) {
                console.error('[AdobeCommerceCustomerSyncService] Failed to persist connector error state', { updateErr });
            }

            console.error('[AdobeCommerceCustomerSyncService] Sync failed', errorPayload);
            throw err;
        }
    }

    private static async fetchCustomers(input: {
        storeUrl: string;
        accessToken: string;
        since: Date | null;
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
            storeUrl: input.storeUrl,
            since: input.since?.toISOString() || null
        });

        for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
            const url = new URL(`${baseUrl}/rest/V1/customers/search`);
            url.searchParams.set('searchCriteria[pageSize]', String(pageSize));
            url.searchParams.set('searchCriteria[currentPage]', String(currentPage));
            url.searchParams.set('searchCriteria[sortOrders][0][field]', 'updated_at');
            url.searchParams.set('searchCriteria[sortOrders][0][direction]', 'ASC');
            // Incremental: only customers updated after the cursor. Omitted on full backfill.
            if (input.since) {
                url.searchParams.set('searchCriteria[filterGroups][0][filters][0][field]', 'updated_at');
                url.searchParams.set('searchCriteria[filterGroups][0][filters][0][conditionType]', 'gt');
                url.searchParams.set('searchCriteria[filterGroups][0][filters][0][value]', toAdobeDateTime(input.since));
            }

            let response: Response;
            try {
                response = await fetchFunc(url.toString(), {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${input.accessToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    signal: AbortSignal.timeout(ADOBE_FETCH_TIMEOUT_MS)
                });
            } catch (err: any) {
                // AbortSignal.timeout raises a TimeoutError; make it actionable
                // instead of a bare "The operation was aborted".
                if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
                    throw new Error(
                        `Adobe Commerce customer sync timed out after ${ADOBE_FETCH_TIMEOUT_MS / 1000}s on page ${currentPage} ` +
                        `(GET /rest/V1/customers/search). The store's customer search is responding too slowly — ` +
                        `retry, or narrow the sync window.`
                    );
                }
                throw err;
            }

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

            // Loud when we stop early on a large store, so partial customer data
            // is never mistaken for a complete sync.
            if (currentPage === maxPages) {
                console.warn('[AdobeCommerceCustomerSyncService] fetchCustomers:page-cap-hit', {
                    maxPages,
                    fetchedSoFar: all.length,
                    totalCount: totalCount || 'unknown'
                });
            }

            await customerDelay(ADOBE_CUSTOMER_PAGE_DELAY_MS);
        }

        console.log('[AdobeCommerceCustomerSyncService] fetchCustomers:success', {
            customerCount: all.length,
            firstCustomerId: all[0]?.id || null
        });

        return all;
    }

    private static async upsertCustomerProfile(db: any, instance: ConnectorRecord, rawCustomer: any): Promise<'created' | 'updated'> {
        const customerId = String(rawCustomer?.id || '');
        const email = String(rawCustomer?.email || '').trim();
        const phone = rawCustomer?.addresses?.[0]?.telephone ? String(rawCustomer.addresses[0].telephone).trim() : null;
        // REST exposes the subscription flag under extension_attributes; GraphQL had it top-level.
        const isSubscribed = Boolean(rawCustomer?.is_subscribed ?? rawCustomer?.extension_attributes?.is_subscribed ?? false);

        // Check if customer already exists by external ID
        const existing = await db.customerProfile.findFirst({
            where: {
                siteId: instance.siteId,
                externalIds: {
                    path: ['adobe_commerce'],
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
            connectorInstanceId: instance.id,
            externalIds: {
                adobe_commerce: customerId
            } as Prisma.InputJsonValue,
            emailHash: emailHash || undefined,
            // Reversible, encrypted-at-rest copy for dashboard display.
            emailEncrypted: encryptEmail(email) || undefined,
            phoneHash: phoneHash || undefined,
            lifecycleState: isSubscribed ? 'RETURNING' : 'NEW_GUEST',
            firstSeenAt: new Date(rawCustomer?.created_at || new Date()),
            lastSeenAt: new Date(rawCustomer?.updated_at || new Date()),
            totalLtv: null,
            // Raw email/phone are NOT stored here — they live only in emailHash/phoneHash.
            // scrubEmails() neutralizes any address email nested in `addresses`.
            metadata: scrubEmails({
                adobeCustomerId: customerId,
                firstName: rawCustomer?.firstname || null,
                lastName: rawCustomer?.lastname || null,
                isSubscribed,
                addresses: rawCustomer?.addresses || [],
                connectorInstanceId: instance.id,
                connectorLabel: instance.label,
                lastSyncedAt: new Date().toISOString()
            }) as Prisma.InputJsonValue
        };

        if (existing) {
            await db.customerProfile.update({
                where: { id: existing.id },
                data: {
                    lastSeenAt: new Date(rawCustomer?.updated_at || new Date()),
                    // Refresh identity columns so existing rows backfill on re-sync.
                    emailHash: emailHash || undefined,
                    emailEncrypted: encryptEmail(email) || undefined,
                    metadata: data.metadata
                }
            });

            return 'updated';
        }

        await db.customerProfile.create({
            data: {
                ...data
            }
        });

        return 'created';
    }

    private static parseCredentials(encryptedSecret: any): Record<string, any> {
        // Decrypts the AES-256-GCM envelope in memory (with legacy-plaintext fallback).
        // Never log the returned credentials.
        return decryptSecret(encryptedSecret);
    }
}
