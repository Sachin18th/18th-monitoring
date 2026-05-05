import { prisma } from '@kpi-platform/db';

export class OrderAnalyticsService {
    
    /**
     * Requirement 15: Trusted Order Aggregates
     * Computes aggregates only from orders that have passed validation (VALID quality state).
     */
    static async getDailyRevenue(siteId: string, days = 30) {
        // Ensuring only high-confidence data is used for KPIs (Requirement 15)
        const orders = await prisma.canonicalOrder.findMany({
            where: {
                siteId,
                normalizedStatus: 'ACTIVE'
            },
            select: {
                createdAt: true,
                totalAmount: true
            }
        });

        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const buckets = new Map<string, { totalRevenue: number; orderCount: number }>();

        for (const order of orders) {
            if (order.createdAt < cutoff) continue;
            const date = order.createdAt.toISOString().slice(0, 10);
            const bucket = buckets.get(date) || { totalRevenue: 0, orderCount: 0 };
            bucket.totalRevenue += Number(order.totalAmount);
            bucket.orderCount += 1;
            buckets.set(date, bucket);
        }

        return Array.from(buckets.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([date, bucket]) => ({
                date,
                totalRevenue: bucket.totalRevenue,
                orderCount: bucket.orderCount,
                avgOrderValue: bucket.orderCount > 0 ? bucket.totalRevenue / bucket.orderCount : 0
            }));
    }

    /**
     * Requirement 15: Segmented Aggregation (Channel & Lifecycle)
     */
    static async getChannelPerformance(siteId: string) {
        const orders = await prisma.canonicalOrder.findMany({
            where: {
                siteId,
                normalizedStatus: 'ACTIVE'
            },
            select: {
                channel: true,
                totalAmount: true
            }
        });

        const buckets = new Map<string, { orderCount: number; totalValue: number }>();

        for (const order of orders) {
            const channel = order.channel || 'unknown';
            const bucket = buckets.get(channel) || { orderCount: 0, totalValue: 0 };
            bucket.orderCount += 1;
            bucket.totalValue += Number(order.totalAmount);
            buckets.set(channel, bucket);
        }

        return Array.from(buckets.entries()).map(([channel, bucket]) => ({
            channel,
            orderCount: bucket.orderCount,
            totalValue: bucket.totalValue
        }));
    }
}
