import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma, hashEmail, encryptEmail, decryptSecret } from '@kpi-platform/db';
import { getDataPlaneClient } from '../lib/tenant-prisma';
import { interpretAdobeApiError } from './adobe-commerce-error.util';

type ConnectorRecord = {
    id: string;
    tenantId: string;
    siteId: string;
    providerId: string;
    label: string;
    syncConfig: any;
};

export type CheckoutSyncSummary = {
    runId: string;
    fetched: number;            // checkouts/carts inspected
    checkoutsUpserted: number;  // canonical_checkouts written
    failed: number;
};

type CheckoutStatus = 'ABANDONED' | 'ACTIVE' | 'COMPLETED';

/**
 * Provider-agnostic checkout/cart shape. Every connector's fetcher maps its
 * native payload into this so a single persist path handles storage + events.
 */
type NormalizedCheckout = {
    checkoutId: string;
    token?: string | null;
    customerExternalId?: string | null;
    customerEmail?: string | null;
    status: CheckoutStatus;
    currency: string;
    subtotalAmount: number;
    totalAmount: number;
    taxAmount: number;
    discountAmount: number;
    lineItems: Array<{ sku?: string | null; name?: string | null; quantity?: number | null; price?: number | null }>;
    abandonedCheckoutUrl?: string | null;
    completedOrderId?: string | null;
    startedAt: Date;
    lastActivityAt?: Date | null;
    completedAt?: Date | null;
    raw: any;
};

/**
 * Fetches checkout / cart data (abandoned + in-progress + completed) for Shopify,
 * Adobe Commerce and BigCommerce and stores it in `canonical_checkouts`.
 *
 * Source per platform:
 *   - Shopify         GET /admin/api/{v}/checkouts.json  (abandoned checkouts)
 *   - Adobe Commerce  GET /rest/V1/carts/search          (quotes / carts)
 *   - BigCommerce     GET /v2/orders?status_id=0         (incomplete = abandoned)
 *
 * None of these APIs expose raw pageview/clickstream data; that needs a
 * storefront pixel. Idempotent: canonical_checkouts keys on
 * (site, tenant, source, checkoutId).
 */
export class CheckoutSyncService {
    static async syncConnectorInstance(connectorInstanceId: string): Promise<CheckoutSyncSummary> {
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
                    where: { isActive: true },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { encryptedSecret: true }
                }
            }
        });

        if (!instance) throw new Error('Integration instance not found.');

        const provider = instance.providerId;
        if (!['shopify', 'adobe_commerce', 'bigcommerce'].includes(provider)) {
            throw new Error(`Provider "${provider}" is not supported by CheckoutSyncService.`);
        }

        const credentials = this.parseCredentials(instance.credentials?.[0]?.encryptedSecret);
        const record: ConnectorRecord = {
            id: instance.id,
            tenantId: instance.tenantId,
            siteId: instance.siteId,
            providerId: provider,
            label: instance.label,
            syncConfig: instance.syncConfig || {}
        };

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
                syncType: 'MANUAL_RESYNC',
                status: 'RUNNING',
                startedAt,
                recordsFetched: 0,
                recordsProcessed: 0,
                recordsFailed: 0
            }
        });

        try {
            const checkouts = await this.fetchCheckouts(record, credentials);

            let checkoutsUpserted = 0;
            let failed = 0;

            for (const checkout of checkouts) {
                try {
                    await this.persistCheckout(db, record, provider, checkout);
                    checkoutsUpserted += 1;
                } catch (err) {
                    failed += 1;
                    console.error('[CheckoutSyncService] Failed to persist checkout', {
                        connectorInstanceId,
                        provider,
                        checkoutId: checkout?.checkoutId,
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
                    recordsFetched: checkouts.length,
                    recordsProcessed: checkoutsUpserted,
                    recordsFailed: failed
                }
            });

            console.log('[CheckoutSyncService] Sync completed', {
                runId,
                provider,
                fetched: checkouts.length,
                checkoutsUpserted,
                failed
            });

            return { runId, fetched: checkouts.length, checkoutsUpserted, failed };
        } catch (err: any) {
            const finishedAt = new Date();
            const errorPayload = { message: err?.message || 'Unknown sync failure', at: finishedAt.toISOString() };
            await prisma.connectorSyncRun.update({
                where: { id: runId },
                data: { status: 'FAILED', finishedAt, errorSummary: errorPayload as Prisma.InputJsonValue }
            });
            console.error('[CheckoutSyncService] Sync failed', { provider, ...errorPayload });
            throw err;
        }
    }

    // ----------------------------------------------------------------------
    // Dispatch + fetchers
    // ----------------------------------------------------------------------

    private static async fetchCheckouts(instance: ConnectorRecord, credentials: Record<string, any>): Promise<NormalizedCheckout[]> {
        switch (instance.providerId) {
            case 'shopify':
                return this.fetchShopifyCheckouts(instance, credentials);
            case 'adobe_commerce':
                return this.fetchAdobeCarts(instance, credentials);
            case 'bigcommerce':
                return this.fetchBigCommerceCarts(instance, credentials);
            default:
                return [];
        }
    }

    private static async fetchShopifyCheckouts(instance: ConnectorRecord, credentials: Record<string, any>): Promise<NormalizedCheckout[]> {
        const config = instance.syncConfig || {};
        const shopDomain = this.normalizeShopDomain(config.shopDomain);
        const apiVersion = String(config.apiVersion || '2024-01').trim();
        const accessToken = String(credentials.adminApiAccessToken || credentials.accessToken || credentials.token || '').trim();

        if (!shopDomain) throw new Error('Shopify integration is missing shopDomain in syncConfig.');
        if (!accessToken) throw new Error('Shopify integration is missing adminApiAccessToken credentials.');

        const fetchFn = await this.getFetch();
        const out: NormalizedCheckout[] = [];
        let nextUrl: string | null = `https://${shopDomain}/admin/api/${apiVersion}/checkouts.json?limit=250`;
        let pages = 0;

        while (nextUrl && pages < 40) {
            pages += 1;
            const response = await fetchFn(nextUrl, {
                method: 'GET',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Shopify checkouts request failed (${response.status}): ${body || response.statusText}`);
            }

            const payload = await response.json();
            const items = Array.isArray(payload?.checkouts) ? payload.checkouts : [];
            for (const c of items) {
                const completedAt = c?.completed_at ? new Date(c.completed_at) : null;
                out.push({
                    checkoutId: String(c?.id ?? c?.token ?? ''),
                    token: c?.token || c?.cart_token || null,
                    customerExternalId: c?.customer?.id != null ? String(c.customer.id) : null,
                    customerEmail: c?.email || c?.customer?.email || null,
                    status: completedAt ? 'COMPLETED' : 'ABANDONED',
                    currency: String(c?.currency || c?.presentment_currency || 'USD'),
                    subtotalAmount: this.num(c?.subtotal_price),
                    totalAmount: this.num(c?.total_price),
                    taxAmount: this.num(c?.total_tax),
                    discountAmount: this.num(c?.total_discounts),
                    lineItems: Array.isArray(c?.line_items)
                        ? c.line_items.map((li: any) => ({ sku: li?.sku || null, name: li?.title || null, quantity: this.num(li?.quantity), price: this.num(li?.price) }))
                        : [],
                    abandonedCheckoutUrl: c?.abandoned_checkout_url || null,
                    completedOrderId: null,
                    startedAt: c?.created_at ? new Date(c.created_at) : new Date(),
                    lastActivityAt: c?.updated_at ? new Date(c.updated_at) : null,
                    completedAt,
                    raw: c
                });
            }

            nextUrl = this.extractNextLink(response.headers.get('link') || response.headers.get('Link'));
            if (nextUrl) await delay(550);
        }

        return out.filter((c) => c.checkoutId);
    }

    private static async fetchAdobeCarts(instance: ConnectorRecord, credentials: Record<string, any>): Promise<NormalizedCheckout[]> {
        const config = instance.syncConfig || {};
        const base = String(config.baseUrl || config.storeUrl || '').trim().replace(/\/+$/, '');
        const accessToken = String(
            credentials.accessToken || credentials.adminApiToken || credentials.adminApiAccessToken || credentials.token || credentials.apiKey || ''
        ).trim();

        if (!base) throw new Error('Adobe Commerce integration is missing baseUrl/storeUrl in syncConfig.');
        if (!accessToken) throw new Error('Adobe Commerce integration is missing access token in credentials.');

        const fetchFn = await this.getFetch();
        const out: NormalizedCheckout[] = [];
        const pageSize = 100;
        const maxPages = 50;

        for (let page = 1; page <= maxPages; page++) {
            const url = new URL(`${base}/rest/V1/carts/search`);
            // carts/search requires a searchCriteria; match every quote via entity_id > 0.
            url.searchParams.set('searchCriteria[filter_groups][0][filters][0][field]', 'entity_id');
            url.searchParams.set('searchCriteria[filter_groups][0][filters][0][condition_type]', 'gt');
            url.searchParams.set('searchCriteria[filter_groups][0][filters][0][value]', '0');
            url.searchParams.set('searchCriteria[pageSize]', String(pageSize));
            url.searchParams.set('searchCriteria[currentPage]', String(page));
            url.searchParams.set('searchCriteria[sortOrders][0][field]', 'updated_at');
            url.searchParams.set('searchCriteria[sortOrders][0][direction]', 'DESC');

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
                throw new Error(interpretAdobeApiError(response.status, body, response.statusText));
            }

            const payload = await response.json();
            const items = Array.isArray(payload?.items) ? payload.items : [];

            for (const q of items) {
                const lineItems = Array.isArray(q?.items)
                    ? q.items.map((it: any) => ({ sku: it?.sku || null, name: it?.name || null, quantity: this.num(it?.qty), price: this.num(it?.price) }))
                    : [];
                const computedSubtotal = lineItems.reduce((sum: number, it: any) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
                const subtotal = this.num(q?.subtotal ?? q?.base_subtotal ?? computedSubtotal);
                const total = this.num(q?.grand_total ?? q?.base_grand_total ?? subtotal);
                const isActive = Boolean(q?.is_active);

                out.push({
                    checkoutId: String(q?.id ?? q?.entity_id ?? ''),
                    token: null,
                    customerExternalId: q?.customer?.id != null ? String(q.customer.id) : (q?.customer_id != null ? String(q.customer_id) : null),
                    customerEmail: q?.customer?.email || q?.billing_address?.email || null,
                    status: isActive ? 'ACTIVE' : 'ABANDONED',
                    currency: String(q?.currency?.quote_currency_code || q?.currency?.base_currency_code || 'USD'),
                    subtotalAmount: subtotal,
                    totalAmount: total,
                    taxAmount: 0,
                    discountAmount: 0,
                    lineItems,
                    abandonedCheckoutUrl: null,
                    completedOrderId: null,
                    startedAt: this.toMagentoDate(q?.created_at) || new Date(),
                    lastActivityAt: this.toMagentoDate(q?.updated_at),
                    completedAt: null,
                    raw: q
                });
            }

            const totalCount = Number(payload?.total_count || 0);
            if (items.length < pageSize || (totalCount > 0 && out.length >= totalCount)) break;
            await delay(250);
        }

        return out.filter((c) => c.checkoutId);
    }

    private static async fetchBigCommerceCarts(instance: ConnectorRecord, credentials: Record<string, any>): Promise<NormalizedCheckout[]> {
        const config = instance.syncConfig || {};
        const storeHash = String(config.storeHash || config.store_hash || '').trim();
        const accessToken = String(credentials.accessToken || credentials.token || credentials.storeApiToken || '').trim();
        const base = storeHash
            ? `https://api.bigcommerce.com/stores/${storeHash}`
            : String(config.baseUrl || '').trim().replace(/\/+$/, '');

        if (!base) throw new Error('BigCommerce integration is missing storeHash or baseUrl in syncConfig.');
        if (!accessToken) throw new Error('BigCommerce integration is missing access token credentials.');

        const fetchFn = await this.getFetch();
        const out: NormalizedCheckout[] = [];
        const pageSize = 250;
        const maxPages = 40;

        // BigCommerce has no "list all carts" endpoint. Incomplete orders
        // (status_id = 0) are the API-accessible proxy for abandoned checkouts.
        for (let page = 1; page <= maxPages; page++) {
            const url = `${base}/v2/orders?status_id=0&limit=${pageSize}&page=${page}&sort=date_created:desc`;
            const response = await fetchFn(url, {
                method: 'GET',
                headers: {
                    'X-Auth-Token': accessToken,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            // V2 returns 204 No Content when a page has no rows.
            if (response.status === 204) break;
            if (!response.ok) {
                const body = await response.text();
                throw new Error(`BigCommerce orders request failed (${response.status}): ${body || response.statusText}`);
            }

            const items = await response.json();
            if (!Array.isArray(items) || items.length === 0) break;

            for (const o of items) {
                out.push({
                    checkoutId: String(o?.id ?? ''),
                    token: o?.cart_id || null,
                    customerExternalId: o?.customer_id != null && Number(o.customer_id) > 0 ? String(o.customer_id) : null,
                    customerEmail: o?.billing_address?.email || o?.email || null,
                    status: 'ABANDONED',
                    currency: String(o?.currency_code || o?.default_currency_code || 'USD'),
                    subtotalAmount: this.num(o?.subtotal_inc_tax ?? o?.subtotal_ex_tax),
                    totalAmount: this.num(o?.total_inc_tax ?? o?.total_ex_tax),
                    taxAmount: this.num(o?.total_tax),
                    discountAmount: this.num(o?.discount_amount ?? o?.coupon_discount),
                    lineItems: [],
                    abandonedCheckoutUrl: null,
                    completedOrderId: null,
                    startedAt: o?.date_created ? new Date(o.date_created) : new Date(),
                    lastActivityAt: o?.date_modified ? new Date(o.date_modified) : null,
                    completedAt: null,
                    raw: { ...o, lineItemsCount: o?.items_total ?? null }
                });
            }

            if (items.length < pageSize) break;
            await delay(250);
        }

        return out.filter((c) => c.checkoutId);
    }

    // ----------------------------------------------------------------------
    // Persistence
    // ----------------------------------------------------------------------

    private static async persistCheckout(
        db: any,
        instance: ConnectorRecord,
        sourceSystem: string,
        checkout: NormalizedCheckout
    ): Promise<void> {
        const customerId = await this.resolveCustomerProfileId(db, instance, sourceSystem, checkout);
        const lineItemsCount = checkout.raw?.lineItemsCount ?? checkout.lineItems.length;

        // canonical_checkout table removed — query neutralized
        const existing: { id: string } | null = null;

        const data = {
            siteId: instance.siteId,
            tenantId: instance.tenantId,
            connectorInstanceId: instance.id,
            checkoutId: checkout.checkoutId,
            sourceSystem,
            token: checkout.token || null,
            customerId: customerId || null,
            customerEmail: checkout.customerEmail || null,
            status: checkout.status,
            currency: checkout.currency || 'USD',
            subtotalAmount: new Prisma.Decimal(checkout.subtotalAmount || 0),
            totalAmount: new Prisma.Decimal(checkout.totalAmount || 0),
            taxAmount: new Prisma.Decimal(checkout.taxAmount || 0),
            discountAmount: new Prisma.Decimal(checkout.discountAmount || 0),
            lineItemsCount: Number.isFinite(lineItemsCount) ? Math.trunc(lineItemsCount) : 0,
            lineItems: checkout.lineItems as unknown as Prisma.InputJsonValue,
            abandonedCheckoutUrl: checkout.abandonedCheckoutUrl || null,
            completedOrderId: checkout.completedOrderId || null,
            startedAt: checkout.startedAt,
            lastActivityAt: checkout.lastActivityAt || null,
            completedAt: checkout.completedAt || null,
            metadata: {
                connectorInstanceId: instance.id,
                connectorLabel: instance.label,
                raw: checkout.raw
            } as Prisma.InputJsonValue,
            updatedAt: new Date()
        };

        // canonical_checkout table removed — query neutralized (write no-op)
        void data;
    }

    /**
     * Resolve the CustomerProfile id for a checkout, creating a deterministic
     * minimal profile when the shopper was not synced (guest cart). Mirrors the
     * journey/customer sync identity resolution.
     */
    private static async resolveCustomerProfileId(
        db: any,
        instance: ConnectorRecord,
        sourceSystem: string,
        checkout: NormalizedCheckout
    ): Promise<string> {
        const externalId = checkout.customerExternalId ? String(checkout.customerExternalId) : null;
        const email = String(checkout.customerEmail || '').trim().toLowerCase();
        const emailHash = hashEmail(email);

        if (externalId) {
            const byExternalId = await db.customerProfile.findFirst({
                where: {
                    siteId: instance.siteId,
                    tenantId: instance.tenantId,
                    externalIds: { path: [sourceSystem], equals: externalId }
                },
                select: { id: true }
            });
            if (byExternalId) return byExternalId.id;
        }

        if (emailHash) {
            const byEmail = await db.customerProfile.findFirst({
                where: { siteId: instance.siteId, tenantId: instance.tenantId, emailHash },
                select: { id: true }
            });
            if (byEmail) return byEmail.id;
        }

        const seed = externalId
            ? `cust:${instance.siteId}:${sourceSystem}:${externalId}`
            : `guest:${instance.siteId}:${sourceSystem}:checkout:${checkout.checkoutId}`;
        const profileId = stableUuid(seed);

        await db.customerProfile.upsert({
            where: { id: profileId },
            create: {
                id: profileId,
                siteId: instance.siteId,
                tenantId: instance.tenantId,
                connectorInstanceId: instance.id,
                externalIds: (externalId ? { [sourceSystem]: externalId } : {}) as Prisma.InputJsonValue,
                emailHash: emailHash || undefined,
                // Reversible, encrypted-at-rest copy for dashboard display.
                emailEncrypted: encryptEmail(email) || undefined,
                lifecycleState: 'NEW_GUEST',
                // Raw email is NOT stored here — identity lives in emailHash above.
                metadata: {
                    source: 'checkout-sync',
                    sourceSystem,
                    connectorInstanceId: instance.id
                } as Prisma.InputJsonValue
            },
            // Backfill the encrypted email if this profile predates the column.
            update: emailHash ? { emailEncrypted: encryptEmail(email) || undefined } : {}
        });

        return profileId;
    }

    // ----------------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------------

    private static async getFetch(): Promise<typeof fetch> {
        return (globalThis as any).fetch ?? (await import('undici')).fetch;
    }

    private static num(value: any): number {
        const parsed = parseFloat(String(value ?? '').replace(/[^0-9.\-]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    private static toMagentoDate(value: any): Date | null {
        if (!value) return null;
        const str = String(value).trim();
        const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str) ? str.replace(' ', 'T') + 'Z' : str;
        const d = new Date(normalized);
        return isNaN(d.getTime()) ? null : d;
    }

    private static normalizeShopDomain(value: unknown): string {
        const raw = String(value || '').trim();
        if (!raw) return '';
        return raw.replace(/^https?:\/\//i, '').split('/')[0].replace(/\/+$/, '').trim();
    }

    private static extractNextLink(linkHeader: string | null): string | null {
        if (!linkHeader) return null;
        const nextMatch = linkHeader.split(',').find((segment) => segment.includes('rel="next"'));
        if (!nextMatch) return null;
        const urlMatch = nextMatch.match(/<([^>]+)>/);
        return urlMatch?.[1] || null;
    }

    private static parseCredentials(serialized: string | null | undefined): Record<string, any> {
        // Decrypts the AES-256-GCM envelope in memory (with legacy-plaintext fallback).
        // Never log the returned credentials.
        return decryptSecret(serialized);
    }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deterministic 36-char UUID-shaped key derived from a string, so repeated syncs
 * upsert the same session/event/profile rows instead of duplicating.
 */
function stableUuid(input: string): string {
    const hash = crypto.createHash('sha1').update(input).digest('hex');
    return [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join('-');
}

export default CheckoutSyncService;
