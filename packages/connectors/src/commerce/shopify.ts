import { BaseConnector, SyncResult, ValidationResult, DiscoveryResult } from '@kpi-platform/connector-framework';
import { IntegrationSyncType } from '@kpi-platform/shared-types';

export class ShopifyConnector extends BaseConnector {
    public readonly type = 'shopify';
    public readonly version = '1.0.0';

    public async validateCredentials(config: any, credentials: any): Promise<ValidationResult> {
        console.log(`[ShopifyConnector] Validating credentials for ${config.shopDomain}`);
        // Mock success
        return { success: true, message: 'Connection established' };
    }

    public async discoverEntities(config: any, credentials: any): Promise<DiscoveryResult> {
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

    public async sync(
        type: IntegrationSyncType,
        config: any,
        credentials: any,
        checkpoint?: any
    ): Promise<SyncResult> {
        console.log(`[ShopifyConnector] Running ${type} sync for ${config.shopDomain}`);
        // Simulation of fetching 100 records
        return {
            recordsProcessed: 100,
            recordsFailed: 0,
            checkpoint: { last_id: '999', timestamp: new Date().toISOString() },
            warnings: []
        };
    }

    public async healthCheck(config: any, credentials: any): Promise<boolean> {
        return true;
    }

    public mapToCanonical(raw: any, entityType: string): any {
        // Obsolete in Phase 5 - Superseded by generic TransformationPipeline and mapping templates.
        return raw; 
    }

    public async validateWebhookSignature(payload: any, headers: any, config: any): Promise<boolean> {
        const hmac = headers['x-shopify-hmac-sha256'];
        if (!hmac) return false;
        
        console.log(`[ShopifyConnector] Validating HMAC: ${hmac}`);
        // In real env: crypto.createHmac('sha256', config.webhookSecret).update(JSON.stringify(payload)).digest('base64') === hmac
        return true; 
    }

    public getMappingTemplate(entityType: string): any {
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
