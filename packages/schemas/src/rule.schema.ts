import { z } from 'zod';

export const RuleConditionSchema = z.object({
    field: z.string(),
    operator: z.enum(['equals', 'in', 'not_equals', 'contains']),
    value: z.union([z.string(), z.array(z.string()), z.number(), z.boolean()]),
});

export const RuleDefinitionSchema = z.object({
    id: z.string(),
    priority: z.number().int(),
    conditions: z.array(RuleConditionSchema),
    result: z.record(z.any()),
});

export const OrderSourceRulesSchema = z.object({
    rules: z.array(RuleDefinitionSchema),
    default: z.string().default('online'),
});

export type RuleDefinition = z.infer<typeof RuleDefinitionSchema>;
export type OrderSourceRules = z.infer<typeof OrderSourceRulesSchema>;
