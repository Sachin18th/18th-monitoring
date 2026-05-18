"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerIngestPayloadSchema = exports.BrowserIngestPayloadSchema = exports.BaseEventSchema = exports.ServerEventTypes = exports.BrowserEventTypes = void 0;
const zod_1 = require("zod");
exports.BrowserEventTypes = zod_1.z.enum([
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
exports.ServerEventTypes = zod_1.z.enum([
    'order_placed',
    'order_processed',
    'csv_upload',
    'oms_sync',
    'oms_sync_failed'
]);
exports.BaseEventSchema = zod_1.z.object({
    eventId: zod_1.z.string().uuid(),
    siteId: zod_1.z.string(),
    eventType: zod_1.z.union([exports.BrowserEventTypes, exports.ServerEventTypes, zod_1.z.string()]),
    timestamp: zod_1.z.string().datetime(), // ISO format
    sessionId: zod_1.z.string().optional(),
    userId: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.any()).default({})
});
exports.BrowserIngestPayloadSchema = zod_1.z.object({
    siteId: zod_1.z.string(),
    events: zod_1.z.array(exports.BaseEventSchema)
});
exports.ServerIngestPayloadSchema = zod_1.z.object({
    siteId: zod_1.z.string(),
    events: zod_1.z.array(exports.BaseEventSchema)
});
