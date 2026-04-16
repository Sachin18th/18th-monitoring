export interface MetricPayload {
    siteId: string;
    kpiName: string;
    value: number;
    timestamp: string;
    dimensions: Record<string, string>;
}

export class MetricsDbAdapter {
    // TODO: Implement ClickHouse or TimescaleDB insert batching
    static async writeMetrics(metrics: MetricPayload[]): Promise<void> {
        console.log([MetricsDB] Flushing \ metrics to Time-Series DB);
    }
}
