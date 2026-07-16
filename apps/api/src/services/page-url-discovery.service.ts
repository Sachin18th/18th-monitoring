import { decryptSecret } from '@kpi-platform/db';
import { getDataPlaneClient } from '../lib/tenant-prisma';

/**
 * Per-page-type URL discovery for PageSpeed measurement.
 *
 * Resolves a small, SAMPLED, representative set of PDP / PLP (and where possible
 * checkout) URLs per connector — never the full catalog. Results are persisted to
 * `discovered_page_urls` and re-discovered on a schedule (default weekly), not on
 * every PSI run. PSI measures the rank-0 URL per page type; the remaining sampled
 * URLs are retained for coverage reporting and rotation.
 *
 * Hard sampling caps (ceilings, not guarantees — fewer is fine, never padded):
 *   PDP: 50   PLP: 50   checkout: 1
 *
 * Storefront domain is resolved SEPARATELY from the API/admin host per platform —
 * never assumed equal (confirmed wrong for Shopify, whose myshopify.com API host
 * differs from the mapped custom storefront domain).
 */

export type DiscoveryPageType = 'pdp' | 'plp' | 'checkout';
export type UrlResolutionMethod = 'api_field' | 'constructed' | 'static';

export const DISCOVERY_PAGE_TYPES: DiscoveryPageType[] = ['pdp', 'plp', 'checkout'];

export const SAMPLE_CAPS: Record<DiscoveryPageType, number> = {
    pdp: 50,
    plp: 50,
    checkout: 1,
};

// Re-discover only after this long. Catalogs change (a deleted product 404s on PSI),
// but discovery is comparatively expensive, so we cache the sample and refresh weekly.
export const DISCOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface DiscoveredUrl {
    pageType: DiscoveryPageType;
    url: string;
    method: UrlResolutionMethod;
    rank: number;
}

export interface PageTypeCoverage {
    found: number;
    target: number;
    /** true when the achievable sample is meaningfully below target (label as "limited"). */
    limited: boolean;
    /** Optional human-readable reason when a page type could not be sampled at all. */
    note?: string;
}

export interface DiscoveryResult {
    storefrontDomain: string | null;
    urls: DiscoveredUrl[];
    coverage: Record<DiscoveryPageType, PageTypeCoverage>;
}

// Loose shape — matches the connector projection PageSpeedService already loads.
export interface DiscoveryConnector {
    id: string;
    tenantId: string;
    siteId: string;
    providerId: string;
    syncConfig: any;
    credentials?: Array<{ encryptedSecret: any }> | null;
}

const FETCH_TIMEOUT_MS = Number(process.env.PAGE_DISCOVERY_FETCH_TIMEOUT_MS || 12000);

export class PageUrlDiscoveryService {
    // ─── Public API ─────────────────────────────────────────────────────────

    /**
     * Discover + persist the sampled URL set for a connector. `publicStoreUrl` is the
     * storefront base already resolved by PageSpeedService.resolveStoreUrl (used as-is
     * for Adobe/BigCommerce; Shopify resolves its mapped custom domain internally).
     * Best-effort: returns a result with whatever was found, never throws for a single
     * page-type failure.
     */
    static async discoverAndPersist(connector: DiscoveryConnector, publicStoreUrl: string | null): Promise<DiscoveryResult> {
        const result = await this.discover(connector, publicStoreUrl);
        await this.persist(connector, result.urls).catch((error) => {
            console.warn('[PageUrlDiscovery] persist-failed', {
                connectorId: connector.id,
                error: error instanceof Error ? error.message : String(error),
            });
        });
        return result;
    }

    /** Run discovery without persisting. */
    static async discover(connector: DiscoveryConnector, publicStoreUrl: string | null): Promise<DiscoveryResult> {
        try {
            switch (connector.providerId) {
                case 'shopify':
                    return await this.discoverShopify(connector, publicStoreUrl);
                case 'bigcommerce':
                    return await this.discoverBigCommerce(connector, publicStoreUrl);
                case 'adobe_commerce':
                    return await this.discoverAdobe(connector, publicStoreUrl);
                default:
                    return this.emptyResult(publicStoreUrl);
            }
        } catch (error) {
            console.warn('[PageUrlDiscovery] discover-failed', {
                connectorId: connector.id,
                providerId: connector.providerId,
                error: error instanceof Error ? error.message : String(error),
            });
            return this.emptyResult(publicStoreUrl);
        }
    }

    /**
     * Return the persisted sample for a connector plus whether it is stale (older than
     * the TTL) or absent. The caller decides whether to re-discover.
     */
    static async readPersisted(connectorInstanceId: string): Promise<{
        byType: Record<DiscoveryPageType, DiscoveredUrl[]>;
        newestAt: Date | null;
        stale: boolean;
        empty: boolean;
    }> {
        // discovered_page_urls is store-payload data → read from the integration's
        // physical store DB (control-plane client when the data plane is off).
        const db = await getDataPlaneClient(connectorInstanceId);
        const rows = await db.discoveredPageUrl.findMany({
            where: { connectorInstanceId },
            orderBy: [{ pageType: 'asc' }, { rank: 'asc' }],
        });

        const byType: Record<DiscoveryPageType, DiscoveredUrl[]> = { pdp: [], plp: [], checkout: [] };
        let newestAt: Date | null = null;
        for (const row of rows) {
            const pt = row.pageType as DiscoveryPageType;
            if (!byType[pt]) continue;
            byType[pt].push({ pageType: pt, url: row.resolvedUrl, method: row.urlResolutionMethod, rank: row.rank });
            if (!newestAt || row.discoveredAt > newestAt) newestAt = row.discoveredAt;
        }

        const empty = rows.length === 0;
        const stale = empty || !newestAt || (Date.now() - newestAt.getTime()) > DISCOVERY_TTL_MS;
        return { byType, newestAt, stale, empty };
    }

    /** Replace the persisted sample (one row per discovered URL) for the page types present in `urls`. */
    static async persist(connector: DiscoveryConnector, urls: DiscoveredUrl[]): Promise<void> {
        const pageTypes = Array.from(new Set(urls.map((u) => u.pageType)));
        if (pageTypes.length === 0) return;

        const now = new Date();
        // Persist into the integration's physical store DB (fails closed when the
        // data plane is enabled but the store DB isn't active; the caller in
        // discoverAndPersist swallows that so a single store can't break discovery).
        const db = await getDataPlaneClient(connector.id);
        await db.$transaction(async (tx: any) => {
            // Re-discovery fully replaces the prior sample for these page types so a
            // shrunken catalog never leaves stale (possibly 404ing) URLs behind.
            await tx.discoveredPageUrl.deleteMany({
                where: { connectorInstanceId: connector.id, pageType: { in: pageTypes } },
            });
            if (urls.length === 0) return;
            await tx.discoveredPageUrl.createMany({
                data: urls.map((u) => ({
                    connectorInstanceId: connector.id,
                    siteId: connector.siteId,
                    pageType: u.pageType,
                    resolvedUrl: u.url,
                    urlResolutionMethod: u.method,
                    rank: u.rank,
                    discoveredAt: now,
                })),
                skipDuplicates: true,
            });
        });
    }

    // ─── Shopify ────────────────────────────────────────────────────────────

    private static async discoverShopify(connector: DiscoveryConnector, publicStoreUrl: string | null): Promise<DiscoveryResult> {
        const config = connector.syncConfig || {};
        const apiHost = this.normalizeShopDomain(config.shopDomain);
        const apiVersion = String(config.apiVersion || '2024-01').trim();
        const creds = this.credentials(connector);
        const token = String(creds.adminApiAccessToken || creds.accessToken || creds.access_token || creds.token || '').trim();

        const coverage = this.initialCoverage();
        if (!apiHost || !token) {
            console.warn('[PageUrlDiscovery] shopify:missing-credentials', { connectorId: connector.id, hasHost: Boolean(apiHost), hasToken: Boolean(token) });
            return { storefrontDomain: publicStoreUrl, urls: [], coverage };
        }

        const apiBase = `https://${apiHost}/admin/api/${apiVersion}`;
        const headers = { 'X-Shopify-Access-Token': token, Accept: 'application/json', 'Content-Type': 'application/json' };

        // Storefront domain != API host. Pull the canonical mapped domain from shop.json.
        const storefront = (await this.resolveShopifyStorefront(apiBase, headers)) || publicStoreUrl;
        const base = storefront ? storefront.replace(/\/$/, '') : null;
        if (!base) {
            return { storefrontDomain: storefront, urls: [], coverage };
        }

        const urls: DiscoveredUrl[] = [];

        // PDP — active + published products only.
        try {
            const productsUrl = new URL(`${apiBase}/products.json`);
            productsUrl.searchParams.set('limit', String(SAMPLE_CAPS.pdp));
            productsUrl.searchParams.set('status', 'active');
            const payload = await this.getJson(productsUrl.toString(), headers);
            const products: any[] = Array.isArray(payload?.products) ? payload.products : [];
            const handles = products
                .filter((p) => p?.published_at != null && typeof p?.handle === 'string' && p.handle.trim())
                .map((p) => String(p.handle).trim())
                .slice(0, SAMPLE_CAPS.pdp);
            handles.forEach((handle, i) => urls.push({ pageType: 'pdp', url: `${base}/products/${handle}`, method: 'constructed', rank: i }));
            coverage.pdp.found = handles.length;
        } catch (error) {
            this.logTypeFailure(connector, 'pdp', error);
        }

        // PLP — merge custom + smart collections, exclude the auto-generated frontpage.
        try {
            const [custom, smart] = await Promise.all([
                this.getJson(`${apiBase}/custom_collections.json?limit=250`, headers).catch(() => ({})),
                this.getJson(`${apiBase}/smart_collections.json?limit=250`, headers).catch(() => ({})),
            ]);
            const collections = [
                ...(Array.isArray(custom?.custom_collections) ? custom.custom_collections : []),
                ...(Array.isArray(smart?.smart_collections) ? smart.smart_collections : []),
            ];
            const seen = new Set<string>();
            const handles: string[] = [];
            for (const c of collections) {
                const handle = typeof c?.handle === 'string' ? c.handle.trim() : '';
                if (!handle || handle === 'frontpage' || seen.has(handle)) continue;
                seen.add(handle);
                handles.push(handle);
                if (handles.length >= SAMPLE_CAPS.plp) break;
            }
            handles.forEach((handle, i) => urls.push({ pageType: 'plp', url: `${base}/collections/${handle}`, method: 'constructed', rank: i }));
            coverage.plp.found = handles.length;
        } catch (error) {
            this.logTypeFailure(connector, 'plp', error);
        }

        // Checkout — Shopify's hosted checkout needs a populated cart created via the
        // Storefront API (no token stored, and adding credential storage is out of
        // scope). Measure the /cart page instead: it always renders, is a real funnel
        // page, and needs no extra credentials. Labeled as the cart page downstream so
        // it's never mistaken for the hosted checkout step.
        urls.push({ pageType: 'checkout', url: `${base}/cart`, method: 'static', rank: 0 });
        coverage.checkout.found = 1;

        this.finalizeCoverage(coverage);
        return { storefrontDomain: storefront, urls, coverage };
    }

    private static async resolveShopifyStorefront(apiBase: string, headers: Record<string, string>): Promise<string | null> {
        try {
            const payload = await this.getJson(`${apiBase}/shop.json`, headers);
            const shop = payload?.shop || {};
            const domain = String(shop.domain || shop.myshopify_domain || '').trim();
            return domain ? this.toHttps(domain) : null;
        } catch (error) {
            console.warn('[PageUrlDiscovery] shopify:shop.json-failed', { error: error instanceof Error ? error.message : String(error) });
            return null;
        }
    }

    // ─── BigCommerce ──────────────────────────────────────────────────────────

    private static async discoverBigCommerce(connector: DiscoveryConnector, publicStoreUrl: string | null): Promise<DiscoveryResult> {
        const config = connector.syncConfig || {};
        const storeHash = String(config.storeHash || config.store_hash || '').trim();
        const creds = this.credentials(connector);
        const token = String(creds.accessToken || creds.token || creds.storeApiToken || '').trim();

        const coverage = this.initialCoverage();
        const storefront = publicStoreUrl ? publicStoreUrl.replace(/\/$/, '') : null;
        if (!storeHash || !token || !storefront) {
            console.warn('[PageUrlDiscovery] bigcommerce:missing-prereqs', { connectorId: connector.id, hasHash: Boolean(storeHash), hasToken: Boolean(token), hasStorefront: Boolean(storefront) });
            return { storefrontDomain: storefront, urls: [], coverage };
        }

        const apiBase = `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog`;
        const headers = { 'X-Auth-Token': token, Accept: 'application/json', 'Content-Type': 'application/json' };
        const urls: DiscoveredUrl[] = [];

        // PDP — visible products only; custom_url.url is the full storefront path.
        try {
            const productsUrl = new URL(`${apiBase}/products`);
            productsUrl.searchParams.set('limit', String(SAMPLE_CAPS.pdp));
            productsUrl.searchParams.set('is_visible', 'true');
            const payload = await this.getJson(productsUrl.toString(), headers);
            const products: any[] = Array.isArray(payload?.data) ? payload.data : [];
            const paths = products
                .filter((p) => p?.is_visible !== false && typeof p?.custom_url?.url === 'string' && p.custom_url.url.trim())
                .map((p) => String(p.custom_url.url).trim())
                .slice(0, SAMPLE_CAPS.pdp);
            paths.forEach((path, i) => urls.push({ pageType: 'pdp', url: this.joinPath(storefront, path), method: 'api_field', rank: i }));
            coverage.pdp.found = paths.length;
        } catch (error) {
            this.logTypeFailure(connector, 'pdp', error);
        }

        // PLP — categories carry custom_url.url directly.
        try {
            const payload = await this.getJson(`${apiBase}/categories?limit=${SAMPLE_CAPS.plp}`, headers);
            const categories: any[] = Array.isArray(payload?.data) ? payload.data : [];
            const paths = categories
                .filter((c) => typeof c?.custom_url?.url === 'string' && c.custom_url.url.trim())
                .map((c) => String(c.custom_url.url).trim())
                .slice(0, SAMPLE_CAPS.plp);
            paths.forEach((path, i) => urls.push({ pageType: 'plp', url: this.joinPath(storefront, path), method: 'api_field', rank: i }));
            coverage.plp.found = paths.length;
        } catch (error) {
            this.logTypeFailure(connector, 'plp', error);
        }

        // Checkout — static path (cart-population is explicitly out of scope this phase).
        urls.push({ pageType: 'checkout', url: `${storefront}/checkout`, method: 'static', rank: 0 });
        coverage.checkout.found = 1;

        this.finalizeCoverage(coverage);
        return { storefrontDomain: storefront, urls, coverage };
    }

    // ─── Adobe Commerce ─────────────────────────────────────────────────────────

    private static async discoverAdobe(connector: DiscoveryConnector, publicStoreUrl: string | null): Promise<DiscoveryResult> {
        const config = connector.syncConfig || {};
        const apiBase = this.normalizeBase(config.baseUrl || config.storeUrl);
        const storefront = (publicStoreUrl || this.toHttps(config.storeUrl || config.baseUrl) || '')?.replace(/\/$/, '') || null;
        const creds = this.credentials(connector);
        const token = String(creds.accessToken || creds.adminApiToken || creds.adminApiAccessToken || creds.token || creds.apiKey || '').trim();

        const coverage = this.initialCoverage();
        if (!apiBase || !storefront || !token) {
            console.warn('[PageUrlDiscovery] adobe:missing-prereqs', { connectorId: connector.id, hasApiBase: Boolean(apiBase), hasStorefront: Boolean(storefront), hasToken: Boolean(token) });
            return { storefrontDomain: storefront, urls: [], coverage };
        }

        const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' };
        // Store-configurable URL suffixes (Magento default = .html). Allow override.
        const productSuffix = this.normalizeSuffix(config.productUrlSuffix ?? config.product_url_suffix, '.html');
        const categorySuffix = this.normalizeSuffix(config.categoryUrlSuffix ?? config.category_url_suffix, '.html');
        const urls: DiscoveredUrl[] = [];

        // PDP — visible (visibility=4 catalog+search), enabled products; read url_key.
        try {
            const productsUrl = new URL(`${apiBase}/rest/V1/products`);
            productsUrl.searchParams.set('searchCriteria[pageSize]', String(SAMPLE_CAPS.pdp));
            productsUrl.searchParams.set('searchCriteria[filterGroups][0][filters][0][field]', 'visibility');
            productsUrl.searchParams.set('searchCriteria[filterGroups][0][filters][0][value]', '4');
            productsUrl.searchParams.set('searchCriteria[filterGroups][1][filters][0][field]', 'status');
            productsUrl.searchParams.set('searchCriteria[filterGroups][1][filters][0][value]', '1');
            const payload = await this.getJson(productsUrl.toString(), headers);
            const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
            const keys = items
                .map((p) => this.readCustomAttribute(p, 'url_key'))
                .filter((k): k is string => Boolean(k))
                .slice(0, SAMPLE_CAPS.pdp);
            keys.forEach((key, i) => urls.push({ pageType: 'pdp', url: `${storefront}/${key}${productSuffix}`, method: 'constructed', rank: i }));
            coverage.pdp.found = keys.length;
        } catch (error) {
            this.logTypeFailure(connector, 'pdp', error);
        }

        // PLP — use the FLAT categories/list endpoint (the tree endpoint omits url_key).
        try {
            const categoriesUrl = new URL(`${apiBase}/rest/V1/categories/list`);
            categoriesUrl.searchParams.set('searchCriteria[pageSize]', String(SAMPLE_CAPS.plp * 3));
            categoriesUrl.searchParams.set('searchCriteria[filterGroups][0][filters][0][field]', 'is_active');
            categoriesUrl.searchParams.set('searchCriteria[filterGroups][0][filters][0][value]', '1');
            const payload = await this.getJson(categoriesUrl.toString(), headers);
            const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
            const paths = items
                .filter((c) => Number(c?.level) > 1) // skip root / default category
                // url_path holds the FULL nested path (e.g. "women/style/clogs"); url_key is
                // only the last segment ("clogs"), which drops ancestor categories from the URL.
                .map((c) => this.readCustomAttribute(c, 'url_path') ?? this.readCustomAttribute(c, 'url_key'))
                .filter((k): k is string => Boolean(k))
                .map((k) => k.replace(/^\/+/, '')) // guard against a leading slash in url_path
                .slice(0, SAMPLE_CAPS.plp);
            paths.forEach((path, i) => urls.push({ pageType: 'plp', url: `${storefront}/${path}${categorySuffix}`, method: 'constructed', rank: i }));
            coverage.plp.found = paths.length;
        } catch (error) {
            this.logTypeFailure(connector, 'plp', error);
        }

        // Checkout — static cart page (renders without a populated cart; measurable).
        urls.push({ pageType: 'checkout', url: `${storefront}/checkout/cart`, method: 'static', rank: 0 });
        coverage.checkout.found = 1;

        this.finalizeCoverage(coverage);
        return { storefrontDomain: storefront, urls, coverage };
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private static credentials(connector: DiscoveryConnector): Record<string, any> {
        return decryptSecret(connector.credentials?.[0]?.encryptedSecret);
    }

    private static initialCoverage(): Record<DiscoveryPageType, PageTypeCoverage> {
        return {
            pdp: { found: 0, target: SAMPLE_CAPS.pdp, limited: false },
            plp: { found: 0, target: SAMPLE_CAPS.plp, limited: false },
            checkout: { found: 0, target: SAMPLE_CAPS.checkout, limited: false },
        };
    }

    // A page type is "limited" when it found at least one URL but fewer than half the
    // target (or zero). Zero-found is flagged so the dashboard labels it, not padded.
    private static finalizeCoverage(coverage: Record<DiscoveryPageType, PageTypeCoverage>): void {
        for (const pt of DISCOVERY_PAGE_TYPES) {
            const c = coverage[pt];
            if (c.note) continue; // already explicitly labeled
            c.limited = c.found === 0 || c.found < Math.ceil(c.target / 2);
        }
    }

    private static emptyResult(publicStoreUrl: string | null): DiscoveryResult {
        return { storefrontDomain: publicStoreUrl, urls: [], coverage: this.initialCoverage() };
    }

    private static logTypeFailure(connector: DiscoveryConnector, pageType: DiscoveryPageType, error: unknown): void {
        console.warn('[PageUrlDiscovery] type-discovery-failed', {
            connectorId: connector.id,
            providerId: connector.providerId,
            pageType,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    private static normalizeShopDomain(value: unknown): string {
        const raw = String(value || '').trim();
        if (!raw) return '';
        return raw.replace(/^https?:\/\//i, '').split('/')[0].replace(/\/+$/, '').trim();
    }

    private static toHttps(value: unknown): string | null {
        const raw = String(value || '').trim();
        if (!raw) return null;
        const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        try {
            return new URL(withProtocol).toString().replace(/\/$/, '');
        } catch {
            return null;
        }
    }

    private static normalizeBase(value: unknown): string | null {
        const url = this.toHttps(value);
        return url ? url.replace(/\/$/, '') : null;
    }

    private static joinPath(base: string, path: string): string {
        const cleanBase = base.replace(/\/$/, '');
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        return `${cleanBase}${cleanPath}`;
    }

    private static normalizeSuffix(value: unknown, fallback: string): string {
        if (value === undefined || value === null) return fallback;
        const raw = String(value).trim();
        if (raw === '') return '';
        return raw.startsWith('.') ? raw : `.${raw}`;
    }

    private static readCustomAttribute(entity: any, code: string): string | null {
        const direct = entity?.[code];
        if (typeof direct === 'string' && direct.trim()) return direct.trim();
        const attrs: any[] = Array.isArray(entity?.custom_attributes) ? entity.custom_attributes : [];
        const found = attrs.find((attr) => attr?.attribute_code === code);
        const value = found?.value;
        return typeof value === 'string' && value.trim() ? value.trim() : null;
    }

    private static async getJson(requestUrl: string, headers: Record<string, string>): Promise<any> {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            const fetchFn: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;
            const controller = new AbortController();
            timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
            const response = await fetchFn(requestUrl, { method: 'GET', headers, signal: controller.signal });
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(`GET ${requestUrl} -> ${response.status} ${response.statusText} ${body.slice(0, 160)}`);
            }
            return await response.json();
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }
}
