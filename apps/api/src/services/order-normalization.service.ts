<<<<<<< HEAD
import crypto from 'crypto';

/**
 * OrderNormalizationService (The CDM Engine)
 * 
 * Objective: 
 * Translates provider-specific payloads (Shopify, Magento, ERP) 
 * into the system's Canonical Data Model (CDM).
 */

export enum LifecycleState {
    PLACED = 'PLACED',
    PAID = 'PAID',
    SHIPPED = 'SHIPPED',
    DELIVERED = 'DELIVERED',
    RETURNED = 'RETURNED',
    CANCELLED = 'CANCELLED'
}

export interface CanonicalOrder {
    id: string;
    siteId: string;
    tenantId: string;
    orderId: string;
    externalReferenceId?: string;
    sourceSystem: string;
    channel: string;
    lifecycleState: LifecycleState;
    currency: string;
    totalAmount: number;
    taxAmount: number;
    discountAmount: number;
    paidAmount: number;
    refundedAmount: number;
    placedAt: string;
    metadata: Record<string, any>;
    qualityScore: number;
}

export class OrderNormalizationService {
    
    /**
     * Entry point for normalization.
     */
    public async normalize(providerId: string, rawPayload: any, siteId: string, tenantId: string): Promise<CanonicalOrder> {
        let canonical: Partial<CanonicalOrder>;

        switch (providerId.toLowerCase()) {
            case 'shopify':
                canonical = this.mapShopify(rawPayload);
                break;
            case 'magento':
                canonical = this.mapMagento(rawPayload);
                break;
            default:
                canonical = this.mapGeneric(rawPayload);
        }

        canonical.id = crypto.randomUUID();
        canonical.siteId = siteId;
        canonical.tenantId = tenantId;
        canonical.sourceSystem = providerId;

        // Run Quality Gates
        const qualityResult = this.runQualityGates(canonical as CanonicalOrder);
        canonical.qualityScore = qualityResult.score;
        canonical.metadata = { 
            ...(canonical.metadata || {}), 
            qualityWarnings: qualityResult.warnings 
        };

        return canonical as CanonicalOrder;
    }

    private mapShopify(payload: any): Partial<CanonicalOrder> {
        return {
            orderId: payload.name || payload.id,
            externalReferenceId: payload.id,
            channel: payload.source_name || 'online',
            lifecycleState: this.mapStatus(payload.financial_status, payload.fulfillment_status),
            currency: payload.currency || 'USD',
            totalAmount: parseFloat(payload.total_price || '0'),
            taxAmount: parseFloat(payload.total_tax || '0'),
            discountAmount: parseFloat(payload.total_discounts || '0'),
            paidAmount: payload.financial_status === 'paid' ? parseFloat(payload.total_price || '0') : 0,
            refundedAmount: 0, // Simplified for demo
            placedAt: payload.created_at || new Date().toISOString(),
            metadata: { shopify_tags: payload.tags }
        };
    }

    private mapMagento(payload: any): Partial<CanonicalOrder> {
        return {
            orderId: payload.increment_id,
            channel: 'magento_store',
            lifecycleState: LifecycleState.PLACED, // Simplified
            currency: payload.order_currency_code || 'USD',
            totalAmount: parseFloat(payload.grand_total || '0'),
            taxAmount: parseFloat(payload.tax_amount || '0'),
            discountAmount: Math.abs(parseFloat(payload.discount_amount || '0')),
            placedAt: payload.created_at,
            metadata: { magento_state: payload.state }
        };
    }

    private mapGeneric(payload: any): Partial<CanonicalOrder> {
        return {
            orderId: payload.id || 'GEN-' + Date.now(),
            lifecycleState: LifecycleState.PLACED,
            totalAmount: payload.amount || 0,
            currency: payload.currency || 'USD',
            placedAt: new Date().toISOString(),
        };
    }

    private mapStatus(financial: string, fulfillment: string): LifecycleState {
        if (financial === 'refunded') return LifecycleState.RETURNED;
        if (financial === 'voided') return LifecycleState.CANCELLED;
        if (fulfillment === 'fulfilled') return LifecycleState.SHIPPED;
        if (financial === 'paid') return LifecycleState.PAID;
        return LifecycleState.PLACED;
    }

    private runQualityGates(order: CanonicalOrder): { score: number; warnings: string[] } {
        const warnings: string[] = [];
        let score = 100;

        if (!order.orderId) { warnings.push('Missing orderId'); score -= 40; }
        if (order.totalAmount < 0) { warnings.push('Negative order amount'); score -= 50; }
        if (!order.currency) { warnings.push('Missing currency'); score -= 20; }
        
        // Logical cross-check
        if (order.paidAmount > (order.totalAmount + 0.01)) {
            warnings.push('Paid amount exceeds total amount (Overpayment Anomaly)');
            score -= 30;
        }

        return { score, warnings };
=======
import { CanonicalOrder, OrderStatus } from '../../../../packages/shared-types/src';
import { orderClassificationService } from './order-classification.service';
import crypto from 'crypto';

export class OrderNormalizationService {
    
    /**
     * Normalizes a raw event payload into a CanonicalOrder.
     * Maps fields, deduplicates, and runs classification engine asynchronously.
     */
    public async normalize(rawEvent: any, siteId: string, tenantId: string = 'default_tenant'): Promise<CanonicalOrder> {
        // Assume rawEvent structure mapping logic
        const metadata = rawEvent.metadata || {};
        
        const partialOrder: Partial<CanonicalOrder> = {
            orderId: metadata.orderId || crypto.randomUUID(),
            externalOrderId: metadata.externalOrderId || metadata.orderId,
            tenantId,
            siteId,
            sourceSystem: metadata.sourceSystem || metadata.system || 'unknown',
            channel: metadata.channel || 'unknown',
            orderType: metadata.orderType || 'standard',
            status: (metadata.status || 'placed') as OrderStatus,
            currency: metadata.currency || 'USD',
            amount: typeof metadata.amount === 'number' ? metadata.amount : (typeof metadata.value === 'number' ? metadata.value : 0),
            createdAt: rawEvent.timestamp || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: { ...metadata, rawEventId: rawEvent.eventId }
        };

        // Determine online vs offline via config-driven rules
        const orderSource = orderClassificationService.classify(partialOrder);
        
        return {
            ...partialOrder,
            orderSource
        } as CanonicalOrder;
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
}

export const orderNormalizationService = new OrderNormalizationService();
