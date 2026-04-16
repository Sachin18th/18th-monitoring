export interface MetricRecord {
    siteId: string;
    timestamp: string;
    kpiName: string;
    value: number;
    dimensions: Record<string, string>;
}
