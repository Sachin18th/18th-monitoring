import fs from 'fs';
import path from 'path';
import { MetricCatalogSchema } from '../../../../packages/schemas/src/catalog.schema';
import { cache, TTL } from '../../../../packages/cache/src';

export interface MetricAlertConfig {
    threshold: number;
    operator: 'gt' | 'lt';
    severity: 'warn' | 'critical';
}

export interface MetricDefinition {
    metricKey: string;
    description: string;
    type: 'count' | 'value';
    aggregation: 'sum' | 'avg' | 'min' | 'max';
    filters?: Record<string, string[]>;
    groupBy?: string[];
    granularity: string;
    unit: string;
    field?: string;
    alert?: MetricAlertConfig;
}

export class MetricCatalogService {
    private catalog: { metrics: MetricDefinition[] };

    constructor() {
        const catalogPath = path.join(__dirname, '../config/metrics/kpi-catalog.json');
        try {
            const data = fs.readFileSync(catalogPath, 'utf8');
            const parsed = JSON.parse(data);
            const result = MetricCatalogSchema.safeParse(parsed);
            if (!result.success) {
                console.error('[MetricCatalog] Catalog config is INVALID:', result.error.flatten());
                this.catalog = { metrics: [] };
            } else {
                this.catalog = result.data as { metrics: MetricDefinition[] };
                console.log(`[MetricCatalog] Loaded ${this.catalog.metrics.length} metric(s).`);
            }
        } catch (err) {
            console.error('[MetricCatalog] Failed to load catalog', err);
            this.catalog = { metrics: [] };
        }
    }

    public getMetrics(): MetricDefinition[] {
        return this.catalog.metrics;
    }

    public getMetricByKey(metricKey: string): MetricDefinition | undefined {
        return this.catalog.metrics.find(m => m.metricKey === metricKey);
    }

    /** Cache-aware catalog fetch — used by API controllers */
    public async getCachedMetrics(): Promise<MetricDefinition[]> {
        const CACHE_KEY = 'metric_catalog:all';
        const hit = await cache.get<MetricDefinition[]>(CACHE_KEY);
        if (hit) return hit;
        await cache.set(CACHE_KEY, this.catalog.metrics, TTL.METRIC_CATALOG);
        return this.catalog.metrics;
    }
}

export const metricCatalogService = new MetricCatalogService();
