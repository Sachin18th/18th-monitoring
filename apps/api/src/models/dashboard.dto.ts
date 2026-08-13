/**
 * Represents a summarized Key Performance Indicator for the dashboard UI.
 * Contains both raw metrics and evaluated state representation.
 */
export interface KpiSummaryResponse {
    kpiName: string;
    value: number;
    trendPct: number;
    state: 'healthy' | 'warning' | 'critical';
    unit?: string;
}

/**
 * Standard parameters used to query and filter metrics across the application.
 * 'siteId' defines the strict contextual boundary for multi-tenant isolation.
 * 'connectorInstanceId' enables multi-store data isolation per connector.
 */
export interface MetricFilterDto {
    siteId: string;
    tenantId?: string | null;
    connectorInstanceId?: string | null;
    timeRange?: '1h' | '24h' | '7d';
    region?: string;
    source?: string;
    limit?: number;
    offset?: number;
    /**
     * Include bot/crawler sessions in session-derived figures. Defaults to
     * false — reported metrics are human traffic unless explicitly asked
     * otherwise. See apps/api/src/utils/bot-detection.ts.
     */
    includeBots?: boolean;
}

/**
 * Represents an escalated system alert that breached pre-defined SLA thresholds
 * linked to a designated KPI.
 */
export interface AlertSummaryResponse {
    alertId: string;
    kpiName: string;
    severity: string;
    status: string;
    message: string;
    triggeredAt: string;
}
