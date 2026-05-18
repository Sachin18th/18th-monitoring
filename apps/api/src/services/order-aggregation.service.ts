//apps/api/src/services/order-aggregation.service.ts
import { prisma } from '@kpi-platform/db';

type SourceSystem = 'shopify' | 'adobe_commerce' | 'bigcommerce';

export class OrderAggregationService {
  static async getOrderStats(input: {
    tenantId: string;
    siteId: string;
    sourceSystems?: SourceSystem[];
  }): Promise<{ totalOrders: number; ordersThisHour: number }> {
    const { tenantId, siteId, sourceSystems } = input;

    const systems = Array.isArray(sourceSystems) && sourceSystems.length > 0 ? sourceSystems : ['shopify', 'adobe_commerce', 'bigcommerce'];

    // Total orders across selected source systems
    const totalOrders = await prisma.canonicalOrder.count({
      where: {
        tenantId,
        siteId,
        sourceSystem: { in: systems },
      },
    });

    // Start of current hour (UTC)
    const now = new Date();
    const startOfHour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0));

    const ordersThisHour = await prisma.canonicalOrder.count({
      where: {
        tenantId,
        siteId,
        sourceSystem: { in: systems },
        placedAt: {
          gte: startOfHour,
        },
      },
    });

    return { totalOrders, ordersThisHour };
  }
}

export default OrderAggregationService;
