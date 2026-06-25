import { DashboardService } from '../services/dashboard.service';
import { successResponse, errorResponse } from '../utils/response';
import { env } from '../config/env';

const getFilters = (req: any) => {
    const timeRange = req.query.range || req.query.timeRange || '24h';
    const endDate = new Date();
    let startDate: Date;

    switch (timeRange) {
        case '24h':
            startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
            break;
        case '7d':
            startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case '30d':
            startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        case '90d':
            startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
        case 'all':
            startDate = new Date(0); // Beginning of time
            break;
        default:
            startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    }

    // Extract connector_instance_id for multi-store data isolation
    const connectorInstanceId = req.query.connector_instance_id;

    return {
        tenantId: req.tenantId, // Attached by auth middleware
        siteId: req.params.siteId || req.query.siteId || req.siteId,
        timeRange,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        connectorInstanceId: connectorInstanceId || null // null = all connectors for current project
    };
};

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
    }
};

export const getAlerts = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getActiveAlerts(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getAlerts', siteId);
    }
};

export const getPerformanceSummary = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getPerformanceSummary(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getPerformanceSummary', siteId);
    }
};

export const getPerformanceTrends = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getPerformanceTrends(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getPerformanceTrends', siteId);
    }
};

export const getRegionalPerformance = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getRegionalPerformance(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getRegionalPerformance', siteId);
    }
};

export const getDeviceSegmentation = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getDeviceSegmentation(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return respondWithError(res, err, 'getDeviceSegmentation', siteId);
    }
};

export const getResourceBreakdown = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getResourceBreakdown(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return respondWithError(res, err, 'getResourceBreakdown', siteId);
    }
};

export const getSlowestPages = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getSlowestPages(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return respondWithError(res, err, 'getSlowestPages', siteId);
    }
};

export const getUserActivitySummary = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getUserActivitySummary(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getUserActivitySummary', siteId);
    }
};

export const getUserTrends = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getUserTrends(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return respondWithError(res, err, 'getUserTrends', siteId);
    }
};

export const getUserAnalytics = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getUserAnalytics(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return respondWithError(res, err, 'getUserAnalytics', siteId);
    }
};

export const getTopPages = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getTopPages(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return respondWithError(res, err, 'getTopPages', siteId);
    }
};

export const getFunnelData = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getFunnelData(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return respondWithError(res, err, 'getFunnelData', siteId);
    }
};

export const getOrderSummary = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getOrderSummary(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getOrderSummary', siteId);
    }
};

export const getOrderTrends = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getOrderTrends(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getOrderTrends', siteId);
    }
};

export const getOrderRCA = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getOrderRCA(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getOrderRCA', siteId);
    }
};

export const getOrderRecommendations = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getRecommendations(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getOrderRecommendations', siteId);
    }
};

export const uploadOfflineOrders = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const { OrderIngestionService } = require('../services/order-ingestion.service');
        const { csv } = req.body;
        const result = await OrderIngestionService.processCSV(siteId, csv);
        return res.code(200).send(successResponse(result));
    } catch (err) {
        return respondWithError(res, err, 'uploadOfflineOrders', siteId);
    }
};

export const ingestCsvConnector = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const { OrderIngestionService } = require('../services/order-ingestion.service');
        const { connectorName, rows, targetConnectorId, connectorInstanceId, currency } = req.body || {};
        const result = await OrderIngestionService.ingestCsvRows(
            siteId,
            connectorName,
            rows,
            targetConnectorId || connectorInstanceId || null,
            currency || null,
        );
        return res.code(200).send(successResponse(result));
    } catch (err) {
        return respondWithError(res, err, 'ingestCsvConnector', siteId);
    }
};

export const syncIntegration = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const { OrderIngestionService } = require('../services/order-ingestion.service');
        const { system } = req.body;
        const result = await OrderIngestionService.syncExternalSystem(siteId, system);
        return res.code(200).send(successResponse(result));
    } catch (err) {
        return respondWithError(res, err, 'syncIntegration', siteId);
    }
};

export const getIntegrationStatus = async (req: any, res: any) => {
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
    }
};

export const getOrderSourceBreakdown = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getOrderSourceBreakdown(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getOrderSourceBreakdown', siteId);
    }
};

export const getIntegrationHealthSummary = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getIntegrationHealthSummary(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getIntegrationHealthSummary', siteId);
    }
};

export const getSyncTrends = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getSyncTrends(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getSyncTrends', siteId);
    }
};

export const getFailedSyncs = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getFailedSyncs(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getFailedSyncs', siteId);
    }
};

export const getIntegrationSystemBreakdown = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getIntegrationSystemBreakdown(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getIntegrationSystemBreakdown', siteId);
    }
};

export const getMetricsCatalog = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getMetricsCatalog(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getMetricsCatalog', siteId);
    }
};

export const getMetricsSeries = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const filters = {
            ...getFilters(req),
            kpi: req.query.kpi as string,
            range: req.query.range as string || '1h'
        };
        const data = await DashboardService.getMetricsSeries(filters as any);
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

export const getCustomerList = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const { lifecycleState, limit = 50, offset = 0 } = req.query;
        let customers = await DashboardService.getCustomers(getFilters(req) as any);
        
        if (lifecycleState) {
            customers = customers.filter((c: any) => c.lifecycleState === lifecycleState);
        }

        const total = customers.length;
        const page = customers.slice(Number(offset), Number(offset) + Number(limit));

        return res.code(200).send(successResponse(page, {
            pagination: {
                total,
                limit: Number(limit),
                offset: Number(offset),
                hasNext: Number(offset) + Number(limit) < total
            }
        }));
    } catch (err) {
        return respondWithError(res, err, 'getCustomerList', siteId);
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

export const savePaymentGatewayConfig = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.savePaymentGatewayConfig(getFilters(req) as any, req.body || {});
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'savePaymentGatewayConfig', siteId);
    }
};

export const getPaymentGatewayStatuses = async (req: any, res: any) => {
    const { siteId } = getFilters(req);
    try {
        const data = await DashboardService.getPaymentGatewayStatuses(getFilters(req) as any);
        return res.code(200).send(successResponse(data));
    } catch (err) {
        return respondWithError(res, err, 'getPaymentGatewayStatuses', siteId);
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
    }
};