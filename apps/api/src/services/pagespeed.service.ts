import { prisma } from '@kpi-platform/db';

type PagespeedMetricName = 'lcp' | 'fid' | 'cls' | 'ttfb';

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

export class PageSpeedService {
    static async syncProjectMetrics(tenantId: string, projectId: string) {
        console.log('[PageSpeedService] syncProjectMetrics:start', { tenantId, projectId });

        try {
            const connector = await this.getConnectorInstance(tenantId, projectId);
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
            const strategies: Array<'mobile' | 'desktop'> = ['mobile', 'desktop'];
            const timestamp = new Date();

            const strategyResults = await Promise.allSettled(strategies.map(async (strategy) => {
                const response = await this.fetchPageSpeedResult(storeUrl, strategy);
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
                    source: `pagespeed_api:${strategy}`,
                })));

                return { strategy, upserted: rows.length };
            }));

            const rejected = strategyResults.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
            if (rejected.length > 0) {
                console.warn('[PageSpeedService] syncProjectMetrics:partial-failure', {
                    tenantId,
                    projectId,
                    failedStrategies: rejected.length,
                    reasons: rejected.map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason))),
                });
            }

            const latest = await this.getLatestMetrics(projectId);
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

    static async getLatestMetrics(projectId: string): Promise<any> {
        try {
            // Query both mobile and desktop saved sources
            const sources = ['pagespeed_api:mobile', 'pagespeed_api:desktop'];
            const metrics = await (prisma.performanceMetric as any).findMany({
                where: {
                    siteId: projectId,
                    source: { in: sources },
                    metricName: { in: METRIC_MAP.map((m) => m.key) },
                },
                orderBy: { timestamp: 'desc' },
            });

            console.log('[PageSpeedService] getLatestMetrics:query-result', {
                projectId,
                count: metrics.length,
            });

            const latest: any = { mobile: {}, desktop: {} };
            for (const metric of metrics) {
                const device = String(metric.source).includes('desktop') ? 'desktop' : 'mobile';
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
        if (!encryptedSecret) return {};
        try {
            return typeof encryptedSecret === 'string' ? JSON.parse(encryptedSecret) : (encryptedSecret as Record<string, any>);
        } catch {
            return {};
        }
    }

    private static async fetchPageSpeedResult(storeUrl: string, strategy: 'mobile' | 'desktop' = 'mobile') {
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
            // Keep this above client timeout headroom to reduce AbortError frequency.
            const controller = new AbortController();
            const timeoutMs = Number(process.env.PAGESPEED_FETCH_TIMEOUT_MS || 65000);
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
                category: 'WEB_VITALS',
                metricName: input.metricName,
                source: input.source,
                metricValue: String(input.metricValue),
                unit: input.metricName === 'cls' ? 'score' : 'ms',
                timestamp: input.timestamp,
            },
            update: {
                tenantId: input.tenantId,
                category: 'WEB_VITALS',
                metricValue: String(input.metricValue),
                unit: input.metricName === 'cls' ? 'score' : 'ms',
                timestamp: input.timestamp,
            },
        });
    }
}
