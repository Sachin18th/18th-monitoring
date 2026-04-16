import { z } from 'zod';

export const TrackingConfigSchema = z.object({
    performance: z.boolean().default(true),
    user: z.boolean().default(true),
    errors: z.boolean().default(true),
    // TODO: Expansion placeholder accommodating specific integrations toggles (e.g., 'omsTracking: boolean')
});

export const SamplingConfigSchema = z.object({
    sessionRate: z.number().min(0).max(1.0).default(1.0),
});

export const ThresholdConfigSchema = z.object({
    pageLoadMs: z.number().positive(),
    errorRatePct: z.number().positive()
});

export const PlatformConfigSchema = z.object({
    tracking: TrackingConfigSchema,
    sampling: SamplingConfigSchema,
    thresholds: ThresholdConfigSchema,
    // Future hooks for explicitly embedded Tenant/Regional mappings
    features: z.record(z.boolean()).optional()
});
