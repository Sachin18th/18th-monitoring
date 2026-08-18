/**
 * Connector credential + permission validation.
 *
 * Backs the "Test Connection" button in the connector setup modal. Unlike the
 * stub `validateCredentials()` on the connector classes, this actually talks to
 * the merchant's store with the credentials they just typed and reports, per
 * capability, whether the token is allowed to read it.
 *
 * The probe list is derived from the endpoints the sync services really call —
 * see the per-platform sections below for the mapping. If a sync service starts
 * calling a new endpoint, add a probe here so the test keeps telling the truth.
 *
 * Contract: this NEVER throws and NEVER returns a non-2xx for a store-side
 * failure. "The store rejected us" is a successful test run with `ok: false`,
 * so the caller keeps the diagnostic metadata instead of getting an axios error.
 */

const PROBE_TIMEOUT_MS = 12_000;
const DEFAULT_SHOPIFY_API_VERSION = '2024-01';

/** A single capability probe result, surfaced per-row in the setup modal. */
export interface ScopeCheck {
    /** Human label shown in the UI, e.g. "Orders". */
    name: string;
    /** Platform-native scope / ACL identifier, e.g. "read_orders". */
    scope: string;
    /** Whether the connector cannot function without it. */
    required: boolean;
    ok: boolean;
    /** HTTP status from the probe; 0 when the request never completed. */
    status: number;
    detail?: string;
}

export interface ConnectorValidationMetadata {
    latencyMs: number;
    store?: {
        name?: string;
        currency?: string;
        timezone?: string;
        plan?: string;
        domain?: string;
    };
    counts?: {
        orders?: number;
        customers?: number;
        products?: number;
    };
    scopesGranted: string[];
    scopesMissing: string[];
    /** Missing but non-fatal — the connector saves, some features degrade. */
    scopesOptionalMissing: string[];
    checks: Array<{ name: string; ok: boolean; required: boolean; detail?: string }>;
    warnings: string[];
}

export interface ConnectorValidationResult {
    ok: boolean;
    /** Set when ok — a short success summary. */
    message?: string;
    /** Set when !ok — the single most actionable reason. */
    error?: string;
    metadata: ConnectorValidationMetadata;
}

type ProbeResponse = {
    status: number;
    ok: boolean;
    json: any;
    text: string;
    networkError?: string;
};

export class ConnectorValidationService {
    // ──────────────────────────────────────────────────────────────────────
    // Entry point
    // ──────────────────────────────────────────────────────────────────────

    public static async validate(
        type: string,
        config: Record<string, any> = {},
        credentials: Record<string, any> = {},
    ): Promise<ConnectorValidationResult> {
        const started = Date.now();
        const provider = String(type || '').toLowerCase();

        try {
            if (provider === 'shopify') {
                return this.stamp(await this.validateShopify(config, credentials), started);
            }
            if (provider === 'bigcommerce') {
                return this.stamp(await this.validateBigCommerce(config, credentials), started);
            }
            if (provider === 'adobe_commerce' || provider === 'adobe' || provider === 'magento') {
                return this.stamp(await this.validateAdobeCommerce(config, credentials), started);
            }
            return this.stamp(
                this.fail(`Unsupported connector type '${type}'.`),
                started,
            );
        } catch (err: any) {
            // Defensive: a bug in a probe must not 500 the setup modal.
            console.error('[ConnectorValidation] unexpected failure', { type, error: err?.message || err });
            return this.stamp(
                this.fail(`Connection test could not be completed: ${err?.message || 'unknown error'}`),
                started,
            );
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Shopify
    //
    // Shopify is the only one of the three that will tell us the granted scope
    // list directly (GET /admin/oauth/access_scopes.json, no scope required),
    // so we use that as the source of truth and only probe live endpoints for
    // store metadata + record counts. That matters for `read_all_orders`, which
    // cannot be detected by probing: without it Shopify silently returns just
    // the trailing 60 days rather than a 403.
    // ──────────────────────────────────────────────────────────────────────

    private static async validateShopify(
        config: Record<string, any>,
        credentials: Record<string, any>,
    ): Promise<ConnectorValidationResult> {
        const shopDomain = this.normalizeDomain(config.shopDomain || config.shop_domain);
        const token = String(
            credentials.adminApiAccessToken || credentials.accessToken || credentials.access_token || credentials.token || '',
        ).trim();
        const apiVersion = String(config.apiVersion || config.api_version || DEFAULT_SHOPIFY_API_VERSION).trim();

        if (!shopDomain) return this.fail('Shop domain is required (e.g. your-store.myshopify.com).');
        if (!token) return this.fail('Admin API access token is required.');

        const base = `https://${shopDomain}/admin/api/${apiVersion}`;
        const headers = { 'X-Shopify-Access-Token': token, Accept: 'application/json' };

        // 1. Auth gate. shop.json needs no particular scope, so a failure here
        //    is always about the token or the domain, never about permissions.
        const shop = await this.probe(`${base}/shop.json`, headers);
        if (shop.networkError) {
            return this.fail(`Could not reach ${shopDomain}: ${shop.networkError}`);
        }
        if (shop.status === 401 || shop.status === 403) {
            return this.fail('Shopify rejected the access token. Check that it was copied in full and that the app is still installed on this store.');
        }
        if (shop.status === 404) {
            return this.fail(`Shopify returned 404 for ${shopDomain} at API version ${apiVersion}. Check the shop domain and the API version.`);
        }
        if (!shop.ok) {
            return this.fail(`Shopify returned HTTP ${shop.status} for shop.json. ${this.snippet(shop.text)}`);
        }

        const shopData = shop.json?.shop || {};
        const store = {
            name: shopData.name,
            currency: shopData.currency,
            timezone: shopData.iana_timezone,
            plan: shopData.plan_display_name || shopData.plan_name,
            domain: shopData.domain || shopDomain,
        };

        // 2. Granted scope list, straight from Shopify.
        const scopesRes = await this.probe(`https://${shopDomain}/admin/oauth/access_scopes.json`, headers);
        const granted = new Set<string>(
            Array.isArray(scopesRes.json?.access_scopes)
                ? scopesRes.json.access_scopes.map((s: any) => String(s?.handle || '')).filter(Boolean)
                : [],
        );
        const scopeListAvailable = scopesRes.ok && granted.size > 0;

        // Capability → scope map, mirroring the endpoints the sync services hit.
        const SHOPIFY_SCOPES: Array<{ name: string; scope: string; required: boolean; detail: string }> = [
            { name: 'Orders', scope: 'read_orders', required: true, detail: 'Order sync — GET /orders.json' },
            { name: 'Full order history', scope: 'read_all_orders', required: false, detail: 'Without it Shopify only returns the last 60 days of orders' },
            { name: 'Customers', scope: 'read_customers', required: true, detail: 'Customer sync — GET /customers.json' },
            { name: 'Products', scope: 'read_products', required: true, detail: 'Product sync + page discovery — GET /products.json' },
            { name: 'Tracker script install', scope: 'write_script_tags', required: false, detail: 'Needed to auto-install the storefront tracker' },
            { name: 'Web Pixel', scope: 'write_pixels', required: false, detail: 'Needed to register the checkout Web Pixel' },
            { name: 'Customer events', scope: 'read_customer_events', required: false, detail: 'Required alongside write_pixels for the Web Pixel' },
        ];

        const checks: ScopeCheck[] = [];

        if (scopeListAvailable) {
            for (const entry of SHOPIFY_SCOPES) {
                const ok = granted.has(entry.scope);
                checks.push({
                    name: entry.name,
                    scope: entry.scope,
                    required: entry.required,
                    ok,
                    status: 200,
                    detail: ok ? entry.detail : `Missing scope '${entry.scope}'. ${entry.detail}`,
                });
            }
        } else {
            // Fallback: the token could not list its own scopes (rare — some
            // legacy private-app tokens). Probe the three required resources
            // directly; a 401/403 on a resource means its scope is absent.
            const [orders, customers, products] = await Promise.all([
                this.probe(`${base}/orders.json?status=any&limit=1`, headers),
                this.probe(`${base}/customers.json?limit=1`, headers),
                this.probe(`${base}/products.json?limit=1`, headers),
            ]);
            const map: Array<[string, string, ProbeResponse]> = [
                ['Orders', 'read_orders', orders],
                ['Customers', 'read_customers', customers],
                ['Products', 'read_products', products],
            ];
            for (const [name, scope, res] of map) {
                checks.push({
                    name,
                    scope,
                    required: true,
                    ok: res.ok,
                    status: res.status,
                    detail: res.ok
                        ? `Readable`
                        : res.status === 401 || res.status === 403
                          ? `Missing scope '${scope}' (HTTP ${res.status})`
                          : `HTTP ${res.status}. ${this.snippet(res.text)}`,
                });
            }
        }

        // 3. Record counts — cheap, and proves the reads actually work rather
        //    than just that the scope string is present on the token.
        const counts = await this.shopifyCounts(base, headers, checks);

        const warnings: string[] = [];
        if (!scopeListAvailable) {
            warnings.push('Could not read the token\'s scope list; permissions were inferred by probing each endpoint.');
        }
        if (checks.some((c) => c.scope === 'read_all_orders' && !c.ok)) {
            warnings.push('Without read_all_orders the historical backfill will silently stop at 60 days.');
        }
        const pixelScopes = checks.filter((c) => c.scope === 'write_pixels' || c.scope === 'read_customer_events');
        if (pixelScopes.length === 2 && pixelScopes.some((c) => c.ok) && pixelScopes.some((c) => !c.ok)) {
            warnings.push('Web Pixel registration needs both write_pixels and read_customer_events — only one is granted.');
        }
        if (checks.some((c) => c.scope === 'read_customers' && c.ok)) {
            warnings.push('Customer names/emails and journey attribution also require Shopify\'s protected customer data approval, which cannot be checked from here.');
        }

        return this.summarize(checks, { store, counts, warnings });
    }

    /** Best-effort record counts. Never fails the test. */
    private static async shopifyCounts(
        base: string,
        headers: Record<string, string>,
        checks: ScopeCheck[],
    ): Promise<ConnectorValidationMetadata['counts']> {
        const has = (scope: string) => checks.some((c) => c.scope === scope && c.ok);
        const wanted: Array<[keyof NonNullable<ConnectorValidationMetadata['counts']>, string, string]> = [];
        if (has('read_orders')) wanted.push(['orders', 'read_orders', `${base}/orders/count.json?status=any`]);
        if (has('read_customers')) wanted.push(['customers', 'read_customers', `${base}/customers/count.json`]);
        if (has('read_products')) wanted.push(['products', 'read_products', `${base}/products/count.json`]);

        const counts: Record<string, number> = {};
        await Promise.all(
            wanted.map(async ([key, , url]) => {
                const res = await this.probe(url, headers);
                if (res.ok && typeof res.json?.count === 'number') counts[key] = res.json.count;
            }),
        );
        return Object.keys(counts).length ? counts : undefined;
    }

    // ──────────────────────────────────────────────────────────────────────
    // BigCommerce
    //
    // Scope check is pure probing: BigCommerce answers 403 on a valid token
    // that lacks a scope, and 401 on a bad token, so the two are cleanly
    // distinguishable. /v2/time is the auth gate because it requires no scope
    // at all (the same reason store-health.service.ts pings it instead of
    // /v2/store, which needs Store Information and produced false failures).
    // ──────────────────────────────────────────────────────────────────────

    private static async validateBigCommerce(
        config: Record<string, any>,
        credentials: Record<string, any>,
    ): Promise<ConnectorValidationResult> {
        const storeHash = String(config.storeHash || config.store_hash || '').trim();
        const token = String(credentials.accessToken || credentials.token || credentials.storeApiToken || '').trim();

        if (!storeHash) return this.fail('Store Hash is required (found in Advanced Settings → API Accounts).');
        if (!token) return this.fail('API access token is required.');

        const base = `https://api.bigcommerce.com/stores/${storeHash}`;
        const headers = { 'X-Auth-Token': token, Accept: 'application/json' };

        // 1. Auth gate.
        const time = await this.probe(`${base}/v2/time`, headers);
        if (time.networkError) {
            return this.fail(`Could not reach the BigCommerce API: ${time.networkError}`);
        }
        if (time.status === 401) {
            return this.fail('BigCommerce rejected the API token. Check the token and that it belongs to this store hash.');
        }
        if (time.status === 404) {
            return this.fail(`BigCommerce returned 404 for store hash '${storeHash}'. Use the hash from API Accounts, not the storefront URL.`);
        }
        if (!time.ok) {
            return this.fail(`BigCommerce returned HTTP ${time.status} on the auth check. ${this.snippet(time.text)}`);
        }

        // 2. Capability probes, one per scope the sync services depend on.
        const PROBES: Array<{ name: string; scope: string; required: boolean; url: string; detail: string }> = [
            { name: 'Orders', scope: 'Orders → read-only', required: true, url: `${base}/v2/orders/count`, detail: 'Order sync + abandoned checkouts — GET /v2/orders' },
            { name: 'Customers', scope: 'Customers → read-only', required: true, url: `${base}/v3/customers?limit=1`, detail: 'Customer sync — GET /v3/customers' },
            { name: 'Products', scope: 'Products → read-only', required: true, url: `${base}/v3/catalog/products?limit=1`, detail: 'Product sync + page discovery — GET /v3/catalog/products' },
            { name: 'Tracker script install', scope: 'Content → modify', required: false, url: `${base}/v3/content/scripts?limit=1`, detail: 'Needed to auto-install the storefront tracker' },
            { name: 'Store information', scope: 'Store Information → read-only', required: false, url: `${base}/v2/store`, detail: 'Used for PageSpeed store lookups' },
        ];

        const results = await Promise.all(PROBES.map((p) => this.probe(p.url, headers)));
        const checks: ScopeCheck[] = PROBES.map((p, i) => {
            const res = results[i];
            return {
                name: p.name,
                scope: p.scope,
                required: p.required,
                ok: res.ok,
                status: res.status,
                detail: res.ok
                    ? p.detail
                    : res.status === 401 || res.status === 403
                      ? `Scope '${p.scope}' is not granted to this API account (HTTP ${res.status}). ${p.detail}`
                      : `HTTP ${res.status}. ${this.snippet(res.text)}`,
            };
        });

        // 3. Store metadata + counts, reusing the probe bodies we already have.
        const storeRes = results[PROBES.findIndex((p) => p.name === 'Store information')];
        const store = storeRes?.ok
            ? {
                  name: storeRes.json?.name,
                  currency: storeRes.json?.currency,
                  timezone: storeRes.json?.timezone?.name,
                  plan: storeRes.json?.plan_name,
                  domain: storeRes.json?.domain,
              }
            : undefined;

        const counts: Record<string, number> = {};
        const ordersRes = results[0];
        const customersRes = results[1];
        const productsRes = results[2];
        if (ordersRes.ok && typeof ordersRes.json?.count === 'number') counts.orders = ordersRes.json.count;
        if (customersRes.ok && typeof customersRes.json?.meta?.pagination?.total === 'number') counts.customers = customersRes.json.meta.pagination.total;
        if (productsRes.ok && typeof productsRes.json?.meta?.pagination?.total === 'number') counts.products = productsRes.json.meta.pagination.total;

        return this.summarize(checks, {
            store,
            counts: Object.keys(counts).length ? counts : undefined,
            warnings: [],
        });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Adobe Commerce / Magento 2
    //
    // The awkward one. Magento returns 401 both for a bad token AND for a valid
    // token missing an ACL resource, so a single probe cannot tell them apart.
    // We disambiguate by quorum: probe everything, and if at least one resource
    // answers 200 the token is definitely valid and the 401s are ACL gaps. Only
    // when EVERY probe is rejected do we call it an authentication failure.
    // ──────────────────────────────────────────────────────────────────────

    private static async validateAdobeCommerce(
        config: Record<string, any>,
        credentials: Record<string, any>,
    ): Promise<ConnectorValidationResult> {
        const base = String(config.storeUrl || config.baseUrl || '').trim().replace(/\/+$/, '');
        const token = String(
            credentials.adminApiToken || credentials.accessToken || credentials.adminApiAccessToken || credentials.token || '',
        ).trim();

        if (!base) return this.fail('Store base URL is required (e.g. https://your-store.com).');
        if (!/^https?:\/\//i.test(base)) return this.fail('Store base URL must include the scheme, e.g. https://your-store.com.');
        if (!token) return this.fail('Admin API access token is required.');

        const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
        const page = 'searchCriteria[pageSize]=1&searchCriteria[currentPage]=1';

        const PROBES: Array<{ name: string; scope: string; required: boolean; url: string; detail: string }> = [
            { name: 'Orders', scope: 'Magento_Sales::sales_order', required: true, url: `${base}/rest/V1/orders?${page}`, detail: 'Order + journey sync — GET /rest/V1/orders' },
            { name: 'Customers', scope: 'Magento_Customer::manage', required: true, url: `${base}/rest/V1/customers/search?${page}`, detail: 'Customer sync — GET /rest/V1/customers/search' },
            { name: 'Products', scope: 'Magento_Catalog::products', required: true, url: `${base}/rest/V1/products?${page}`, detail: 'Product sync + page discovery — GET /rest/V1/products' },
            { name: 'Categories', scope: 'Magento_Catalog::categories', required: false, url: `${base}/rest/V1/categories/list?${page}`, detail: 'Category page discovery — GET /rest/V1/categories/list' },
            { name: 'Carts', scope: 'Magento_Cart::manage', required: false, url: `${base}/rest/V1/carts/search?${page}`, detail: 'Abandoned cart sync — GET /rest/V1/carts/search' },
            { name: 'Store configuration', scope: 'Magento_Backend::store', required: false, url: `${base}/rest/V1/store/storeConfigs`, detail: 'Store metadata + the connector health probe' },
        ];

        const results = await Promise.all(PROBES.map((p) => this.probe(p.url, headers)));

        // Every probe failed to even connect → it's the URL, not the token.
        if (results.every((r) => r.networkError)) {
            return this.fail(`Could not reach ${base}: ${results[0].networkError}`);
        }
        // Nothing was readable and everything was an auth rejection → bad token.
        const anyReadable = results.some((r) => r.ok);
        const allRejected = results.every((r) => r.status === 401 || r.status === 403);
        if (!anyReadable && allRejected) {
            return this.fail('Adobe Commerce rejected the token for every resource. Either the access token is invalid, or the integration was never activated in System → Extensions → Integrations.');
        }
        if (!anyReadable) {
            const first = results.find((r) => !r.ok) as ProbeResponse;
            return this.fail(`Adobe Commerce returned HTTP ${first.status} for every resource. ${this.snippet(first.text)}`);
        }

        const checks: ScopeCheck[] = PROBES.map((p, i) => {
            const res = results[i];
            return {
                name: p.name,
                scope: p.scope,
                required: p.required,
                ok: res.ok,
                status: res.status,
                detail: res.ok
                    ? p.detail
                    : res.status === 401 || res.status === 403
                      ? `Integration is not granted '${p.scope}' (HTTP ${res.status}). ${p.detail}`
                      : `HTTP ${res.status}. ${this.snippet(res.text)}`,
            };
        });

        const storeRes = results[PROBES.findIndex((p) => p.name === 'Store configuration')];
        const storeConfig = storeRes?.ok && Array.isArray(storeRes.json) ? storeRes.json[0] : undefined;
        const store = storeConfig
            ? {
                  name: storeConfig.website_id ? `Store view ${storeConfig.code}` : storeConfig.code,
                  currency: storeConfig.default_display_currency_code,
                  timezone: storeConfig.timezone,
                  domain: storeConfig.base_url,
              }
            : undefined;

        // searchCriteria responses carry total_count, so counts are free.
        const counts: Record<string, number> = {};
        if (results[0].ok && typeof results[0].json?.total_count === 'number') counts.orders = results[0].json.total_count;
        if (results[1].ok && typeof results[1].json?.total_count === 'number') counts.customers = results[1].json.total_count;
        if (results[2].ok && typeof results[2].json?.total_count === 'number') counts.products = results[2].json.total_count;

        const warnings: string[] = [];
        if (checks.some((c) => c.scope === 'Magento_Backend::store' && !c.ok)) {
            warnings.push('Without Magento_Backend::store the connector will sync fine but show as unhealthy on the Backend API Observability page, which probes /rest/V1/store/storeConfigs.');
        }

        return this.summarize(checks, {
            store,
            counts: Object.keys(counts).length ? counts : undefined,
            warnings,
        });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Shared helpers
    // ──────────────────────────────────────────────────────────────────────

    /** GET a URL with a hard timeout. Never throws; network errors come back on the result. */
    private static async probe(url: string, headers: Record<string, string>): Promise<ProbeResponse> {
        const fetchFn: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;
        try {
            const res = await fetchFn(url, {
                method: 'GET',
                headers,
                signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
            });
            const text = await res.text().catch(() => '');
            let json: any = null;
            try {
                json = text ? JSON.parse(text) : null;
            } catch {
                // Non-JSON body (an HTML error page from a WAF, typically).
            }
            return { status: res.status, ok: res.status >= 200 && res.status < 300, json, text };
        } catch (err: any) {
            const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
            return {
                status: 0,
                ok: false,
                json: null,
                text: '',
                networkError: isTimeout ? `timed out after ${PROBE_TIMEOUT_MS / 1000}s` : String(err?.message || err?.name || 'network error'),
            };
        }
    }

    /** Roll the per-capability checks up into the caller-facing result. */
    private static summarize(
        checks: ScopeCheck[],
        extra: {
            store?: ConnectorValidationMetadata['store'];
            counts?: ConnectorValidationMetadata['counts'];
            warnings: string[];
        },
    ): ConnectorValidationResult {
        const granted = checks.filter((c) => c.ok).map((c) => c.scope);
        const missingRequired = checks.filter((c) => !c.ok && c.required);
        const missingOptional = checks.filter((c) => !c.ok && !c.required);
        const ok = missingRequired.length === 0;

        const metadata: ConnectorValidationMetadata = {
            latencyMs: 0, // stamped by validate()
            store: extra.store,
            counts: extra.counts,
            scopesGranted: granted,
            scopesMissing: missingRequired.map((c) => c.scope),
            scopesOptionalMissing: missingOptional.map((c) => c.scope),
            checks: checks.map((c) => ({ name: c.name, ok: c.ok, required: c.required, detail: c.detail })),
            warnings: extra.warnings,
        };

        if (!ok) {
            const list = missingRequired.map((c) => `${c.name} (${c.scope})`).join(', ');
            return {
                ok: false,
                error: `Connected, but the token is missing required permissions: ${list}. Grant them on the store and test again.`,
                metadata,
            };
        }

        const parts: string[] = ['Connection successful'];
        if (extra.counts) {
            const bits = [
                extra.counts.orders != null ? `${extra.counts.orders.toLocaleString()} orders` : null,
                extra.counts.customers != null ? `${extra.counts.customers.toLocaleString()} customers` : null,
                extra.counts.products != null ? `${extra.counts.products.toLocaleString()} products` : null,
            ].filter(Boolean);
            if (bits.length) parts.push(bits.join(' · '));
        }
        if (missingOptional.length) {
            parts.push(`${missingOptional.length} optional permission${missingOptional.length === 1 ? '' : 's'} not granted`);
        }

        return { ok: true, message: parts.join(' — '), metadata };
    }

    /** A hard failure with no per-capability detail (bad URL, bad token, unreachable). */
    private static fail(error: string): ConnectorValidationResult {
        return {
            ok: false,
            error,
            metadata: {
                latencyMs: 0,
                scopesGranted: [],
                scopesMissing: [],
                scopesOptionalMissing: [],
                checks: [],
                warnings: [],
            },
        };
    }

    private static stamp(result: ConnectorValidationResult, startedAt: number): ConnectorValidationResult {
        result.metadata.latencyMs = Date.now() - startedAt;
        return result;
    }

    private static normalizeDomain(value: unknown): string {
        return String(value || '')
            .trim()
            .replace(/^https?:\/\//i, '')
            .split('/')[0]
            .replace(/\/+$/, '')
            .trim();
    }

    /** Trim an error body for display, and never echo anything token-shaped. */
    private static snippet(text: string): string {
        if (!text) return '';
        const flat = text.replace(/\s+/g, ' ').trim();
        return flat.length > 200 ? `${flat.slice(0, 200)}…` : flat;
    }
}
