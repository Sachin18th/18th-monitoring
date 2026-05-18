import { KpiEngine } from '../engine/kpi-engine';
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { orderNormalizationService } from '../../../../apps/api/src/services/order-normalization.service';

export class OrderHandler {
    static async handle(event: any) {
        const { siteId, eventType, metadata } = event.value;
        const orderId = metadata?.orderId;
        if (!orderId) return;

        if (eventType === 'order_placed') {
            const tenantId = GlobalMemoryStore.projects.get(siteId)?.tenantId || 'system';
            const canonicalOrder = await orderNormalizationService.normalize(metadata?.providerId || 'web', event.value, siteId, tenantId);
            GlobalMemoryStore.orders.set(orderId, {
                ...canonicalOrder,
                siteId,
                paymentStatus: metadata.paymentStatus || 'pending',
                processingStatus: metadata.processingStatus || 'queued',
                fulfillmentStatus: metadata.fulfillmentStatus || 'unfulfilled',
                sku: metadata.sku || 'N/A',
                paymentMethod: metadata.paymentMethod || 'Credit Card'
            });
            await KpiEngine.recordOrder(siteId, orderId, true, canonicalOrder.channel);
        } else if (eventType === 'order_processed') {
            const order = GlobalMemoryStore.orders.get(orderId);
            if (order) {
                order.status = 'processed';
                // Success metric
                await KpiEngine.recordOrderLifecycle(siteId, orderId, 'processed');
            }
        }
    }
}
