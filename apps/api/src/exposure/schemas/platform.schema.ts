import { z } from 'zod';

// --- Overview ---
export const PlatformKpiSchema = z.object({
    kpiName: z.string(),
    value: z.number(),
    trendPct: z.number().optional(),
    state: z.enum(['healthy', 'warning', 'critical']),
    unit: z.string().optional()
});

export const HealthStatusSchema = z.object({
    status: z.enum(['healthy', 'degraded', 'critical', 'maintenance']),
    healthScore: z.number().min(0).max(100),
    activeIssues: z.number(),
    lastUpdated: z.string().datetime()
});

// --- Customers ---
export const SegmentSchema = z.object({
    id: z.string(),
    name: z.string(),
    size: z.number(),
    growthPct: z.number().optional(),
    conversionRate: z.number().optional()
});

export const AudienceAnalyticsSchema = z.object({
    totalUsers: z.number(),
    activeUsers: z.number(),
    newVsReturning: z.number(),
    deviceBreakdown: z.record(z.string(), z.object({
        count: z.number(),
        percentage: z.number()
    })),
    browserBreakdown: z.array(z.object({
        name: z.string(),
        count: z.number(),
        percentage: z.number()
    }))
});

// --- Integrations ---
export const ConnectorHealthSchema = z.object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    status: z.enum(['Active', 'Degraded', 'Offline', 'Configuring']),
    healthScore: z.number(),
    latency: z.union([z.number(), z.string()]).optional(),
    lastSyncAt: z.string().datetime().optional()
});

export const SyncRunSchema = z.object({
    id: z.string(),
    connectorId: z.string(),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().optional(),
    status: z.enum(['success', 'failure', 'pending', 'cancelled']),
    recordsProcessed: z.number().optional(),
    errorMessage: z.string().optional()
});
