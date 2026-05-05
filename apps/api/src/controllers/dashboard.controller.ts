import { DashboardService } from '../services/dashboard.service';
<<<<<<< HEAD
import { successResponse, errorResponse } from '../utils/response';
import { env } from '../config/env';

const getFilters = (req: any) => ({
    tenantId: req.tenantId, // Attached by auth middleware
    siteId: req.params.siteId || req.query.siteId || req.siteId,
    timeRange: req.query.timeRange || '1h'
});

// Standard error responder for all controller methods
const respondWithError = (res: any, err: any, context: string, siteId?: string) => {
    const correlationId = (res.request as any)?.id || 'unknown';
    console.error(`[API FAIL] ${context} | siteId=${siteId || 'none'} | rid=${correlationId} | Error:`, err);
    
    // Hide details in production
    const message = env.NODE_ENV === 'production' ? 'An internal server error occurred' : err.message;
    
    return res.code(500).send(errorResponse(message, 'INTERNAL_SERVER_ERROR', null, correlationId));
};

export const getSummaries = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getKpiSummaries(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getSummaries', siteId);
=======

const getFilters = (req: any) => ({
    siteId: req.params.siteId || req.siteId,
    timeRange: req.query.timeRange || '1h'
});

export const getSummaries = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getKpiSummaries(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        console.error('[DashboardController] Routing failure', err);
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getAlerts = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getActiveAlerts(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getAlerts', siteId);
=======
    try {
        const data = await DashboardService.getActiveAlerts(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getPerformanceSummary = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getPerformanceSummary(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getPerformanceSummary', siteId);
=======
    try {
        const data = await DashboardService.getPerformanceSummary(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getPerformanceTrends = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getPerformanceTrends(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getPerformanceTrends', siteId);
=======
    try {
        const data = await DashboardService.getPerformanceTrends(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getRegionalPerformance = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getRegionalPerformance(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getRegionalPerformance', siteId);
=======
    try {
        const data = await DashboardService.getRegionalPerformance(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getDeviceSegmentation = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    try {
        const data = await DashboardService.getDeviceSegmentation(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
<<<<<<< HEAD
        return respondWithError(res, err, 'getDeviceSegmentation', siteId);
=======
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getResourceBreakdown = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    try {
        const data = await DashboardService.getResourceBreakdown(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
<<<<<<< HEAD
        return respondWithError(res, err, 'getResourceBreakdown', siteId);
=======
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getSlowestPages = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    try {
        const data = await DashboardService.getSlowestPages(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
<<<<<<< HEAD
        return respondWithError(res, err, 'getSlowestPages', siteId);
=======
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getUserActivitySummary = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getUserActivitySummary(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getUserActivitySummary', siteId);
=======
    try {
        const data = await DashboardService.getUserActivitySummary(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getUserTrends = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    try {
        const data = await DashboardService.getUserTrends(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
<<<<<<< HEAD
        return respondWithError(res, err, 'getUserTrends', siteId);
=======
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getUserAnalytics = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    try {
        const data = await DashboardService.getUserAnalytics(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
<<<<<<< HEAD
        return respondWithError(res, err, 'getUserAnalytics', siteId);
=======
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getTopPages = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    try {
        const data = await DashboardService.getTopPages(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
<<<<<<< HEAD
        return respondWithError(res, err, 'getTopPages', siteId);
=======
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getFunnelData = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    try {
        const data = await DashboardService.getFunnelData(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
<<<<<<< HEAD
        return respondWithError(res, err, 'getFunnelData', siteId);
=======
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getOrderSummary = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getOrderSummary(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getOrderSummary', siteId);
=======
    try {
        const data = await DashboardService.getOrderSummary(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getOrderTrends = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getOrderTrends(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getOrderTrends', siteId);
=======
    try {
        const data = await DashboardService.getOrderTrends(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getOrderRCA = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getOrderRCA(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getOrderRCA', siteId);
=======
    try {
        const data = await DashboardService.getOrderRCA(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getOrderRecommendations = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getRecommendations(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getOrderRecommendations', siteId);
=======
    try {
        const data = await DashboardService.getRecommendations(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const uploadOfflineOrders = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const { OrderIngestionService } = require('../services/order-ingestion.service');
        const { csv } = req.body;
        const result = await OrderIngestionService.processCSV(siteId, csv);
        return res.code(200).send(successResponse(result));
    } catch (err) {
        return respondWithError(res, err, 'uploadOfflineOrders', siteId);
=======
    const { OrderIngestionService } = require('../services/order-ingestion.service');
    try {
        const { siteId } = getFilters(req);
        const { csv } = req.body;
        const result = await OrderIngestionService.processCSV(siteId, csv);
        return res.code(200).send(result);
    } catch (err) {
        return res.code(500).send({ error: 'Failed to process CSV ingestion' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const syncIntegration = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const { OrderIngestionService } = require('../services/order-ingestion.service');
        const { system } = req.body;
        const result = await OrderIngestionService.syncExternalSystem(siteId, system);
        return res.code(200).send(successResponse(result));
    } catch (err) {
        return respondWithError(res, err, 'syncIntegration', siteId);
=======
    const { OrderIngestionService } = require('../services/order-ingestion.service');
    try {
        const { siteId } = getFilters(req);
        const { system } = req.body;
        const result = await OrderIngestionService.syncExternalSystem(siteId, system);
        return res.code(200).send(result);
    } catch (err) {
        return res.code(500).send({ error: 'Sync triggered failed' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getIntegrationStatus = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const { GlobalMemoryStore } = require('../../../../packages/db/src/adapters/in-memory.adapter');
        const syncs = (GlobalMemoryStore.integrationSyncs || []).filter((s:any) => s && s.siteId === siteId);
        return res.code(200).send(successResponse(syncs));
    } catch (err) {
        return respondWithError(res, err, 'getIntegrationStatus', siteId);
    }
};

export const getDelayedOrders = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getDelayedOrders(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getDelayedOrders', siteId);
=======
    const { GlobalMemoryStore } = require('../../../../packages/db/src');
    const { siteId } = getFilters(req);
    const syncs = GlobalMemoryStore.integrationSyncs.filter((s:any) => s.siteId === siteId);
    return res.code(200).send(syncs);
};

export const getDelayedOrders = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getDelayedOrders(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getOrderSourceBreakdown = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getOrderSourceBreakdown(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getOrderSourceBreakdown', siteId);
=======
    try {
        const data = await DashboardService.getOrderSourceBreakdown(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getIntegrationHealthSummary = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getIntegrationHealthSummary(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getIntegrationHealthSummary', siteId);
=======
    try {
        const data = await DashboardService.getIntegrationHealthSummary(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getSyncTrends = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getSyncTrends(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getSyncTrends', siteId);
=======
    try {
        const data = await DashboardService.getSyncTrends(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getFailedSyncs = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getFailedSyncs(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getFailedSyncs', siteId);
=======
    try {
        const data = await DashboardService.getFailedSyncs(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getIntegrationSystemBreakdown = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getIntegrationSystemBreakdown(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getIntegrationSystemBreakdown', siteId);
=======
    try {
        const data = await DashboardService.getIntegrationSystemBreakdown(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getMetricsCatalog = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getMetricsCatalog(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getMetricsCatalog', siteId);
=======
    try {
        const data = await DashboardService.getMetricsCatalog(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};

export const getMetricsSeries = async (req: any, res: any) => {
<<<<<<< HEAD
    const { siteId } = getFilters(req);
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    try {
        const filters = {
            ...getFilters(req),
            kpi: req.query.kpi as string,
            range: req.query.range as string || '1h'
        };
        const data = await DashboardService.getMetricsSeries(filters as any);
<<<<<<< HEAD
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getMetricsSeries', siteId);
    }
};

export const getOrders = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getOrders(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getOrders', siteId);
    }
};

export const getPerformanceAnomalies = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getPerformanceAnomalies(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getPerformanceAnomalies', siteId);
    }
};

export const getCustomerIntelligence = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getCustomerIntelligence(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getCustomerIntelligence', siteId);
    }
};

export const getAuditLogs = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getAuditLogs(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getAuditLogs', siteId);
    }
};

export const getActivityFeed = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getActivityFeed(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getActivityFeed', siteId);
    }
};

export const getGovernanceConfig = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getGovernanceConfig(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getGovernanceConfig', siteId);
    }
};

export const updateGovernanceConfig = async (req: any, res: any) => {
    const siteId = req.params.siteId || req.query.siteId || req.siteId;
    try {
        const { section, data } = req.body;
        const result = await DashboardService.updateGovernanceConfig(siteId, section, data);
        return res.code(200).send(successResponse(result));
    } catch (err) {
        return respondWithError(res, err, 'updateGovernanceConfig', siteId);
    }
};

export const getIncidents = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getIncidents(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getIncidents', siteId);
=======
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
};
