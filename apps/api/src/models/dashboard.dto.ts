/**
 * Represents a summarized Key Performance Indicator for the dashboard UI.
 * Contains both raw metrics and evaluated state representation.
 */
export interface KpiSummaryResponse {
    kpiName: string;
    value: number;
    trendPct: number;
    state: 'healthy' | 'warning' | 'critical';
}

/**
 * Standard parameters used to query and filter metrics across the application.
 * 'siteId' defines the strict contextual boundary for multi-tenant isolation.
 */
export interface MetricFilterDto {
    siteId: string;
    timeRange: '1h' | '24h' | '7d';
    region?: string;
    source?: string;
    limit?: number;
    offset?: number;
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
