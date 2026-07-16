//apps/api/src/services/order-aggregation.service.ts
import { getSiteDataPlaneClient } from '../lib/tenant-prisma';

type SourceSystem = 'shopify' | 'adobe_commerce' | 'bigcommerce';

export class OrderAggregationService {
  static async getOrderStats(input: {
    siteId: string;
    sourceSystems?: SourceSystem[];
  }): Promise<{ totalOrders: number; ordersThisHour: number }> {
    const { siteId, sourceSystems } = input;

    const systems = Array.isArray(sourceSystems) && sourceSystems.length > 0 ? sourceSystems : ['shopify', 'adobe_commerce', 'bigcommerce'];

    const db = await getSiteDataPlaneClient(siteId);

    // Total orders across selected source systems
    const totalOrders = await db.canonicalOrder.count({
      where: {
        siteId,
        sourceSystem: { in: systems },
      },
    });

    // Start of current hour (UTC)
    const now = new Date();
    const startOfHour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0));

    const ordersThisHour = await db.canonicalOrder.count({
      where: {
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
