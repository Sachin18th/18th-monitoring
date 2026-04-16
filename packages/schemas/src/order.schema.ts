import { z } from 'zod';

export const OrderStatusSchema = z.enum(['placed', 'processed', 'shipped', 'cancelled', 'refunded']);
export const OrderSourceSchema = z.enum(['online', 'offline']);

export const CanonicalOrderSchema = z.object({
    orderId: z.string(),
    externalOrderId: z.string().optional(),
    tenantId: z.string(),
    siteId: z.string(),
    orderSource: OrderSourceSchema.default('online'),
    sourceSystem: z.string(),
    channel: z.string(),
    orderType: z.string(),
    status: OrderStatusSchema,
    currency: z.string().length(3),
    amount: z.number().min(0),
    createdAt: z.string().datetime(), // ISO string
    updatedAt: z.string().datetime(),
    metadata: z.record(z.any()).default({}),
});

export type ZodCanonicalOrder = z.infer<typeof CanonicalOrderSchema>;
