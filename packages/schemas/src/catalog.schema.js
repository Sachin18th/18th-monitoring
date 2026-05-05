"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricCatalogSchema = exports.MetricCatalogEntrySchema = exports.MetricAlertSchema = void 0;
const zod_1 = require("zod");
exports.MetricAlertSchema = zod_1.z.object({
    threshold: zod_1.z.number(),
    operator: zod_1.z.enum(['gt', 'lt']),
    severity: zod_1.z.enum(['warn', 'critical']),
});
exports.MetricCatalogEntrySchema = zod_1.z.object({
    metricKey: zod_1.z.string(),
    description: zod_1.z.string(),
    type: zod_1.z.enum(['count', 'value']),
    aggregation: zod_1.z.enum(['sum', 'avg', 'min', 'max']),
    filters: zod_1.z.record(zod_1.z.array(zod_1.z.string())).optional(),
    groupBy: zod_1.z.array(zod_1.z.string()).optional(),
    granularity: zod_1.z.string(),
    unit: zod_1.z.string(),
    field: zod_1.z.string().optional(),
    alert: exports.MetricAlertSchema.optional(),
});
exports.MetricCatalogSchema = zod_1.z.object({
    metrics: zod_1.z.array(exports.MetricCatalogEntrySchema),
});
