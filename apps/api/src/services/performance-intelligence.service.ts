import { prisma } from '@kpi-platform/db';
import { 
    PerformanceSignal, 
    PerformanceRollup, 
    PerformanceMetricName 
} from '../../../../packages/shared-types/src';
import crypto from 'crypto';

export class PerformanceIntelligenceService {
    
    /**
     * Ingests a new performance signal accurately.
     * Requirement 1 & 9
     */
    static async ingestSignal(signal: Omit<PerformanceSignal, 'id'>) {
        const id = crypto.randomUUID();
        
        // 1. STORE RAW SIGNAL (Requirement 3)
        await prisma.performanceMetric.create({
            data: {
                siteId: signal.siteId,
                tenantId: (signal as any).tenantId || 'system',
                category: 'WEB_VITALS',
                metricName: signal.name,
                metricValue: signal.value.toString(),
                unit: 'ms',
                timestamp: new Date(signal.timestamp),
                region: signal.dimensions.region,
                device: signal.dimensions.device,
                browser: signal.dimensions.browser,
                route: signal.dimensions.route,
                traceId: (signal as any).traceId,
                correlationId: (signal as any).correlationId
            }
        });

        // 2. REAL-TIME ANOMALY CHECK (Requirement 11)
        await this.checkAnomalies(signal);

        return id;
    }

    /**
     * Computes high-resolution rollups including percentiles.
     * Requirement 4 & 5
     */
    static async computeRollup(siteId: string, metricName: PerformanceMetricName, bucket: '1m' | '5m' | '1h', from: Date, to: Date) {
        // Fetch raw data for the window
        const signals = await prisma.performanceMetric.findMany({
            where: {
                siteId,
                metricName,
                timestamp: {
                    gte: from,
                    lte: to
                }
            }
        });

        if (signals.length === 0) return null;

        const values = signals.map((s: any) => parseFloat(s.metricValue as string)).sort((a: number, b: number) => a - b);
        const count = values.length;
        const sum = values.reduce((a: number, b: number) => a + b, 0);

        // PERCENTILE COMPUTATION (Requirement 5)
        const getP = (p: number) => values[Math.floor((p / 100) * (count - 1))];

        const rollup: PerformanceRollup = {
            siteId,
            metricName,
            bucketSize: bucket,
            timestamp: from.toISOString(),
            count,
            min: values[0],
            max: values[count - 1],
            avg: sum / count,
            p50: getP(50),
            p75: getP(75),
            p90: getP(90),
            p95: getP(95),
            p99: getP(99),
            dimensions: {} // In production, we'd group by dimensions too
        };

        // 3. STORE ROLLUP (Requirement 4)
        await prisma.performanceRollup.create({
            data: {
                siteId: rollup.siteId,
                metricName: rollup.metricName,
                bucketSize: rollup.bucketSize,
                timestamp: new Date(rollup.timestamp),
                count: rollup.count,
                min: rollup.min.toString(),
                max: rollup.max.toString(),
                avg: rollup.avg.toString(),
                sum: sum.toString(),
                p50: rollup.p50.toString(),
                p90: rollup.p90.toString(),
                p99: rollup.p99.toString(),
                dimensions: rollup.dimensions
            }
        });

        return rollup;
    }

    /**
     * Requirement 11: Anomaly Detection Framework
     */
    private static async checkAnomalies(signal: Omit<PerformanceSignal, 'id'>) {
        // Example: Static threshold for TTFB
        if (signal.name === 'TTFB' && signal.value > 2000) {
            console.warn(`[PerformanceIntelligence] Anomaly detected: HIGH TTFB for ${signal.siteId} (${signal.value}ms)`);
            // Trigger health metric or alert
        }
    }
}
