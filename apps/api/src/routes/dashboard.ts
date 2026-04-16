import { 
    getSummaries, 
    getAlerts, 
    getPerformanceSummary, 
    getPerformanceTrends, 
    getSlowestPages,
    getUserActivitySummary,
    getUserTrends,
    getUserAnalytics,
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
    getRegionalPerformance,
    getDeviceSegmentation,
    getResourceBreakdown,
    getMetricsCatalog,
    getMetricsSeries
} from '../controllers/dashboard.controller';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { syntheticRoutes } from './synthetic';

export const dashboardRoutes = async (fastify: any) => {
    // API Prefix Mapping
    // Securely routes all data strictly mapped to authenticated tenants bounds
    fastify.addHook('preHandler', tenantAuthHandler);
    
    fastify.get('/summaries', getSummaries);
    fastify.get('/alerts', getAlerts);
    
    // Performance Endpoints
    fastify.get('/performance/summary', getPerformanceSummary);
    fastify.get('/performance/trends', getPerformanceTrends);
    fastify.get('/performance/slowest-pages', getSlowestPages);
    fastify.get('/performance/regional', getRegionalPerformance);
    fastify.get('/performance/device', getDeviceSegmentation);
    fastify.get('/performance/resources', getResourceBreakdown);
    
    // User Activity Endpoints
    fastify.get('/users/summary', getUserActivitySummary);
    fastify.get('/users/trends', getUserTrends);
    fastify.get('/users/analytics', getUserAnalytics);
    fastify.get('/users/top-pages', getTopPages);
    fastify.get('/users/funnel', getFunnelData);
    
    // Order Activity Endpoints
    fastify.get('/orders/summary', getOrderSummary);
    fastify.get('/orders/trends', getOrderTrends);
    fastify.get('/orders/rca', getOrderRCA);
    fastify.get('/orders/recommendations', getOrderRecommendations);
    fastify.post('/orders/offline/upload', uploadOfflineOrders);
    fastify.post('/orders/integrations/sync', syncIntegration);
    fastify.get('/orders/integrations/status', getIntegrationStatus);
    fastify.get('/orders/delayed', getDelayedOrders);
    fastify.get('/orders/source-breakdown', getOrderSourceBreakdown);
    
    // Integration Monitoring Endpoints
    fastify.get('/integrations/summary', getIntegrationHealthSummary);
    fastify.get('/integrations/trends', getSyncTrends);
    fastify.get('/integrations/failed', getFailedSyncs);
    fastify.get('/integrations/systems', getIntegrationSystemBreakdown);
    
    // KPI Meta Metrics Endpoints
    fastify.get('/p/:siteId/metrics/catalog', getMetricsCatalog);
    fastify.get('/p/:siteId/metrics/series', getMetricsSeries);
    
    fastify.register(syntheticRoutes, { prefix: '/synthetic' });
};

