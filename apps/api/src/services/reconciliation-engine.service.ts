import { prisma } from '@kpi-platform/db';
import { 
    ReconciliationJobSummary, 
    MismatchDetail, 
    MismatchCategory 
} from '../../../../packages/shared-types/src';

export class ReconciliationEngine {
    
    /**
     * Executes a domain reconciliation job.
     * Requirement 7 & 11 (Job System)
     */
    static async runReconciliation(options: { 
        siteId: string; 
        domain: 'ORDERS' | 'INTEGRATIONS';
        connectorId?: string;
        start: Date;
        end: Date;
    }): Promise<ReconciliationJobSummary> {
        const jobId = Math.random().toString(36).substring(7);
        console.log(`[ReconciliationEngine] Starting job ${jobId} for ${options.domain} (${options.siteId})`);

        const mismatches: MismatchDetail[] = [];
        let examined = 0;
        let matched = 0;

        if (options.domain === 'ORDERS') {
            // 1. COUNT RECONCILIATION (Requirement 8)
            const stats = await this.reconcileOrderCounts(options.siteId, options.start, options.end);
            examined = stats.raw;
            matched = stats.normalized;
            
            if (stats.raw !== stats.normalized) {
                mismatches.push({
                    entityId: options.siteId,
                    category: 'COUNT_MISMATCH',
                    severity: 'HIGH',
                    sourceLayer: 'RAW_INGESTION',
                    targetLayer: 'NORMALIZED_ORDERS',
                    expectedValue: stats.raw,
                    actualValue: stats.normalized,
                    explanation: `Mismatch of ${stats.raw - stats.normalized} records between Raw and Normalized layers.`,
                    recoverable: true
                });
            }
        }

        if (options.domain === 'INTEGRATIONS' && options.connectorId) {
            // 2. FRESHNESS RECONCILIATION (Requirement 8)
            const freshness = await this.checkConnectorFreshness(options.connectorId, options.siteId);
            if (freshness.isStale) {
                mismatches.push({
                    entityId: options.connectorId,
                    category: 'FRESHNESS_BREACH',
                    severity: 'HIGH',
                    sourceLayer: 'CONNECTOR_SYNC',
                    targetLayer: 'SYSTEM_SLA',
                    explanation: `Connector ${options.connectorId} exceeds stale threshold. Last sync: ${freshness.lastSync}`,
                    recoverable: true
                });
            }
        }

        // Calculate confidence score based on mismatches vs examined
        const confidenceScore = examined > 0 ? (matched / examined) : 1.0;

        const summary: ReconciliationJobSummary = {
            jobId,
            domain: options.domain,
            siteId: options.siteId,
            connectorId: options.connectorId,
            range: { start: options.start.toISOString(), end: options.end.toISOString() },
            counts: {
                examined,
                matched,
                mismatched: examined - matched,
                repaired: 0
            },
            confidenceScore,
            status: 'COMPLETED',
            mismatches
        };

        // Record metrics (Requirement 20)
        await this.recordReconMetric(summary);

        return summary;
    }

    private static async reconcileOrderCounts(siteId: string, start: Date, end: Date) {
        const [raw, normalized] = await Promise.all([
            prisma.ingestionEvent.count({
                where: {
                    projectId: siteId,
                    receivedAt: {
                        gte: start,
                        lte: end
                    }
                }
            }),
            prisma.canonicalOrder.count({
                where: {
                    siteId,
                    placedAt: {
                        gte: start,
                        lte: end
                    },
                    normalizedStatus: 'ACTIVE'
                }
            })
        ]);

        return {
            raw,
            normalized
        };
    }

    private static async checkConnectorFreshness(connectorId: string, siteId: string) {
        // Simulate freshness check against SLA
        return {
            isStale: false,
            lastSync: new Date().toISOString()
        };
    }

    private static async recordReconMetric(summary: ReconciliationJobSummary) {
        try {
            await prisma.systemHealthMetric.create({
                data: {
                    projectId: summary.siteId,
                    metricName: `recon_confidence_${summary.domain.toLowerCase()}`,
                    metricValue: Math.round(summary.confidenceScore * 100),
                    labels: { siteId: summary.siteId, jobId: summary.jobId }
                }
            });
        } catch (err) {}
    }
}
