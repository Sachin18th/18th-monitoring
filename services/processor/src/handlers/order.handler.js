"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderHandler = void 0;
const kpi_engine_1 = require("../engine/kpi-engine");
const in_memory_adapter_1 = require("../../../../packages/db/src/adapters/in-memory.adapter");
const order_normalization_service_1 = require("../../../../apps/api/src/services/order-normalization.service");
class OrderHandler {
    static async handle(event) {
        const { siteId, eventType, metadata } = event.value;
        const orderId = metadata?.orderId;
        if (!orderId)
            return;
        if (eventType === 'order_placed') {
            const tenantId = in_memory_adapter_1.GlobalMemoryStore.projects.get(siteId)?.tenantId || 'system';
            const canonicalOrder = await order_normalization_service_1.orderNormalizationService.normalize(metadata?.providerId || 'web', event.value, siteId, tenantId);
            in_memory_adapter_1.GlobalMemoryStore.orders.set(orderId, {
                ...canonicalOrder,
                siteId,
                paymentStatus: metadata.paymentStatus || 'pending',
                processingStatus: metadata.processingStatus || 'queued',
                fulfillmentStatus: metadata.fulfillmentStatus || 'unfulfilled',
                sku: metadata.sku || 'N/A',
                paymentMethod: metadata.paymentMethod || 'Credit Card'
            });
            await kpi_engine_1.KpiEngine.recordOrder(siteId, orderId, true, canonicalOrder.channel);
        }
        else if (eventType === 'order_processed') {
            const order = in_memory_adapter_1.GlobalMemoryStore.orders.get(orderId);
            if (order) {
                order.status = 'processed';
                // Success metric
                await kpi_engine_1.KpiEngine.recordOrderLifecycle(siteId, orderId, 'processed');
            }
        }
    }
}
exports.OrderHandler = OrderHandler;
