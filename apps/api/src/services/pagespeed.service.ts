//apps/api/src/services/pagespeed.service.ts
import { prisma, decryptSecret } from '@kpi-platform/db';

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

// Discovered PDP/PLP URLs are cached on the connector for this long. Catalogs and
// products change (a deleted product would 404 on PSI), so we re-discover after.
const PAGE_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
            // Run the strategies concurrently: sequential mobile+desktop scans can take
            // ~60s+ combined, which pushes the request past the dashboard proxy / client
            // timeout (70s) and surfaces as a socket-hang-up / ECONNRESET 500.
            const strategies: PagespeedStrategy[] = ['mobile', 'desktop'];
            const timestamp = new Date();

            const strategyResults: Array<{ strategy: PagespeedStrategy; upserted: number }> = [];
            const rejected: Array<{ strategy: PagespeedStrategy; reason: unknown }> = [];

            const settled = await Promise.allSettled(strategies.map(async (strategy) => {
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
                    return { strategy, upserted: 0 };
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

                return { strategy, upserted: rows.length };
            }));

            settled.forEach((outcome, index) => {
                if (outcome.status === 'fulfilled') {
                    strategyResults.push(outcome.value);
                } else {
                    rejected.push({ strategy: strategies[index], reason: outcome.reason });
                }
            });

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
        const attempts = strategy === 'mobile' ? 2 : 1;
        let lastError: unknown;

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                return await this.fetchPageSpeedResult(storeUrl, strategy, bustCache);
            } catch (error) {
                lastError = error;
                console.warn('[PageSpeedService] fetchPageSpeedResultWithRetry:attempt-failed', {
                    storeUrl,
                    strategy,
                    attempt,
                    attempts,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        throw lastError instanceof Error ? lastError : new Error(`PageSpeed ${strategy} request failed`);
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
            // Google PageSpeed API can take 15-30+ seconds to analyze a page.
            // Mobile runs are often slower than desktop, so give them more headroom.
            const controller = new AbortController();
            const defaultTimeoutMs = strategy === 'mobile' ? 120000 : 90000;
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
     * Run PageSpeed for each page type at the given strategy (cache-first, 1h TTL)
     * and return one entry per page type.
     *
     * Per the product brief, every page type is measured against the store's base
     * (homepage) URL for now. We deliberately do NOT discover or fabricate
     * PDP/PLP/checkout sub-paths — that discovery is unreliable (password-protected
     * storefronts, missing Admin tokens, Shopify blocking checkout) and previously
     * left those tabs permanently "Unavailable". The homepage is measured once and
     * reused for the other page types, annotated so the UI can surface a note.
     */
    static async getPageTypeMetrics(
        tenantId: string,
        projectId: string,
        connectorInstanceIdParam: string | undefined,
        strategy: PagespeedStrategy,
        forceRefresh = false,
    ): Promise<Record<PageType, any>> {
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
                tenantId, projectId, connectorInstanceId, strategy, pageType: 'homepage', url: homepageUrl, forceRefresh,
            });
        } catch (error) {
            console.warn('[PageSpeedService] getPageTypeMetrics:homepage-failed', {
                projectId, url: homepageUrl, error: error instanceof Error ? error.message : String(error),
            });
            await this.upsertPageMetric({ tenantId, siteId: projectId, connectorInstanceId, strategy, pageType: 'homepage', metricName: 'score', metricValue: -1, url: homepageUrl, timestamp: new Date() });
            homepage = this.unavailablePage('homepage', homepageUrl, this.failureReason('homepage'));
        }

        result.homepage = homepage;

        // PDP/PLP/Checkout PageSpeed calculation disabled — only the homepage is
        // measured for now. The discovery + per-page-type measurement below is
        // commented out; each non-homepage type simply proxies the homepage result
        // so the response shape stays unchanged for any remaining consumers.
        for (const pageType of ['pdp', 'plp', 'checkout'] as Array<'pdp' | 'plp' | 'checkout'>) {
            result[pageType] = this.proxyHomepageResult(pageType, homepage);
        }

        // // Resolve real per-page-type URLs. For Adobe Commerce we auto-discover
        // // PDP/PLP via the REST API (cached on the connector for 7 days). Other
        // // platforms — or a failed/empty discovery — return null here and each page
        // // type falls back to proxying the homepage measurement (legacy behaviour).
        // const pageUrls = await this.resolvePageTypeUrls(connector, storeUrl as string);
        //
        // for (const pageType of ['pdp', 'plp', 'checkout'] as Array<'pdp' | 'plp' | 'checkout'>) {
        //     const targetUrl = pageUrls ? pageUrls[pageType] : null;
        //     if (!targetUrl) {
        //         result[pageType] = this.proxyHomepageResult(pageType, homepage);
        //         continue;
        //     }
        //
        //     try {
        //         const measured = await this.resolvePageMetrics({
        //             tenantId, projectId, connectorInstanceId, strategy, pageType, url: targetUrl, forceRefresh,
        //         });
        //         if (measured?.available) {
        //             result[pageType] = measured;
        //         } else if (measured?.reason === NOT_MEASURED_REASON) {
        //             // First load, nothing cached yet — a benign "click Refresh" state,
        //             // NOT a discovered-URL failure. Leave it as-is.
        //             result[pageType] = measured;
        //         } else {
        //             // A discovered URL that PSI could not measure (product disabled
        //             // after discovery, redirect chain, 404). Surface this distinctly
        //             // from the homepage-proxy / not-configured states.
        //             result[pageType] = { ...measured, measurementError: 'discovered_url_unreachable' };
        //         }
        //     } catch (error) {
        //         console.warn('[PageSpeedService] getPageTypeMetrics:discovered-url-failed', {
        //             projectId, pageType, url: targetUrl,
        //             error: error instanceof Error ? error.message : String(error),
        //         });
        //         result[pageType] = {
        //             ...this.unavailablePage(pageType, targetUrl, 'Discovered URL could not be measured.'),
        //             measurementError: 'discovered_url_unreachable',
        //         };
        //     }
        // }

        return result;
    }

    /**
     * Resolve the PDP/PLP/Checkout URLs to measure for this connector.
     *
     * Adobe Commerce: returns auto-discovered URLs, using the copy cached on
     * `connector.metadata.page_urls` when it is fresh (< 7 days) and otherwise
     * re-discovering and persisting the result. A discovery error/empty catalog
     * falls back to the last cached copy if present, else null.
     *
     * Any other platform returns null so the caller proxies the homepage.
     */
    private static async resolvePageTypeUrls(
        connector: ConnectorInstanceConfig,
        storeUrl: string,
    ): Promise<{ pdp: string | null; plp: string | null; checkout: string } | null> {
        if (connector.providerId !== 'adobe_commerce') {
            return null; // Auto-discovery is Adobe Commerce-only for now.
        }

        const metadata = (connector.metadata && typeof connector.metadata === 'object')
            ? (connector.metadata as Record<string, any>)
            : {};
        const cached = (metadata.page_urls && typeof metadata.page_urls === 'object')
            ? (metadata.page_urls as Record<string, any>)
            : null;

        const discoveredAt = cached?.discovered_at ? new Date(cached.discovered_at).getTime() : NaN;
        const isFresh = Number.isFinite(discoveredAt) && (Date.now() - discoveredAt) < PAGE_URL_TTL_MS;
        if (cached && isFresh) {
            return this.normalizeCachedPageUrls(cached, storeUrl);
        }

        // Absent or stale (> 7 days) — re-discover.
        try {
            const discovered = await this.discoverPageUrls(connector, storeUrl);
            if (!discovered) {
                console.warn('[PageSpeedService] resolvePageTypeUrls:discovery-empty', { connectorId: connector.id });
                return cached ? this.normalizeCachedPageUrls(cached, storeUrl) : null;
            }

            const page_urls = { ...discovered, discovered_at: new Date().toISOString() };
            await (prisma.connectorInstance as any).update({
                where: { id: connector.id },
                data: { metadata: { ...metadata, page_urls } },
            });
            return discovered;
        } catch (error) {
            console.warn('[PageSpeedService] resolvePageTypeUrls:discovery-failed', {
                connectorId: connector.id,
                error: error instanceof Error ? error.message : String(error),
            });
            return cached ? this.normalizeCachedPageUrls(cached, storeUrl) : null;
        }
    }

    private static normalizeCachedPageUrls(
        cached: Record<string, any>,
        storeUrl: string,
    ): { pdp: string | null; plp: string | null; checkout: string } {
        return {
            pdp: typeof cached.pdp === 'string' && cached.pdp.trim() ? cached.pdp : null,
            plp: typeof cached.plp === 'string' && cached.plp.trim() ? cached.plp : null,
            checkout: typeof cached.checkout === 'string' && cached.checkout.trim()
                ? cached.checkout
                : `${storeUrl.replace(/\/$/, '')}/checkout/`,
        };
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

    /**
     * Adobe Commerce only: auto-discover a representative PDP and PLP URL via the
     * REST API so the page-type breakdown measures real product/category pages
     * instead of proxying the homepage. Checkout is the well-known static path.
     *
     * Returns null when discovery cannot run at all (no base URL or access token).
     * Individual page types resolve to null when their own lookup fails, so a
     * partial discovery (e.g. PLP found but PDP not) still returns useful URLs.
     */
    private static async discoverPageUrls(
        connector: ConnectorInstanceConfig,
        publicStoreUrl: string,
    ): Promise<{ pdp: string | null; plp: string | null; checkout: string } | null> {
        const syncConfig = connector.syncConfig || {};
        const apiBase = this.normalizePublicUrl(syncConfig.baseUrl || syncConfig.storeUrl);
        const publicBase = (publicStoreUrl || '').replace(/\/$/, '');
        if (!apiBase || !publicBase) {
            console.warn('[PageSpeedService] discoverPageUrls:missing-base-url', { connectorId: connector.id });
            return null;
        }

        const credentials = this.parseCredentials(connector.credentials?.[0]?.encryptedSecret);
        const token = String(
            credentials.accessToken || credentials.adminApiToken || credentials.adminApiAccessToken || credentials.token || credentials.apiKey || '',
        ).trim();
        if (!token) {
            console.warn('[PageSpeedService] discoverPageUrls:missing-token', { connectorId: connector.id });
            return null;
        }

        const checkout = `${publicBase}/checkout/`;

        // Magento's default URL rewrite appends ".html" to category/product url keys.
        // The suffix is store-configurable (catalog/seo/{category,product}_url_suffix)
        // and there is no reliable unauthenticated REST endpoint to read it, so we use
        // the Magento default and allow an explicit override via syncConfig.
        const categorySuffix = this.normalizeUrlSuffix(syncConfig.categoryUrlSuffix ?? syncConfig.category_url_suffix, '.html');
        const productSuffix = this.normalizeUrlSuffix(syncConfig.productUrlSuffix ?? syncConfig.product_url_suffix, '.html');

        const [plp, pdp] = await Promise.all([
            this.discoverPlpUrl(apiBase, token, publicBase, categorySuffix).catch((error) => {
                console.warn('[PageSpeedService] discoverPageUrls:plp-failed', {
                    connectorId: connector.id, error: error instanceof Error ? error.message : String(error),
                });
                return null;
            }),
            this.discoverPdpUrl(apiBase, token, publicBase, productSuffix).catch((error) => {
                console.warn('[PageSpeedService] discoverPageUrls:pdp-failed', {
                    connectorId: connector.id, error: error instanceof Error ? error.message : String(error),
                });
                return null;
            }),
        ]);

        return { pdp, plp, checkout };
    }

    // Walk the category tree, pick the first active, in-menu, non-root category, then
    // fetch it for its url_key (the tree endpoint omits url_key).
    private static async discoverPlpUrl(apiBase: string, token: string, publicBase: string, suffix: string): Promise<string | null> {
        const tree = await this.magentoGet(`${apiBase}/rest/V1/categories`, token);
        const categoryId = this.pickMenuCategoryId(tree);
        if (categoryId == null) return null;

        const category = await this.magentoGet(`${apiBase}/rest/V1/categories/${categoryId}`, token);
        const urlKey = this.readCustomAttribute(category, 'url_key');
        if (!urlKey) return null;

        return `${publicBase}/${urlKey}${suffix}`;
    }

    // Depth-first: first active + in-menu category below the root (level <= 1 is root).
    private static pickMenuCategoryId(node: any): number | null {
        const children: any[] = Array.isArray(node?.children_data) ? node.children_data : [];
        for (const child of children) {
            const level = Number(child?.level);
            const isRoot = Number.isFinite(level) && level <= 1;
            if (!isRoot && child?.is_active === true && child?.include_in_menu === true && child?.id != null) {
                return Number(child.id);
            }
            const fromChild = this.pickMenuCategoryId(child);
            if (fromChild != null) return fromChild;
        }
        return null;
    }

    // First enabled product; read url_key from custom_attributes, falling back to the
    // single-product endpoint (the list response can omit it).
    private static async discoverPdpUrl(apiBase: string, token: string, publicBase: string, suffix: string): Promise<string | null> {
        const url = new URL(`${apiBase}/rest/V1/products`);
        url.searchParams.set('searchCriteria[pageSize]', '1');
        url.searchParams.set('searchCriteria[filter_groups][0][filters][0][field]', 'status');
        url.searchParams.set('searchCriteria[filter_groups][0][filters][0][value]', '1');

        const payload = await this.magentoGet(url.toString(), token);
        const product = Array.isArray(payload?.items) ? payload.items[0] : null;
        if (!product) return null;

        let urlKey = this.readCustomAttribute(product, 'url_key');
        if (!urlKey && product?.sku) {
            const full = await this.magentoGet(`${apiBase}/rest/V1/products/${encodeURIComponent(String(product.sku))}`, token);
            urlKey = this.readCustomAttribute(full, 'url_key');
        }
        if (!urlKey) return null;

        return `${publicBase}/${urlKey}${suffix}`;
    }

    // url_key can sit at the top level or inside Magento's custom_attributes array.
    private static readCustomAttribute(entity: any, code: string): string | null {
        const direct = entity?.[code];
        if (typeof direct === 'string' && direct.trim()) return direct.trim();

        const attrs: any[] = Array.isArray(entity?.custom_attributes) ? entity.custom_attributes : [];
        const found = attrs.find((attr) => attr?.attribute_code === code);
        const value = found?.value;
        return typeof value === 'string' && value.trim() ? value.trim() : null;
    }

    // Normalize a configured URL suffix: '' means the store uses no suffix; a bare
    // value gets a leading dot; undefined/null uses the Magento default.
    private static normalizeUrlSuffix(value: unknown, fallback: string): string {
        if (value === undefined || value === null) return fallback;
        const raw = String(value).trim();
        if (raw === '') return '';
        return raw.startsWith('.') ? raw : `.${raw}`;
    }

    // Bounded authenticated GET against the Adobe Commerce REST API. Throws on a
    // non-2xx response so callers can decide whether to fall back.
    private static async magentoGet(requestUrl: string, token: string): Promise<any> {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            const fetchFn: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;
            const controller = new AbortController();
            const timeoutMs = Number(process.env.ADOBE_COMMERCE_FETCH_TIMEOUT_MS || 10000);
            timeout = setTimeout(() => controller.abort(), timeoutMs);

            const response = await fetchFn(requestUrl, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
            });

            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(`Adobe Commerce GET ${requestUrl} -> ${response.status} ${response.statusText} ${body.slice(0, 200)}`);
            }

            return await response.json();
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }

    private static async resolvePageMetrics(input: {
        tenantId: string; projectId: string; connectorInstanceId: string;
        strategy: PagespeedStrategy; pageType: PageType; url: string; forceRefresh: boolean;
    }): Promise<any> {
        const { tenantId, projectId, connectorInstanceId, strategy, pageType, url, forceRefresh } = input;
        const source = this.buildPageSource(strategy, pageType);

        // How long a stored PageSpeed measurement is considered "fresh enough" to serve
        // on a normal page load. Older than this and the next load auto-fetches a fresh
        // run (no explicit Refresh click required).
        const PAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

        // On a normal page load we serve the last stored measurement as long as it is
        // still fresh (under the TTL). A first-ever load with no measurement returns a
        // "not measured yet" state so it can't hang on a live PageSpeed call. A stale
        // cache (older than the TTL) falls through to a live run below. An explicit
        // refresh (forceRefresh=true) always re-measures.
        const cached = await this.readCachedPage(projectId, connectorInstanceId, source, strategy);
        if (!forceRefresh && cached && cached.ageMs < PAGE_CACHE_TTL_MS) {
            if (cached.values.score !== undefined && cached.values.score < 0) {
                return this.unavailablePage(pageType, cached.url || url, this.failureReason(pageType), cached.timestamp);
            }
            return this.buildPageResult(pageType, cached.url || url, cached.values, cached.timestamp);
        }
        if (!forceRefresh && !cached) {
            return this.unavailablePage(pageType, url, NOT_MEASURED_REASON, null);
        }
        // Cache is stale (> TTL) or forceRefresh=true — fall through to the live fetch below.

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

    private static buildPageSource(strategy: PagespeedStrategy, pageType: PageType): string {
        return `${PAGE_SOURCE_PREFIX}:${strategy}:${pageType}`;
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
        const source = this.buildPageSource(input.strategy, input.pageType);
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