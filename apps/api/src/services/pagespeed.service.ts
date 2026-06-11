import { prisma, decryptSecret } from '@kpi-platform/db';

type PagespeedMetricName = 'lcp' | 'fid' | 'cls' | 'ttfb';
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
    credentials?: Array<{ encryptedSecret: any }>;
};

const METRIC_MAP: Array<{ key: PagespeedMetricName; auditName: string }> = [
    { key: 'lcp', auditName: 'largest-contentful-paint' },
    { key: 'fid', auditName: 'max-potential-fid' },
    { key: 'cls', auditName: 'cumulative-layout-shift' },
    { key: 'ttfb', auditName: 'server-response-time' },
];

const PAGESPEED_SOURCE_PREFIX = 'pagespeed_api';

// Page-type breakdown lives in the same PerformanceMetric table under a distinct
// source prefix so it never mixes with the site-wide metrics above. The existing
// (siteId, metricName, source) unique constraint gives us per-(strategy,pageType)
// cache dedup for free — no schema migration required.
const PAGE_SOURCE_PREFIX = 'pagespeed_page';
const PAGE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

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
            const strategies: PagespeedStrategy[] = ['mobile', 'desktop'];
            const timestamp = new Date();

            const strategyResults: Array<{ strategy: PagespeedStrategy; upserted: number }> = [];
            const rejected: Array<{ strategy: PagespeedStrategy; reason: unknown }> = [];

            for (const strategy of strategies) {
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
                } catch (error) {
                    rejected.push({ strategy, reason: error });
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

        try {
            const fetchFn: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;
            const response = await fetchFn(`https://api.bigcommerce.com/stores/${storeHash}/v2/store`, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Auth-Token': accessToken,
                },
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

    private static async fetchPageSpeedResultWithRetry(storeUrl: string, strategy: PagespeedStrategy) {
        const attempts = strategy === 'mobile' ? 2 : 1;
        let lastError: unknown;

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                return await this.fetchPageSpeedResult(storeUrl, strategy);
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

    private static async fetchPageSpeedResult(storeUrl: string, strategy: PagespeedStrategy = 'mobile') {
        const url = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
        url.searchParams.set('url', storeUrl);
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
     * Discover representative Shopify URLs, run PageSpeed for each page type at the
     * given strategy (cache-first, 1h TTL), and return one entry per page type.
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
                    id: true, tenantId: true, siteId: true, providerId: true, syncConfig: true,
                    credentials: { orderBy: { lastRotatedAt: 'desc' }, take: 1, select: { encryptedSecret: true } },
                },
            });
        } else {
            connector = await this.getConnectorInstance(tenantId, projectId);
        }

        const result = {} as Record<PageType, any>;

        if (!connector) {
            for (const pt of PAGE_TYPES) result[pt] = this.unavailablePage(pt, null, 'No connected store found for this project.');
            return result;
        }

        const connectorInstanceId = connector.id;
        const urls = await this.discoverPageUrls(connector);

        // Resolve each page type concurrently; a single page failing never breaks the others.
        await Promise.all(PAGE_TYPES.map(async (pageType) => {
            const url = urls[pageType];
            if (!url) {
                result[pageType] = this.unavailablePage(pageType, null, this.missingUrlReason(pageType));
                return;
            }
            try {
                result[pageType] = await this.resolvePageMetrics({
                    tenantId, projectId, connectorInstanceId, strategy, pageType, url, forceRefresh,
                });
            } catch (error) {
                console.warn('[PageSpeedService] getPageTypeMetrics:page-failed', {
                    projectId, pageType, url, error: error instanceof Error ? error.message : String(error),
                });
                // Cache an "unavailable" sentinel so we don't re-hit PSI within the TTL.
                await this.upsertPageMetric({ tenantId, siteId: projectId, connectorInstanceId, strategy, pageType, metricName: 'score', metricValue: -1, url, timestamp: new Date() });
                result[pageType] = this.unavailablePage(pageType, url, this.failureReason(pageType));
            }
        }));

        return result;
    }

    private static async resolvePageMetrics(input: {
        tenantId: string; projectId: string; connectorInstanceId: string;
        strategy: PagespeedStrategy; pageType: PageType; url: string; forceRefresh: boolean;
    }): Promise<any> {
        const { tenantId, projectId, connectorInstanceId, strategy, pageType, url, forceRefresh } = input;
        const source = this.buildPageSource(strategy, pageType);

        // Cache-first.
        if (!forceRefresh) {
            const cached = await this.readCachedPage(projectId, connectorInstanceId, source);
            if (cached && cached.ageMs < PAGE_CACHE_TTL_MS) {
                if (cached.values.score !== undefined && cached.values.score < 0) {
                    return this.unavailablePage(pageType, cached.url || url, this.failureReason(pageType), cached.timestamp);
                }
                return this.buildPageResult(pageType, cached.url || url, cached.values, cached.timestamp);
            }
        }

        // Fetch fresh from PageSpeed.
        const response = await this.fetchPageSpeedResultWithRetry(url, strategy);
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

    private static missingUrlReason(pageType: PageType): string {
        if (pageType === 'pdp') return 'No published product found in the store to test.';
        if (pageType === 'plp') return 'No collection found in the store to test.';
        return 'Could not resolve a URL for this page type.';
    }

    private static failureReason(pageType: PageType): string {
        if (pageType === 'checkout') return 'Unavailable – Shopify restricts PageSpeed analysis for this page.';
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
    ): Promise<{ values: Partial<Record<PageMetricName, number>>; url: string | null; timestamp: string | null; ageMs: number } | null> {
        const rows = await (prisma.performanceMetric as any).findMany({
            where: {
                siteId: projectId,
                ...(connectorInstanceId ? { connectorInstanceId } : {}),
                source,
                metricName: { in: PAGE_METRIC_NAMES },
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

    // ─── Shopify representative-URL discovery ───────────────────────────────────

    private static async discoverPageUrls(connector: ConnectorInstanceConfig): Promise<Record<PageType, string | null>> {
        // Homepage works for any provider via the existing store-URL resolver.
        const storeUrl = await this.resolveStoreUrl(connector);
        const homepage = storeUrl ? `${storeUrl.replace(/\/$/, '')}/` : null;

        // PDP / PLP / Checkout discovery is Shopify-specific (Admin REST).
        if (connector.providerId !== 'shopify') {
            return { homepage, pdp: null, plp: null, checkout: null };
        }

        const cfg = (connector.syncConfig || {}) as Record<string, any>;
        const shopDomain = this.normalizeShopDomain(cfg.shopDomain);
        const credentials = this.parseCredentials(connector.credentials?.[0]?.encryptedSecret);
        const token = String(credentials.adminApiAccessToken || credentials.accessToken || credentials.token || '').trim();
        const apiVersion = String(cfg.apiVersion || '2024-01').trim();

        if (!shopDomain || !token) {
            return { homepage, pdp: null, plp: null, checkout: null };
        }

        // Public domain: prefer the shop's primary domain over the myshopify domain.
        let publicDomain = shopDomain;
        const shop = await this.shopifyAdminGet(shopDomain, token, apiVersion, '/shop.json');
        const primary = shop?.shop?.domain || shop?.shop?.myshopify_domain;
        if (primary) publicDomain = this.normalizeShopDomain(primary);

        const base = `https://${publicDomain}`;

        // PDP: first published product handle.
        let pdp: string | null = null;
        const products = await this.shopifyAdminGet(shopDomain, token, apiVersion, '/products.json?limit=1&published_status=published');
        const productHandle = products?.products?.[0]?.handle;
        if (productHandle) pdp = `${base}/products/${productHandle}`;

        // PLP: first collection handle (custom or smart).
        let plp: string | null = null;
        const custom = await this.shopifyAdminGet(shopDomain, token, apiVersion, '/custom_collections.json?limit=1');
        let collectionHandle = custom?.custom_collections?.[0]?.handle;
        if (!collectionHandle) {
            const smart = await this.shopifyAdminGet(shopDomain, token, apiVersion, '/smart_collections.json?limit=1');
            collectionHandle = smart?.smart_collections?.[0]?.handle;
        }
        if (collectionHandle) plp = `${base}/collections/${collectionHandle}`;

        return {
            homepage: `${base}/`,
            pdp,
            plp,
            checkout: `${base}/checkout`,
        };
    }

    private static normalizeShopDomain(value: unknown): string {
        return String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').split('/')[0];
    }

    private static async shopifyAdminGet(shopDomain: string, token: string, apiVersion: string, path: string): Promise<any | null> {
        try {
            const fetchFn: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;
            const response = await fetchFn(`https://${shopDomain}/admin/api/${apiVersion}${path}`, {
                method: 'GET',
                headers: { 'X-Shopify-Access-Token': token, Accept: 'application/json', 'Content-Type': 'application/json' },
            });
            if (!response.ok) {
                console.warn('[PageSpeedService] shopifyAdminGet:non-ok', { path, status: response.status });
                return null;
            }
            return await response.json();
        } catch (error) {
            console.warn('[PageSpeedService] shopifyAdminGet:failed', { path, error: error instanceof Error ? error.message : String(error) });
            return null;
        }
    }
}