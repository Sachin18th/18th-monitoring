import { z } from 'zod';

/**
 * Standard Pagination Request Schema
 */
export const PaginationParamsSchema = z.object({
    limit: z.coerce.number().int().min(1).max(1000).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    page: z.coerce.number().int().min(1).optional(),
});

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;

/**
 * Common Filter Patterns
 */
export const TimeRangeParamsSchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    range: z.enum(['1h', '6h', '24h', '7d', '30d']).optional(),
});

export const SortParamsSchema = z.object({
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Standard Error Object Schema
 */
export const ApiErrorSchema = z.object({
    code: z.string(),
    message: z.string(),
    field: z.string().optional(),
    category: z.enum([
        'unauthorized',
        'forbidden',
        'invalid_request',
        'validation_error',
        'not_found',
        'rate_limited',
        'conflict',
        'internal_error',
        'unavailable'
    ]).optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Standard Metadata Schema
 */
export const ApiMetadataSchema = z.object({
    timestamp: z.string().datetime(),
    traceId: z.string(),
    version: z.string().default('v1'),
    pagination: z.object({
        total: z.number(),
        limit: z.number(),
        offset: z.number(),
        hasNext: z.boolean(),
    }).optional(),
    filters: z.record(z.string(), z.any()).optional(),
    freshness: z.enum(['fresh', 'delayed', 'stale', 'partial']).default('fresh'),
});

/**
 * Universal Response Envelope Factory
 */
export function createResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
    return z.object({
        status: z.enum(['success', 'error']),
        data: dataSchema.optional(),
        metadata: ApiMetadataSchema,
        errors: z.array(ApiErrorSchema).optional(),
    });
}
