export interface MetricRecord {
    id?: string;
    siteId: string;
    tenantId?: string;
    timestamp: string;
    kpiName: string;
    value: number;
    dimensions: Record<string, string>;
    timeWindow?: string;
    freshnessStatus?: 'live' | 'stale' | 'replaying';
    lastUpdated?: string;
    _dimHash?: string;
}
