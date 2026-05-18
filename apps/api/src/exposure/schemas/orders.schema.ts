import { z } from 'zod';

export const OrderStatusEnum = z.enum([
    'placed', 'processed', 'shipped', 'delivered', 'cancelled', 'failed', 'returned'
]);

export const OrderSourceEnum = z.enum(['online', 'offline', 'pos', 'api']);

/**
 * Detailed Order Resource
 */
export const OrderResourceSchema = z.object({
    id: z.string(),
    externalOrderId: z.string().optional(),
    siteId: z.string(),
    amount: z.number(),
    currency: z.string().default('USD'),
    status: OrderStatusEnum,
    paymentStatus: z.enum(['pending', 'authorized', 'captured', 'refunded', 'failed']).optional(),
    channel: OrderSourceEnum,
    customerName: z.string().optional(),
    customerEmail: z.string().optional(),
    itemsCount: z.number().int().optional(),
    health: z.enum(['healthy', 'delayed', 'stuck', 'failed']).default('healthy'),
    syncStatus: z.enum(['synced', 'pending', 'error', 'mismatch']).default('synced'),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime().optional(),
    placedAt: z.string().datetime().optional(),
});

/**
 * Order Summary/List Item
 */
export const OrderSummaryResourceSchema = OrderResourceSchema.pick({
    id: true,
    externalOrderId: true,
    amount: true,
    status: true,
    channel: true,
    health: true,
    syncStatus: true,
    createdAt: true
});

/**
 * Order Metrics Aggregate
 */
export const OrderMetricsSchema = z.object({
    totalOrders: z.number(),
    totalRevenue: z.number(),
    averageOrderValue: z.number(),
    delayedCount: z.number(),
    failureRate: z.number(),
    channelBreakdown: z.array(z.object({
        channel: OrderSourceEnum,
        count: z.number(),
        percentage: z.number()
    }))
});
export type OrderResource = z.infer<typeof OrderResourceSchema>;
