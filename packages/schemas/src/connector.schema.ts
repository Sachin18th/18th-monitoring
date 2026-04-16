import { z } from 'zod';

export const ConnectorAuthSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('oauth2'),
        vaultKey: z.string(),
    }),
    z.object({
        type: z.literal('apiKey'),
        headerName: z.string(),
        vaultKey: z.string(),
    }),
]);

export const FieldMappingSchema = z.record(z.string()); // canonical field -> source path or "const:<value>"

export const DedupRuleSchema = z.object({
    strategy: z.enum(['upsert_on_newer', 'reject_duplicate']),
    key: z.string(),
});

export const RetryPolicySchema = z.object({
    maxRetries: z.number().int().min(0).max(10),
    backoffMs: z.number().int().min(100),
    dlqTopic: z.string(),
});

const BaseConnectorSchema = z.object({
    connectorId: z.string(),
    label: z.string(),
    fieldMapping: FieldMappingSchema,
    dedupeRule: DedupRuleSchema,
});

export const ApiPollConnectorSchema = BaseConnectorSchema.extend({
    type: z.literal('api_poll'),
    schedule: z.string(),                    // cron expression
    auth: ConnectorAuthSchema,
    endpoint: z.string().url(),
    pagination: z.object({
        strategy: z.enum(['cursor', 'page']),
        cursorField: z.string().optional(),
        pageSize: z.number().int().min(1),
    }),
    retryPolicy: RetryPolicySchema,
});

export const WebhookConnectorSchema = BaseConnectorSchema.extend({
    type: z.literal('webhook'),
    webhookPath: z.string().startsWith('/'),
    auth: ConnectorAuthSchema,
    retryPolicy: RetryPolicySchema,
});

export const CsvConnectorSchema = BaseConnectorSchema.extend({
    type: z.literal('csv_import'),
    csvSchema: z.object({
        requiredColumns: z.array(z.string()),
        delimiter: z.string(),
        dateFormat: z.string(),
    }),
    limits: z.object({
        maxRowsPerFile: z.number().int(),
        maxFileSizeMb: z.number(),
        chunkSize: z.number().int(),
    }),
});

export const ConnectorDefinitionSchema = z.discriminatedUnion('type', [
    ApiPollConnectorSchema,
    WebhookConnectorSchema,
    CsvConnectorSchema,
]);

export const ConnectorRegistrySchema = z.object({
    connectors: z.array(ConnectorDefinitionSchema),
});

export type ConnectorDefinition = z.infer<typeof ConnectorDefinitionSchema>;
export type ConnectorRegistry = z.infer<typeof ConnectorRegistrySchema>;
