import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';

export interface RCAAnalysis {
    siteId: string;
    status: 'Healthy' | 'Issue Detected' | 'Critical Failure';
    correlations: Array<{
        type: 'Latency' | 'SyncRate' | 'API_Error';
        severity: 'High' | 'Medium' | 'Low';
        reason: string;
        impactedMetric: string;
    }>;
    recommendations: string[];
}

export class OrderIntelligenceService {
    
    public async performRCA(siteId: string): Promise<RCAAnalysis> {
        const metrics = GlobalMemoryStore.metrics.filter(m => m.siteId === siteId);
        const syncSuccessRate = this.getMetricValue(metrics, 'syncSuccessRate');
        const avgLatency = this.getMetricValue(metrics, 'pageLoadTime');
        const errorRate = this.getMetricValue(metrics, 'errorRatePct');

        const correlations: RCAAnalysis['correlations'] = [];
        const recommendations: string[] = [];

        // 1. Correlate Sync Health with Order Drops
        if (syncSuccessRate < 95) {
            correlations.push({
                type: 'SyncRate',
                severity: syncSuccessRate < 80 ? 'High' : 'Medium',
                reason: `Integration sync success rate dropped to ${syncSuccessRate}%. This directly correlates with gaps in order ingestion from source marketplaces.`,
                impactedMetric: 'Order Ingestion Integrity'
            });
            recommendations.push('Trigger manual resync for high-priority connectors.');
        }

        // 2. Correlate Latency with Conversion/Checkout Failure
        if (avgLatency > 3500) {
            correlations.push({
                type: 'Latency',
                severity: avgLatency > 5000 ? 'High' : 'Medium',
                reason: `Average site latency is ${avgLatency}ms. High TTI (Time to Interactive) is correlated with checkout abandonment spikes.`,
                impactedMetric: 'Checkout Conversion Rate'
            });
            recommendations.push('Check CDN propagation and static asset optimization.');
        }

        // 3. Correlate API Errors
        if (errorRate > 5) {
            correlations.push({
                type: 'API_Error',
                severity: 'High',
                reason: `Frontend API error rate is ${errorRate}%. 5xx errors from the checkout microservice are impacting order throughput.`,
                impactedMetric: 'Order Throughput'
            });
            recommendations.push('Perform rolling restart of the checkout-api service.');
        }

        let status: RCAAnalysis['status'] = 'Healthy';
        if (correlations.some(c => c.severity === 'High')) status = 'Critical Failure';
        else if (correlations.length > 0) status = 'Issue Detected';

        if (status === 'Healthy') {
            recommendations.push('Baseline performance is within SLAs. Monitor for seasonal drift.');
        }

        return {
            siteId,
            status,
            correlations,
            recommendations
        };
    }

    private getMetricValue(metrics: any[], kpiName: string): number {
        const records = metrics.filter(m => m.kpiName === kpiName);
        if (records.length === 0) {
            // Fallback for demo if metrics aren't seeded yet
            if (kpiName === 'syncSuccessRate') return 98;
            if (kpiName === 'pageLoadTime') return 2400;
            if (kpiName === 'errorRatePct') return 0.5;
            return 0;
        }
        return Math.round(records.reduce((s, r) => s + r.value, 0) / records.length);
    }
}

export const orderIntelligenceService = new OrderIntelligenceService();
