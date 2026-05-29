import {
    getSummaries,
    getAlerts,
    getAuditLogs,
    getActivityFeed,
    getGovernanceConfig,
    updateGovernanceConfig,
    getPerformanceSummary,
    getPerformanceTrends,
    getPerformanceAnomalies,
    getSlowestPages,
    getUserActivitySummary,
    getUserTrends,
    getUserAnalytics,
    getCustomerIntelligence,
    savePaymentGatewayConfig,
    getTopPages,
    getFunnelData,
    getOrderSummary,
    getOrderTrends,
    getOrderRCA,
    getOrderRecommendations,
    uploadOfflineOrders,
    syncIntegration,
    getIntegrationStatus,
    getDelayedOrders,
    getOrderSourceBreakdown,
    getIntegrationHealthSummary,
    getSyncTrends,
    getFailedSyncs,
    getIntegrationSystemBreakdown,
    getOrders,
    getCustomerList,
    getRegionalPerformance,
    getDeviceSegmentation,
    getResourceBreakdown,
    getMetricsCatalog,
    getMetricsSeries,
    getIncidents
} from '../controllers/dashboard.controller';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { requirePageAccess } from '../middlewares/page-access.middleware';
import { syntheticRoutes } from './synthetic';

export const dashboardRoutes = async (fastify: any) => {
    // API Prefix Mapping
    // Securely routes all data strictly mapped to authenticated tenants bounds
    fastify.addHook('preHandler', tenantAuthHandler);

    fastify.get('/summaries', getSummaries);
    // Alerts are now handled via monitoringRoutes to avoid duplication
    // fastify.get('/alerts', getAlerts);
    fastify.get('/audit', getAuditLogs);
    fastify.get('/activity', getActivityFeed);
    fastify.get('/governance', getGovernanceConfig);
    fastify.post('/governance', updateGovernanceConfig);
    fastify.get('/incidents', getIncidents);

    // Performance Endpoints
    fastify.get('/performance/summary', { preHandler: [requirePageAccess(['performance', 'rum', 'observability/failures', 'observability/backend', 'observability/incidents'])] }, getPerformanceSummary);
    fastify.get('/performance/trends', { preHandler: [requirePageAccess(['performance', 'rum', 'observability/failures', 'observability/backend'])] }, getPerformanceTrends);
    fastify.get('/performance/anomalies', { preHandler: [requirePageAccess(['performance', 'rum', 'observability/failures', 'observability/backend'])] }, getPerformanceAnomalies);
    fastify.get('/performance/slowest-pages', { preHandler: [requirePageAccess(['performance', 'rum', 'observability/failures', 'observability/backend'])] }, getSlowestPages);
    fastify.get('/performance/regional', getRegionalPerformance);
    fastify.get('/performance/device', getDeviceSegmentation);
    fastify.get('/performance/resources', getResourceBreakdown);

    // Customer Analytics (End-User Experience)
    fastify.get('/customers/summary', { preHandler: [requirePageAccess(['customers', 'rum', 'observability/journeys'])] }, getUserActivitySummary);
    fastify.get('/customers/trends', { preHandler: [requirePageAccess(['customers', 'rum', 'observability/journeys'])] }, getUserTrends);
    fastify.get('/customers/analytics', { preHandler: [requirePageAccess(['customers', 'rum', 'observability/journeys'])] }, getUserAnalytics);
    fastify.get('/customers/intelligence', { preHandler: [requirePageAccess(['customers', 'observability/journeys'])] }, getCustomerIntelligence);
    fastify.post('/customers/payment-gateways', { preHandler: [requirePageAccess(['customers', 'observability/journeys'])] }, savePaymentGatewayConfig);
    fastify.get('/customers/list', getCustomerList);
    fastify.get('/customers/top-pages', { preHandler: [requirePageAccess(['customers', 'rum', 'observability/journeys'])] }, getTopPages);
    fastify.get('/customers/funnel', { preHandler: [requirePageAccess(['customers', 'rum', 'observability/journeys'])] }, getFunnelData);

    // Legacy Aliases (Compatibility for user-analytics -> customer-analytics migration)
    fastify.get('/users/summary', getUserActivitySummary);
    fastify.get('/users/trends', getUserTrends);
    fastify.get('/users/analytics', getUserAnalytics);
    fastify.get('/users/top-pages', getTopPages);
    fastify.get('/users/funnel', getFunnelData);

    // Order Activity Endpoints
    fastify.get('/orders/summary', { preHandler: [requirePageAccess('orders')] }, getOrderSummary);
    fastify.get('/orders/trends', { preHandler: [requirePageAccess('orders')] }, getOrderTrends);
    fastify.get('/orders/rca', { preHandler: [requirePageAccess('orders')] }, getOrderRCA);
    fastify.get('/orders/recommendations', { preHandler: [requirePageAccess('orders')] }, getOrderRecommendations);
    fastify.post('/orders/offline/upload', { preHandler: [requirePageAccess('orders')] }, uploadOfflineOrders);
    fastify.post('/orders/integrations/sync', { preHandler: [requirePageAccess('orders')] }, syncIntegration);
    fastify.get('/orders/integrations/status', { preHandler: [requirePageAccess('orders')] }, getIntegrationStatus);
    fastify.get('/orders/list', getOrders);
    fastify.get('/orders/delayed', { preHandler: [requirePageAccess('orders')] }, getDelayedOrders);
    fastify.get('/orders/source-breakdown', { preHandler: [requirePageAccess('orders')] }, getOrderSourceBreakdown);

    // Integration Monitoring Endpoints
    fastify.get('/integrations/summary', { preHandler: [requirePageAccess('integrations')] }, getIntegrationHealthSummary);
    fastify.get('/integrations/trends', { preHandler: [requirePageAccess('integrations')] }, getSyncTrends);
    fastify.get('/integrations/failed', { preHandler: [requirePageAccess('integrations')] }, getFailedSyncs);
    fastify.get('/integrations/systems', { preHandler: [requirePageAccess('integrations')] }, getIntegrationSystemBreakdown);

    // KPI Meta Metrics Endpoints
    fastify.get('/p/:siteId/metrics/catalog', getMetricsCatalog);
    fastify.get('/p/:siteId/metrics/series', getMetricsSeries);

    fastify.register(syntheticRoutes, { prefix: '/synthetic' });
};
