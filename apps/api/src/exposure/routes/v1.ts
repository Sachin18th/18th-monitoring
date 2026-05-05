import { FastifyInstance } from 'fastify';
import { apiKeyAuth } from '../../middlewares/api-key.middleware';
import { apiRateLimiter } from '../../middlewares/api-rate-limiter.middleware';
import { apiAuditHandler } from '../../middlewares/api-audit.middleware';
import { validateRequest } from '../../middlewares/validator.middleware';
import { PaginationParamsSchema, TimeRangeParamsSchema } from '../schemas/common.schema';
import { OrderStatusEnum } from '../schemas/orders.schema';
import * as OverviewController from '../controllers/overview.controller';
import * as PerformanceController from '../controllers/performance.controller';
import * as OrderController from '../controllers/orders.controller';
import * as CustomerController from '../controllers/customers.controller';
import * as IntegrationController from '../controllers/integrations.controller';
import * as SubscriptionsController from '../controllers/subscriptions.controller';
import { z } from 'zod';

export const exposureV1Routes = async (server: FastifyInstance) => {
    
    // Global Governance Hooks for Exposure Layer
    server.addHook('onRequest', apiAuditHandler);
    server.addHook('preHandler', apiRateLimiter);

    // ── Overview Domain ──────────────────────────────────────────────────
    server.register(async (api) => {
        api.addHook('preHandler', apiKeyAuth(['reporting']));
        
        api.get('/overview/kpis',   OverviewController.getGlobalKpis);
        api.get('/overview/health', OverviewController.getSystemHealth);
        api.get('/overview/full',   OverviewController.getPlatformOverview);
    });

    // ── Performance Domain ───────────────────────────────────────────────
    server.register(async (api) => {
        api.addHook('preHandler', apiKeyAuth(['reporting', 'performance']));
        
        api.get('/performance/summary',  PerformanceController.getPerformanceSummary);
        api.get('/performance/regional', PerformanceController.getRegionalPerformance);
        api.get('/performance/slow-pages', PerformanceController.getSlowestPages);
        api.get('/performance/series', {
            preHandler: [validateRequest({
                query: TimeRangeParamsSchema.extend({
                    metric: z.string().optional()
                })
            })]
        }, PerformanceController.getPerformanceSeries);
    });

    // ── Orders Domain ────────────────────────────────────────────────────
    server.register(async (api) => {
        api.addHook('preHandler', apiKeyAuth(['reporting', 'orders']));
        
        api.get('/orders/summary', OrderController.getOrderOverview);
        
        api.get('/orders', {
            preHandler: [validateRequest({
                query: PaginationParamsSchema.extend({
                    status: OrderStatusEnum.optional()
                })
            })]
        }, OrderController.getOrderList);
        
        api.get('/orders/delayed', OrderController.getDelayedOrders);
        api.get('/orders/trends',  OrderController.getOrderTrends);
    });

    // ── Customers Domain ─────────────────────────────────────────────────
    server.register(async (api) => {
        api.addHook('preHandler', apiKeyAuth(['reporting', 'customers']));
        
        api.get('/customers/analytics',    CustomerController.getCustomerAnalytics);
        api.get('/customers/intelligence', CustomerController.getCustomerIntelligence);
        api.get('/customers/behavior',     CustomerController.getBehaviorMetrics);
    });

    // ── Integrations Domain ──────────────────────────────────────────────
    server.register(async (api) => {
        api.addHook('preHandler', apiKeyAuth(['reporting', 'integrations']));
        
        api.get('/integrations/summary', IntegrationController.getIntegrationSummary);
        api.get('/integrations/status',  IntegrationController.getConnectorStatus);
        api.get('/integrations/history', IntegrationController.getSyncHistory);
    });

    // ── Alerts & Config (Governance) ─────────────────────────────────────
    // These might use 'admin' scope
    server.register(async (api) => {
        api.addHook('preHandler', apiKeyAuth(['admin']));
        
        api.get('/alerts/active', async (req, reply) => {
             const { DashboardService } = require('../../services/dashboard.service');
             const { ResponseUtil } = require('../../utils/response');
             const alerts = await DashboardService.getActiveAlerts({ siteId: (req as any).siteId });
             return reply.send(ResponseUtil.success(alerts, { filters: { siteId: (req as any).siteId } }, req.id as string));
        });

        api.get('/config/governance', async (req, reply) => {
            const { DashboardService } = require('../../services/dashboard.service');
            const { ResponseUtil } = require('../../utils/response');
            const config = await DashboardService.getGovernanceConfig({ siteId: (req as any).siteId });
            return reply.send(ResponseUtil.success(config, { filters: { siteId: (req as any).siteId } }, req.id as string));
        });

        // Webhook Subscriptions Management
        api.get('/config/subscriptions',      SubscriptionsController.listSubscriptions);
        api.post('/config/subscriptions',     SubscriptionsController.createSubscription);
        api.delete('/config/subscriptions/:subId', SubscriptionsController.deleteSubscription);
        api.get('/config/subscriptions/logs', SubscriptionsController.getDeliveryLogs);
    });
};
