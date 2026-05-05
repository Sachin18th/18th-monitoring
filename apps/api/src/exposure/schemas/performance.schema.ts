import { z } from 'zod';

export const PerformanceHealthEnum = z.enum(['healthy', 'warning', 'critical']);

/**
 * Core Web Vitals and Latency Metrics
 */
export const PerformanceMetricsSchema = z.object({
    p50: z.number().describe('Median latency in milliseconds'),
    p75: z.number(),
    p90: z.number(),
    p95: z.number(),
    p99: z.number(),
    avg: z.number(),
    errorRate: z.number().describe('Percentage of requests resulting in errors'),
    uptime: z.number().min(0).max(100),
    ttfb: z.number().optional(),
    fcp: z.number().optional(),
    lcp: z.number().optional(),
    cls: z.number().optional(),
    fid: z.number().optional(),
});

/**
 * Regional Performance Breakdown
 */
export const RegionalPerformanceSchema = z.object({
    region: z.string(),
    countryCode: z.string().optional(),
    avgLatency: z.number(),
    errorRate: z.number(),
    trafficShare: z.number(),
    health: PerformanceHealthEnum
});

/**
 * Performance Anomaly
 */
export const PerformanceAnomalySchema = z.object({
    id: z.string(),
    metricName: z.string(),
    detectedAt: z.string().datetime(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    message: z.string(),
    affectedEntity: z.string().optional(),
    baseline: z.number().optional(),
    current: z.number().optional(),
});
