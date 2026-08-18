import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { ConnectorValidationService } from './connector-validation.service';

/**
 * The service resolves `fetch` off globalThis at call time, so stubbing it here
 * lets us drive every provider branch without a network. Routes are matched by
 * substring against the request URL; anything unmatched 404s, which is also how
 * we assert that a probe was *not* made.
 */
const realFetch = globalThis.fetch;
let routes: Record<string, { status: number; body: any }> = {};
let requested: string[] = [];

const ok = (body: any) => ({ status: 200, body });

beforeEach(() => {
    routes = {};
    requested = [];
    globalThis.fetch = (async (url: any) => {
        const href = String(url);
        requested.push(href);
        const key = Object.keys(routes).find((k) => href.includes(k));
        const hit = key ? routes[key] : { status: 404, body: { errors: ['Not Found'] } };
        return { status: hit.status, text: async () => JSON.stringify(hit.body) };
    }) as any;
});

afterAll(() => {
    globalThis.fetch = realFetch;
});

// ──────────────────────────────────────────────────────────────────────────
// Shopify
// ──────────────────────────────────────────────────────────────────────────

describe('Shopify validation', () => {
    const fullScopes = ['read_orders', 'read_customers', 'read_products'];
    const shopOk = ok({
        shop: { name: 'Northwind', currency: 'USD', iana_timezone: 'Asia/Kolkata', plan_display_name: 'Shopify Plus', domain: 'northwind.com' },
    });

    it('uses the granted scope list as the source of truth and harvests counts', async () => {
        routes = {
            '/shop.json': shopOk,
            '/access_scopes.json': ok({ access_scopes: fullScopes.map((handle) => ({ handle })) }),
            '/orders/count.json': ok({ count: 1234 }),
            '/customers/count.json': ok({ count: 567 }),
            '/products/count.json': ok({ count: 89 }),
        };

        const r = await ConnectorValidationService.validate('shopify', { shopDomain: 'northwind.myshopify.com' }, { adminApiAccessToken: 'shpat_x' });

        expect(r.ok).toBe(true);
        expect(r.metadata.store).toMatchObject({ name: 'Northwind', plan: 'Shopify Plus', currency: 'USD' });
        expect(r.metadata.counts).toEqual({ orders: 1234, customers: 567, products: 89 });
    });

    it('flags read_all_orders as an optional gap and explains the 60-day truncation', async () => {
        routes = {
            '/shop.json': shopOk,
            '/access_scopes.json': ok({ access_scopes: fullScopes.map((handle) => ({ handle })) }),
        };

        const r = await ConnectorValidationService.validate('shopify', { shopDomain: 'n.myshopify.com' }, { adminApiAccessToken: 't' });

        expect(r.ok).toBe(true);
        expect(r.metadata.scopesOptionalMissing).toContain('read_all_orders');
        expect(r.metadata.warnings.join(' ')).toMatch(/60 days/);
        // Tracker install and Web Pixel are optional but must still be reported.
        expect(r.metadata.scopesOptionalMissing).toEqual(
            expect.arrayContaining(['write_script_tags', 'write_pixels', 'read_customer_events']),
        );
    });

    it('fails when a required scope is absent, and skips that resource\'s count', async () => {
        routes = {
            '/shop.json': shopOk,
            '/access_scopes.json': ok({ access_scopes: [{ handle: 'read_orders' }, { handle: 'read_products' }] }),
            '/orders/count.json': ok({ count: 1 }),
            '/products/count.json': ok({ count: 2 }),
        };

        const r = await ConnectorValidationService.validate('shopify', { shopDomain: 'n.myshopify.com' }, { adminApiAccessToken: 't' });

        expect(r.ok).toBe(false);
        expect(r.metadata.scopesMissing).toEqual(['read_customers']);
        expect(r.error).toMatch(/Customers \(read_customers\)/);
        expect(r.metadata.counts?.customers).toBeUndefined();
        expect(requested.some((u) => u.includes('/customers/count.json'))).toBe(false);
    });

    it('warns when only half of the Web Pixel scope pair is granted', async () => {
        routes = {
            '/shop.json': shopOk,
            '/access_scopes.json': ok({ access_scopes: [...fullScopes, 'write_pixels'].map((handle) => ({ handle })) }),
        };

        const r = await ConnectorValidationService.validate('shopify', { shopDomain: 'n.myshopify.com' }, { adminApiAccessToken: 't' });

        expect(r.ok).toBe(true);
        expect(r.metadata.warnings.join(' ')).toMatch(/only one is granted/);
    });

    it('separates a rejected token from a wrong domain / API version', async () => {
        routes = { '/shop.json': { status: 401, body: { errors: 'Invalid API key or access token' } } };
        const bad = await ConnectorValidationService.validate('shopify', { shopDomain: 'n.myshopify.com' }, { adminApiAccessToken: 'bad' });
        expect(bad.error).toMatch(/rejected the access token/);

        routes = { '/shop.json': { status: 404, body: {} } };
        const missing = await ConnectorValidationService.validate('shopify', { shopDomain: 'nope.myshopify.com' }, { adminApiAccessToken: 't' });
        expect(missing.error).toMatch(/404 for nope\.myshopify\.com at API version 2024-01/);
    });

    it('falls back to probing when the token cannot list its own scopes', async () => {
        routes = {
            '/shop.json': ok({ shop: { name: 'Legacy' } }),
            '/access_scopes.json': { status: 403, body: {} },
            '/orders.json': ok({ orders: [] }),
            '/customers.json': { status: 403, body: {} },
            '/products.json': ok({ products: [] }),
        };

        const r = await ConnectorValidationService.validate('shopify', { shopDomain: 'legacy.myshopify.com' }, { adminApiAccessToken: 't' });

        expect(r.ok).toBe(false);
        expect(r.metadata.scopesMissing).toEqual(['read_customers']);
        expect(r.metadata.checks).toHaveLength(3);
        expect(r.metadata.warnings.join(' ')).toMatch(/inferred by probing/);
    });

    it('normalises the shop domain and honours an API version override', async () => {
        routes = { '/shop.json': ok({ shop: {} }), '/access_scopes.json': ok({ access_scopes: [] }) };

        await ConnectorValidationService.validate(
            'shopify',
            { shopDomain: 'https://n.myshopify.com/admin/', apiVersion: '2025-04' },
            { adminApiAccessToken: 't' },
        );

        expect(requested[0]).toBe('https://n.myshopify.com/admin/api/2025-04/shop.json');
    });
});

// ──────────────────────────────────────────────────────────────────────────
// BigCommerce
// ──────────────────────────────────────────────────────────────────────────

describe('BigCommerce validation', () => {
    const fullyScoped = {
        '/v2/time': ok({ time: 1 }),
        '/v2/orders/count': ok({ count: 99 }),
        '/v3/customers': ok({ data: [], meta: { pagination: { total: 22 } } }),
        '/v3/catalog/products': ok({ data: [], meta: { pagination: { total: 33 } } }),
        '/v3/content/scripts': ok({ data: [] }),
        '/v2/store': ok({ name: 'BC Store', currency: 'GBP', domain: 'bc.example.com', plan_name: 'Pro', timezone: { name: 'Europe/London' } }),
    };

    it('passes a fully scoped token and reports every capability', async () => {
        routes = { ...fullyScoped };

        const r = await ConnectorValidationService.validate('bigcommerce', { storeHash: 'abc123' }, { accessToken: 'tok' });

        expect(r.ok).toBe(true);
        expect(r.metadata.scopesMissing).toEqual([]);
        expect(r.metadata.scopesOptionalMissing).toEqual([]);
        expect(r.metadata.checks).toHaveLength(5);
        expect(r.message).toMatch(/99 orders · 22 customers · 33 products/);
    });

    it('reads 403 as a scope gap, not an auth failure', async () => {
        routes = {
            ...fullyScoped,
            '/v2/orders/count': { status: 403, body: { title: 'Forbidden' } },
            '/v3/content/scripts': { status: 403, body: {} },
        };

        const r = await ConnectorValidationService.validate('bigcommerce', { storeHash: 'abc123' }, { accessToken: 'tok' });

        expect(r.ok).toBe(false);
        expect(r.metadata.scopesMissing).toEqual(['Orders → read-only']);
        expect(r.metadata.scopesOptionalMissing).toContain('Content → modify');
        expect(r.metadata.store).toMatchObject({ name: 'BC Store', timezone: 'Europe/London' });
        expect(r.metadata.counts).toMatchObject({ customers: 22, products: 33 });
    });

    it('separates a rejected token from a wrong store hash', async () => {
        routes = { '/v2/time': { status: 401, body: {} } };
        expect((await ConnectorValidationService.validate('bigcommerce', { storeHash: 'abc' }, { accessToken: 'bad' })).error)
            .toMatch(/rejected the API token/);

        routes = { '/v2/time': { status: 404, body: {} } };
        expect((await ConnectorValidationService.validate('bigcommerce', { storeHash: 'wrong' }, { accessToken: 't' })).error)
            .toMatch(/404 for store hash 'wrong'/);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// Adobe Commerce — the 401-means-two-things case
// ──────────────────────────────────────────────────────────────────────────

describe('Adobe Commerce validation', () => {
    const base = 'https://magento.example.com';
    const UNAUTH = { status: 401, body: { message: "The consumer isn't authorized to access %resources." } };

    it('calls it an auth failure only when every resource is rejected', async () => {
        routes = { '/rest/V1/': UNAUTH };

        const r = await ConnectorValidationService.validate('adobe_commerce', { storeUrl: base }, { adminApiToken: 'tok' });

        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/rejected the token for every resource/);
        // No per-capability rows: we cannot attribute anything when nothing read.
        expect(r.metadata.checks).toHaveLength(0);
    });

    it('treats 401s as ACL gaps once any single resource reads', async () => {
        routes = {
            '/rest/V1/orders': UNAUTH,
            '/rest/V1/customers/search': UNAUTH,
            '/rest/V1/products': ok({ items: [], total_count: 42 }),
            '/rest/V1/categories/list': UNAUTH,
            '/rest/V1/carts/search': UNAUTH,
            '/rest/V1/store/storeConfigs': UNAUTH,
        };

        const r = await ConnectorValidationService.validate('adobe_commerce', { storeUrl: base }, { adminApiToken: 'tok' });

        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/missing required permissions/);
        expect(r.metadata.scopesMissing).toEqual(['Magento_Sales::sales_order', 'Magento_Customer::manage']);
        expect(r.metadata.scopesGranted).toContain('Magento_Catalog::products');
        expect(r.metadata.counts?.products).toBe(42);
    });

    it('passes on the required ACLs and warns about the health-probe resource', async () => {
        routes = {
            '/rest/V1/orders': ok({ items: [], total_count: 10 }),
            '/rest/V1/customers/search': ok({ items: [], total_count: 5 }),
            '/rest/V1/products': ok({ items: [], total_count: 7 }),
            '/rest/V1/categories/list': UNAUTH,
            '/rest/V1/carts/search': UNAUTH,
            '/rest/V1/store/storeConfigs': UNAUTH,
        };

        const r = await ConnectorValidationService.validate('adobe_commerce', { storeUrl: base }, { adminApiToken: 'tok' });

        expect(r.ok).toBe(true);
        expect(r.metadata.scopesMissing).toEqual([]);
        expect(r.metadata.scopesOptionalMissing).toEqual([
            'Magento_Catalog::categories',
            'Magento_Cart::manage',
            'Magento_Backend::store',
        ]);
        expect(r.message).toMatch(/3 optional permissions not granted/);
        // Magento_Backend::store breaks the observability page without breaking sync.
        expect(r.metadata.warnings.join(' ')).toMatch(/Backend API Observability/);
    });

    it('reports a non-auth HTTP error verbatim instead of blaming permissions', async () => {
        routes = { '/rest/V1/': { status: 503, body: { message: 'Service Unavailable' } } };

        const r = await ConnectorValidationService.validate('adobe_commerce', { storeUrl: base }, { adminApiToken: 'tok' });

        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/HTTP 503/);
        expect(r.error).not.toMatch(/missing required permissions/);
    });
});

// ──────────────────────────────────────────────────────────────────────────
// Cross-cutting
// ──────────────────────────────────────────────────────────────────────────

describe('guard clauses', () => {
    it.each([
        ['adobe_commerce', {}, { adminApiToken: 't' }, /base URL is required/],
        ['adobe_commerce', { storeUrl: 'store.example.com' }, { adminApiToken: 't' }, /must include the scheme/],
        ['adobe_commerce', { storeUrl: 'https://s.example.com' }, {}, /access token is required/],
        ['shopify', {}, { adminApiAccessToken: 't' }, /Shop domain is required/],
        ['shopify', { shopDomain: 'x.myshopify.com' }, {}, /access token is required/],
        ['bigcommerce', {}, { accessToken: 't' }, /Store Hash is required/],
        ['bigcommerce', { storeHash: 'abc' }, {}, /access token is required/],
        ['woocommerce', {}, {}, /Unsupported connector type/],
    ])('rejects %s with %j before making any request', async (type, config, credentials, expected) => {
        const r = await ConnectorValidationService.validate(type as string, config as any, credentials as any);

        expect(r.ok).toBe(false);
        expect(r.error).toMatch(expected as RegExp);
        expect(requested).toHaveLength(0);
        expect(typeof r.metadata.latencyMs).toBe('number');
    });

    it('reports unreachability rather than an auth verdict when the host is down', async () => {
        globalThis.fetch = (async () => {
            throw Object.assign(new Error('connect ECONNREFUSED'), { name: 'TypeError' });
        }) as any;

        const r = await ConnectorValidationService.validate('adobe_commerce', { storeUrl: 'https://down.example.com' }, { adminApiToken: 't' });

        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/Could not reach/);
    });
});
