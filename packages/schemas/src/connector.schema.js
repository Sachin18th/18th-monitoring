"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectorRegistrySchema = exports.ConnectorCategorySchema = exports.ConnectorDefinitionSchema = exports.CsvConnectorSchema = exports.WebhookConnectorSchema = exports.ApiPollConnectorSchema = exports.RetryPolicySchema = exports.DedupRuleSchema = exports.FieldMappingSchema = exports.ConnectorAuthSchema = void 0;
const zod_1 = require("zod");
exports.ConnectorAuthSchema = zod_1.z.discriminatedUnion('type', [
    zod_1.z.object({
        type: zod_1.z.literal('oauth2'),
        vaultKey: zod_1.z.string(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('apiKey'),
        headerName: zod_1.z.string(),
        vaultKey: zod_1.z.string(),
    }),
]);
exports.FieldMappingSchema = zod_1.z.record(zod_1.z.string()); // canonical field -> source path or "const:<value>"
exports.DedupRuleSchema = zod_1.z.object({
    strategy: zod_1.z.enum(['upsert_on_newer', 'reject_duplicate']),
    key: zod_1.z.string(),
});
exports.RetryPolicySchema = zod_1.z.object({
    maxRetries: zod_1.z.number().int().min(0).max(10),
    backoffMs: zod_1.z.number().int().min(100),
    dlqTopic: zod_1.z.string(),
});
const BaseConnectorSchema = zod_1.z.object({
    connectorId: zod_1.z.string(),
    label: zod_1.z.string(),
    fieldMapping: exports.FieldMappingSchema,
    dedupeRule: exports.DedupRuleSchema,
});
exports.ApiPollConnectorSchema = BaseConnectorSchema.extend({
    type: zod_1.z.literal('api_poll'),
    schedule: zod_1.z.string(), // cron expression
    auth: exports.ConnectorAuthSchema,
    endpoint: zod_1.z.string().url(),
    pagination: zod_1.z.object({
        strategy: zod_1.z.enum(['cursor', 'page']),
        cursorField: zod_1.z.string().optional(),
        pageSize: zod_1.z.number().int().min(1),
    }),
    retryPolicy: exports.RetryPolicySchema,
});
exports.WebhookConnectorSchema = BaseConnectorSchema.extend({
    type: zod_1.z.literal('webhook'),
    webhookPath: zod_1.z.string().startsWith('/'),
    auth: exports.ConnectorAuthSchema,
    retryPolicy: exports.RetryPolicySchema,
});
exports.CsvConnectorSchema = BaseConnectorSchema.extend({
    type: zod_1.z.literal('csv_import'),
    csvSchema: zod_1.z.object({
        requiredColumns: zod_1.z.array(zod_1.z.string()),
        delimiter: zod_1.z.string(),
        dateFormat: zod_1.z.string(),
    }),
    limits: zod_1.z.object({
        maxRowsPerFile: zod_1.z.number().int(),
        maxFileSizeMb: zod_1.z.number(),
        chunkSize: zod_1.z.number().int(),
    }),
});
exports.ConnectorDefinitionSchema = zod_1.z.discriminatedUnion('type', [
    exports.ApiPollConnectorSchema,
    exports.WebhookConnectorSchema,
    exports.CsvConnectorSchema,
    zod_1.z.object({
        type: zod_1.z.literal('template'),
        connectorId: zod_1.z.string(),
        label: zod_1.z.string(),
        category: zod_1.z.string(),
    })
]);
exports.ConnectorCategorySchema = zod_1.z.object({
    id: zod_1.z.string(),
    label: zod_1.z.string(),
    description: zod_1.z.string(),
    icon: zod_1.z.string(),
});
exports.ConnectorRegistrySchema = zod_1.z.object({
    categories: zod_1.z.array(exports.ConnectorCategorySchema),
    connectors: zod_1.z.array(zod_1.z.any()), // Allow loose validation for the catalog registry for now
});
