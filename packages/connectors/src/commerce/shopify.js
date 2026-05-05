"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopifyConnector = void 0;
const connector_framework_1 = require("@kpi-platform/connector-framework");
class ShopifyConnector extends connector_framework_1.BaseConnector {
    type = 'shopify';
    version = '1.0.0';
    async validateCredentials(config, credentials) {
        console.log(`[ShopifyConnector] Validating credentials for ${config.shopDomain}`);
        // Mock success
        return { success: true, message: 'Connection established' };
    }
    async discoverEntities(config, credentials) {
        console.log(`[ShopifyConnector] Discovering entities for ${config.shopDomain}`);
        return {
            accounts: [{ id: 'shop_main', name: 'Primary Store' }],
            entities: ['orders', 'products', 'customers', 'collections'],
            metadata: {
                api_version: '2024-01',
                webhooks_supported: true
            }
        };
    }
    async sync(type, config, credentials, checkpoint) {
        console.log(`[ShopifyConnector] Running ${type} sync for ${config.shopDomain}`);
        // Simulation of fetching 100 records
        return {
            recordsProcessed: 100,
            recordsFailed: 0,
            checkpoint: { last_id: '999', timestamp: new Date().toISOString() },
            warnings: []
        };
    }
    async healthCheck(config, credentials) {
        return true;
    }
    mapToCanonical(raw, entityType) {
        // Obsolete in Phase 5 - Superseded by generic TransformationPipeline and mapping templates.
        return raw;
    }
    async validateWebhookSignature(payload, headers, config) {
        const hmac = headers['x-shopify-hmac-sha256'];
        if (!hmac)
            return false;
        console.log(`[ShopifyConnector] Validating HMAC: ${hmac}`);
        // In real env: crypto.createHmac('sha256', config.webhookSecret).update(JSON.stringify(payload)).digest('base64') === hmac
        return true;
    }
    getMappingTemplate(entityType) {
        if (entityType === 'ORDER') {
            return {
                version: '1.0.0',
                mapping: {
                    orderId: 'name',
                    externalReferenceId: 'id',
                    placedAt: 'created_at',
                    totalAmount: 'total_price',
                    currency: 'currency',
                    rawState: 'financial_status'
                },
                statusMap: {
                    'paid': { state: 'PAID', category: 'COMPLETED' },
                    'pending': { state: 'PENDING_PAYMENT', category: 'ACTIVE' },
                    'refunded': { state: 'REFUNDED', category: 'COMPLETED' },
                    'partially_refunded': { state: 'PARTIALLY_REFUNDED', category: 'ACTIVE' },
                    'voided': { state: 'CANCELLED', category: 'FAILED' }
                }
            };
        }
        return null;
    }
}
exports.ShopifyConnector = ShopifyConnector;
