import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma, hashEmail, encryptEmail, decryptSecret } from '@kpi-platform/db';

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
    fetched: number;          // orders inspected
    sessionsUpserted: number; // customer_sessions written
    eventsUpserted: number;   // customer_events written
    failed: number;
};

type ShopifyUtmParameters = {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    term?: string | null;
    content?: string | null;
} | null;

type ShopifyVisit = {
    id?: string | null;
    occurredAt?: string | null;
    source?: string | null;
    sourceType?: string | null;
    landingPage?: string | null;
    referrerUrl?: string | null;
    referralCode?: string | null;
    utmParameters?: ShopifyUtmParameters;
};

type ShopifyJourneyOrder = {
    id?: string | null;
    name?: string | null;
    createdAt?: string | null;
    processedAt?: string | null;
    totalPriceSet?: { shopMoney?: { amount?: string | null } } | null;
    customer?: { id?: string | null; email?: string | null } | null;
    customerJourneySummary?: {
        customerOrderIndex?: number | null;
        daysToConversion?: number | null;
        momentsCount?: { count?: number | null } | null;
        firstVisit?: ShopifyVisit | null;
        lastVisit?: ShopifyVisit | null;
        moments?: { edges?: Array<{ node?: ShopifyVisit }> } | null;
    } | null;
};

/**
 * Backfills customer journey data (sessions + events) for a Shopify connector
 * using the Admin GraphQL API's `customerJourneySummary` on orders.
 *
 * This works with the existing admin access token and covers customers who
 * converted (placed an order). Anonymous / non-converting traffic is NOT
 * available from this source — that requires a storefront Web Pixel feeding a
 * dedicated ingestion endpoint, which can be layered on top of the same
 * customer_sessions / customer_events tables later.
 *
 * Idempotency: session/event primary keys are derived deterministically from
 * the Shopify visit GID, so re-running the sync upserts rather than duplicates.
 */
export class ShopifyJourneySyncService {
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
            throw new Error(`Provider "${instance.providerId}" is not supported by ShopifyJourneySyncService.`);
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
            const orders = await this.fetchJourneyOrders({
                shopDomain,
                adminApiAccessToken,
                apiVersion
            });

            let sessionsUpserted = 0;
            let eventsUpserted = 0;
            let failed = 0;

            for (const order of orders) {
                try {
                    const result = await this.persistOrderJourney(instance, order);
                    sessionsUpserted += result.sessions;
                    eventsUpserted += result.events;
                } catch (err) {
                    failed += 1;
                    console.error('[ShopifyJourneySyncService] Failed to persist order journey', {
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
                    recordsProcessed: sessionsUpserted + eventsUpserted,
                    recordsFailed: failed,
                    checkpointValue: orders[0]?.processedAt || orders[0]?.createdAt || null
                }
            });

            console.log('[ShopifyJourneySyncService] Sync completed', {
                runId,
                fetched: orders.length,
                sessionsUpserted,
                eventsUpserted,
                failed
            });

            return {
                runId,
                fetched: orders.length,
                sessionsUpserted,
                eventsUpserted,
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

            console.error('[ShopifyJourneySyncService] Sync failed', errorPayload);
            throw err;
        }
    }

    private static async fetchJourneyOrders(input: {
        shopDomain: string;
        adminApiAccessToken: string;
        apiVersion: string;
    }): Promise<ShopifyJourneyOrder[]> {
        const normalizedShopDomain = this.normalizeShopDomain(input.shopDomain);
        const endpoint = `https://${normalizedShopDomain}/admin/api/${input.apiVersion}/graphql.json`;

        console.log('[ShopifyJourneySyncService] fetchJourneyOrders:start', {
            shopDomain: input.shopDomain,
            normalizedShopDomain,
            apiVersion: input.apiVersion
        });

        const query = `
            query JourneyOrders {
                orders(first: 100, sortKey: PROCESSED_AT, reverse: true) {
                    edges {
                        node {
                            id
                            name
                            createdAt
                            processedAt
                            totalPriceSet { shopMoney { amount } }
                            customer { id email }
                            customerJourneySummary {
                                customerOrderIndex
                                daysToConversion
                                momentsCount { count }
                                firstVisit { ...VisitFields }
                                lastVisit { ...VisitFields }
                                moments(first: 50) {
                                    edges { node { ... on CustomerVisit { ...VisitFields } } }
                                }
                            }
                        }
                    }
                }
            }

            fragment VisitFields on CustomerVisit {
                id
                occurredAt
                source
                sourceType
                landingPage
                referrerUrl
                referralCode
                utmParameters { source medium campaign term content }
            }
        `;

        const fetchFunc: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;

        const response = await fetchFunc(endpoint, {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': input.adminApiAccessToken,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ query })
        });

        if (!response.ok) {
            const body = await response.text();
            console.error('[ShopifyJourneySyncService] fetchJourneyOrders:error-response', {
                status: response.status,
                statusText: response.statusText,
                body
            });
            throw new Error(`Shopify GraphQL request failed (${response.status}): ${body || response.statusText}`);
        }

        const payload = await response.json();

        if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
            const message = payload.errors.map((e: any) => e?.message).filter(Boolean).join('; ');
            // Customer journey is "protected customer data"; surface the cause clearly.
            throw new Error(`Shopify GraphQL returned errors: ${message || 'unknown error'}. ` +
                'Customer journey data requires the app to be approved for protected customer data access and read_orders scope.');
        }

        const edges = payload?.data?.orders?.edges;
        const orders: ShopifyJourneyOrder[] = Array.isArray(edges)
            ? edges.map((edge: any) => edge?.node).filter(Boolean)
            : [];

        console.log('[ShopifyJourneySyncService] fetchJourneyOrders:success', {
            orderCount: orders.length,
            firstOrderId: orders[0]?.id || null
        });

        return orders;
    }

    private static async persistOrderJourney(
        instance: ConnectorRecord,
        order: ShopifyJourneyOrder
    ): Promise<{ sessions: number; events: number }> {
        const journey = order.customerJourneySummary;
        if (!journey) {
            return { sessions: 0, events: 0 };
        }

        // Collect visits: prefer the full moments list, fall back to first/last visit.
        const momentVisits = (journey.moments?.edges || [])
            .map((edge) => edge?.node)
            .filter((v): v is ShopifyVisit => Boolean(v && v.id));

        const fallbackVisits = [journey.firstVisit, journey.lastVisit]
            .filter((v): v is ShopifyVisit => Boolean(v && v.id));

        const visits = momentVisits.length > 0 ? momentVisits : dedupeVisits(fallbackVisits);

        if (visits.length === 0) {
            return { sessions: 0, events: 0 };
        }

        const customerId = await this.resolveCustomerProfileId(instance, order);
        const convertingVisitId = journey.lastVisit?.id || visits[visits.length - 1]?.id || null;

        const orderAmount = Number(order.totalPriceSet?.shopMoney?.amount || 0);
        const orderTimestamp = order.processedAt || order.createdAt || null;

        let sessions = 0;
        let events = 0;

        for (const visit of visits) {
            const isConverting = Boolean(convertingVisitId && visit.id === convertingVisitId);
            const sessionId = stableUuid(`shopify-session:${visit.id}`);
            const startTime = visit.occurredAt ? new Date(visit.occurredAt) : new Date(orderTimestamp || Date.now());
            const utm = visit.utmParameters || {};
            const trafficSource = visit.source || utm.source || visit.sourceType || null;

            // A "visit" event for every session, plus a "purchase" event on the converting visit.
            const eventCount = isConverting ? 2 : 1;

            await prisma.customerSession.upsert({
                where: { id: sessionId },
                create: {
                    id: sessionId,
                    customerId,
                    siteId: instance.siteId,
                    connectorInstanceId: instance.id,
                    startTime,
                    endTime: isConverting && orderTimestamp ? new Date(orderTimestamp) : null,
                    trafficSource: trafficSource || undefined,
                    isConverted: isConverting ? 1 : 0,
                    eventCount
                },
                update: {
                    customerId,
                    connectorInstanceId: instance.id,
                    startTime,
                    endTime: isConverting && orderTimestamp ? new Date(orderTimestamp) : undefined,
                    trafficSource: trafficSource || undefined,
                    isConverted: isConverting ? 1 : 0,
                    eventCount
                }
            });
            sessions += 1;

            // Visit (acquisition) event
            const visitEventId = stableUuid(`shopify-event:visit:${visit.id}`);
            await prisma.customerEvent.upsert({
                where: { id: visitEventId },
                create: {
                    id: visitEventId,
                    customerId,
                    sessionId,
                    siteId: instance.siteId,
                    connectorInstanceId: instance.id,
                    eventName: 'visit',
                    category: 'acquisition',
                    timestamp: startTime,
                    utmSource: utm.source || undefined,
                    utmMedium: utm.medium || undefined,
                    utmCampaign: utm.campaign || undefined,
                    metadata: {
                        source: visit.source || null,
                        sourceType: visit.sourceType || null,
                        landingPage: visit.landingPage || null,
                        referrerUrl: visit.referrerUrl || null,
                        referralCode: visit.referralCode || null,
                        utmTerm: utm.term || null,
                        utmContent: utm.content || null,
                        shopifyVisitId: visit.id || null
                    } as Prisma.InputJsonValue
                },
                update: {
                    sessionId,
                    timestamp: startTime,
                    utmSource: utm.source || undefined,
                    utmMedium: utm.medium || undefined,
                    utmCampaign: utm.campaign || undefined
                }
            });
            events += 1;

            // Purchase (conversion) event attached to the converting visit/session.
            if (isConverting) {
                const purchaseEventId = stableUuid(`shopify-event:purchase:${order.id}`);
                await prisma.customerEvent.upsert({
                    where: { id: purchaseEventId },
                    create: {
                        id: purchaseEventId,
                        customerId,
                        sessionId,
                        siteId: instance.siteId,
                        connectorInstanceId: instance.id,
                        eventName: 'purchase',
                        category: 'conversion',
                        timestamp: orderTimestamp ? new Date(orderTimestamp) : startTime,
                        utmSource: utm.source || undefined,
                        utmMedium: utm.medium || undefined,
                        utmCampaign: utm.campaign || undefined,
                        metadata: {
                            shopifyOrderId: order.id || null,
                            orderName: order.name || null,
                            amount: orderAmount,
                            daysToConversion: journey.daysToConversion ?? null,
                            customerOrderIndex: journey.customerOrderIndex ?? null
                        } as Prisma.InputJsonValue
                    },
                    update: {
                        sessionId,
                        timestamp: orderTimestamp ? new Date(orderTimestamp) : startTime,
                        metadata: {
                            shopifyOrderId: order.id || null,
                            orderName: order.name || null,
                            amount: orderAmount
                        } as Prisma.InputJsonValue
                    }
                });
                events += 1;
            }
        }

        return { sessions, events };
    }

    /**
     * Resolve the canonical CustomerProfile id for an order, creating a minimal
     * profile when the order's customer was not synced (e.g. guest checkout).
     * Mirrors the externalIds.shopify lookup used by ShopifyCustomerSyncService.
     */
    private static async resolveCustomerProfileId(
        instance: ConnectorRecord,
        order: ShopifyJourneyOrder
    ): Promise<string> {
        const shopifyCustomerId = extractNumericId(order.customer?.id);
        const email = String(order.customer?.email || '').trim().toLowerCase();
        const emailHash = hashEmail(email);

        if (shopifyCustomerId) {
            const byExternalId = await prisma.customerProfile.findFirst({
                where: {
                    siteId: instance.siteId,
                    tenantId: instance.tenantId,
                    externalIds: { path: ['shopify'], equals: shopifyCustomerId }
                },
                select: { id: true }
            });
            if (byExternalId) return byExternalId.id;
        }

        if (emailHash) {
            const byEmail = await prisma.customerProfile.findFirst({
                where: { siteId: instance.siteId, tenantId: instance.tenantId, emailHash },
                select: { id: true }
            });
            if (byEmail) return byEmail.id;
        }

        // No synced profile — create a deterministic minimal one so the FK resolves
        // and re-syncs reuse the same profile.
        const seed = shopifyCustomerId
            ? `cust:${instance.siteId}:${shopifyCustomerId}`
            : `guest:${instance.siteId}:${order.id}`;
        const profileId = stableUuid(seed);

        await prisma.customerProfile.upsert({
            where: { id: profileId },
            create: {
                id: profileId,
                siteId: instance.siteId,
                tenantId: instance.tenantId,
                connectorInstanceId: instance.id,
                externalIds: (shopifyCustomerId ? { shopify: shopifyCustomerId } : {}) as Prisma.InputJsonValue,
                emailHash: emailHash || undefined,
                // Reversible, encrypted-at-rest copy for dashboard display.
                emailEncrypted: encryptEmail(email) || undefined,
                lifecycleState: shopifyCustomerId ? 'RETURNING' : 'NEW_GUEST',
                metadata: {
                    source: 'shopify-journey-sync',
                    shopifyCustomerId: shopifyCustomerId || null,
                    connectorInstanceId: instance.id
                } as Prisma.InputJsonValue
            },
            update: {}
        });

        return profileId;
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

    private static parseCredentials(serialized: string | null | undefined): Record<string, any> {
        if (!serialized) {
            return {};
        }

        try {
            // Decrypts the AES-256-GCM envelope in memory (with legacy-plaintext fallback).
            // Never log the returned credentials.
            const parsed = decryptSecret(serialized);
            if (!parsed || typeof parsed !== 'object') return {};

            if (parsed.adminApiAccessToken) return parsed;

            const altToken = parsed.accessToken || parsed.access_token || parsed.token || parsed.apiKey || parsed.password;
            if (altToken) {
                return { ...parsed, adminApiAccessToken: String(altToken) };
            }

            return parsed;
        } catch {
            return {};
        }
    }
}

/**
 * Deterministic 36-char UUID-shaped key derived from a string, so repeated syncs
 * upsert the same session/event rows instead of creating duplicates.
 */
function stableUuid(input: string): string {
    const hash = crypto.createHash('sha1').update(input).digest('hex');
    return [
        hash.slice(0, 8),
        hash.slice(8, 12),
        hash.slice(12, 16),
        hash.slice(16, 20),
        hash.slice(20, 32)
    ].join('-');
}

/** Extract the numeric id from a Shopify GID (gid://shopify/Customer/123 -> "123"). */
function extractNumericId(gid: string | null | undefined): string | null {
    if (!gid) return null;
    const tail = String(gid).split('/').pop();
    return tail && tail.trim() ? tail.trim() : null;
}

function dedupeVisits(visits: ShopifyVisit[]): ShopifyVisit[] {
    const seen = new Set<string>();
    const out: ShopifyVisit[] = [];
    for (const visit of visits) {
        const key = String(visit.id || '');
        if (key && !seen.has(key)) {
            seen.add(key);
            out.push(visit);
        }
    }
    return out;
}
