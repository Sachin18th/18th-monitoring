import { z } from 'zod';

export const BrowserEventTypes = z.enum([
    'page_view', 
    'session_start', 
    'session_end', 
    'js_error', 
    'api_failure',
    'performance_metrics',
    'ttfb',
    'fcp',
    'lcp',
    'load_time',
    'api_latency',
    'click',
    'user_activity',
    'session_heartbeat'
]);

export const ServerEventTypes = z.enum([
    'order_placed', 
    'order_processed', 
    'csv_upload', 
    'oms_sync', 
    'oms_sync_failed'
]);

export const BaseEventSchema = z.object({
    eventId: z.string().uuid(),
    siteId: z.string(),
    eventType: z.union([BrowserEventTypes, ServerEventTypes, z.string()]),
    timestamp: z.string().datetime(), // ISO format
    sessionId: z.string().optional(),
    userId: z.string().optional(),
    metadata: z.record(z.any()).default({})
});

export const BrowserIngestPayloadSchema = z.object({
    siteId: z.string(),
    events: z.array(BaseEventSchema)
});

export const ServerIngestPayloadSchema = z.object({
    siteId: z.string(),
    events: z.array(BaseEventSchema)
});
