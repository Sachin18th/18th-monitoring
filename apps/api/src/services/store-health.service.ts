import { prisma, decryptSecret } from '@kpi-platform/db';

/**
 * Backend API Observability — store-API health.
 *
 * For every connected store (Shopify / BigCommerce / Adobe Commerce) this
 * service pings the cheapest *authenticated* endpoint of the provider's API
 * using the connector's stored token, and records the result. The status code
 * tells us, per store:
 *
 *   200            → healthy      (reachable + token valid)
 *   401 / 403      → auth_failed  (token expired / revoked → reconnect needed)
 *   404            → degraded     (wrong shop domain / store hash)
 *   429 / 5xx      → degraded     (rate-limited / provider erroring)
 *   0 (no response)→ unreachable  (timeout / DNS / connection refused)
 *
 * Results persist to `connector_health_checks` so the dashboard can show
 * up/down state, uptime %, and p95 latency over time. The latest result is
 * also mirrored onto `ConnectorInstance.healthStatus` + `syncConfig.apiHealth`
 * so existing screens see the live state without a history query.
 */

const SHOPIFY_API_VERSION = '2024-01';
const PROBE_TIMEOUT_MS = 8000;

type ProbeState = 'healthy' | 'auth_failed' | 'degraded' | 'unreachable';

interface ProbeTarget {
    url: string;
    headers: Record<string, string>;
}

interface ProbeResult {
    ok: boolean;
    state: ProbeState;
    statusCode: number;
    latencyMs: number;
    endpoint: string | null;
    error: string | null;
}

interface ConnectorRow {
    id: string;
    siteId: string;
    tenantId: string;
    providerId: string;
    label: string;
    syncConfig: any;
    credentials: { encryptedSecret: string | null }[];
}

export class StoreHealthService {
    /** Probe every active connector across all projects (scheduled sweep). */
    public static async checkAll(): Promise<void> {
        const connectors = await prisma.connectorInstance.findMany({
            where: { disconnectedAt: null },
            select: {
                id: true,
                siteId: true,
                tenantId: true,
                providerId: true,
                label: true,
                syncConfig: true,
                credentials: {
                    orderBy: { lastRotatedAt: 'desc' },
                    take: 1,
                    select: { encryptedSecret: true },
                },
            },
        });
        // Probe in parallel: each call is independent and self-persists, so
        // total time ≈ the slowest single probe rather than the sum.
        await Promise.all(connectors.map((c) => this.checkOne(c as ConnectorRow)));
    }

    /** Probe every active connector for a single project. */
    public static async checkProject(siteId: string): Promise<void> {
        const connectors = await prisma.connectorInstance.findMany({
            where: { siteId, disconnectedAt: null },
            select: {
                id: true,
                siteId: true,
                tenantId: true,
                providerId: true,
                label: true,
                syncConfig: true,
                credentials: {
                    orderBy: { lastRotatedAt: 'desc' },
                    take: 1,
                    select: { encryptedSecret: true },
                },
            },
        });
        await Promise.all(connectors.map((c) => this.checkOne(c as ConnectorRow)));
    }

    /** Probe one connector, persist the result, and mirror the latest state. */
    public static async checkOne(c: ConnectorRow): Promise<void> {
        const result = await this.probe(c);

        try {
            await prisma.connectorHealthCheck.create({
                data: {
                    connectorInstanceId: c.id,
                    siteId: c.siteId,
                    tenantId: c.tenantId,
                    providerId: c.providerId,
                    ok: result.ok,
                    state: result.state,
                    statusCode: result.statusCode,
                    latencyMs: result.latencyMs,
                    endpoint: result.endpoint,
                    error: result.error,
                },
            });

            // Mirror the latest probe onto the connector so other screens see it.
            await prisma.connectorInstance.update({
                where: { id: c.id },
                data: {
                    healthStatus: result.ok ? 'HEALTHY' : result.state === 'degraded' ? 'DEGRADED' : 'CRITICAL',
                    syncConfig: {
                        ...(c.syncConfig && typeof c.syncConfig === 'object' ? c.syncConfig : {}),
                        apiHealth: {
                            ok: result.ok,
                            state: result.state,
                            statusCode: result.statusCode,
                            latencyMs: result.latencyMs,
                            error: result.error,
                            checkedAt: new Date().toISOString(),
                        },
                    },
                },
            });
        } catch (err: any) {
            console.error(`[StoreHealth] persist failed for ${c.id}:`, err?.message || err);
        }
    }

    /** Build the per-provider ping, execute it, and interpret the result. */
    private static async probe(c: ConnectorRow): Promise<ProbeResult> {
        const target = this.buildPing(c);
        if (!target) {
            return {
                ok: false,
                state: 'unreachable',
                statusCode: 0,
                latencyMs: 0,
                endpoint: null,
                error: 'missing base URL or access token',
            };
        }

        const started = Date.now();
        try {
            const res = await fetch(target.url, {
                method: 'GET',
                headers: target.headers,
                signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
            });
            const latencyMs = Date.now() - started;
            const status = res.status;
            // Drain the body so the connection can be reused/closed cleanly.
            await res.text().catch(() => undefined);

            return {
                ok: status >= 200 && status < 300,
                state: this.interpret(status),
                statusCode: status,
                latencyMs,
                endpoint: this.redact(target.url),
                error: status >= 200 && status < 300 ? null : `HTTP ${status}`,
            };
        } catch (err: any) {
            const latencyMs = Date.now() - started;
            const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
            return {
                ok: false,
                state: 'unreachable',
                statusCode: 0,
                latencyMs,
                endpoint: this.redact(target.url),
                error: isTimeout ? 'timeout' : String(err?.message || err?.name || 'network error'),
            };
        }
    }

    private static interpret(status: number): ProbeState {
        if (status >= 200 && status < 300) return 'healthy';
        if (status === 401 || status === 403) return 'auth_failed';
        return 'degraded';
    }

    /**
     * Resolve baseUrl + decrypted token for a connector and return the cheapest
     * authenticated "ping" request for its provider. Returns null when the
     * connector is not configured enough to be probed.
     */
    private static buildPing(c: ConnectorRow): ProbeTarget | null {
        const config = (c.syncConfig && typeof c.syncConfig === 'object' ? c.syncConfig : {}) as Record<string, any>;
        const creds = this.resolveCredentials(c.credentials?.[0]?.encryptedSecret);
        const provider = String(c.providerId || '').toLowerCase();

        if (provider === 'shopify') {
            const shopDomain = this.normalizeDomain(config.shopDomain || config.shop_domain);
            const token = String(
                creds.adminApiAccessToken || creds.accessToken || creds.access_token || creds.token || creds.apiKey || creds.password || '',
            ).trim();
            if (!shopDomain || !token) return null;
            const apiVersion = String(config.apiVersion || config.api_version || SHOPIFY_API_VERSION).trim();
            return {
                url: `https://${shopDomain}/admin/api/${apiVersion}/shop.json`,
                headers: { 'X-Shopify-Access-Token': token, Accept: 'application/json' },
            };
        }

        if (provider === 'bigcommerce') {
            const storeHash = String(config.storeHash || config.store_hash || '').trim();
            const rawBase = String(config.baseUrl || '').trim().replace(/\/+$/, '');
            const base = storeHash
                ? `https://api.bigcommerce.com/stores/${storeHash}`
                : rawBase.includes('api.bigcommerce.com')
                  ? rawBase
                  : '';
            const token = String(creds.accessToken || creds.token || creds.storeApiToken || '').trim();
            if (!base || !token) return null;
            // `/v2/time` is the canonical ping: validates token + store with the
            // least scope. `/v2/store` requires the "Store Information" scope,
            // which many sync tokens lack — using it produced false 403s even
            // when order/catalog sync worked fine.
            return {
                url: `${base}/v2/time`,
                headers: { 'X-Auth-Token': token, Accept: 'application/json' },
            };
        }

        if (provider === 'adobe_commerce' || provider === 'adobe' || provider === 'magento') {
            const base = String(config.baseUrl || config.storeUrl || '').trim().replace(/\/+$/, '');
            const token = String(
                creds.accessToken || creds.adminApiToken || creds.adminApiAccessToken || creds.token || creds.apiKey || creds.api_key || creds.bearerToken || '',
            ).trim();
            if (!base || !token) return null;
            return {
                url: `${base}/rest/V1/store/storeConfigs`,
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            };
        }

        return null;
    }

    /** Decrypt a credential envelope; never throws. */
    private static resolveCredentials(serialized: string | null | undefined): Record<string, any> {
        if (!serialized) return {};
        try {
            const parsed = decryptSecret(serialized);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    private static normalizeDomain(value: unknown): string {
        return String(value || '')
            .trim()
            .replace(/^https?:\/\//i, '')
            .split('/')[0]
            .replace(/\/+$/, '')
            .trim();
    }

    /** Strip query strings from a URL before storing (avoid leaking tokens). */
    private static redact(url: string): string {
        return url.split('?')[0];
    }

    // ──────────────────────────────────────────────────────────────────────
    // Read / aggregation for the dashboard
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Full observability payload for a project over the trailing window:
     * per-store current health, summary KPIs (uptime %, error rate, p95),
     * status-code distribution, and an hourly latency trend (p50/p95/p99).
     */
    public static async overview(
        siteId: string,
        opts: { connectorInstanceId?: string | null; windowHours?: number } = {},
    ) {
        const windowHours = opts.windowHours && opts.windowHours > 0 ? opts.windowHours : 24;
        const since = new Date(Date.now() - windowHours * 3600 * 1000);

        // Always fetch the site's connectors first. The connector filter (a
        // cross-page global injected by the dashboard) is only honored if it
        // actually belongs to THIS site — otherwise a stale id from another
        // project would filter everything out and the page would look empty.
        const siteConnectors = await prisma.connectorInstance.findMany({
            where: { siteId, disconnectedAt: null },
            select: { id: true, label: true, providerId: true, healthStatus: true },
        });
        const requested = opts.connectorInstanceId && opts.connectorInstanceId !== 'all' ? opts.connectorInstanceId : null;
        const validConnectorId = requested && siteConnectors.some((c) => c.id === requested) ? requested : null;

        const connectors = validConnectorId ? siteConnectors.filter((c) => c.id === validConnectorId) : siteConnectors;
        const checks = await prisma.connectorHealthCheck.findMany({
            where: { siteId, checkedAt: { gte: since }, ...(validConnectorId ? { connectorInstanceId: validConnectorId } : {}) },
            orderBy: { checkedAt: 'desc' },
            select: {
                connectorInstanceId: true,
                ok: true,
                state: true,
                statusCode: true,
                latencyMs: true,
                error: true,
                checkedAt: true,
            },
        });

        // Per-connector rollup (latest state + uptime% + p95 over the window).
        const byConnector = new Map<string, typeof checks>();
        for (const chk of checks) {
            const arr = byConnector.get(chk.connectorInstanceId) || [];
            arr.push(chk);
            byConnector.set(chk.connectorInstanceId, arr);
        }

        const connectorHealth = connectors.map((conn) => {
            const rows = byConnector.get(conn.id) || []; // already newest-first
            const latest = rows[0] || null;
            const total = rows.length;
            const healthy = rows.filter((r) => r.ok).length;
            const latencies = rows.map((r) => r.latencyMs);
            return {
                connectorInstanceId: conn.id,
                label: conn.label,
                provider: conn.providerId,
                state: latest?.state || 'unknown',
                ok: latest?.ok ?? null,
                statusCode: latest?.statusCode ?? null,
                latencyMs: latest?.latencyMs ?? null,
                p95: this.percentile(latencies, 95),
                uptime: total > 0 ? Math.round((healthy / total) * 1000) / 10 : null,
                checks: total,
                lastError: latest?.error || null,
                lastCheckedAt: latest?.checkedAt?.toISOString?.() || null,
            };
        });

        // Project-wide summary.
        const total = checks.length;
        const okCount = checks.filter((c) => c.ok).length;
        const allLatencies = checks.map((c) => c.latencyMs);
        const summary = {
            totalChecks: total,
            storesMonitored: connectors.length,
            storesHealthy: connectorHealth.filter((c) => c.ok === true).length,
            storesDown: connectorHealth.filter((c) => c.ok === false).length,
            errorRate: total > 0 ? Math.round(((total - okCount) / total) * 1000) / 10 : 0,
            uptime: total > 0 ? Math.round((okCount / total) * 1000) / 10 : 0,
            p50: this.percentile(allLatencies, 50),
            p95: this.percentile(allLatencies, 95),
            p99: this.percentile(allLatencies, 99),
        };

        // Status-code distribution (2xx / 3xx / 4xx / 5xx / no-response).
        const buckets = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, err: 0 };
        for (const c of checks) {
            const s = c.statusCode;
            if (s === 0) buckets.err++;
            else if (s >= 200 && s < 300) buckets['2xx']++;
            else if (s >= 300 && s < 400) buckets['3xx']++;
            else if (s >= 400 && s < 500) buckets['4xx']++;
            else buckets['5xx']++;
        }
        const statusCodes = Object.entries(buckets)
            .filter(([, v]) => v > 0)
            .map(([name, value]) => ({ name, value }));

        // Hourly latency trend (oldest → newest) with p50/p95/p99 per bucket.
        const latencyTrend = this.buildTrend(checks, since, windowHours);

        return { summary, connectors: connectorHealth, statusCodes, latencyTrend, windowHours };
    }

    /** Recent individual probe rows (newest first) for a project. */
    public static async history(
        siteId: string,
        opts: { connectorInstanceId?: string | null; limit?: number } = {},
    ) {
        const limit = Math.min(Math.max(opts.limit || 100, 1), 500);
        const requested = opts.connectorInstanceId && opts.connectorInstanceId !== 'all' ? opts.connectorInstanceId : null;
        // Honor the connector filter only if it belongs to this site (see overview).
        const valid = requested
            ? await prisma.connectorInstance.findFirst({ where: { id: requested, siteId }, select: { id: true } })
            : null;
        const connectorFilter = valid ? { connectorInstanceId: valid.id } : {};
        const rows = await prisma.connectorHealthCheck.findMany({
            where: { siteId, ...connectorFilter },
            orderBy: { checkedAt: 'desc' },
            take: limit,
            select: {
                connectorInstanceId: true,
                providerId: true,
                ok: true,
                state: true,
                statusCode: true,
                latencyMs: true,
                endpoint: true,
                error: true,
                checkedAt: true,
            },
        });
        return rows.map((r) => ({ ...r, checkedAt: r.checkedAt.toISOString() }));
    }

    // ── helpers ────────────────────────────────────────────────────────────

    private static buildTrend(
        checks: { latencyMs: number; checkedAt: Date }[],
        since: Date,
        windowHours: number,
    ) {
        // Bucket size: keep ~24 points regardless of window length.
        const bucketMs = Math.max(3600 * 1000, Math.round((windowHours * 3600 * 1000) / 24));
        const start = since.getTime();
        const groups = new Map<number, number[]>();
        for (const c of checks) {
            const idx = Math.floor((c.checkedAt.getTime() - start) / bucketMs);
            const arr = groups.get(idx) || [];
            arr.push(c.latencyMs);
            groups.set(idx, arr);
        }
        return [...groups.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([idx, latencies]) => {
                const ts = new Date(start + idx * bucketMs);
                const label = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return {
                    timestamp: label,
                    p50: this.percentile(latencies, 50),
                    p95: this.percentile(latencies, 95),
                    p99: this.percentile(latencies, 99),
                };
            });
    }

    /** Nearest-rank percentile of a numeric array (0 when empty). */
    private static percentile(values: number[], p: number): number {
        if (!values.length) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const rank = Math.ceil((p / 100) * sorted.length);
        return sorted[Math.min(rank, sorted.length) - 1];
    }
}
