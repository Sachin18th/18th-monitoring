import { ConnectorRegistry } from '../../../../packages/connector-framework/src/registry';
import { ShopifyConnector } from '../../../../packages/connectors/src/commerce/shopify';
import { AdobeCommerceConnector } from '../../../../packages/connectors/src/commerce/adobe';
import { BigCommerceConnector } from '../../../../packages/connectors/src/commerce/bigcommerce';

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

    // Register Adobe Commerce
    const adobe = new AdobeCommerceConnector();
    ConnectorRegistry.register({
        type: 'adobe_commerce',
        family: 'COMMERCE',
        name: 'Adobe Commerce Accelerator',
        description: 'High-performance connector for Adobe Commerce (Magento) stores.',
        capabilities: ['OAUTH', 'WEBHOOKS', 'POLLING', 'DISCOVERY', 'INCREMENTAL_SYNC'],
        version: '1.0.0'
    }, adobe);

    // Register other connectors here... (e.g., SAP, ServiceNow)
    // Register BigCommerce
    const bigc = new BigCommerceConnector();
    ConnectorRegistry.register({
        type: 'bigcommerce',
        family: 'COMMERCE',
        name: 'BigCommerce Accelerator',
        description: 'Connector for BigCommerce stores.',
        capabilities: ['API_KEY', 'WEBHOOKS', 'POLLING', 'DISCOVERY'],
        version: '1.0.0'
    }, bigc);
    
    console.log('[Bootstrap] Connector Framework Ready.');
};
