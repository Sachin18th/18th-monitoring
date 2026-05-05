import { ConnectorRegistry } from '../../../../packages/connector-framework/src/registry';
import { ShopifyConnector } from '../../../../packages/connectors/src/commerce/shopify';

export const initializeConnectors = () => {
    console.log('[Bootstrap] Initializing Connector Framework...');
    
    // Register Shopify
    const shopify = new ShopifyConnector();
    ConnectorRegistry.register({
        type: 'shopify',
        family: 'COMMERCE',
        name: 'Shopify Accelerator',
        description: 'High-performance connector for Shopify Plus stores.',
        capabilities: ['OAUTH', 'WEBHOOKS', 'POLLING', 'DISCOVERY', 'INCREMENTAL_SYNC'],
        version: '1.0.0'
    }, shopify);

    // Register other connectors here... (e.g., Magento, Mock Payment)
    
    console.log('[Bootstrap] Connector Framework Ready.');
};
