//apps/api/src/services/pagespeed.service.ts
import { createHash } from 'crypto';
import { prisma, decryptSecret } from '@kpi-platform/db';
import { PageUrlDiscoveryService, DiscoveryPageType, DiscoveredUrl, SAMPLE_CAPS } from './page-url-discovery.service';

type PagespeedMetricName = 'lcp' | 'fcp' | 'fid' | 'cls' | 'ttfb' | 'tti';
type PagespeedStrategy = 'mobile' | 'desktop';
type MetricStatusLabel = 'good' | 'needs-improvement' | 'poor';

type PagespeedMetricRow = {
    metricName: PagespeedMetricName;
    metricValue: number;
    timestamp: string;
    source: string; // e.g. 'pagespeed_api:mobile' or 'pagespeed_api:desktop'
};

type ConnectorInstanceConfig = {
    id: string;
    tenantId: string;
    siteId: string;
    providerId: string;
    syncConfig: any;
    metadata?: any;
    credentials?: Array<{ encryptedSecret: any }>;
};

// Shared so resolvePageMetrics and the page-type discovery loop agree on the exact
// "first load, nothing measured yet" sentinel (used to avoid mislabeling it as a
// discovered-URL failure).
const NOT_MEASURED_REASON = 'Not measured yet — click Refresh to run PageSpeed.';

const METRIC_MAP: Array<{ key: PagespeedMetricName; auditName: string }> = [
    { key: 'lcp', auditName: 'largest-contentful-paint' },
    { key: 'fcp', auditName: 'first-contentful-paint' },
    { key: 'fid', auditName: 'max-potential-fid' },
    { key: 'cls', auditName: 'cumulative-layout-shift' },
    { key: 'ttfb', auditName: 'server-response-time' },
    // "Load Time" on the overview's Latency Confidence Profile maps to Time to Interactive.
    { key: 'tti', auditName: 'interactive' },
];

const PAGESPEED_SOURCE_PREFIX = 'pagespeed_api';

// Page-type breakdown lives in the same PerformanceMetric table under a distinct
// source prefix so it never mixes with the site-wide metrics above. The existing
// (siteId, metricName, source) unique constraint gives us per-(strategy,pageType)
// cache dedup for free — no schema migration required.
const PAGE_SOURCE_PREFIX = 'pagespeed_page';

type PageType = 'homepage' | 'pdp' | 'plp' | 'checkout';
const PAGE_TYPES: PageType[] = ['homepage', 'pdp', 'plp', 'checkout'];
type PageMetricName = 'lcp' | 'tbt' | 'cls' | 'ttfb' | 'score';
const PAGE_METRIC_NAMES: PageMetricName[] = ['lcp', 'tbt', 'cls', 'ttfb', 'score'];

export class PageSpeedService {
    static async syncProjectMetrics(tenantId: string, projectId: string, connectorInstanceIdParam?: string) {
        console.log('[PageSpeedService] syncProjectMetrics:start', { tenantId, projectId, connectorInstanceIdParam });

        try {
            let connector = null;
            
            // If connectorInstanceId is provided, fetch that specific connector
            if (connectorInstanceIdParam) {
                connector = await prisma.connectorInstance.findFirst({
                    where: {
                        id: connectorInstanceIdParam,
                        tenantId,
                        siteId: projectId,
                    },
                    select: {
                        id: true,
                        tenantId: true,
                        siteId: true,
                        providerId: true,
                        syncConfig: true,
                        credentials: {
                            orderBy: { lastRotatedAt: 'desc' },
                            take: 1,
                            select: {
                                encryptedSecret: true,
                            },
                        },
                    },
                });
                
                if (!connector) {
                    console.warn('[PageSpeedService] syncProjectMetrics:connector-not-found', { tenantId, projectId, connectorInstanceIdParam });
                    return [];
                }
            } else {
                // Fallback: Query for any connector assigned to this project
                connector = await this.getConnectorInstance(tenantId, projectId);
            }
            
            if (!connector) {
                console.warn('[PageSpeedService] syncProjectMetrics:no-connector', { tenantId, projectId });
                return [];
            }

            console.log('[PageSpeedService] syncProjectMetrics:connector-found', {
                tenantId,
                projectId,
                connectorId: connector.id,
                providerId: connector.providerId,
                hasSyncConfig: Boolean(connector.syncConfig),
            });

            const storeUrl = await this.resolveStoreUrl(connector);
            console.log('[PageSpeedService] syncProjectMetrics:store-url', { tenantId, projectId, storeUrl });
            if (!storeUrl) {
                console.warn('[PageSpeedService] syncProjectMetrics:no-store-url', {
                    tenantId,
                    projectId,
                    providerId: connector.providerId,
                    syncConfig: connector.syncConfig,
                });
                return [];
            }

            // Fetch for both strategies and tolerate one strategy failing.
            // This avoids 502 responses when Google API is temporarily slow for one device.
            // Strategies run SERIALLY below (see loop) so a fragile origin is never hit
            // by two concurrent Lighthouse loads at once (the PAGE_HUNG trigger).
            const strategies: PagespeedStrategy[] = ['mobile', 'desktop'];
            const timestamp = new Date();

            const strategyResults: Array<{ strategy: PagespeedStrategy; upserted: number }> = [];
            const rejected: Array<{ strategy: PagespeedStrategy; reason: unknown }> = [];

            // Run strategies SERIALLY (not concurrently). Weak/staging origins
            // cannot handle mobile + desktop Lighthouse loads at the same time and
            // hang (PSI PAGE_HUNG). One-at-a-time keeps the target under a single
            // load. A short pause between runs lets the origin recover.
            for (let index = 0; index < strategies.length; index += 1) {
                const strategy = strategies[index];
                if (index > 0) {
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                }
                try {
                    const response = await this.fetchPageSpeedResultWithRetry(storeUrl, strategy);
                    console.log('[PageSpeedService] syncProjectMetrics:pagespeed-response', {
                        tenantId,
                        projectId,
                        strategy,
                        hasResponse: Boolean(response),
                        lighthouseCategories: response?.lighthouseResult ? Object.keys(response.lighthouseResult) : [],
                    });

                    const audits = response?.lighthouseResult?.audits || {};
                    const rows = METRIC_MAP.map((metric) => ({
                        metricName: metric.key,
                        metricValue: Number(audits?.[metric.auditName]?.numericValue),
                    })).filter((row) => Number.isFinite(row.metricValue));

                    console.log('[PageSpeedService] syncProjectMetrics:parsed-metrics', {
                        tenantId,
                        projectId,
                        strategy,
                        rows,
                    });

                    if (rows.length === 0) {
                        console.warn('[PageSpeedService] syncProjectMetrics:no-metrics-extracted', {
                            tenantId,
                            projectId,
                            strategy,
                            auditsPresent: Object.keys(audits).length,
                            auditsSample: Object.keys(audits).slice(0, 12),
                        });
                        strategyResults.push({ strategy, upserted: 0 });
                        continue;
                    }

                    await Promise.all(rows.map((row) => this.upsertMetric({
                        tenantId,
                        siteId: projectId,
                        metricName: row.metricName,
                        metricValue: row.metricValue,
                        timestamp,
                        source: this.buildSource(strategy),
                        device: strategy,
                        connectorInstanceId: connectorInstanceIdParam || connector.id
                    })));

                    strategyResults.push({ strategy, upserted: rows.length });
                } catch (reason) {
                    rejected.push({ strategy, reason });
                }
            }

            if (rejected.length > 0) {
                console.warn('[PageSpeedService] syncProjectMetrics:partial-failure', {
                    tenantId,
                    projectId,
                    failedStrategies: rejected.length,
                    reasons: rejected.map((r) => ({
                        strategy: r.strategy,
                        message: r.reason instanceof Error ? r.reason.message : String(r.reason),
                    })),
                });
            }

            const latest = await this.getLatestMetrics(projectId, connectorInstanceIdParam);
            console.log('[PageSpeedService] syncProjectMetrics:latest-after-upsert', {
                tenantId,
                projectId,
                latestKeys: Object.keys(latest),
            });
            return latest;
        } catch (error) {
            console.error('[PageSpeedService] syncProjectMetrics:failed', {
                tenantId,
                projectId,
                error,
            });
            throw error;
        }
    }

    static async getLatestMetrics(projectId: string, connectorInstanceId?: string): Promise<any> {
        try {
            const metrics = await (prisma.performanceMetric as any).findMany({
                where: {
                    siteId: projectId,
                    ...(connectorInstanceId ? { connectorInstanceId } : {}),
                    OR: [
                        { source: { startsWith: `${PAGESPEED_SOURCE_PREFIX}:` } },
                        { source: { startsWith: `${PAGESPEED_SOURCE_PREFIX}.` } },
                    ],
                    metricName: { in: METRIC_MAP.map((m) => m.key) },
                },
                orderBy: { timestamp: 'desc' },
            });

            console.log('[PageSpeedService] getLatestMetrics:query-result', {
                projectId,
                connectorInstanceId: connectorInstanceId || null,
                count: metrics.length,
            });

            const latest: any = { mobile: {}, desktop: {} };
            for (const metric of metrics) {
                const device = this.resolveMetricDevice(metric) || 'mobile';
                const key = metric.metricName as PagespeedMetricName;
                if (latest[device][key]) continue; // already have latest for this metric+device
                latest[device][key] = {
                    value: Number(metric.metricValue),
                    unit: metric.unit || (key === 'cls' ? '' : 'ms'),
                    timestamp: metric.timestamp ? metric.timestamp.toISOString() : null,
                };
            }

            // Compute status per thresholds
            const computeStatus = (k: PagespeedMetricName, v: number) => {
                if (k === 'cls') {
                    if (v <= 0.1) return 'good';
                    if (v <= 0.25) return 'needs-improvement';
                    return 'poor';
                }
                if (k === 'fid') {
                    if (v <= 200) return 'good';
                    if (v <= 500) return 'needs-improvement';
                    return 'poor';
                }
                if (k === 'lcp') {
                    if (v <= 2500) return 'good';
                    if (v <= 4000) return 'needs-improvement';
                    return 'poor';
                }
                if (k === 'fcp') {
                    if (v <= 1800) return 'good';
                    if (v <= 3000) return 'needs-improvement';
                    return 'poor';
                }
                if (k === 'tti') {
                    if (v <= 3800) return 'good';
                    if (v <= 7300) return 'needs-improvement';
                    return 'poor';
                }
                if (k === 'ttfb') {
                    if (v <= 800) return 'good';
                    if (v <= 1800) return 'needs-improvement';
                    return 'poor';
                }
                return 'good';
            };

            const formatted: any = { mobile: {}, desktop: {} };
            for (const device of ['mobile', 'desktop'] as const) {
                for (const m of METRIC_MAP) {
                    const key = m.key;
                    const entry = latest[device][key];
                    if (entry) {
                        formatted[device][key] = {
                            value: entry.value,
                            unit: entry.unit,
                            status: computeStatus(key, entry.value),
                            timestamp: entry.timestamp,
                        };
                    }
                }
            }

            return formatted;
        } catch (err) {
            console.warn('[PageSpeedService] getLatestMetrics failed', err);
            return [];
        }
    }

    private static async getConnectorInstance(tenantId: string, projectId: string): Promise<ConnectorInstanceConfig | null> {
        // IMPORTANT: Only return connectors explicitly assigned to THIS project
        // DO NOT use cross-project fallback connectors (security risk: credential sharing)
        const connector = await prisma.connectorInstance.findFirst({
            where: {
                tenantId,
                siteId: projectId,
                providerId: { in: ['shopify', 'adobe_commerce', 'bigcommerce'] },
            },
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                tenantId: true,
                siteId: true,
                providerId: true,
                syncConfig: true,
                metadata: true,
                credentials: {
                    orderBy: { lastRotatedAt: 'desc' },
                    take: 1,
                    select: {
                        encryptedSecret: true,
                    },
                },
            },
        });

        if (!connector) {
            console.warn('[PageSpeedService] getConnectorInstance:no-connector', {
                tenantId,
                projectId,
                reason: 'Project has no configured Shopify/Adobe Commerce/BigCommerce connector. Please connect a store first.',
            });
        }

        return connector as ConnectorInstanceConfig | null;
    }

    private static async resolveStoreUrl(connector: ConnectorInstanceConfig): Promise<string | null> {
        const syncConfig = connector.syncConfig || {};

        if (connector.providerId === 'shopify') {
            const shopDomain = String(syncConfig.shopDomain || '').trim();
            return shopDomain ? this.normalizePublicUrl(shopDomain) : null;
        }

        if (connector.providerId === 'adobe_commerce') {
            const storeUrl = String(syncConfig.storeUrl || '').trim();
            return this.normalizePublicUrl(storeUrl);
        }

        if (connector.providerId === 'bigcommerce') {
            const candidates = [
                syncConfig.storeUrl,
                syncConfig.store_url,
                syncConfig.storefrontUrl,
                syncConfig.storefront_url,
                syncConfig.siteUrl,
                syncConfig.site_url,
                syncConfig.domain,
                syncConfig.customDomain,
                syncConfig.custom_domain,
                syncConfig.baseUrl,
            ];

            for (const candidate of candidates) {
                const normalized = this.normalizePublicUrl(candidate);
                if (!normalized) continue;

                const hostname = this.safeHostname(normalized);
                if (hostname === 'api.bigcommerce.com') {
                    continue;
                }

                return normalized;
            }

            console.warn('[PageSpeedService] resolveStoreUrl:bigcommerce-missing-storefront-url', {
                connectorId: connector.id,
                siteId: connector.siteId,
                availableKeys: Object.keys(syncConfig),
                hasStoreHash: Boolean(String(syncConfig.storeHash || syncConfig.store_hash || '').trim()),
                baseUrl: String(syncConfig.baseUrl || '').trim() || null,
            });

            const fallbackUrl = await this.resolveBigCommerceStorefrontUrl(syncConfig, connector.credentials?.[0]?.encryptedSecret);
            if (fallbackUrl) {
                return fallbackUrl;
            }

            return null;
        }

        return null;
    }

    private static async resolveBigCommerceStorefrontUrl(
        syncConfig: Record<string, any>,
        encryptedSecret: unknown,
    ): Promise<string | null> {
        const storeHash = String(syncConfig.storeHash || syncConfig.store_hash || '').trim();
        const credentials = this.parseCredentials(encryptedSecret);
        const accessToken = String(credentials.accessToken || credentials.token || credentials.storeApiToken || '').trim();

        if (!storeHash || !accessToken) {
            return null;
        }

        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            const fetchFn: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;
            // Bound this lookup so a slow/hanging BigCommerce API can't consume the
            // whole sync budget and trip the dashboard proxy timeout (ECONNRESET 500).
            const controller = new AbortController();
            const timeoutMs = Number(process.env.BIGCOMMERCE_FETCH_TIMEOUT_MS || 10000);
            timeout = setTimeout(() => controller.abort(), timeoutMs);
            const response = await fetchFn(`https://api.bigcommerce.com/stores/${storeHash}/v2/store`, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Auth-Token': accessToken,
                },
                signal: controller.signal,
            });

            if (!response.ok) {
                console.warn('[PageSpeedService] resolveBigCommerceStorefrontUrl:non-ok-response', {
                    storeHash,
                    status: response.status,
                    statusText: response.statusText,
                });
                return null;
            }

            const payload = await response.json();
            const candidates = [
                payload?.secure_url,
                payload?.secureUrl,
                payload?.store_secure_url,
                payload?.storeSecureUrl,
                payload?.domain,
                payload?.url,
            ];

            for (const candidate of candidates) {
                const normalized = this.normalizePublicUrl(candidate);
                if (!normalized) continue;
                if (this.safeHostname(normalized) === 'api.bigcommerce.com') continue;
                return normalized;
            }
        } catch (error) {
            console.warn('[PageSpeedService] resolveBigCommerceStorefrontUrl failed', {
                storeHash,
                error,
            });
        } finally {
            if (timeout) clearTimeout(timeout);
        }

        return null;
    }

    private static normalizePublicUrl(value: unknown): string | null {
        const raw = String(value || '').trim();
        if (!raw) return null;

        const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

        try {
            const url = new URL(withProtocol);
            return url.toString().replace(/\/$/, '');
        } catch {
            return null;
        }
    }

    private static safeHostname(value: string): string | null {
        try {
            return new URL(value).hostname.toLowerCase();
        } catch {
            return null;
        }
    }

    private static parseCredentials(encryptedSecret: unknown): Record<string, any> {
        // Decrypts the AES-256-GCM envelope in memory (with legacy-plaintext fallback).
        // Never log the returned credentials.
        return decryptSecret(encryptedSecret);
    }

    private static buildSource(strategy: PagespeedStrategy): string {
        return `${PAGESPEED_SOURCE_PREFIX}:${strategy}`;
    }

    private static resolveMetricDevice(metric: { device?: string | null; source?: string | null }): PagespeedStrategy | null {
        const device = String(metric.device || '').trim().toLowerCase();
        if (device === 'mobile' || device === 'desktop') {
            return device;
        }

        const source = String(metric.source || '').trim().toLowerCase();
        if (source.endsWith(':mobile') || source.endsWith('.mobile')) return 'mobile';
        if (source.endsWith(':desktop') || source.endsWith('.desktop')) return 'desktop';
        return null;
    }

    private static async fetchPageSpeedResultWithRetry(storeUrl: string, strategy: PagespeedStrategy, bustCache = false) {
        // Run a SINGLE attempt only. Retrying against a fragile/slow origin
        // (e.g. Magento mcstaging.*) just re-triggers back-to-back Lighthouse loads,
        // which makes PSI fail harder ("Lighthouse returned error" / PAGE_HUNG) and
        // multiplies wall-clock time.
        try {
            return await this.fetchPageSpeedResult(storeUrl, strategy, bustCache);
        } catch (error) {
            console.warn('[PageSpeedService] fetchPageSpeedResultWithRetry:attempt-failed', {
                storeUrl,
                strategy,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error instanceof Error ? error : new Error(`PageSpeed ${strategy} request failed`);
        }
    }

    private static async fetchPageSpeedResult(storeUrl: string, strategy: PagespeedStrategy = 'mobile', bustCache = false) {
        // NOTE: `bustCache` is intentionally a no-op. There is no supported PSI
        // cache-bust mechanism via query params on the target URL — appending one
        // (e.g. ?psi_cb=...) makes Google measure a DIFFERENT URL than the real
        // homepage, then we store/show that result as if it were the homepage.
        // PSI's own cache is only a few minutes, so we simply always call the API
        // against the clean store URL. The param is kept to avoid breaking callers.
        const targetUrl = storeUrl;

        const url = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
        url.searchParams.set('url', targetUrl);
        url.searchParams.set('strategy', strategy);
        url.searchParams.set('category', 'performance');

        const apiKey = String(process.env.PAGESPEED_API_KEY || '').trim();
        if (apiKey) {
            url.searchParams.set('key', apiKey);
        } else {
            console.warn('[PageSpeedService] fetchPageSpeedResult:missing-api-key', { storeUrl });
        }

        console.log('[PageSpeedService] fetchPageSpeedResult:request', {
            storeUrl,
            requestUrl: url.toString(),
        });

        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            const fetchFn: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;
            // Google PageSpeed API can take 15-30+ seconds to analyze a page, and
            // slow/staging origins routinely push both strategies past 90s. Give
            // desktop the same headroom as mobile so it isn't aborted prematurely.
            const controller = new AbortController();
            // Slow/staging origins (e.g. Magento mcstaging.*) routinely make Google's
            // Lighthouse analysis take 2-3+ minutes. pagespeed.web.dev has no client-side
            // cutoff, so it "works there"; our 120s abort was firing before PSI finished.
            // Give a single attempt enough headroom (override via PAGESPEED_FETCH_TIMEOUT_MS).
            const defaultTimeoutMs = 180000;
            const timeoutMs = Number(process.env.PAGESPEED_FETCH_TIMEOUT_MS || defaultTimeoutMs);
            timeout = setTimeout(() => controller.abort(), timeoutMs);

            const response = await fetchFn(url.toString(), {
                method: 'GET',
                signal: controller.signal
            });
            
            console.log('[PageSpeedService] fetchPageSpeedResult:response', {
                storeUrl,
                status: response.status,
                statusText: response.statusText,
                contentType: response.headers.get('content-type'),
            });
            if (!response.ok) {
                const body = await response.text();
                console.warn('[PageSpeedService] fetchPageSpeedResult:non-ok-body', {
                    storeUrl,
                    status: response.status,
                    body: body.slice(0, 500),
                });
                throw new Error(`PageSpeed API returned ${response.status} ${response.statusText}. ${body.slice(0, 200)}`);
            }
            const json = await response.json();
            console.log('[PageSpeedService] fetchPageSpeedResult:json-keys', {
                storeUrl,
                keys: json && typeof json === 'object' ? Object.keys(json) : [],
            });
            return json;
        } catch (err) {
            console.warn('[PageSpeedService] fetchPageSpeedResult failed', err);
            throw err;
        } finally {
            // Ensure timer is always cleared even when fetch throws/aborts.
            if (timeout) clearTimeout(timeout);
        }
    }

    private static async upsertMetric(input: {
        tenantId: string;
        siteId: string;
        metricName: PagespeedMetricName;
        metricValue: number;
        timestamp: Date;
        source: string;
        device: PagespeedStrategy;
        connectorInstanceId?: string | null;
    }) {
        console.log('[PageSpeedService] upsertMetric', {
            siteId: input.siteId,
            metricName: input.metricName,
            source: input.source,
            metricValue: input.metricValue,
        });

        await (prisma.performanceMetric as any).upsert({
            where: {
                siteId_metricName_source: {
                    siteId: input.siteId,
                    metricName: input.metricName,
                    source: input.source,
                },
            },
            create: {
                tenantId: input.tenantId,
                siteId: input.siteId,
                connectorInstanceId: input.connectorInstanceId || null,
                category: 'WEB_VITALS',
                metricName: input.metricName,
                source: input.source,
                metricValue: String(input.metricValue),
                unit: input.metricName === 'cls' ? 'score' : 'ms',
                device: input.device,
                timestamp: input.timestamp,
            },
            update: {
                tenantId: input.tenantId,
                connectorInstanceId: input.connectorInstanceId || null,
                category: 'WEB_VITALS',
                metricValue: String(input.metricValue),
                unit: input.metricName === 'cls' ? 'score' : 'ms',
                device: input.device,
                timestamp: input.timestamp,
            },
        });
    }

    // ─── Page-type breakdown (Homepage / PDP / PLP / Checkout) ──────────────────

    /**
     * Run PageSpeed for each page type at the given strategy and return one entry per
     * page type.
     *
     * The homepage is measured against the store base URL. PDP/PLP/checkout are
     * measured against REAL, per-page-type URLs resolved by PageUrlDiscoveryService
     * (Shopify / BigCommerce / Adobe Commerce), persisted in `discovered_page_urls`
     * and re-discovered on a schedule rather than on every run. When discovery returns
     * no URL for a page type — a thin catalog, a discovery failure, or Shopify checkout
     * (which needs a Storefront API token that isn't configured) — that page type
     * falls back to proxying the homepage measurement, clearly labeled. No PSI scores
     * are ever fabricated.
     */
    static async getPageTypeMetrics(
        tenantId: string,
        projectId: string,
        connectorInstanceIdParam: string | undefined,
        strategy: PagespeedStrategy,
        forceRefresh = false,
        pageTypeFilter?: PageType,
        sourceUrl?: string,
    ): Promise<Record<PageType, any>> {
        // When a single page type is requested for a live refresh, only THAT type runs
        // PSI; every other type is served read-only from cache. This keeps one refresh
        // to a single PSI call so it stays well under the proxy timeout.
        const shouldMeasure = (pt: PageType) => forceRefresh && (!pageTypeFilter || pageTypeFilter === pt);
        let connector = null;
        if (connectorInstanceIdParam) {
            connector = await prisma.connectorInstance.findFirst({
                where: { id: connectorInstanceIdParam, tenantId, siteId: projectId },
                select: {
                    id: true, tenantId: true, siteId: true, providerId: true, syncConfig: true, metadata: true,
                    credentials: { orderBy: { lastRotatedAt: 'desc' }, take: 1, select: { encryptedSecret: true } },
                },
            });
        } else {
            connector = await this.getConnectorInstance(tenantId, projectId);
        }

        const result = {} as Record<PageType, any>;

        const noStore = () => {
            for (const pt of PAGE_TYPES) result[pt] = this.unavailablePage(pt, null, 'No connected store found for this project.');
            return result;
        };

        if (!connector) return noStore();

        const connectorInstanceId = connector.id;
        const storeUrl = await this.resolveStoreUrl(connector);
        const homepageUrl = storeUrl ? `${storeUrl.replace(/\/$/, '')}/` : null;
        if (!homepageUrl) return noStore();

        // Measure the homepage once.
        let homepage: any;
        try {
            homepage = await this.resolvePageMetrics({
                tenantId, projectId, connectorInstanceId, strategy, pageType: 'homepage', url: homepageUrl, forceRefresh: shouldMeasure('homepage'),
            });
        } catch (error) {
            console.warn('[PageSpeedService] getPageTypeMetrics:homepage-failed', {
                projectId, url: homepageUrl, error: error instanceof Error ? error.message : String(error),
            });
            await this.upsertPageMetric({ tenantId, siteId: projectId, connectorInstanceId, strategy, pageType: 'homepage', metricName: 'score', metricValue: -1, url: homepageUrl, timestamp: new Date() });
            homepage = this.unavailablePage('homepage', homepageUrl, this.failureReason('homepage'));
        }

        // Homepage is single-URL — one candidate so the UI selector stays consistent.
        result.homepage = { ...homepage, candidates: [{ url: homepageUrl, rank: 0 }], selectedUrl: homepageUrl };

        // Resolve real PDP/PLP/Checkout URLs per platform (cache-first; only hits the
        // store APIs when the persisted sample is stale/absent). Each page type exposes
        // its full discovered candidate set; PSI measures the SELECTED URL (the one the
        // user picked, else the top-ranked). A page type with no discovered URL proxies
        // the homepage, clearly labeled — never a fabricated score.
        //
        // A homepage-only refresh (pageTypeFilter === 'homepage') never uses discovered
        // URLs and the client discards the other sections from the response, so skip
        // discovery entirely: when the persisted sample is stale it would otherwise fire
        // synchronous store-API calls and pile 10–40s of latency onto a request that
        // doesn't need them. For pdp/plp/checkout (and full, unfiltered loads) discovery
        // is still required to resolve candidate URLs.
        const discovered = pageTypeFilter === 'homepage'
            ? null
            : await this.resolveDiscoveredUrls(connector, storeUrl);

        for (const pageType of ['pdp', 'plp', 'checkout'] as Array<'pdp' | 'plp' | 'checkout'>) {
            const candidates = discovered?.[pageType] || [];
            const candidateList = candidates.map((c) => ({ url: c.url, rank: c.rank }));
            // The page the user picked from the dropdown (only honored for the page type
            // being refreshed/read); otherwise default to the top-ranked candidate.
            const requestedUrl = pageTypeFilter === pageType && sourceUrl
                ? candidates.find((c) => c.url === sourceUrl)?.url
                : undefined;
            const targetUrl = requestedUrl || candidates[0]?.url || null;
            // Honest coverage signal: how many candidate URLs we actually sampled vs the
            // target ceiling, and whether that's meaningfully below target. Lets the
            // dashboard label thin coverage instead of implying full sampling.
            const target = SAMPLE_CAPS[pageType];
            const coverage = {
                discoveredCount: candidates.length,
                coverageTarget: target,
                coverageLimited: candidates.length > 0 && candidates.length < Math.ceil(target / 2),
                candidates: candidateList,
                selectedUrl: targetUrl,
                // Shopify checkout is measured against the /cart page (the hosted checkout
                // needs a Storefront API token we don't store) — label the section "Cart".
                ...(pageType === 'checkout' && connector.providerId === 'shopify' && targetUrl
                    ? { isCartPage: true, note: 'Cart page — Shopify checkout requires a Storefront API token' }
                    : {}),
            };
            if (!targetUrl) {
                result[pageType] = { ...this.proxyHomepageResult(pageType, homepage), ...coverage };
                continue;
            }

            try {
                const measured = await this.resolvePageMetrics({
                    tenantId, projectId, connectorInstanceId, strategy, pageType, url: targetUrl, forceRefresh: shouldMeasure(pageType),
                });
                if (measured?.available) {
                    result[pageType] = { ...measured, ...coverage };
                } else if (measured?.reason === NOT_MEASURED_REASON) {
                    // First load, nothing cached yet — a benign "click Refresh" state,
                    // NOT a measurement failure. Leave it as-is.
                    result[pageType] = { ...measured, ...coverage };
                } else {
                    // PSI ran but returned no usable data (score 0 / no lab vitals —
                    // often a blocked, password-protected, or non-rendering page).
                    // Surface PSI's own explanation, not a generic URL-config blame.
                    result[pageType] = {
                        ...measured,
                        ...coverage,
                        measurementError: 'pagespeed_error',
                        reason: measured?.reason || this.failureReason(pageType),
                    };
                }
            } catch (error) {
                // The measurement threw — almost always the Google PageSpeed API
                // returning an error (NO_FCP, PAGE_HUNG, timeout, rate limit, …).
                // Translate that into a plain-language reason and show it verbatim
                // instead of the misleading "check URL suffix config" badge.
                const described = this.describePageSpeedError(error);
                console.warn('[PageSpeedService] getPageTypeMetrics:discovered-url-failed', {
                    projectId, pageType, url: targetUrl,
                    error: error instanceof Error ? error.message : String(error),
                });
                result[pageType] = {
                    ...this.unavailablePage(pageType, targetUrl, described),
                    ...coverage,
                    measurementError: 'pagespeed_error',
                };
            }
        }

        return result;
    }

    /**
     * Return the persisted discovered URLs for this connector grouped by page type
     * (rank-ordered). Re-discovers + persists only when the stored sample is stale or
     * absent — discovery is scheduled, not run on every PSI request. Falls back to the
     * stale sample if a fresh discovery turns up nothing, and to null on hard failure
     * (caller then proxies the homepage for every page type).
     */
    private static async resolveDiscoveredUrls(
        connector: ConnectorInstanceConfig,
        storeUrl: string | null,
    ): Promise<Record<DiscoveryPageType, DiscoveredUrl[]> | null> {
        try {
            const persisted = await PageUrlDiscoveryService.readPersisted(connector.id);
            if (!persisted.stale) return persisted.byType;

            const result = await PageUrlDiscoveryService.discoverAndPersist(
                { id: connector.id, tenantId: connector.tenantId, siteId: connector.siteId, providerId: connector.providerId, syncConfig: connector.syncConfig, credentials: connector.credentials },
                storeUrl,
            );

            if (result.urls.length === 0) {
                // Fresh discovery found nothing — keep using the stale sample if we have
                // one (better a possibly-aged real URL than an immediate homepage proxy).
                return persisted.empty ? this.groupDiscovered(result.urls) : persisted.byType;
            }
            return this.groupDiscovered(result.urls);
        } catch (error) {
            console.warn('[PageSpeedService] resolveDiscoveredUrls:failed', {
                connectorId: connector.id,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    private static groupDiscovered(urls: DiscoveredUrl[]): Record<DiscoveryPageType, DiscoveredUrl[]> {
        const byType: Record<DiscoveryPageType, DiscoveredUrl[]> = { pdp: [], plp: [], checkout: [] };
        for (const u of urls) {
            if (byType[u.pageType]) byType[u.pageType].push(u);
        }
        for (const pt of Object.keys(byType) as DiscoveryPageType[]) {
            byType[pt].sort((a, b) => a.rank - b.rank);
        }
        return byType;
    }

    /**
     * Build a page-type result that reuses the homepage measurement, flagged so the
     * frontend can render a "Measured against store homepage" note.
     */
    private static proxyHomepageResult(pageType: PageType, homepage: any): any {
        if (!homepage || !homepage.available) {
            return {
                ...this.unavailablePage(pageType, homepage?.url ?? null, homepage?.reason || this.failureReason(pageType), homepage?.timestamp ?? null),
                measuredAgainstHomepage: true,
            };
        }
        return {
            ...homepage,
            pageType,
            measuredAgainstHomepage: true,
            note: 'Measured against store homepage',
        };
    }

    private static async resolvePageMetrics(input: {
        tenantId: string; projectId: string; connectorInstanceId: string;
        strategy: PagespeedStrategy; pageType: PageType; url: string; forceRefresh: boolean;
    }): Promise<any> {
        const { tenantId, projectId, connectorInstanceId, strategy, pageType, url, forceRefresh } = input;
        const source = this.buildPageSource(strategy, pageType, url);

        // A live PageSpeed run happens ONLY on an explicit Refresh (forceRefresh=true).
        // A normal page load never scans: it serves the last stored measurement
        // regardless of age, or a "not measured yet" state when nothing is stored.
        // This guarantees the only thing that ever calls Google PSI is the Refresh
        // button (and the background /sync it kicks off), never a page visit.
        const cached = await this.readCachedPage(projectId, connectorInstanceId, source, strategy);
        if (!forceRefresh) {
            if (!cached) {
                return this.unavailablePage(pageType, url, NOT_MEASURED_REASON, null);
            }
            if (cached.values.score !== undefined && cached.values.score < 0) {
                return this.unavailablePage(pageType, cached.url || url, this.failureReason(pageType), cached.timestamp);
            }
            return this.buildPageResult(pageType, cached.url || url, cached.values, cached.timestamp);
        }
        // forceRefresh=true — fall through to the live fetch below.

        // Fetch fresh from PageSpeed. On an explicit refresh, bust Google's result
        // cache so the user gets a brand-new measurement instead of a repeated one.
        const response = await this.fetchPageSpeedResultWithRetry(url, strategy, forceRefresh);
        const extracted = this.extractPageMetrics(response);

        // Checkout (and other restricted pages) often return a 0 score / no lab data.
        const hasVitals = ['lcp', 'tbt', 'cls', 'ttfb'].some((k) => Number.isFinite((extracted as any)[k]));
        if (!hasVitals || extracted.score === 0) {
            await this.upsertPageMetric({ tenantId, siteId: projectId, connectorInstanceId, strategy, pageType, metricName: 'score', metricValue: -1, url, timestamp: new Date() });
            return this.unavailablePage(pageType, url, this.failureReason(pageType));
        }

        const timestamp = new Date();
        const values: Partial<Record<PageMetricName, number>> = {};
        await Promise.all(PAGE_METRIC_NAMES.map(async (metricName) => {
            const raw = (extracted as any)[metricName];
            if (!Number.isFinite(raw)) return;
            values[metricName] = raw;
            await this.upsertPageMetric({ tenantId, siteId: projectId, connectorInstanceId, strategy, pageType, metricName, metricValue: raw, url, timestamp });
        }));

        return this.buildPageResult(pageType, url, values, timestamp.toISOString());
    }

    private static extractPageMetrics(response: any): Record<PageMetricName, number> {
        const audits = response?.lighthouseResult?.audits || {};
        const rawScore = Number(response?.lighthouseResult?.categories?.performance?.score);
        return {
            lcp: Number(audits['largest-contentful-paint']?.numericValue),
            tbt: Number(audits['total-blocking-time']?.numericValue),
            cls: Number(audits['cumulative-layout-shift']?.numericValue),
            ttfb: Number(audits['server-response-time']?.numericValue),
            score: Number.isFinite(rawScore) ? Math.round(rawScore * 100) : NaN,
        };
    }

    private static buildPageResult(pageType: PageType, url: string, values: Partial<Record<PageMetricName, number>>, timestamp: string | null): any {
        const metric = (key: PageMetricName) => {
            const value = values[key];
            if (value === undefined || !Number.isFinite(value)) return null;
            return {
                value,
                unit: key === 'cls' || key === 'score' ? '' : 'ms',
                status: this.pageMetricStatus(key, value),
                timestamp,
            };
        };
        const score = values.score !== undefined && values.score >= 0 ? values.score : null;
        return {
            pageType,
            url,
            available: true,
            score,
            scoreStatus: score === null ? null : this.scoreStatus(score),
            metrics: { lcp: metric('lcp'), tbt: metric('tbt'), cls: metric('cls'), ttfb: metric('ttfb') },
            timestamp,
        };
    }

    private static unavailablePage(pageType: PageType, url: string | null, reason: string, timestamp: string | null = null): any {
        return {
            pageType,
            url,
            available: false,
            reason,
            score: null,
            scoreStatus: null,
            metrics: { lcp: null, tbt: null, cls: null, ttfb: null },
            timestamp,
        };
    }

    // Uniform across all platforms and page types — no platform- or page-specific
    // messaging. Page-type tabs proxy the homepage result, so this only surfaces
    // when the homepage measurement itself could not be analyzed.
    private static failureReason(_pageType: PageType): string {
        return 'Unavailable – PageSpeed could not analyze this page.';
    }

    /**
     * Translate a thrown PageSpeed/Lighthouse error into a plain-language reason that
     * is safe to show a user. Google returns the real cause inside the error JSON
     * (e.g. NO_FCP, PAGE_HUNG, DNS_FAILURE); we surface that instead of guessing at a
     * URL-config problem — the URL is frequently correct and the origin is simply
     * slow, blocking bots, or a staging/password-protected site.
     */
    private static describePageSpeedError(error: unknown): string {
        const raw = error instanceof Error ? error.message : String(error || '');

        // Pull the structured PSI message out of the error string when present.
        let psiMessage = raw;
        const jsonStart = raw.indexOf('{');
        if (jsonStart >= 0) {
            try {
                const parsed = JSON.parse(raw.slice(jsonStart));
                psiMessage = parsed?.error?.message || psiMessage;
            } catch {
                const match = raw.match(/"message":\s*"([^"]+)"/);
                if (match) psiMessage = match[1];
            }
        }

        const upper = psiMessage.toUpperCase();
        if (upper.includes('NO_FCP')) {
            return 'PageSpeed couldn’t measure this page — it never rendered any content (NO_FCP). The origin is usually too slow, a staging/password-protected site, or is blocking automated tools.';
        }
        if (upper.includes('PAGE_HUNG')) {
            return 'PageSpeed couldn’t measure this page — the page hung while loading (PAGE_HUNG). The origin may be too slow or stuck.';
        }
        if (upper.includes('DNS_FAILURE')) {
            return 'PageSpeed couldn’t reach this page — DNS lookup for the domain failed (DNS_FAILURE).';
        }
        if (upper.includes('FAILED_DOCUMENT_REQUEST') || upper.includes('ERRORED_DOCUMENT_REQUEST')) {
            return 'PageSpeed couldn’t load this page — the origin refused the request or returned an error.';
        }
        if (upper.includes('INVALID_URL')) {
            return 'PageSpeed rejected this URL as invalid.';
        }
        if (upper.includes('429') || upper.includes('RATE LIMIT')) {
            return 'PageSpeed rate limit reached. Please wait a moment and try again.';
        }
        if (upper.includes('ABORT') || upper.includes('TIMEOUT') || upper.includes('TIMED OUT')) {
            return 'PageSpeed timed out while analyzing this page — the origin took too long to respond.';
        }

        const trimmed = psiMessage.replace(/\s+/g, ' ').trim();
        return trimmed
            ? `PageSpeed couldn’t analyze this page: ${trimmed.slice(0, 240)}`
            : 'PageSpeed couldn’t analyze this page.';
    }

    private static pageMetricStatus(key: PageMetricName, v: number): MetricStatusLabel {
        const thresholds: Record<string, [number, number]> = {
            lcp: [2500, 4000], tbt: [200, 600], cls: [0.1, 0.25], ttfb: [800, 1800],
        };
        const t = thresholds[key];
        if (!t) return 'good';
        if (v <= t[0]) return 'good';
        if (v <= t[1]) return 'needs-improvement';
        return 'poor';
    }

    private static scoreStatus(score: number): MetricStatusLabel {
        if (score >= 90) return 'good';
        if (score >= 50) return 'needs-improvement';
        return 'poor';
    }

    private static buildPageSource(strategy: PagespeedStrategy, pageType: PageType, url?: string): string {
        const base = `${PAGE_SOURCE_PREFIX}:${strategy}:${pageType}`;
        // PDP/PLP have several discovered candidate URLs; key each one separately so
        // their cached PageSpeed results don't overwrite each other. Homepage/checkout
        // are single-URL per page type, so they keep the plain source.
        if ((pageType === 'pdp' || pageType === 'plp') && url) {
            return `${base}:${this.urlKey(url)}`;
        }
        return base;
    }

    private static urlKey(url: string): string {
        return createHash('sha1').update(url).digest('hex').slice(0, 12);
    }

    private static async readCachedPage(
        projectId: string,
        connectorInstanceId: string | undefined,
        source: string,
        strategy: PagespeedStrategy,
    ): Promise<{ values: Partial<Record<PageMetricName, number>>; url: string | null; timestamp: string | null; ageMs: number } | null> {
        const rows = await (prisma.performanceMetric as any).findMany({
            where: {
                siteId: projectId,
                ...(connectorInstanceId ? { connectorInstanceId } : {}),
                source,
                metricName: { in: PAGE_METRIC_NAMES },
                device: strategy,
            },
            orderBy: { timestamp: 'desc' },
        });
        if (!rows.length) return null;

        const values: Partial<Record<PageMetricName, number>> = {};
        let url: string | null = null;
        let freshest: Date | null = null;
        for (const row of rows) {
            const key = row.metricName as PageMetricName;
            if (values[key] === undefined) values[key] = Number(row.metricValue);
            if (!url && row.route) url = row.route;
            if (!freshest || row.timestamp > freshest) freshest = row.timestamp;
        }

        return {
            values,
            url,
            timestamp: freshest ? freshest.toISOString() : null,
            ageMs: freshest ? Date.now() - freshest.getTime() : Number.POSITIVE_INFINITY,
        };
    }

    private static async upsertPageMetric(input: {
        tenantId: string; siteId: string; connectorInstanceId?: string | null;
        strategy: PagespeedStrategy; pageType: PageType; metricName: PageMetricName;
        metricValue: number; url: string; timestamp: Date;
    }) {
        const source = this.buildPageSource(input.strategy, input.pageType, input.url);
        const unit = input.metricName === 'cls' || input.metricName === 'score' ? 'score' : 'ms';
        await (prisma.performanceMetric as any).upsert({
            where: { siteId_metricName_source: { siteId: input.siteId, metricName: input.metricName, source } },
            create: {
                tenantId: input.tenantId, siteId: input.siteId, connectorInstanceId: input.connectorInstanceId || null,
                category: 'WEB_VITALS', metricName: input.metricName, source,
                metricValue: String(input.metricValue), unit, device: input.strategy, route: input.url, timestamp: input.timestamp,
            },
            update: {
                tenantId: input.tenantId, connectorInstanceId: input.connectorInstanceId || null, category: 'WEB_VITALS',
                metricValue: String(input.metricValue), unit, device: input.strategy, route: input.url, timestamp: input.timestamp,
            },
        });
    }

}