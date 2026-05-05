<<<<<<< HEAD
import { prisma } from '@kpi-platform/db';
import { Prisma } from '@prisma/client';
import { 
    CanonicalOrder, 
    CanonicalLifecycleState, 
    OrderChannel, 
    OrderIntelligenceState,
    FinancialSummary
} from '../../../../packages/shared-types/src';
import crypto from 'crypto';

export class OrderIntelligenceService {
    
    /**
     * Normalizes a raw order from any source into the Canonical Order Layer.
     * Requirement 1, 2, 4
     */
    static async ingestAndNormalize(raw: any, sourceSystem: string, siteId: string): Promise<string> {
        const sourceOrderId = raw.id || raw.order_number || raw.entity_id;
        const project = await prisma.project.findUnique({
            where: { id: siteId },
            select: { tenantId: true }
        });
        const tenantId = project?.tenantId || (raw as any).tenantId || 'tenant_001';
        
        // 1. LIFECYCLE MAPPING (Requirement 2)
        const lifecycleState = this.mapToCanonicalState(raw.status || raw.state, sourceSystem);
        
        // 2. CHANNEL CLASSIFICATION (Requirement 5)
        const channel = this.classifyChannel(raw, sourceSystem);
        
        // 3. FINANCIAL NORMALIZATION (Requirement 7)
        const financials = this.normalizeFinancials(raw);

        // 4. CHECK SOURCE-OF-TRUTH HIERARCHY (Requirement 6 - Simulation)
        // In production, we'd fetch the existing record and check if this source is higher priority for this domain.

        const internalId = crypto.randomUUID();
        const orderData = {
            id: internalId,
            orderId: sourceOrderId.toString(),
            siteId,
            tenantId,
            sourceSystem,
            channel,
            lifecycleState,
            normalizedStatus: 'ACTIVE',
            currency: financials.currency,
            totalAmount: financials.grandTotal.toString(),
            taxAmount: financials.tax.toString(),
            discountAmount: financials.discount.toString(),
            paidAmount: financials.paidAmount.toString(),
            refundedAmount: financials.refundedAmount.toString(),
            mappingVersion: '1.0.0',
            placedAt: new Date(raw.created_at || raw.createdAt || Date.now()),
            metadata: { originalStatus: raw.status, sourceSystem }
        };

        // 5. ATOMIC OPS: UPSERT ORDER + SNAPSHOT (Requirement 3)
        // Using a transaction usually, but here we'll chain
        await prisma.$transaction(async tx => {
            await tx.canonicalOrder.create({ data: orderData });

            await tx.orderSnapshot.create({
                data: {
                    orderInternalId: internalId,
                    lifecycleState,
                    totalAmount: financials.grandTotal.toString(),
                    metadata: { financials } as unknown as Prisma.InputJsonValue
                }
            });
        });

        // 6. INTELLIGENCE RULES (Requirement 10)
        await this.runIntelligenceRules(internalId, orderData);

        return internalId;
    }

    private static mapToCanonicalState(sourceStatus: string, system: string): CanonicalLifecycleState {
        const normalizedStatus = sourceStatus?.toLowerCase();
        
        // Shopify Mappings
        if (system === 'shopify') {
            if (normalizedStatus === 'open') return 'CREATED';
            if (normalizedStatus === 'fulfilled') return 'SHIPPED';
            if (normalizedStatus === 'cancelled') return 'CANCELLED';
        }

        // Magento Mappings
        if (system === 'magento') {
            if (normalizedStatus === 'pending') return 'PENDING_PAYMENT';
            if (normalizedStatus === 'processing') return 'PAID';
            if (normalizedStatus === 'complete') return 'DELIVERED';
        }

        return 'CREATED'; // Fallback
    }

    private static classifyChannel(raw: any, system: string): OrderChannel {
        // Requirement 5: Deterministic Online vs Offline
        if (raw.source_name === 'pos' || raw.pos_details) return 'OFFLINE_POS';
        if (raw.source_name === 'web' || raw.browser_ip) return 'ONLINE_STOREFRONT';
        if (raw.market_place_id) return 'MARKETPLACE';
        
        return 'UNKNOWN_CHANNEL';
    }

    private static normalizeFinancials(raw: any): FinancialSummary {
        return {
            currency: raw.currency || 'USD',
            subtotal: parseFloat(raw.subtotal_price || raw.subtotal || '0'),
            tax: parseFloat(raw.total_tax || '0'),
            shipping: parseFloat(raw.total_shipping || '0'),
            discount: parseFloat(raw.total_discounts || '0'),
            grandTotal: parseFloat(raw.total_price || raw.grand_total || '0'),
            paidAmount: parseFloat(raw.total_paid || '0'),
            refundedAmount: parseFloat(raw.total_refunded || '0'),
            balanceDue: 0 // Computed
        };
    }

    /**
     * Requirement 10: Order Exception Intelligence
     */
    private static async runIntelligenceRules(id: string, order: any) {
        let intelligenceState: OrderIntelligenceState = 'HEALTHY';
        
        // Rule: Stuck in Created (Requirement 10)
        const ageInHours = (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60);
        if (order.lifecycleState === 'CREATED' && ageInHours > 24) {
            intelligenceState = 'STUCK';
        }

        // Rule: Financial Mismatch (Requirement 7)
        if (parseFloat(order.grandTotal) < 0) {
            intelligenceState = 'REQUIRES_REVIEW';
        }

        if (intelligenceState !== 'HEALTHY') {
            const existing = await prisma.canonicalOrder.findUnique({
                where: { id },
                select: { metadata: true }
            });

            await prisma.canonicalOrder.update({
                where: { id },
                data: {
                    metadata: {
                        ...((existing?.metadata as Record<string, any>) || {}),
                        intelligenceState
                    }
                }
            });
        }
    }
}
=======
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
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
