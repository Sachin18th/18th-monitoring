import { FastifyInstance } from 'fastify';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { OrderAggregationService } from '../services/order-aggregation.service';
import { ResponseUtil } from '../utils/response';

export const ordersRoutes = async (fastify: FastifyInstance) => {
  // Prefix: mounted under /api/v1/projects
  fastify.addHook('preHandler', tenantAuthHandler);

  fastify.get('/:projectId/orders/stats', async (req, reply) => {
    const { projectId } = req.params as any;
    const tenantId = (req.query as any).tenantId as string | undefined;
    const sourceSystemsRaw = (req.query as any).sourceSystem as string | undefined;

    if (!tenantId) {
      return reply.code(400).send(ResponseUtil.error('tenantId query parameter is required', 'MISSING_TENANT_ID'));
    }

    const sourceSystems = sourceSystemsRaw
      ? (sourceSystemsRaw.split(',').map(s => s.trim()).filter(Boolean) as Array<'shopify' | 'adobe_commerce' | 'bigcommerce'>)
      : undefined;

    try {
      const stats = await OrderAggregationService.getOrderStats({ siteId: projectId, sourceSystems });
      const payload = {
        totalOrders: stats.totalOrders,
        ordersThisHour: stats.ordersThisHour,
        sourceSystems: sourceSystems && sourceSystems.length > 0 ? sourceSystems : ['shopify', 'adobe_commerce', 'bigcommerce'],
        computedAt: new Date().toISOString()
      };
      return reply.send(ResponseUtil.success(payload, {}, 'Order stats'));
    } catch (err: any) {
      console.error('[ORDERS] stats failed', err);
      return reply.code(500).send(ResponseUtil.error(err?.message || 'Failed to compute order stats', 'ORDERS_STATS_FAILED'));
    }
  });
};

export default ordersRoutes;
