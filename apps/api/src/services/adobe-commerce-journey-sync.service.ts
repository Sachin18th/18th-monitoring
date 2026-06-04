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
    fetched: number;          // orders inspected
    sessionsUpserted: number; // customer_sessions written
    eventsUpserted: number;   // customer_events written
    failed: number;
};

/**
 * Backfills customer journey data (sessions + events) for an Adobe Commerce /
 * Magento connector.
 *
 * Unlike Shopify, the Magento REST API exposes no native visit / traffic-source
 * "customer journey". The reliable signal we DO have is the order itself plus its
 * `status_histories` lifecycle. So for every order we derive:
 *   - one converting customer_session (the purchase session), and
 *   - a `purchase` conversion event, plus one engagement event per status-history
 *     entry (order placed -> processing -> complete, etc.).
 *
 * Anonymous / non-converting traffic is not available from this source; it would
 * require a storefront pixel feeding the same customer_sessions/events tables.
 *
 * Idempotency: session/event primary keys are derived deterministically from the
 * Magento order id, so re-syncs upsert instead of duplicating.
 */
export class AdobeCommerceJourneySyncService {
    static async syncConnectorInstance(connectorInstanceId: string): Promise<SyncSummary> {
        const instance = await prisma.connectorInstance.findUnique({
            where: { id: connectorInstanceId },
            select: {
                id: true,
                tenantId: true,
                siteId: true,
                providerId: true,
                label: true,
                syncConfig: true
            }
        });

        if (!instance) throw new Error('Integration instance not found.');
        if (instance.providerId !== 'adobe_commerce') {
            throw new Error(`Provider "${instance.providerId}" is not supported by AdobeCommerceJourneySyncService.`);
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
            const orders = await this.fetchOrders(instance);

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
                    console.error('[AdobeCommerceJourneySyncService] Failed to persist order journey', {
                        connectorInstanceId,
                        orderId: order?.entity_id || order?.increment_id,
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
                    checkpointValue: orders[0]?.updated_at || null
                }
            });

            console.log('[AdobeCommerceJourneySyncService] Sync completed', {
                runId,
                fetched: orders.length,
                sessionsUpserted,
                eventsUpserted,
                failed
            });

            return { runId, fetched: orders.length, sessionsUpserted, eventsUpserted, failed };
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

            console.error('[AdobeCommerceJourneySyncService] Sync failed', errorPayload);
            throw err;
        }
    }

    private static async fetchOrders(instance: ConnectorRecord): Promise<any[]> {
        const config = instance.syncConfig || {};
        const base = String(config.baseUrl || config.storeUrl || '').trim().replace(/\/$/, '');
        if (!base) {
            console.warn('[AdobeCommerceJourneySyncService] fetchOrders:no-base-url', { siteId: instance.siteId });
            return [];
        }

        const credential = await prisma.connectorCredential.findFirst({
            where: { connectorInstanceId: instance.id, isActive: true },
            orderBy: [{ createdAt: 'desc' }]
        });

        const credentials = this.parseCredentials(credential?.encryptedSecret);
        const accessToken = String(
            credentials.accessToken || credentials.adminApiToken || credentials.adminApiAccessToken || credentials.token || credentials.apiKey || ''
        ).trim();

        if (!accessToken) {
            throw new Error('Adobe Commerce integration is missing access token in credentials.');
        }

        // The /rest/V1/orders search returns full order entities including the
        // `status_histories` array, so a single fetch covers sessions + events.
        const url = new URL(`${base}/rest/V1/orders`);
        url.searchParams.set('searchCriteria[sortOrders][0][field]', 'updated_at');
        url.searchParams.set('searchCriteria[sortOrders][0][direction]', 'DESC');
        url.searchParams.set('searchCriteria[pageSize]', '100');

        const fetchFn: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;
        const response = await fetchFn(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const body = await response.text();
            console.error('[AdobeCommerceJourneySyncService] fetchOrders:error-response', {
                status: response.status,
                statusText: response.statusText,
                body
            });
            throw new Error(interpretAdobeApiError(response.status, body, response.statusText));
        }

        const payload = await response.json();
        const items = Array.isArray(payload?.items) ? payload.items : [];

        console.log('[AdobeCommerceJourneySyncService] fetchOrders:success', {
            itemCount: items.length,
            totalCount: payload?.total_count || null
        });

        return items;
    }

    private static async persistOrderJourney(
        instance: ConnectorRecord,
        order: any
    ): Promise<{ sessions: number; events: number }> {
        const orderKey = String(order?.entity_id ?? order?.increment_id ?? '').trim();
        if (!orderKey) {
            return { sessions: 0, events: 0 };
        }

        const customerId = await this.resolveCustomerProfileId(instance, order);

        const placedAt = this.toMagentoDate(order?.created_at);
        const lastActivityAt = this.toMagentoDate(order?.updated_at) || placedAt;
        const orderAmount = Number(order?.grand_total ?? order?.base_grand_total ?? 0);
        const currency = String(order?.order_currency_code || order?.base_currency_code || 'USD');
        const trafficSource = this.extractTrafficSource(order);

        // Build the event list: a purchase conversion event, plus one engagement
        // event per status-history entry (order lifecycle progression).
        const histories: any[] = Array.isArray(order?.status_histories) ? order.status_histories : [];

        const sessionId = stableUuid(`adobe-session:${instance.siteId}:${orderKey}`);
        const eventCount = 1 + histories.length;

        const sessionStart = placedAt || new Date();
        const sessionEnd = lastActivityAt || sessionStart;
        const durationSeconds = Math.max(0, Math.round((sessionEnd.getTime() - sessionStart.getTime()) / 1000));

        await prisma.customerSession.upsert({
            where: { id: sessionId },
            create: {
                id: sessionId,
                customerId,
                siteId: instance.siteId,
                connectorInstanceId: instance.id,
                startTime: sessionStart,
                endTime: sessionEnd,
                durationSeconds,
                trafficSource: trafficSource || undefined,
                isConverted: 1,
                eventCount
            },
            update: {
                customerId,
                connectorInstanceId: instance.id,
                startTime: sessionStart,
                endTime: sessionEnd,
                durationSeconds,
                trafficSource: trafficSource || undefined,
                isConverted: 1,
                eventCount
            }
        });

        let events = 0;

        // Purchase (conversion) event.
        const purchaseEventId = stableUuid(`adobe-event:purchase:${orderKey}`);
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
                timestamp: sessionStart,
                metadata: {
                    orderId: order?.increment_id || null,
                    entityId: order?.entity_id || null,
                    amount: Number.isFinite(orderAmount) ? orderAmount : 0,
                    currency,
                    status: order?.status || null,
                    state: order?.state || null,
                    isGuest: Boolean(order?.customer_is_guest)
                } as Prisma.InputJsonValue
            },
            update: {
                sessionId,
                timestamp: sessionStart,
                metadata: {
                    orderId: order?.increment_id || null,
                    entityId: order?.entity_id || null,
                    amount: Number.isFinite(orderAmount) ? orderAmount : 0,
                    currency,
                    status: order?.status || null,
                    state: order?.state || null
                } as Prisma.InputJsonValue
            }
        });
        events += 1;

        // Lifecycle (engagement) events from the order's status history.
        for (let i = 0; i < histories.length; i++) {
            const history = histories[i] || {};
            const historyId = history.entity_id != null ? String(history.entity_id) : String(i);
            const eventId = stableUuid(`adobe-event:status:${orderKey}:${historyId}`);
            const timestamp = this.toMagentoDate(history.created_at) || sessionStart;
            const status = String(history.status || '').trim();

            await prisma.customerEvent.upsert({
                where: { id: eventId },
                create: {
                    id: eventId,
                    customerId,
                    sessionId,
                    siteId: instance.siteId,
                    connectorInstanceId: instance.id,
                    eventName: status ? `order_${status}` : 'order_status_change',
                    category: 'engagement',
                    timestamp,
                    metadata: {
                        orderId: order?.increment_id || null,
                        status: status || null,
                        comment: history.comment || null,
                        notified: Boolean(history.is_customer_notified)
                    } as Prisma.InputJsonValue
                },
                update: {
                    sessionId,
                    timestamp,
                    metadata: {
                        orderId: order?.increment_id || null,
                        status: status || null,
                        comment: history.comment || null
                    } as Prisma.InputJsonValue
                }
            });
            events += 1;
        }

        return { sessions: 1, events };
    }

    /**
     * Resolve the canonical CustomerProfile id for an order, creating a minimal
     * profile when the order's customer was not synced (e.g. guest checkout).
     * Mirrors the externalIds.adobe_commerce lookup used by the customer sync.
     */
    private static async resolveCustomerProfileId(instance: ConnectorRecord, order: any): Promise<string> {
        const adobeCustomerId = order?.customer_id != null ? String(order.customer_id) : null;
        const email = String(order?.customer_email || order?.billing_address?.email || '').trim().toLowerCase();
        const emailHash = email ? crypto.createHash('sha256').update(email).digest('hex') : null;

        if (adobeCustomerId) {
            const byExternalId = await prisma.customerProfile.findFirst({
                where: {
                    siteId: instance.siteId,
                    tenantId: instance.tenantId,
                    externalIds: { path: ['adobe_commerce'], equals: adobeCustomerId }
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
        const seed = adobeCustomerId
            ? `cust:${instance.siteId}:${adobeCustomerId}`
            : `guest:${instance.siteId}:${order?.entity_id || order?.increment_id}`;
        const profileId = stableUuid(seed);

        await prisma.customerProfile.upsert({
            where: { id: profileId },
            create: {
                id: profileId,
                siteId: instance.siteId,
                tenantId: instance.tenantId,
                connectorInstanceId: instance.id,
                externalIds: (adobeCustomerId ? { adobe_commerce: adobeCustomerId } : {}) as Prisma.InputJsonValue,
                emailHash: emailHash || undefined,
                lifecycleState: adobeCustomerId ? 'RETURNING' : 'NEW_GUEST',
                metadata: {
                    source: 'adobe-commerce-journey-sync',
                    adobeCustomerId: adobeCustomerId || null,
                    isGuest: Boolean(order?.customer_is_guest),
                    firstName: order?.customer_firstname || null,
                    lastName: order?.customer_lastname || null,
                    email: email || null,
                    connectorInstanceId: instance.id
                } as Prisma.InputJsonValue
            },
            update: {}
        });

        return profileId;
    }

    /**
     * Magento timestamps come back as "2026-06-03 11:37:34" in UTC with no zone
     * marker; `new Date()` would treat that as local time. Normalize to a real
     * UTC instant. Returns null on empty/unparseable input.
     */
    private static toMagentoDate(value: any): Date | null {
        if (!value) return null;
        const str = String(value).trim();
        const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)
            ? str.replace(' ', 'T') + 'Z'
            : str;
        const d = new Date(normalized);
        return isNaN(d.getTime()) ? null : d;
    }

    /**
     * Magento has no standard traffic-source field; some installs persist it via
     * extension attributes or a custom order attribute. Probe the common spots and
     * fall back to null so the column stays honest rather than fabricated.
     */
    private static extractTrafficSource(order: any): string | null {
        const candidates = [
            order?.extension_attributes?.traffic_source,
            order?.extension_attributes?.source,
            order?.source_name,
            order?.traffic_source
        ];
        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim().length > 0) {
                return candidate.trim();
            }
        }
        return null;
    }

    private static parseCredentials(serialized: string | null | undefined): Record<string, any> {
        if (!serialized) return {};
        try {
            const parsed = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
            if (!parsed || typeof parsed !== 'object') return {};
            if (parsed.accessToken) return parsed;

            const altToken = parsed.adminApiToken || parsed.adminApiAccessToken || parsed.token || parsed.apiKey || parsed.api_key || parsed.bearerToken;
            if (altToken) {
                return { ...parsed, accessToken: String(altToken) };
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

export default AdobeCommerceJourneySyncService;
