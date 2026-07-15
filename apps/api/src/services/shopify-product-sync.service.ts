import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma, decryptSecret } from '@kpi-platform/db';
import { getDataPlaneClient } from '../lib/tenant-prisma';
import {
    getSinceCursor,
    computeMaxCheckpoint,
    extractNextLink,
    PRODUCT_SYNC_TYPE,
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

/**
 * Syncs Shopify products (and their derived product categories) into the canonical
 * `canonical_products` + `canonical_product_categories` tables.
 *
 * Mirrors ShopifyCustomerSyncService: incremental checkpoints via ConnectorSyncRun,
 * cursor pagination through the Link header, per-record error isolation, and a
 * checkpoint that only advances on a fully successful run.
 */
export class ShopifyProductSyncService {
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

        if (!instance) {
            throw new Error('Integration instance not found.');
        }

        if (instance.providerId !== 'shopify') {
            throw new Error(`Provider "${instance.providerId}" is not supported by ShopifyProductSyncService.`);
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

        // DATA-PLANE routing: canonical products/categories live in the
        // integration's physical store DB when the data plane is enabled (else
        // this is the shared control client). Connector bookkeeping stays on `prisma`.
        const db = await getDataPlaneClient(instance.id);

        const runId = crypto.randomUUID();
        const startedAt = new Date();

        await prisma.connectorSyncRun.create({
            data: {
                id: runId,
                connectorInstanceId,
                syncType: PRODUCT_SYNC_TYPE,
                status: 'RUNNING',
                startedAt,
                recordsFetched: 0,
                recordsProcessed: 0,
                recordsFailed: 0
            }
        });

        try {
            // Incremental cursor: only products updated since the last successful run (minus
            // overlap). Null on the first run → full backfill.
            const since = await getSinceCursor(connectorInstanceId, PRODUCT_SYNC_TYPE);

            const products = await this.fetchProducts({
                shopDomain,
                adminApiAccessToken,
                apiVersion,
                since
            });

            let created = 0;
            let updated = 0;
            let failed = 0;

            for (const product of products) {
                try {
                    const result = await this.upsertProduct(db, instance, product);
                    if (result === 'created') {
                        created += 1;
                    } else {
                        updated += 1;
                    }
                } catch (err) {
                    failed += 1;
                    console.error('[ShopifyProductSyncService] Failed to persist product', {
                        connectorInstanceId,
                        productId: product?.id,
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
                    recordsFetched: products.length,
                    recordsProcessed: created + updated,
                    recordsFailed: failed,
                    // Advance the checkpoint ONLY on a fully successful run; PARTIAL leaves it null
                    // so the cursor is not advanced and failed records are retried next run.
                    checkpointValue: failed > 0 ? null : computeMaxCheckpoint(products, ['updated_at', 'created_at'], 'shopify')
                }
            });

            await prisma.connectorInstance.update({
                where: { id: connectorInstanceId },
                data: { lastSyncAt: finishedAt, lastAttemptAt: startedAt }
            });

            console.log('[ShopifyProductSyncService] Sync completed', {
                runId,
                fetched: products.length,
                created,
                updated,
                failed
            });

            return {
                runId,
                fetched: products.length,
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

            console.error('[ShopifyProductSyncService] Sync failed', errorPayload);
            throw err;
        }
    }

    private static async fetchProducts(input: {
        shopDomain: string;
        adminApiAccessToken: string;
        apiVersion: string;
        since: Date | null;
    }): Promise<any[]> {
        const normalizedShopDomain = this.normalizeShopDomain(input.shopDomain);
        const baseUrl = `https://${normalizedShopDomain}/admin/api/${input.apiVersion}`;

        console.log('[ShopifyProductSyncService] fetchProducts:start', {
            shopDomain: input.shopDomain,
            normalizedShopDomain,
            apiVersion: input.apiVersion,
            since: input.since?.toISOString() || null
        });

        const firstUrl = new URL(`${baseUrl}/products.json`);
        firstUrl.searchParams.set('limit', '250');
        if (input.since) {
            firstUrl.searchParams.set('updated_at_min', input.since.toISOString());
        }

        const fetchFunc: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;

        const products: any[] = [];
        // Cursor pagination via the Link header; the next URL carries its own page_info + limit.
        let nextUrl: string | null = firstUrl.toString();
        let page = 0;

        while (nextUrl) {
            page += 1;
            if (page > MAX_SYNC_PAGES) {
                console.warn('[ShopifyProductSyncService] fetchProducts:page-cap-hit', { page, totalSoFar: products.length });
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
                console.error('[ShopifyProductSyncService] fetchProducts:error-response', {
                    status: response.status,
                    statusText: response.statusText,
                    body
                });
                throw new Error(`Shopify API request failed (${response.status}): ${body || response.statusText}`);
            }

            const payload = await response.json();
            const pageProducts = Array.isArray(payload?.products) ? payload.products : [];
            products.push(...pageProducts);

            nextUrl = extractNextLink(response.headers.get('link') || response.headers.get('Link'));
            if (nextUrl) {
                await delay(SHOPIFY_PAGE_DELAY_MS);
            }
        }

        console.log('[ShopifyProductSyncService] fetchProducts:complete', {
            pages: page,
            productCount: products.length
        });

        return products;
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

    /**
     * Upserts a single Shopify product into canonical_products, then syncs its derived
     * category rows into canonical_product_categories. One canonical row per Shopify product
     * (variants are collapsed): price/sku come from the first variant, inventory is summed
     * across variants.
     */
    private static async upsertProduct(db: any, instance: ConnectorRecord, rawProduct: any): Promise<'created' | 'updated'> {
        const externalId = String(rawProduct?.id || '').trim();
        if (!externalId) {
            throw new Error('Product record is missing an external identifier.');
        }

        const variants: any[] = Array.isArray(rawProduct?.variants) ? rawProduct.variants : [];
        const firstVariant = variants[0] || {};
        const name = String(rawProduct?.title || firstVariant?.title || externalId).trim();
        const sku = firstVariant?.sku ? String(firstVariant.sku).trim() : (rawProduct?.handle ? String(rawProduct.handle).trim() : null);
        const price = firstVariant?.price != null ? Number(firstVariant.price) : null;
        const inventory = variants.reduce((sum, v) => sum + (Number(v?.inventory_quantity) || 0), 0);
        const sourceUpdatedAt = rawProduct?.updated_at || rawProduct?.created_at
            ? new Date(rawProduct?.updated_at || rawProduct?.created_at)
            : null;

        const metadata = {
            handle: rawProduct?.handle || null,
            status: rawProduct?.status || null,
            productType: rawProduct?.product_type || null,
            vendor: rawProduct?.vendor || null,
            tags: rawProduct?.tags || null,
            variantCount: variants.length,
            imageUrl: rawProduct?.image?.src || rawProduct?.images?.[0]?.src || null,
            connectorInstanceId: instance.id,
            connectorLabel: instance.label,
            lastSyncedAt: new Date().toISOString()
        } as Prisma.InputJsonValue;

        const existing = await db.canonicalProduct.findUnique({
            where: {
                siteId_tenantId_sourceSystem_productId: {
                    siteId: instance.siteId,
                    tenantId: instance.tenantId,
                    sourceSystem: 'shopify',
                    productId: externalId
                }
            },
            select: { id: true }
        });

        if (existing) {
            await db.canonicalProduct.update({
                where: { id: existing.id },
                data: {
                    name,
                    sku: sku || undefined,
                    inventory,
                    price: price != null ? new Prisma.Decimal(price) : undefined,
                    sourceUpdatedAt: sourceUpdatedAt || undefined,
                    connectorInstanceId: instance.id,
                    metadata
                }
            });
            await this.syncCategories(db, instance, externalId, rawProduct, sourceUpdatedAt);
            return 'updated';
        }

        await db.canonicalProduct.create({
            data: {
                id: crypto.randomUUID(),
                siteId: instance.siteId,
                tenantId: instance.tenantId,
                connectorInstanceId: instance.id,
                productId: externalId,
                sourceSystem: 'shopify',
                name,
                sku: sku || undefined,
                inventory,
                price: price != null ? new Prisma.Decimal(price) : undefined,
                sourceUpdatedAt: sourceUpdatedAt || undefined,
                metadata
            }
        });

        await this.syncCategories(db, instance, externalId, rawProduct, sourceUpdatedAt);
        return 'created';
    }

    /**
     * Derives category rows for a Shopify product and upserts them into
     * canonical_product_categories. Shopify collections require separate API calls, so the
     * primary category is derived from `product_type`; each distinct product tag is stored as
     * a secondary category so category-affinity analytics have something to group on.
     */
    private static async syncCategories(
        db: any,
        instance: ConnectorRecord,
        productId: string,
        rawProduct: any,
        sourceUpdatedAt: Date | null
    ): Promise<void> {
        const primary = String(rawProduct?.product_type || '').trim();
        const categories: Array<{ name: string; isPrimary: boolean }> = [];

        if (primary) {
            categories.push({ name: primary, isPrimary: true });
        }

        const rawTags = rawProduct?.tags;
        const tags: string[] = Array.isArray(rawTags)
            ? rawTags.map((t: any) => String(t).trim())
            : String(rawTags || '').split(',').map((t) => t.trim());

        for (const tag of tags) {
            if (tag && tag.toLowerCase() !== primary.toLowerCase() && !categories.some((c) => c.name.toLowerCase() === tag.toLowerCase())) {
                categories.push({ name: tag, isPrimary: categories.length === 0 });
            }
        }

        for (const category of categories) {
            await db.canonicalProductCategory.upsert({
                where: {
                    siteId_tenantId_sourceSystem_productId_categoryName: {
                        siteId: instance.siteId,
                        tenantId: instance.tenantId,
                        sourceSystem: 'shopify',
                        productId,
                        categoryName: category.name
                    }
                },
                create: {
                    id: crypto.randomUUID(),
                    siteId: instance.siteId,
                    tenantId: instance.tenantId,
                    connectorInstanceId: instance.id,
                    productId,
                    sourceSystem: 'shopify',
                    categoryName: category.name,
                    categoryPath: category.name,
                    isPrimary: category.isPrimary,
                    sourceUpdatedAt: sourceUpdatedAt || undefined
                },
                update: {
                    connectorInstanceId: instance.id,
                    categoryPath: category.name,
                    isPrimary: category.isPrimary,
                    sourceUpdatedAt: sourceUpdatedAt || undefined
                }
            });
        }
    }

    private static parseCredentials(encryptedSecret: any): Record<string, any> {
        // Decrypts the AES-256-GCM envelope in memory (with legacy-plaintext fallback).
        // Never log the returned credentials.
        return decryptSecret(encryptedSecret);
    }
}
