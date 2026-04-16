import { DashboardService } from '../services/dashboard.service';

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
    }
};

export const getAlerts = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getActiveAlerts(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getPerformanceSummary = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getPerformanceSummary(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getPerformanceTrends = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getPerformanceTrends(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getRegionalPerformance = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getRegionalPerformance(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getDeviceSegmentation = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getDeviceSegmentation(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getResourceBreakdown = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getResourceBreakdown(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getSlowestPages = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getSlowestPages(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getUserActivitySummary = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getUserActivitySummary(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getUserTrends = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getUserTrends(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getUserAnalytics = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getUserAnalytics(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getTopPages = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getTopPages(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getFunnelData = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getFunnelData(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getOrderSummary = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getOrderSummary(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getOrderTrends = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getOrderTrends(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getOrderRCA = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getOrderRCA(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getOrderRecommendations = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getRecommendations(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const uploadOfflineOrders = async (req: any, res: any) => {
    const { OrderIngestionService } = require('../services/order-ingestion.service');
    try {
        const { siteId } = getFilters(req);
        const { csv } = req.body;
        const result = await OrderIngestionService.processCSV(siteId, csv);
        return res.code(200).send(result);
    } catch (err) {
        return res.code(500).send({ error: 'Failed to process CSV ingestion' });
    }
};

export const syncIntegration = async (req: any, res: any) => {
    const { OrderIngestionService } = require('../services/order-ingestion.service');
    try {
        const { siteId } = getFilters(req);
        const { system } = req.body;
        const result = await OrderIngestionService.syncExternalSystem(siteId, system);
        return res.code(200).send(result);
    } catch (err) {
        return res.code(500).send({ error: 'Sync triggered failed' });
    }
};

export const getIntegrationStatus = async (req: any, res: any) => {
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
    }
};

export const getOrderSourceBreakdown = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getOrderSourceBreakdown(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getIntegrationHealthSummary = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getIntegrationHealthSummary(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getSyncTrends = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getSyncTrends(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getFailedSyncs = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getFailedSyncs(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getIntegrationSystemBreakdown = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getIntegrationSystemBreakdown(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getMetricsCatalog = async (req: any, res: any) => {
    try {
        const data = await DashboardService.getMetricsCatalog(getFilters(req) as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getMetricsSeries = async (req: any, res: any) => {
    try {
        const filters = {
            ...getFilters(req),
            kpi: req.query.kpi as string,
            range: req.query.range as string || '1h'
        };
        const data = await DashboardService.getMetricsSeries(filters as any);
        return res.code(200).send(data);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};
