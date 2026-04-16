import { MetricRecord } from '../models/metric.model';

/**
 * Interface mapping Time-Series operations.
 * Consumed strictly by Processor (writing) and Dashboard (querying metrics).
 */
export interface TimeSeriesRepository {
    insertBatch(metrics: MetricRecord[]): Promise<void>;
    queryKpi(siteId: string, kpiName: string, startTime: string, endTime: string, dimensions?: any): Promise<MetricRecord[]>;
}
