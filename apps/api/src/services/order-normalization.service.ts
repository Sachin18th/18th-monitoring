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
    }
}

export const orderNormalizationService = new OrderNormalizationService();
