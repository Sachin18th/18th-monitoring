import { z } from 'zod';

export const MetricAlertSchema = z.object({
    threshold: z.number(),
    operator: z.enum(['gt', 'lt']),
    severity: z.enum(['warn', 'critical']),
});

export const MetricCatalogEntrySchema = z.object({
    metricKey: z.string(),
    description: z.string(),
    type: z.enum(['count', 'value']),
    aggregation: z.enum(['sum', 'avg', 'min', 'max']),
    filters: z.record(z.array(z.string())).optional(),
    groupBy: z.array(z.string()).optional(),
    granularity: z.string(),
    unit: z.string(),
    field: z.string().optional(),
    alert: MetricAlertSchema.optional(),
});

export const MetricCatalogSchema = z.object({
    metrics: z.array(MetricCatalogEntrySchema),
});

export type MetricCatalogEntry = z.infer<typeof MetricCatalogEntrySchema>;
export type MetricCatalog = z.infer<typeof MetricCatalogSchema>;
