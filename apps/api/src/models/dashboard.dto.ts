/**
 * Represents a summarized Key Performance Indicator for the dashboard UI.
 * Contains both raw metrics and evaluated state representation.
 */
export interface KpiSummaryResponse {
    kpiName: string;
    value: number;
    trendPct: number;
    state: 'healthy' | 'warning' | 'critical';
<<<<<<< HEAD
    unit?: string;
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
}

/**
 * Standard parameters used to query and filter metrics across the application.
 * 'siteId' defines the strict contextual boundary for multi-tenant isolation.
 */
export interface MetricFilterDto {
    siteId: string;
<<<<<<< HEAD
    timeRange?: '1h' | '24h' | '7d';
=======
    timeRange: '1h' | '24h' | '7d';
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
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
