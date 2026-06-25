//apps/api/src/services/dashboard.service.ts
import { prisma, decryptEmail } from '@kpi-platform/db';
import type { MetricFilterDto, KpiSummaryResponse, AlertSummaryResponse } from '../models/dashboard.dto';
import { AnalyticsEngine } from './analytics-engine.service';
import { PaymentGatewayService } from './payment-gateway.service';
import { StorefrontTrackingService } from './storefront-tracking.service';

// Removed GlobalMemoryStore usage - now using DB queries

export class DashboardService {
    private static deriveCustomerEmail(customer: any): string | null {
        const metadata = customer?.metadata || {};
        const rawCustomer = metadata?.rawCustomer || {};
        const candidates = [
            metadata?.email,
            metadata?.customerEmail,
            metadata?.contactEmail,
            rawCustomer?.email
        ];

        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim().length > 0) {
                return candidate.trim().toLowerCase();
            }
        }

        return null;
    }

    private static deriveOrderCustomerEmail(order: any): string | null {
        const metadata = order?.metadata || {};
        const rawOrder = metadata?.rawOrder || metadata?.adobeOrder || metadata?.bigcommerceOrder || {};
        const candidates = [
            metadata?.customerEmail,
            metadata?.buyerEmail,
            metadata?.email,
            rawOrder?.email,
            rawOrder?.contact_email,
            rawOrder?.customer_email,
            rawOrder?.customer?.email,
            rawOrder?.billing_address?.email,
            rawOrder?.shipping_address?.email,
            rawOrder?.extension_attributes?.shipping_assignments?.[0]?.shipping?.address?.email
        ];

        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim().length > 0) {
                return candidate.trim().toLowerCase();
            }
        }

        return null;
    }

    /**
     * Extracts and calculates the core Key Performance Indicators for a specific site.
     * Evaluates data over the given time range and computes the standard health states.
     * 
     * @param filters - The DTO containing the 'siteId' constraint.
     * @returns A mapped array of aggregated KPI objects.
     */
    static async getKpiSummaries(filters: MetricFilterDto): Promise<KpiSummaryResponse[]> {
        const { siteId } = filters;
        const analytics = await AnalyticsEngine.getSummaryKpis(siteId, filters);
        const systemPerf = await AnalyticsEngine.getSystemPerformance(siteId);

        // Calculate trends by comparing with previous period
        const previousFilters = { ...filters, previousPeriod: true };
        const previousAnalytics = await AnalyticsEngine.getSummaryKpis(siteId, previousFilters);
        const previousSystemPerf = await AnalyticsEngine.getSystemPerformance(siteId); // For simplicity, using same

        const calculateTrend = (current: number, previous: number) => {
            if (previous === 0) return 0;
            return ((current - previous) / previous) * 100;
        };

        const determineState = (value: number, thresholds: { warning: number; critical: number }) => {
            if (value >= thresholds.critical) return 'critical';
            if (value >= thresholds.warning) return 'warning';
            return 'healthy';
        };

        return [
            {
                kpiName: 'revenue',
                value: analytics.revenue,
                trendPct: calculateTrend(analytics.revenue, previousAnalytics.revenue),
                state: 'healthy', // Revenue is always healthy if positive
                unit: 'USD'
            },
            {
                kpiName: 'pageLoadTime',
                value: systemPerf.avgLatencyMs,
                trendPct: calculateTrend(systemPerf.avgLatencyMs, previousSystemPerf.avgLatencyMs),
                state: determineState(systemPerf.avgLatencyMs, { warning: 2000, critical: 5000 }),
                unit: 'ms'
            },
            {
                kpiName: 'ordersTotal',
                value: analytics.orderCount,
                trendPct: calculateTrend(analytics.orderCount, previousAnalytics.orderCount),
                state: 'healthy',
                unit: 'orders'
            },
            {
                kpiName: 'aov',
                value: analytics.aov,
                trendPct: calculateTrend(analytics.aov, previousAnalytics.aov),
                state: 'healthy',
                unit: 'USD'
            }
        ];
    }

    /**
     * Retrieves currently active threshold breaches and architectural alerts.
     * Guaranteed to isolate outputs to the requested 'siteId' preventing cross-tenant leakage.
     * 
     * @param filters - Contains limit/offset for pagination and 'siteId'.
     * @returns A mapped array of alert summaries sorted dynamically.
     */
    static async getActiveAlerts(filters: MetricFilterDto): Promise<AlertSummaryResponse[]> {
        if (!filters || !filters.siteId) return [];
        const { siteId, connectorInstanceId, limit = 50, offset = 0 } = filters;

        try {
            const alerts = await prisma.alert.findMany({
                where: {
                    siteId,
                    status: { in: ['TRIGGERED', 'ACTIVE'] },
                    ...(connectorInstanceId && connectorInstanceId !== 'all' ? { connectorInstanceId } : {})
                },
                orderBy: { triggeredAt: 'desc' },
                take: limit,
                skip: offset,
                select: {
                    id: true,
                    severity: true,
                    status: true,
                    message: true,
                    triggeredAt: true,
                    acknowledgedAt: true,
                    resolvedAt: true,
                    siteId: true,
                    alertType: true,
                    module: true
                }
            });

            return alerts.map((a: any) => ({
                alertId: a.id,
                kpiName: a.alertType || 'Unknown Metric',
                severity: a.severity || 'warning',
                status: a.status || 'active',
                message: a.message || 'System threshold breach detected',
                triggeredAt: a.triggeredAt?.toISOString() || new Date().toISOString(),
                acknowledgedAt: a.acknowledgedAt?.toISOString(),
                resolvedAt: a.resolvedAt?.toISOString(),
                module: a.module || 'System',
                affectedEntity: '-',
                ruleId: a.alertType,
                siteId: a.siteId,
            }));
        } catch (err) {
            console.warn(`[DashboardService] getActiveAlerts failed for site ${siteId}.`, err);
            return [];
        }
    }

    static async getAuditLogs(filters: MetricFilterDto) {
        const { tenantId, siteId, limit = 50 } = filters as any;
        try {
            const logs = await prisma.iamAuditLog.findMany({
                where: {
                    tenantId,
                    project: {
                        is: { id: siteId }
                    }
                },
                orderBy: { timestamp: 'desc' },
                take: limit,
                select: {
                    id: true,
                    actorId: true,
                    action: true,
                    targetType: true,
                    targetId: true,
                    timestamp: true,
                    metadata: true
                }
            });

            if (logs.length === 0) {
                return [];
            }

            return logs.map((l: any) => ({
                id: l.id,
                actor: l.actorId || 'System',
                action: l.action,
                entity: l.targetType || '-',
                value: l.targetId || '-',
                timestamp: l.timestamp.toLocaleString(),
                category: 'system'
            }));
        } catch (err) {
            console.warn(`[DashboardService] getAuditLogs failed for site ${siteId}.`, err);
            return [];
        }
    }

    static async getActivityFeed(filters: MetricFilterDto) {
        const { siteId } = filters;

        try {
            // Get recent sync events
            const syncEvents = await prisma.connectorLifecycleEvent.findMany({
                where: { projectId: siteId, eventType: 'CONNECTOR_SYNCED' },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: {
                    id: true,
                    connectorInstanceId: true,
                    createdAt: true,
                    severity: true,
                    payload: true
                }
            });

            const syncs = syncEvents.map((s: any) => ({
                id: `act-sync-${s.id}`,
                type: 'Integration Sync',
                entity: s.connectorInstanceId || 'Connector',
                timestamp: s.createdAt.toISOString(),
                status: s.severity === 'ERROR' ? 'error' : 'success',
                description: `Sync ${s.severity === 'ERROR' ? 'failed' : 'completed'} with ${s.payload?.records || 0} records.`
            }));

            // Get recent ingestion events
            const ingestions = await prisma.ingestionEvent.findMany({
                where: { projectId: siteId },
                orderBy: { receivedAt: 'desc' },
                take: 3,
                select: {
                    id: true,
                    mode: true,
                    sourceReferenceId: true,
                    receivedAt: true,
                    status: true
                }
            });

            const ingestionsFeed = ingestions.map((l: any) => ({
                id: `act-ing-${l.id}`,
                type: 'Event Ingested',
                entity: l.sourceReferenceId || 'Ingestion Pipeline',
                timestamp: l.receivedAt.toISOString(),
                status: l.status === 'SUCCESS' ? 'success' : 'processing',
                description: `${l.mode || 'Event'} received from ${l.sourceReferenceId || 'unknown'}.`
            }));

            const combined = [...syncs, ...ingestionsFeed]
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 10);

            if (combined.length === 0) {
                return [];
            }
            return combined;
        } catch (err) {
            console.warn(`[DashboardService] getActivityFeed failed for site ${siteId}.`, err);
            return [];
        }
    }

    static async getPerformanceSummary(filters: MetricFilterDto) {
        const { siteId } = filters;
        const systemPerf = await AnalyticsEngine.getSystemPerformance(siteId);
        
        const metrics = await prisma.performanceMetric.findMany({
            where: { siteId },
            select: { metricValue: true, metricName: true }
        });

        const getAvg = (metricName: string) => {
            const filtered = metrics.filter(m => m.metricName === metricName);
            if (filtered.length === 0) return 0;
            return Math.round(filtered.reduce((s, m) => s + Number(m.metricValue), 0) / filtered.length);
        };

        const avg = systemPerf.avgLatencyMs || 1200;
        
        return {
            p50: avg,
            p75: avg * 1.15,
            p90: avg * 1.3,
            p95: avg * 1.5,
            p99: avg * 2.2,
            avg: avg,
            errorRate: getAvg('errorRate') || 0.42,
            uptime: systemPerf.uptime || 99.9,
            ttfb: getAvg('ttfb') || 0,
            fid: getAvg('fid') || 0,
            cls: getAvg('cls') || 0,
            lcp: getAvg('lcp') || 0,
            fcp: getAvg('fcp') || 0
        };
    }

    static async getPerformanceAnomalies(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        // Query for anomalies based on thresholds
        const metrics = await prisma.performanceMetric.findMany({
            where: { siteId },
            select: { metricName: true, metricValue: true, region: true, timestamp: true }
        });

        const anomalies = [];
        
        // Check for high latency
        const latencyMetrics = metrics.filter(m => m.metricName === 'pageLoadTime');
        if (latencyMetrics.length > 0) {
            const avgLatency = latencyMetrics.reduce((s, m) => s + Number(m.metricValue), 0) / latencyMetrics.length;
            if (avgLatency > 3000) {
                anomalies.push({
                    id: 'anom-latency',
                    metric: 'p95 Latency',
                    severity: 'critical',
                    impact: `Region: ${latencyMetrics[0]?.region || 'Global'}`,
                    scope: 'Overall Performance',
                    window: 'Last 1h',
                    deviation: `+${Math.round(avgLatency - 2000)}ms`,
                    status: 'active'
                });
            }
        }

        // Check for high error rate
        const errorMetrics = metrics.filter(m => m.metricName === 'errorRate');
        if (errorMetrics.length > 0) {
            const avgError = errorMetrics.reduce((s, m) => s + Number(m.metricValue), 0) / errorMetrics.length;
            if (avgError > 5) {
                anomalies.push({
                    id: 'anom-error',
                    metric: 'Error Rate',
                    severity: 'warning',
                    impact: 'Global',
                    scope: 'API Responses',
                    window: 'Last 1h',
                    deviation: `+${avgError.toFixed(1)}%`,
                    status: 'active'
                });
            }
        }

        return anomalies;
    }

    static async getRegionalPerformance(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        const metrics = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'latencyByRegion' },
            select: { region: true, metricValue: true }
        });
        
        const regions = metrics.map(m => ({
            region: m.region || 'Unknown',
            countryCode: m.region || '??',
            avgLatency: Math.round(Number(m.metricValue)),
            errorRate: 0.2,
            trafficShare: 20,
            health: Number(m.metricValue) > 400 ? 'warning' as const : 'healthy' as const
        }));

        if (regions.length === 0) {
            return [];
        }

        return regions;
    }

    static async getDeviceSegmentation(filters: MetricFilterDto) {
        const { siteId } = filters;

        // Real-user device split comes from storefront_sessions (captured by the
        // /api/track tracker), scoped to this project's connectors. ConnectorInstance.siteId
        // is the project id.
        const connectors = await prisma.connectorInstance.findMany({
            where: { siteId },
            select: { id: true }
        });
        const connectorIds = connectors.map(c => c.id);
        if (connectorIds.length === 0) return [];

        const sessions = await prisma.storefrontSession.findMany({
            where: { connectorInstanceId: { in: connectorIds } },
            select: { connectorInstanceId: true, deviceType: true }
        });

        // Normalize device labels and count per (connector, device). Tagging each row
        // with connectorInstanceId lets the RUM page's connector filter rescope the donut.
        const normalizeDevice = (raw?: string | null) => {
            const d = (raw || '').toLowerCase();
            if (d === 'mobile') return 'Mobile';
            if (d === 'desktop') return 'Desktop';
            if (d === 'tablet') return 'Tablet';
            return 'Other';
        };

        const counts = new Map<string, { connectorInstanceId: string; name: string; value: number }>();
        for (const s of sessions) {
            const name = normalizeDevice(s.deviceType);
            const key = `${s.connectorInstanceId}::${name}`;
            const existing = counts.get(key);
            if (existing) existing.value += 1;
            else counts.set(key, { connectorInstanceId: s.connectorInstanceId, name, value: 1 });
        }

        const colorFor = (name: string) =>
            name === 'Desktop' ? 'var(--accent-blue)'
            : name === 'Mobile' ? 'var(--accent-green)'
            : name === 'Tablet' ? 'var(--accent-purple)'
            : 'var(--accent-orange)';

        return Array.from(counts.values()).map(row => ({
            name: row.name,
            value: row.value,
            connectorInstanceId: row.connectorInstanceId,
            color: colorFor(row.name)
        }));
    }

    static async getResourceBreakdown(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        const resources = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: { in: ['resourceSizeImages', 'resourceSizeJS', 'resourceSizeCSS', 'resourceSizeFonts', 'resourceSizeOther'] } },
            select: { metricName: true, metricValue: true }
        });

        const resourceMap: Record<string, number> = {
            'Images': 0,
            'JavaScript': 0,
            'CSS': 0,
            'Fonts': 0,
            'Other': 0
        };

        resources.forEach(r => {
            const name = r.metricName.replace('resourceSize', '');
            if (resourceMap[name] !== undefined) {
                resourceMap[name] = Number(r.metricValue);
            }
        });

        // If no data, provide defaults
        if (Object.values(resourceMap).every(v => v === 0)) {
            return [];
        }

        return Object.entries(resourceMap).map(([name, value]) => ({
            name,
            value: value / (1024 * 1024), // Convert to MB
            unit: 'MB'
        }));
    }

    static async getPerformanceTrends(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        const records = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'pageLoadTime' },
            orderBy: { timestamp: 'desc' },
            take: 12,
            select: { timestamp: true, metricValue: true }
        });
        
        if (records.length === 0) {
            const avg = 2500;
            return [];
        }

        return records.map(r => ({
            timestamp: r.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            pageLoadTime: Number(r.metricValue),
            ttfb: Number(r.metricValue) * 0.15,
            fcp: Number(r.metricValue) * 0.35,
            lcp: Number(r.metricValue) * 0.75,
        }));
    }

    static async getSlowestPages(filters: MetricFilterDto) {
        const { siteId } = filters;
        const records = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'pageLoadTime' },
            select: { route: true, metricValue: true }
        });
        
        const urlMap: Record<string, { total: number, count: number }> = {};
        records.forEach(r => {
            const url = r.route || '/unknown';
            if (!urlMap[url]) urlMap[url] = { total: 0, count: 0 };
            urlMap[url].total += Number(r.metricValue);
            urlMap[url].count += 1;
        });

        return Object.entries(urlMap)
            .map(([url, data]) => ({
                route: url,
                method: url.startsWith('/api') ? 'POST' : 'GET',
                p95: Math.round(data.total / data.count * 1.2),
                p99: Math.round(data.total / data.count * 1.5),
                avgLoadTime: Math.round(data.total / data.count),
                errorRate: 0.1,
                calls: data.count,
                status: (data.total / data.count) > 4000 ? 'critical' : (data.total / data.count) > 3000 ? 'warning' : 'healthy'
            }))
            .sort((a, b) => b.avgLoadTime - a.avgLoadTime)
            .slice(0, 5);
    }

    static async getUserActivitySummary(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        const metrics = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'activeUsers' },
            select: { device: true }
        });

        const sessions = metrics.length;
        const users = await prisma.user.count({ where: { projectAccess: { some: { projectId: siteId } } } });

        return {
            totalUsers: (sessions || 0) * 12,
            activeUsers: sessions || 0,
            identifiedRatio: sessions > 0 ? Math.round((users / sessions) * 100) : 0,
            newVsReturning: 38,
            sessions: sessions * 1.5,
            avgSessionDuration: 12.5,
            bounceRate: 34.2,
        };
    }

    static async getCustomerIntelligence(filters: MetricFilterDto) {
        const { siteId } = filters;
        const tenantId = (filters as any).tenantId;
        
                const { connectorInstanceId } = filters;
                // Avoid showing platform-provisioned default gateways (e.g. demo Razorpay)
                // unless a manual gateway config exists for the project. This prevents
                // the UI from displaying a default test gateway as "configured".
                const manualGatewayCountQuery = await prisma.$queryRaw<any[]>`
                        SELECT COUNT(1) as count FROM payment_gateway_configs
                        WHERE project_id = ${siteId}
                            AND tenant_id = ${tenantId}
                            AND (metadata->>'scope') = 'manual'
                `;
                const manualGatewayCount = (manualGatewayCountQuery && manualGatewayCountQuery[0] && Number(manualGatewayCountQuery[0].count)) || 0;

                const [customers, orders, sessionsCount, views, paymentGateways] = await Promise.all([
            prisma.user.findMany({
                where: {
                    projectAccess: { some: { projectId: siteId } },
                    role: 'USER'
                },
                take: 5,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    lastLoginAt: true
                }
            }),
            prisma.canonicalOrder.count({
                where: {
                    siteId,
                    ...(connectorInstanceId && connectorInstanceId !== 'all' ? { connectorInstanceId } : {})
                }
            }),
            prisma.performanceMetric.count({
                where: { siteId, metricName: 'sessionStart' }
            }),
            prisma.performanceMetric.count({
                where: { siteId, metricName: 'pageView' }
            }),
            // Only sync configured gateways if there is at least one manual config.
            // Otherwise return an empty array so the UI shows the "no configured gateways" message.
            manualGatewayCount > 0 ? PaymentGatewayService.syncConfiguredGateways(siteId, tenantId) : []
        ]);

        const connectorFilter = connectorInstanceId && connectorInstanceId !== 'all'
            ? { connectorInstanceId }
            : {};

        // Real journey data backfilled from Shopify customer_sessions / customer_events.
        const [journeySessions, convertedSessions, productViewEvents, sessionsBySource] = await Promise.all([
            prisma.customerSession.count({ where: { siteId, ...connectorFilter } }),
            prisma.customerSession.count({ where: { siteId, isConverted: 1, ...connectorFilter } }),
            prisma.customerEvent.count({
                where: { siteId, eventName: { in: ['product_viewed', 'product_view'] }, ...connectorFilter }
            }),
            prisma.customerSession.groupBy({
                by: ['trafficSource'],
                where: { siteId, ...connectorFilter },
                _count: { _all: true },
                _sum: { isConverted: true }
            })
        ]);

        const hasJourneyData = journeySessions > 0;

        // Prefer real session data when available; otherwise fall back to the
        // performance-metric derived estimate so existing projects keep working.
        const sessions = hasJourneyData ? journeySessions : (sessionsCount || 1);
        const productViews = hasJourneyData ? productViewEvents : views;
        const purchases = hasJourneyData ? convertedSessions : orders;

        const topAttribution = hasJourneyData && sessionsBySource.length > 0
            ? sessionsBySource
                .map((row) => ({
                    source: row.trafficSource || 'Direct / Unknown',
                    sessions: row._count?._all || 0,
                    conversion: row._count?._all
                        ? Math.round((Number(row._sum?.isConverted || 0) / row._count._all) * 100)
                        : 0
                }))
                .sort((a, b) => b.sessions - a.sessions)
                .slice(0, 5)
            : [
                { source: 'Direct / Organic', sessions, conversion: Math.round((purchases / sessions) * 100) }
            ];

        // Purchase Journey Funnel — sourced from storefront_sessions (the tracker
        // session aggregate), which is the authoritative funnel record. Scoped to
        // this project's connector instances (one project may have several).
        const connectorRows = await prisma.connectorInstance.findMany({
            where: {
                siteId,
                tenantId,
                ...(connectorInstanceId && connectorInstanceId !== 'all' ? { id: connectorInstanceId } : {})
            },
            select: { id: true }
        });
        const connectorIds = connectorRows.map((c) => c.id);

        // Journey Intel range: allowlisted 7d/30d/90d, default 30d.
        const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
        const range = RANGE_DAYS[(filters as any).timeRange] ? (filters as any).timeRange : '30d';
        const to = new Date();
        const from = new Date(to.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);

        const [journey, insights] = await Promise.all([
            StorefrontTrackingService.journeyIntel({ connectorInstanceIds: connectorIds, from, to }),
            StorefrontTrackingService.journeyInsights({ connectorInstanceIds: connectorIds, from, to })
        ]);

        return {
            meta: { generatedAt: to.toISOString(), range },
            generatedAt: to.toISOString(),
            range,
            funnel: journey.funnel,
            sessionIntelligence: { ...journey.sessionIntelligence, ...insights },
            segments: [
                { name: 'Identified Customers', size: customers.length, active: customers.length, conversion: Math.round((purchases / (customers.length || 1)) * 100), growth: 0 },
                { name: 'Anonymous Guests', size: Math.max(0, sessions - customers.length), active: 0, conversion: 0, growth: 0 }
            ],
            topAttribution,
            paymentGateways,
            recentIdentities: customers.map(c => ({
                id: c.id,
                name: c.name || '',
                email: c.email,
                state: 'Active',
                sessions: 1,
                lastActive: c.lastLoginAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || 'N/A'
            }))
        };
    }

    static async savePaymentGatewayConfig(
        filters: MetricFilterDto,
        input: { gatewayName: string; label?: string; apiKey?: string; apiSecret?: string; metadata?: Record<string, unknown> }
    ) {
        const { siteId } = filters;
        const tenantId = (filters as any).tenantId;

        if (!siteId || !tenantId) {
            throw new Error('siteId and tenantId are required to save a payment gateway configuration.');
        }

        return PaymentGatewayService.upsertGatewayConfig(siteId, tenantId, input);
    }

    static async getPaymentGatewayStatuses(filters: MetricFilterDto) {
        const { siteId } = filters;
        const tenantId = (filters as any).tenantId;

        if (!siteId || !tenantId) {
            return [];
        }

        return PaymentGatewayService.syncConfiguredGateways(siteId, tenantId);
    }

    static async getUserTrends(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        const sessionCount = await prisma.performanceMetric.count({
            where: { siteId, metricName: 'sessionStart' }
        });

        const pageViewCount = await prisma.performanceMetric.count({
            where: { siteId, metricName: 'pageView' }
        });

        const metrics = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'sessionStart' },
            select: { device: true }
        });

        const userCount = new Set(metrics.map(e => e.device || 'session')).size;

        return {
            sessions: sessionCount,
            activeUsers: userCount,
            pageViews: pageViewCount,
            avgSessionDuration: '4m 12s',
            bounceRate: '32%',
            topDevices: [
                { name: 'Desktop', share: 0.65 },
                { name: 'Mobile', share: 0.30 },
                { name: 'Tablet', share: 0.05 }
            ]
        };
    }

    static async getUserAnalytics(filters: MetricFilterDto) {
        const { siteId } = filters;
        const now = Date.now();
        const activeWindow = 5 * 60 * 1000; // 5 minutes

        const sessions = await prisma.userSession.findMany({
            where: { user: { projectAccess: { some: { projectId: siteId } } } },
            select: { createdAt: true, expiresAt: true }
        });

        const activeSessions = sessions.filter(s => s.expiresAt.getTime() > now);

        // Estimate device/browser breakdown from performance metrics
        const metrics = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'userAgent' },
            take: activeSessions.length,
            select: { device: true, browser: true }
        });

        const deviceBreakdown: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 };
        const browserBreakdown: Record<string, number> = { chrome: 0, safari: 0, edge: 0, firefox: 0, other: 0 };
        
        metrics.forEach(m => {
            const device = (m.device || 'desktop').toLowerCase();
            if (deviceBreakdown[device] !== undefined) deviceBreakdown[device]++;
            else deviceBreakdown.desktop++;

            const browser = (m.browser || 'chrome').toLowerCase();
            if (browserBreakdown[browser] !== undefined) browserBreakdown[browser]++;
            else browserBreakdown.other++;
        });

        const total = Math.max(activeSessions.length, 1);

        return {
            activeUsers: activeSessions.length,
            totalCustomers: activeSessions.length,
            activeVisitors: 0,
            deviceBreakdown: {
                desktop: { count: deviceBreakdown.desktop, percentage: Math.round((deviceBreakdown.desktop / total) * 100) },
                mobile:  { count: deviceBreakdown.mobile,  percentage: Math.round((deviceBreakdown.mobile / total) * 100) },
                tablet:  { count: deviceBreakdown.tablet,  percentage: Math.round((deviceBreakdown.tablet / total) * 100) }
            },
            browserBreakdown: Object.entries(browserBreakdown).map(([name, count]) => ({
                name,
                count,
                percentage: Math.round((count / total) * 100)
            })).sort((a,b) => b.count - a.count)
        };
    }


    static async getTopPages(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        const records = await prisma.performanceMetric.findMany({
            where: { siteId, metricName: 'pageView' },
            select: { route: true }
        });
        
        const urlMap: Record<string, number> = {};
        records.forEach(r => {
            const url = r.route || '/';
            urlMap[url] = (urlMap[url] || 0) + 1;
        });

        return Object.entries(urlMap)
            .map(([url, count]) => ({ url, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }

    static async getFunnelData(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        const orders = await prisma.canonicalOrder.findMany({
            where: { siteId },
            select: { id: true, normalizedStatus: true }
        });

        const sessionCount = await prisma.performanceMetric.count({
            where: { siteId, metricName: 'sessionStart' }
        }) || orders.length * 8;

        const stages = [
            { step: 'Landing Page', count: sessionCount },
            { step: 'Product View', count: Math.round(sessionCount * 0.65) },
            { step: 'Add to Cart', count: Math.round(sessionCount * 0.22) },
            { step: 'Checkout', count: orders.filter(o => ['placed','paid','shipped','delivered'].includes((o.normalizedStatus || '').toLowerCase())).length || Math.round(sessionCount * 0.12) },
            { step: 'Purchase', count: orders.filter(o => ['paid','shipped','delivered'].includes((o.normalizedStatus || '').toLowerCase())).length || Math.round(sessionCount * 0.08) }
        ];
        const top = stages[0].count || 1;
        return stages.map(s => ({ ...s, percentage: Math.round((s.count / top) * 100) }));
    }

    /**
     * Collates complex order aggregation metrics including delays, channels, and total volumes.
     * Hardened against null data, invalid dates, and empty datasets.
     */
    static async getOrderSummary(filters: MetricFilterDto) {
        const { siteId, connectorInstanceId } = filters;
        const allOrders = await prisma.canonicalOrder.findMany({
            where: {
                siteId,
                ...(connectorInstanceId && connectorInstanceId !== 'all' ? { connectorInstanceId } : {})
            },
            select: {
                id: true,
                normalizedStatus: true,
                totalAmount: true,
                createdAt: true,
                placedAt: true,
                lifecycleState: true,
                taxAmount: true,
            }
        });
        
        const criticalFailureStatuses = new Set([
            'FAILED',
            'RETURNED',
            'CANCELLED',
            'CANCELED',
            'REFUNDED',
            'DEAD_LETTERED',
            'REJECTED',
            'MISMATCH'
        ]);

        const isFailedOrder = (o: typeof allOrders[number]) => {
            const normalizedStatus = (o.normalizedStatus || '').toUpperCase();
            const lifecycleState = (o.lifecycleState || '').toUpperCase();
            return criticalFailureStatuses.has(normalizedStatus) || criticalFailureStatuses.has(lifecycleState);
        };
        const isDelayedOrder = (o: typeof allOrders[number]) => (o.lifecycleState || '').toUpperCase() === 'PROCESSING';

        const failedCount = allOrders.filter(isFailedOrder).length;
        const delayedCount = allOrders.filter(isDelayedOrder).length;
        const mismatches = allOrders.filter(o => (o.normalizedStatus || '').toUpperCase() === 'MISMATCH').length;

        // Real revenue at risk: the actual order value tied up in orders that are
        // either failed (critical states) or delayed (still processing). An order
        // can match both predicates, so we de-dupe on id before summing.
        const atRiskOrders = allOrders.filter(o => isFailedOrder(o) || isDelayedOrder(o));
        const revenueAtRisk = atRiskOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
        
        const now = Date.now();
        const hourAgo = now - 3600000;
        const ordersThisHour = allOrders.filter(o => {
            const orderTimestamp = o.placedAt ?? o.createdAt;
            return orderTimestamp.getTime() > hourAgo;
        }).length;

        const totalRevenue = allOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
        const taxTotal = allOrders.reduce((sum, order) => sum + Number(order.taxAmount || 0), 0);
        const averageOrderValue = allOrders.length > 0 ? totalRevenue / allOrders.length : 0;
        
        const stages = [
            { stage: 'Placed', count: allOrders.filter(o => (o.normalizedStatus || '').toUpperCase() === 'PLACED').length, color: '#3b82f6' },
            { stage: 'Processing', count: allOrders.filter(o => (o.lifecycleState || '').toUpperCase() === 'PROCESSING').length, color: '#f59e0b' },
            { stage: 'Shipped', count: allOrders.filter(o => (o.normalizedStatus || '').toUpperCase() === 'SHIPPED').length, color: '#10b981' },
            { stage: 'Delivered', count: allOrders.filter(o => (o.normalizedStatus || '').toUpperCase() === 'DELIVERED').length, color: '#059669' },
            { stage: 'Cancelled', count: allOrders.filter(o => (o.normalizedStatus || '').toUpperCase() === 'CANCELLED').length, color: '#ef4444' },
        ];

        return {
            totalOrders: allOrders.length,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            averageOrderValue: Math.round(averageOrderValue * 100) / 100,
            taxTotal: Math.round(taxTotal * 100) / 100,
            ordersThisHour,
            failedCount,
            delayedCount,
            mismatches,
            revenueAtRisk: Math.round(revenueAtRisk * 100) / 100,
            atRiskOrderCount: atRiskOrders.length,
            ordersPerMinute: (ordersThisHour / 60).toFixed(2),
            stages,
            metadata: {
                sampleSize: allOrders.length,
                filteredBy: ['siteId']
            }
        };
    }

    static async getOrderTrends(filters: MetricFilterDto) {
        const { siteId, connectorInstanceId } = filters;
        
        const orders = await prisma.canonicalOrder.findMany({
            where: {
                siteId,
                ...(connectorInstanceId && connectorInstanceId !== 'all' ? { connectorInstanceId } : {})
            },
            select: { id: true, createdAt: true, placedAt: true, channel: true }
        });

        const now = Date.now();
        const buckets: Record<string, { online: number; offline: number }> = {};

        for (let i = 5; i >= 0; i--) {
            const t = new Date(now - i * 3600000);
            const label = `${t.getHours().toString().padStart(2, '0')}:00`;
            buckets[label] = { online: 0, offline: 0 };
        }

        orders.forEach(o => {
            const orderTimestamp = o.placedAt ?? o.createdAt;
            const label = `${orderTimestamp.getHours().toString().padStart(2, '0')}:00`;
            if (buckets[label]) {
                if (o.channel === 'POS') buckets[label].offline++;
                else buckets[label].online++;
            }
        });

        return Object.entries(buckets).map(([timestamp, counts]) => ({ timestamp, ...counts }));
    }

    static async getOrderRCA(filters: MetricFilterDto) {
        const { siteId, connectorInstanceId } = filters;
        const anomalies = [];
        
        // 1. Check for Performance Correlation
        const perfMetrics = await prisma.performanceMetric.findMany({
            where: {
                siteId,
                metricName: 'pageLoadTime',
                ...(connectorInstanceId && connectorInstanceId !== 'all' ? { connectorInstanceId } : {})
            },
            select: { metricValue: true }
        });

        const avgLatency = perfMetrics.length > 0 
            ? perfMetrics.reduce((acc, m) => acc + Number(m.metricValue), 0) / perfMetrics.length 
            : 0;
        
        if (avgLatency > 3000) {
            anomalies.push({
                type: 'Performance Degradation',
                metric: 'Page Load Time',
                value: `${Math.round(avgLatency)}ms`,
                impact: 'High correlation with checkout abandonment',
                confidence: 0.85
            });
        }

        // 2. Check for Integration Failures
        const syncFailures = await prisma.connectorLifecycleEvent.count({
            where: { projectId: siteId, severity: 'ERROR' }
        });

        if (syncFailures > 0) {
            anomalies.push({
                type: 'Integration Failure',
                metric: 'OMS Sync Health',
                value: `${syncFailures} failed attempts`,
                impact: 'Offline order ingestion blocked',
                confidence: 0.95
            });
        }

        // 3. Check for JS Errors
        const jsErrors = await prisma.performanceMetric.count({
            where: { siteId, metricName: 'jsError' }
        });

        if (jsErrors > 3) {
            anomalies.push({
                type: 'Frontend Stability',
                metric: 'JS Error Rate',
                value: `${jsErrors} spikes`,
                impact: 'Potential breakage in Add to Cart / Checkout flow',
                confidence: 0.7
            });
        }

        return {
            status: anomalies.length > 0 ? 'alert' : 'healthy',
            anomalies,
            analyzedAt: new Date().toISOString()
        };
    }

    static async getRecommendations(filters: MetricFilterDto) {
        const rca = await this.getOrderRCA(filters);
        const recommendations = [];

        for (const anomaly of rca.anomalies) {
            if (anomaly.type === 'Performance Degradation') {
                recommendations.push({
                    title: 'Optimize Checkout Assets',
                    action: 'Investigate LCP on /checkout page. Heavy script or image blocking render.',
                    priority: 'Critical'
                });
            }
            if (anomaly.type === 'Integration Failure') {
                recommendations.push({
                    title: 'Restart OMS Connector',
                    action: 'Verify API credentials and connectivity for OMS-1 system.',
                    priority: 'High'
                });
            }
            if (anomaly.type === 'Frontend Stability') {
                recommendations.push({
                    title: 'Check Payment Gateway Hook',
                    action: 'Frequent "ReferenceError" detected in payment script handler.',
                    priority: 'High'
                });
            }
        }

        if (recommendations.length === 0) {
            recommendations.push({
                title: 'No Action Required',
                action: 'System operating within normal baseline parameters.',
                priority: 'Low'
            });
        }

        return recommendations;
    }

    static async getDelayedOrders(filters: MetricFilterDto) {
        const { siteId, connectorInstanceId } = filters;
        const orders = await prisma.canonicalOrder.findMany({
            where: {
                siteId,
                normalizedStatus: 'PLACED',
                ...(connectorInstanceId && connectorInstanceId !== 'all' ? { connectorInstanceId } : {})
            },
            orderBy: { placedAt: 'asc' },
            take: 10,
            select: { id: true, createdAt: true, placedAt: true, channel: true }
        });
        
        return orders.map(o => ({
            orderId: o.id,
            placedAt: (o.placedAt ?? o.createdAt).toISOString(),
            channel: o.channel || 'Unknown',
            minutesDelayed: Math.floor((Date.now() - (o.placedAt ?? o.createdAt).getTime()) / 60000)
        }));
    }

    static async getOrderSourceBreakdown(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        const orders = await prisma.canonicalOrder.findMany({
            where: { siteId },
            select: { channel: true }
        });
        
        const channels: Record<string, number> = { 'Web': 0, 'Mobile': 0, 'POS': 0, 'API': 0 };
        orders.forEach(o => {
            const ch = (o.channel || 'Web').charAt(0).toUpperCase() + (o.channel || 'Web').slice(1);
            channels[ch] = (channels[ch] || 0) + 1;
        });

        return Object.entries(channels).map(([name, value]) => ({ name, value }));
    }

    static async getIntegrationHealthSummary(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        // Get connector instances
        const connectors = await prisma.connectorInstance.findMany({
            where: { siteId },
            select: { id: true, healthStatus: true, lastSyncAt: true, lastError: true }
        });

        const total = connectors.length;
        const healthy = connectors.filter(c => c.healthStatus === 'HEALTHY').length;
        const successRate = total > 0 ? Math.round((healthy / total) * 100) : 100;

        // Get sync runs for latency
        const syncRuns = await prisma.connectorSyncRun.findMany({
            where: { connectorInstance: { siteId } },
            select: { status: true, startedAt: true, finishedAt: true }
        });

        const successfulRuns = syncRuns.filter(r => r.status === 'SUCCESS');
        const failedRuns = syncRuns.filter(r => r.status === 'FAILED');

        // Calculate average latency
        const latencies = successfulRuns
            .filter(r => r.startedAt && r.finishedAt)
            .map(r => r.finishedAt!.getTime() - r.startedAt!.getTime());
        const avgLatency = latencies.length > 0 
            ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
            : 0;

        return {
            successRate,
            failureCount24h: failedRuns.length,
            avgOmsLatency: avgLatency,
            healthScore: Math.max(0, Math.min(100, successRate - (failedRuns.length * 2))),
        };
    }

    static async getSyncTrends(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        // Get sync runs from last 6 hours
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        const syncRuns = await prisma.connectorSyncRun.findMany({
            where: { 
                connectorInstance: { siteId },
                startedAt: { gte: sixHoursAgo }
            },
            select: { status: true, startedAt: true }
        });

        const buckets: Record<string, { success: number; failure: number }> = {};

        for (let i = 5; i >= 0; i--) {
            const t = new Date(Date.now() - i * 600000); // 10-min buckets
            const label = `${t.getHours().toString().padStart(2, '0')}:${(Math.floor(t.getMinutes() / 10) * 10).toString().padStart(2, '0')}`;
            buckets[label] = { success: 0, failure: 0 };
        }

        syncRuns.forEach(r => {
            if (!r.startedAt) return;
            const d = r.startedAt;
            const label = `${d.getHours().toString().padStart(2, '0')}:${(Math.floor(d.getMinutes() / 10) * 10).toString().padStart(2, '0')}`;
            if (buckets[label]) {
                if (r.status === 'SUCCESS') buckets[label].success++;
                else if (r.status === 'FAILED') buckets[label].failure++;
            }
        });

        return Object.entries(buckets).map(([timestamp, counts]) => ({ timestamp, ...counts }));
    }

    static async getFailedSyncs(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        const failedRuns = await prisma.connectorSyncRun.findMany({
            where: { 
                connectorInstance: { siteId },
                status: 'FAILED'
            },
            orderBy: { startedAt: 'desc' },
            take: 5,
            select: {
                id: true,
                connectorInstance: { select: { providerId: true } },
                errorSummary: true,
                startedAt: true
            }
        });

        return failedRuns.map(r => ({
            id: r.id,
            system: r.connectorInstance.providerId || 'Unknown',
            error: r.errorSummary ? JSON.stringify(r.errorSummary) : 'Sync failed',
            timestamp: r.startedAt?.toISOString() || new Date().toISOString()
        }));
    }

    static async getOrders(filters: MetricFilterDto) {
        const { siteId } = filters;
        const orders = await prisma.canonicalOrder.findMany({
            where: { siteId },
            orderBy: { placedAt: 'desc' }
        });

        return orders.map((order: any) => {
            const customerEmail = this.deriveOrderCustomerEmail(order);
            const metadata = {
                ...(order?.metadata || {})
            } as Record<string, any>;

            if (customerEmail && !metadata.customerEmail) {
                metadata.customerEmail = customerEmail;
            }

            return {
                ...order,
                metadata
            };
        });
    }

    static async getCustomers(filters: MetricFilterDto) {
        const { siteId } = filters;
        const customers = await prisma.customerProfile.findMany({
            where: { siteId },
            orderBy: { lastSeenAt: 'desc' }
        });

        return customers.map((customer: any) => {
            const metadata = {
                ...(customer?.metadata || {})
            } as Record<string, any>;
            const rawCustomer = metadata?.rawCustomer || {};

            // The plaintext email is never stored in the DB — only the reversible
            // `emailEncrypted` envelope. Decrypt it here for display; fall back to
            // any legacy derivable email for rows synced before the column existed.
            const decryptedEmail = decryptEmail(customer?.emailEncrypted);
            const derivedEmail = decryptedEmail || this.deriveCustomerEmail(customer);

            if (derivedEmail && !metadata.email) {
                metadata.email = derivedEmail;
            }

            if (!metadata.firstName && rawCustomer?.first_name) {
                metadata.firstName = rawCustomer.first_name;
            }

            if (!metadata.lastName && rawCustomer?.last_name) {
                metadata.lastName = rawCustomer.last_name;
            }

            if (metadata.orders === undefined && rawCustomer?.orders_count !== undefined) {
                metadata.orders = rawCustomer.orders_count;
            }

            if (metadata.orderCount === undefined && rawCustomer?.orders_count !== undefined) {
                metadata.orderCount = rawCustomer.orders_count;
            }

            // Drop the ciphertext from the API response — the client only needs the
            // decrypted email (now in metadata.email), never the envelope.
            const { emailEncrypted: _emailEncrypted, ...safeCustomer } = customer;
            return {
                ...safeCustomer,
                metadata
            };
        });
    }

    static async getIntegrationSystemBreakdown(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        const connectors = await prisma.connectorInstance.findMany({
            where: { siteId },
            select: { id: true, label: true, providerId: true, status: true, healthScore: true }
        });

        if (connectors.length === 0) return [];

        return connectors.map(c => {
            // For latency, we could query sync runs, but for simplicity, use healthScore
            return {
                name: c.label || c.providerId || c.id,
                status: c.status === 'ACTIVE' ? 'Active' : c.status === 'DRAFT' ? 'Draft' : 'Offline',
                latency: 'N/A', // Could calculate from sync runs
                health: c.healthScore || 100,
            };
        });
    }

    static async getMetricsCatalog(filters: MetricFilterDto) {
        const { siteId } = filters;
        
        // Get distinct KPI names from database
        const kpiNames = await prisma.kpiValue.findMany({
            where: { siteId },
            select: { kpiName: true },
            distinct: ['kpiName']
        });

        const catalogDef: Record<string, { name: string; category: string; type: string; unit: string }> = {
            pageLoadTime:     { name: 'Page Load Time',    category: 'Performance',  type: 'latency',    unit: 'ms' },
            errorRatePct:     { name: 'JS Error Rate',     category: 'Performance',  type: 'percentage', unit: '%' },
            activeUsers:      { name: 'Active Users',      category: 'Audience',     type: 'count',      unit: 'users' },
            totalOrders:      { name: 'Total Orders',      category: 'Business',     type: 'count',      unit: 'orders' },
            delayedOrders:    { name: 'Delayed Orders',    category: 'Business',     type: 'count',      unit: 'orders' },
            syncSuccessRate:  { name: 'Sync Success Rate', category: 'Integrations', type: 'percentage', unit: '%' },
            syncSuccessPing:  { name: 'Sync Success Ping', category: 'Integrations', type: 'count',      unit: 'pings' },
            syncFailurePing:  { name: 'Sync Failure Ping', category: 'Integrations', type: 'count',      unit: 'pings' },
            sessionStart:     { name: 'Session Starts',    category: 'Audience',     type: 'count',      unit: 'sessions' },
            lcp:              { name: 'Largest Contentful Paint', category: 'Performance', type: 'latency', unit: 'ms' },
            fcp:              { name: 'First Contentful Paint',   category: 'Performance', type: 'latency', unit: 'ms' },
        };

        return kpiNames.map(k => ({
            id: k.kpiName,
            ...(catalogDef[k.kpiName] || { name: k.kpiName, category: 'Custom', type: 'gauge', unit: '' })
        }));
    }

    static async getMetricsSeries(filters: MetricFilterDto & { kpi: string; range: string }) {
        const { siteId, kpi, range } = filters;
        const now = new Date();
        const windowMs = range === '1h' ? 3600000 : 86400000 * 7;
        const startDate = new Date(now.getTime() - windowMs);

        const records = await prisma.kpiValue.findMany({
            where: {
                siteId,
                kpiName: kpi,
                timestamp: { gte: startDate }
            },
            orderBy: { timestamp: 'asc' },
            select: { timestamp: true, kpiValue: true }
        });

        if (records.length === 0) return [];

        const buckets: Record<string, number[]> = {};
        records.forEach(r => {
            const t = new Date(r.timestamp);
            const key = range === '1h'
                ? `${t.getHours().toString().padStart(2, '0')}:${(Math.floor(t.getMinutes() / 10) * 10).toString().padStart(2, '0')}`
                : t.toLocaleDateString('en-US', { weekday: 'short' });
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(Number(r.kpiValue));
        });

        return Object.entries(buckets).map(([timestamp, vals]) => ({
            timestamp,
            value: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
        }));
    }

    static async getGovernanceConfig(filters: MetricFilterDto) {
        const { siteId } = filters;

        // Query project/site metadata from database
        const project = await prisma.project.findUnique({
            where: { id: siteId }
        });

        // For now, return basic config from site data
        return {
            project: {
                id: siteId,
                name: project?.name || siteId,
                region: 'Default', // Not in schema
                retentionDays: 90, // Not in schema
                environments: [project?.environment || 'production']
            },
            rbac: {
                roles: [], // Would need User table
                users: []
            },
            security: {
                apiKeys: [], // Would need API key table
                mfaRequired: false, // Not in schema
                allowedIps: [] // Not in schema
            },
            versioning: {
                currentVersion: 'v1.0.0', // Static for now
                lastChange: null
            }
        };
    }

    static async updateGovernanceConfig(siteId: string, section: string, data: any) {
        console.log(`[GOVERNANCE] Updating ${section} for site ${siteId}`, data);
        // For now, just log and return success
        return { success: true, updatedVersion: 'v1.0.0' };
    }

    static async getIncidents(filters: MetricFilterDto) {
        const { siteId } = filters;
        const { IncidentService } = require('./incident.service');
        const incidents = IncidentService.getActiveIncidents(siteId);
        
        return incidents.map((inc: any) => ({
            id: inc.id,
            title: inc.title,
            status: inc.status,
            severity: inc.severity,
            createdAt: inc.createdAt,
            impact: inc.impact || 'Detected by signal analysis',
            owner: inc.owner || 'On-Call Rotation'
        }));
    }
}